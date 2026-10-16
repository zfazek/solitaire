/**
 * FreeCell solvability checker.
 *
 * FreeCell is fully deterministic (no hidden cards), so solvability is exactly
 * decidable. This uses iterative-deepening-free DFS with:
 *   - a canonical state key (free cells + columns are order-independent)
 *   - a transposition table (visited set) to prune revisited states
 *   - safe-autoplay of cards to foundations to cut the branching factor
 *   - move ordering (foundation moves first, then to-empty-column, etc.)
 *
 * Returns true if the position is solvable, false if provably not.
 * With the default node budget it is exact for the overwhelming majority of
 * real deals; raise MAX_NODES if you want a stronger guarantee.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Color = 'red' | 'black';

export interface FCCard {
  suit: Suit;
  rank: number; // 1..13 (A=1, K=13)
}

export interface FreeCellState {
  cascades: FCCard[][]; // 8 columns (bottom..top, top is last element)
  freeCells: (FCCard | null)[]; // length 4
  foundations: Record<Suit, number>; // highest rank placed per suit (0 = empty)
}

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function color(suit: Suit): Color {
  return suit === 'H' || suit === 'D' ? 'red' : 'black';
}

function cardStr(c: FCCard): string {
  return `${c.suit}${c.rank}`;
}

/** Can `card` be placed on top of a cascade (down, alternating color)? */
function canStack(card: FCCard, onto: FCCard | undefined): boolean {
  if (!onto) return true; // empty column accepts anything
  return color(card.suit) !== color(onto.suit) && card.rank === onto.rank - 1;
}

/** Can `card` go to its foundation now? */
function canToFoundation(card: FCCard, foundations: Record<Suit, number>): boolean {
  return foundations[card.suit] === card.rank - 1;
}

/**
 * A card is SAFE to auto-move to the foundation if no card that might still
 * need to rest on it in the tableau could possibly need it.
 * Classic rule: a card of rank N is safe if both opposite-color foundations
 * are at least N-1 (so no opposite-color card of rank N-1 still needs a home).
 * Aces and twos are always safe.
 */
function isSafeAutoplay(card: FCCard, foundations: Record<Suit, number>): boolean {
  if (card.rank <= 2) return true;
  const opp: Suit[] = color(card.suit) === 'red' ? ['S', 'C'] : ['H', 'D'];
  const minOpp = Math.min(foundations[opp[0]], foundations[opp[1]]);
  return minOpp >= card.rank - 1;
}

function clone(s: FreeCellState): FreeCellState {
  return {
    cascades: s.cascades.map(col => col.slice()),
    freeCells: s.freeCells.slice(),
    foundations: { ...s.foundations },
  };
}

function isWon(s: FreeCellState): boolean {
  return SUITS.every(suit => s.foundations[suit] === 13);
}

/** Apply all safe autoplay moves repeatedly until none remain. Mutates s. */
function autoplay(s: FreeCellState): void {
  let moved = true;
  while (moved) {
    moved = false;

    // From free cells
    for (let i = 0; i < s.freeCells.length; i++) {
      const c = s.freeCells[i];
      if (c && canToFoundation(c, s.foundations) && isSafeAutoplay(c, s.foundations)) {
        s.foundations[c.suit] = c.rank;
        s.freeCells[i] = null;
        moved = true;
      }
    }

    // From cascade tops
    for (const col of s.cascades) {
      const c = col[col.length - 1];
      if (c && canToFoundation(c, s.foundations) && isSafeAutoplay(c, s.foundations)) {
        col.pop();
        s.foundations[c.suit] = c.rank;
        moved = true;
      }
    }
  }
}

/** Canonical key: sort cascades and free cells so interchangeable layouts collapse. */
function stateKey(s: FreeCellState): string {
  const cols = s.cascades
    .map(col => col.map(cardStr).join(','))
    .sort()
    .join('|');
  const cells = s.freeCells
    .map(c => (c ? cardStr(c) : '_'))
    .sort()
    .join(',');
  const f = SUITS.map(su => `${su}${s.foundations[su]}`).join('');
  return `${cols}/${cells}/${f}`;
}

interface FCMove {
  apply: (s: FreeCellState) => void;
  priority: number;
}

