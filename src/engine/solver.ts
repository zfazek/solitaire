/**
 * Fast Klondike solvability checker.
 * Uses DFS with move ordering and a visited-state set to avoid cycles.
 *
 * Returns a tri-state result:
 *   - 'solvable'   — a winning sequence was found.
 *   - 'unsolvable' — the entire reachable state space was exhausted with no
 *                    win (the DFS stack emptied within budget). This is a
 *                    definitive proof that the deal cannot be won.
 *   - 'unknown'    — the move budget ran out before the search completed, so
 *                    the deal's solvability could not be determined.
 */

import type { GameState, Card } from './types';
import { FOUNDATION_SUITS } from './rules';
import { SUITS, isRed } from './deck';

export type SolveResult = 'solvable' | 'unsolvable' | 'unknown';

// Budget for the DFS. The check runs in a background Web Worker (off the main
// thread). This is deliberately SMALL (~sub-second per check): the game treats
// anything that isn't a proven 'solvable' as reshuffle-worthy, so the budget's
// job is only to quickly confirm a deal IS winnable. Deals that can't be solved
// within the budget return 'unknown' and get reshuffled, which is the desired
// behaviour — we bias hard toward easily-winnable deals rather than spending
// many seconds trying to prove hard deals. Measured over random draw-1 deals,
// 5000 gives ~136ms avg / ~410ms max per check while still accepting the
// majority of winnable deals. Raising it recovers very few extra deals for a
// large time cost (the DFS move ordering plateaus around here).
const MAX_MOVES = 5000;

// ---- Compact, immutable state ---------------------------------------------
//
// A card is a small integer: suitIndex * 13 + (rank - 1), with suitIndex taken
// from SUITS. Tableau cards additionally carry FACE_UP (bit 6) because their
// visibility changes during play; stock cards are always face-down and waste
// cards always face-up, so those piles store plain 0..51 codes.
//
// States are never mutated after creation. A move builds a child state that
// copies only the piles it touches and *shares* every other pile (and the
// array holding them) with its parent -- structural sharing -- instead of
// deep-cloning ~52 card objects per candidate move.
//
// Foundations are fixed suit slots (FOUNDATION_SUITS), so each is fully
// described by its height (0..13): the cards on it are rank 1..height.

const FACE_UP = 64;
const CARD_MASK = 63;

const CARD_SUIT = new Uint8Array(52); // index into SUITS
const CARD_RANK = new Uint8Array(52); // 1..13
const CARD_RED = new Uint8Array(52);  // 1 for hearts/diamonds
for (let suit = 0; suit < 4; suit++) {
  for (let r = 0; r < 13; r++) {
    const c = suit * 13 + r;
    CARD_SUIT[c] = suit;
    CARD_RANK[c] = r + 1;
    CARD_RED[c] = isRed(SUITS[suit]) ? 1 : 0;
  }
}
// Foundation slot (0..3) that accepts each suit index.
const SUIT_SLOT = new Uint8Array(4);
FOUNDATION_SUITS.forEach((suit, slot) => { SUIT_SLOT[SUITS.indexOf(suit)] = slot; });

const EMPTY: readonly number[] = [];

function encodeCard(c: Card): number {
  return SUITS.indexOf(c.suit) * 13 + (c.rank - 1);
}

interface SolverState {
  readonly tableau: readonly (readonly number[])[]; // 7 piles, FACE_UP-flagged
  readonly foundations: readonly number[];          // 4 heights
  readonly stock: readonly number[];                // face-down, top = last
  readonly waste: readonly number[];                // face-up, top = last
  readonly drawCount: 1 | 3;
}

// State identity. The tableau (with face-up flags), the foundation heights and
// the FULL ordered stock and waste uniquely identify a state, so all of them
// are hashed (with a separator after each pile so pile boundaries matter).
// Hashing the stock/waste fully -- rather than just their lengths / top card --
// avoids distinct states being wrongly pruned as "visited", which would make
// the solver skip subtrees and report false negatives.
//
// The result is a 53-bit number built from two independent 32-bit hashes, so it
// fits exactly in a double and can live in a Set<number> (no string building).
// A false "already visited" needs a 53-bit collision: with at most a few
// thousand states per search that is a ~1e-9 event per deal, and it could only
// cause a missed branch, never a wrong 'solvable' answer.
const SEP = 255; // outside the card range (0..127), delimits piles