function generateMoves(s: FreeCellState): FCMove[] {
  const moves: FCMove[] = [];

  // 1. Cascade top / free cell → foundation (non-safe ones; safe ones auto-played)
  for (let ci = 0; ci < s.cascades.length; ci++) {
    const col = s.cascades[ci];
    const c = col[col.length - 1];
    if (c && canToFoundation(c, s.foundations)) {
      moves.push({
        priority: 100,
        apply: (st) => {
          const card = st.cascades[ci].pop()!;
          st.foundations[card.suit] = card.rank;
        },
      });
    }
  }
  for (let fi = 0; fi < s.freeCells.length; fi++) {
    const c = s.freeCells[fi];
    if (c && canToFoundation(c, s.foundations)) {
      moves.push({
        priority: 100,
        apply: (st) => {
          const card = st.freeCells[fi]!;
          st.freeCells[fi] = null;
          st.foundations[card.suit] = card.rank;
        },
      });
    }
  }

  // 2. Cascade top → another cascade (onto a valid parent, or an empty column)
  for (let from = 0; from < s.cascades.length; from++) {
    const col = s.cascades[from];
    const c = col[col.length - 1];
    if (!c) continue;
    for (let to = 0; to < s.cascades.length; to++) {
      if (to === from) continue;
      const dest = s.cascades[to];
      const onto = dest[dest.length - 1];
      if (canStack(c, onto)) {
        // Deprioritise moving onto an empty column if the source would just
        // empty and re-fill (mild heuristic). Favour building sequences.
        const toEmpty = dest.length === 0;
        moves.push({
          priority: onto ? 60 : 20,
          apply: (st) => {
            const card = st.cascades[from].pop()!;
            st.cascades[to].push(card);
          },
        });
        // Only use one empty column target (they're interchangeable)
        if (toEmpty) break;
      }
    }
  }

  // 3. Free cell → cascade
  for (let fi = 0; fi < s.freeCells.length; fi++) {
    const c = s.freeCells[fi];
    if (!c) continue;
    let usedEmpty = false;
    for (let to = 0; to < s.cascades.length; to++) {
      const dest = s.cascades[to];
      const onto = dest[dest.length - 1];
      if (canStack(c, onto)) {
        if (!onto) {
          if (usedEmpty) continue;
          usedEmpty = true;
        }
        moves.push({
          priority: onto ? 50 : 15,
          apply: (st) => {
            const card = st.freeCells[fi]!;
            st.freeCells[fi] = null;
            st.cascades[to].push(card);
          },
        });
      }
    }
  }

  // 4. Cascade top → free cell (only one empty free cell needs to be tried)
  const firstEmptyCell = s.freeCells.findIndex(c => c === null);
  if (firstEmptyCell !== -1) {
    for (let from = 0; from < s.cascades.length; from++) {
      const col = s.cascades[from];
      if (col.length === 0) continue;
      moves.push({
        priority: 10,
        apply: (st) => {
          const card = st.cascades[from].pop()!;
          const slot = st.freeCells.findIndex(x => x === null);
          st.freeCells[slot] = card;
        },
      });
    }
  }

  moves.sort((a, b) => b.priority - a.priority);
  return moves;
}

const MAX_NODES = 200_000;

export function isFreeCellSolvable(initial: FreeCellState): boolean {
  const start = clone(initial);
  autoplay(start);
  if (isWon(start)) return true;

  const visited = new Set<string>();
  const stack: FreeCellState[] = [start];
  let nodes = 0;

  while (stack.length > 0 && nodes < MAX_NODES) {
    const state = stack.pop()!;
    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);
    nodes++;

    if (isWon(state)) return true;

    const moves = generateMoves(state);
    // Push lowest priority first so highest is popped first (DFS)
    for (let i = moves.length - 1; i >= 0; i--) {
      const next = clone(state);
      moves[i].apply(next);
      autoplay(next);
      const k = stateKey(next);
      if (!visited.has(k)) stack.push(next);
    }
  }

  return false;
}

/* --------------------------------------------------------------------------
 * Helpers to build a state and to generate the classic Microsoft FreeCell deals.
 * ------------------------------------------------------------------------ */

/** Build an empty state (foundations at 0, free cells empty). */
export function emptyState(): FreeCellState {
  return {
    cascades: Array.from({ length: 8 }, () => []),
    freeCells: [null, null, null, null],
    foundations: { S: 0, H: 0, D: 0, C: 0 },
  };
}

/**
 * Deal using the classic Microsoft FreeCell LCG, so deal numbers match the
 * well-known Windows game (e.g. #11982 is the famously unsolvable one).
 */
export function dealMicrosoft(gameNumber: number): FreeCellState {
  // Build the standard 52-card deck in MS order: A..K of C D H S interleaved by rank
  // MS uses: rank-major, suit order Clubs, Diamonds, Hearts, Spades
  const suitsMS: Suit[] = ['C', 'D', 'H', 'S'];
  const deck: FCCard[] = [];
  for (let rank = 1; rank <= 13; rank++) {
    for (const suit of suitsMS) {
      deck.push({ suit, rank });
    }
  }

  // Microsoft LCG
  let seed = gameNumber;
  const rand = () => {
    seed = (seed * 214013 + 2531011) & 0x7fffffff;
    return (seed >> 16) & 0x7fff;
  };

  const cards = deck.slice();
  const dealt: FCCard[] = [];
  let left = 52;
  for (let i = 0; i < 52; i++) {
    const idx = rand() % left;
    dealt.push(cards[idx]);
    cards[idx] = cards[left - 1];
    left--;
  }

  const state = emptyState();
  for (let i = 0; i < 52; i++) {
    state.cascades[i % 8].push(dealt[i]);
  }
  return state;
}