function stateHash(s: SolverState): number {
  // h1: MurmurHash3-style mixing; h2: FNV-1a with a multiplicative finish.
  let h1 = 0x9747b28c;
  let h2 = 0x811c9dc5;

  const feed = (v: number) => {
    let k = Math.imul(v + 1, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h1 ^= k;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;

    h2 ^= v;
    h2 = Math.imul(h2, 0x01000193);
  };
  const feedPile = (pile: readonly number[]) => {
    for (let i = 0; i < pile.length; i++) feed(pile[i]);
    feed(SEP);
  };

  for (let i = 0; i < 7; i++) feedPile(s.tableau[i]);
  feedPile(s.foundations);
  feedPile(s.waste);
  feedPile(s.stock);

  // Final avalanche (MurmurHash3 fmix32) on both halves.
  h1 ^= h1 >>> 16; h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13; h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  h2 ^= h2 >>> 15; h2 = Math.imul(h2, 0x2c1b3c6d);
  h2 ^= h2 >>> 12; h2 = Math.imul(h2, 0x297a2d39);
  h2 ^= h2 >>> 15;

  // 32 bits from h1 + 21 bits from h2 = 53 bits.
  return (h2 & 0x1fffff) * 4294967296 + (h1 >>> 0);
}

function isWon(s: SolverState): boolean {
  const f = s.foundations;
  return f[0] === 13 && f[1] === 13 && f[2] === 13 && f[3] === 13;
}

// Can plain card `card` (0..51) sit on top of tableau pile `pile`?
function canPlaceOnTableauCode(card: number, pile: readonly number[]): boolean {
  if (pile.length === 0) return CARD_RANK[card] === 13; // only Kings on empty columns
  const top = pile[pile.length - 1];
  if (!(top & FACE_UP)) return false;
  const t = top & CARD_MASK;
  return CARD_RED[card] !== CARD_RED[t] && CARD_RANK[card] === CARD_RANK[t] - 1;
}

// Foundation slot that would accept plain card `card`, or -1.
function foundationSlotFor(card: number, foundations: readonly number[]): number {
  const slot = SUIT_SLOT[CARD_SUIT[card]];
  return CARD_RANK[card] === foundations[slot] + 1 ? slot : -1;
}

const Kind = {
  Draw: 0,
  WasteToFoundation: 1,
  TableauToFoundation: 2,
  WasteToTableau: 3,
  TableauToTableau: 4,
} as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Move {
  kind: Kind;
  from: number;   // source tableau pile (tableau sources)
  index: number;  // first card moved within the source pile (tableau->tableau)
  to: number;     // target tableau pile or foundation slot
  priority: number;
}

function generateMoves(s: SolverState): Move[] {
  const moves: Move[] = [];
  const { tableau, foundations, stock, waste } = s;
  const topWaste = waste.length > 0 ? waste[waste.length - 1] : -1;

  // 1. Move to foundation (highest priority)
  if (topWaste >= 0) {
    const slot = foundationSlotFor(topWaste, foundations);
    if (slot >= 0) moves.push({ kind: Kind.WasteToFoundation, from: 0, index: 0, to: slot, priority: 100 });
  }
  for (let i = 0; i < 7; i++) {
    const pile = tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (!(top & FACE_UP)) continue;
    const slot = foundationSlotFor(top & CARD_MASK, foundations);
    if (slot >= 0) moves.push({ kind: Kind.TableauToFoundation, from: i, index: pile.length - 1, to: slot, priority: 100 });
  }

  // 2. Draw from stock
  if (stock.length > 0 || waste.length > 0) {
    moves.push({ kind: Kind.Draw, from: 0, index: 0, to: 0, priority: 10 });
  }

  // 3. Tableau to tableau (face-up stacks)
  for (let si = 0; si < 7; si++) {
    const srcPile = tableau[si];
    let firstFaceUp = -1;
    for (let i = 0; i < srcPile.length; i++) {
      if (srcPile[i] & FACE_UP) { firstFaceUp = i; break; }
    }
    if (firstFaceUp === -1) continue;

    for (let ci = firstFaceUp; ci < srcPile.length; ci++) {
      const card = srcPile[ci] & CARD_MASK;
      for (let ti = 0; ti < 7; ti++) {
        if (ti === si) continue;
        const target = tableau[ti];
        if (canPlaceOnTableauCode(card, target)) {
          // Prioritise moves that reveal a face-down card
          const revealsCard = ci === firstFaceUp && firstFaceUp > 0;
          // Deprioritise moving a King to another empty column (wasteful)
          const kingToEmpty = CARD_RANK[card] === 13 && target.length === 0 && firstFaceUp === 0;
          const priority = revealsCard ? 80 : kingToEmpty ? 5 : 40;
          moves.push({ kind: Kind.TableauToTableau, from: si, index: ci, to: ti, priority });
        }
      }
    }
  }

  // 4. Waste to tableau
  if (topWaste >= 0) {
    for (let ti = 0; ti < 7; ti++) {
      if (canPlaceOnTableauCode(topWaste, tableau[ti])) {
        moves.push({ kind: Kind.WasteToTableau, from: 0, index: 0, to: ti, priority: 30 });
      }
    }
  }

  // Sort by priority descending (stable, so generation order breaks ties).
  // Any weights work here; adding a heuristic needs no other change.
  moves.sort((a, b) => b.priority - a.priority);
  return moves;
}

// Moves come from generateMoves on the same state, so they are always legal.
function applyMoveToSolver(s: SolverState, move: Move): SolverState {
  const { tableau, foundations, stock, waste, drawCount } = s;
  const { from, to, index } = move;

  switch (move.kind) {
    case Kind.Draw: {
      if (stock.length === 0) {
        // Recycle the waste back into the stock, face-down.
        return { tableau, foundations, stock: waste.slice().reverse(), waste: EMPTY, drawCount };
      }
      const count = Math.min(drawCount, stock.length);
      const keep = stock.length - count;
      return {
        tableau,
        foundations,
        stock: stock.slice(0, keep),
        waste: waste.concat(stock.slice(keep).reverse()),
        drawCount,
      };
    }

    case Kind.WasteToFoundation: {
      const f = foundations.slice();
      f[to]++;
      return { tableau, foundations: f, stock, waste: waste.slice(0, -1), drawCount };
    }

    case Kind.WasteToTableau: {
      const t = tableau.slice();
      t[to] = t[to].concat(waste[waste.length - 1] | FACE_UP);
      return { tableau: t, foundations, stock, waste: waste.slice(0, -1), drawCount };
    }

    case Kind.TableauToFoundation: {
      const f = foundations.slice();
      f[to]++;
      const t = tableau.slice();
      t[from] = revealTop(tableau[from].slice(0, index));
      return { tableau: t, foundations: f, stock, waste, drawCount };
    }

    case Kind.TableauToTableau: {
      const src = tableau[from];
      const t = tableau.slice();
      t[from] = revealTop(src.slice(0, index));
      t[to] = tableau[to].concat(src.slice(index));
      return { tableau: t, foundations, stock, waste, drawCount };
    }
  }
}

// Flip the newly exposed card face-up. `pile` must be a fresh copy.
function revealTop(pile: number[]): number[] {
  const last = pile.length - 1;
  if (last >= 0) pile[last] |= FACE_UP;
  return pile;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SolveAnalysis {
  result: SolveResult;
  /** Distinct states the DFS expanded before finishing (search effort). */
  statesExplored: number;
  /** Length (in moves, draws included) of the winning line; null if not solved. */
  solutionLength: number | null;
  /**
   * Fraction of explored states that were NOT on the winning line, i.e. how
   * much the solver had to backtrack / wander. 0 = straight to the win,
   * →1 = mostly dead ends. 1 when no solution was found.
   */
  deadEndRatio: number;
  /** Coarse label derived from deadEndRatio. null unless result is 'solvable'. */
  difficulty: Difficulty | null;
}

// Thresholds on deadEndRatio. The DFS move ordering is a decent "human-ish"
// heuristic, so deals it solves with little backtracking are straightforward.
const EASY_MAX_DEAD_END_RATIO = 0.3;
const MEDIUM_MAX_DEAD_END_RATIO = 0.7;

function classify(result: SolveResult, deadEndRatio: number): Difficulty | null {
  // Difficulty is only meaningful for deals proven winnable.
  if (result !== 'solvable') return null;
  if (deadEndRatio <= EASY_MAX_DEAD_END_RATIO) return 'easy';
  if (deadEndRatio <= MEDIUM_MAX_DEAD_END_RATIO) return 'medium';
  return 'hard';
}

export function isSolvable(gameState: GameState, maxMovesLimit: number = MAX_MOVES): SolveAnalysis {
  const finish = (result: SolveResult, statesExplored: number, solutionLength: number | null): SolveAnalysis => {
    const deadEndRatio = solutionLength === null || statesExplored === 0
      ? 1
      : Math.max(0, (statesExplored - solutionLength) / statesExplored);
    return { result, statesExplored, solutionLength, deadEndRatio, difficulty: classify(result, deadEndRatio) };
  };

  const initial: SolverState = {
    tableau: gameState.tableau.map(p => p.map(c => encodeCard(c) | (c.faceUp ? FACE_UP : 0))),
    foundations: gameState.foundations.map(p => p.length),
    stock: gameState.stock.map(encodeCard),
    waste: gameState.waste.map(encodeCard),
    drawCount: gameState.drawCount,
  };

  const visited = new Set<number>();
  const stack: { state: SolverState; depth: number }[] = [{ state: initial, depth: 0 }];
  let totalMoves = 0;

  while (stack.length > 0 && totalMoves < maxMovesLimit) {
    const { state, depth } = stack.pop()!;

    if (isWon(state)) return finish('solvable', totalMoves, depth);

    const key = stateHash(state);
    if (visited.has(key)) continue;
    visited.add(key);

    totalMoves++;

    const moves = generateMoves(state);
    // Push in reverse so highest priority is popped first
    for (let i = moves.length - 1; i >= 0; i--) {
      stack.push({ state: applyMoveToSolver(state, moves[i]), depth: depth + 1 });
    }
  }

  // If the stack emptied, we exhausted every reachable state without a win:
  // the deal is provably unsolvable. If instead the budget ran out while
  // states remained to explore, we simply don't know.
  return finish(stack.length === 0 ? 'unsolvable' : 'unknown', totalMoves, null);
}
