/**
 * Fast Klondike solvability checker.
 * Uses DFS with move ordering and a visited-state set to avoid cycles.
 * Returns true if a winning sequence is found within the move budget.
 * Returns false if the budget is exhausted (inconclusive — may still be solvable).
 */

import type { GameState, Card, MoveSource, MoveTarget } from './types';
import { canPlaceOnTableau, canPlaceOnFoundation } from './rules';

const MAX_MOVES = 2000;

interface SolverState {
  tableau: Card[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
  drawCount: 1 | 3;
}

function stateKey(s: SolverState): string {
  const t = s.tableau.map(p => p.map(c => `${c.id}${c.faceUp ? '+' : '-'}`).join(',')).join('|');
  const f = s.foundations.map(p => p.length > 0 ? p[p.length - 1].id : '').join('|');
  const w = s.waste.length > 0 ? s.waste[s.waste.length - 1].id + s.waste.length : '';
  const st = s.stock.length;
  return `${t}/${f}/${w}/${st}`;
}

function cloneState(s: SolverState): SolverState {
  return {
    tableau: s.tableau.map(p => p.map(c => ({ ...c }))),
    foundations: s.foundations.map(p => p.map(c => ({ ...c }))),
    stock: s.stock.map(c => ({ ...c })),
    waste: s.waste.map(c => ({ ...c })),
    drawCount: s.drawCount,
  };
}

function isWon(s: SolverState): boolean {
  return s.foundations.every(p => p.length === 13);
}

interface Move {
  source: MoveSource | { area: 'draw' };
  target: MoveTarget;
  priority: number;
}

function generateMoves(s: SolverState): Move[] {
  const moves: Move[] = [];

  // Helper: top face-up card of a pile
  const topWaste = s.waste.length > 0 ? s.waste[s.waste.length - 1] : null;

  // 1. Move to foundation (highest priority)
  const trySendToFoundation = (src: MoveSource, card: Card) => {
    for (let fi = 0; fi < 4; fi++) {
      if (canPlaceOnFoundation(card, s.foundations[fi], fi)) {
        moves.push({ source: src, target: { area: 'foundation', pileIndex: fi }, priority: 100 });
        break;
      }
    }
  };

  if (topWaste) trySendToFoundation({ area: 'waste', pileIndex: 0 }, topWaste);
  for (let i = 0; i < 7; i++) {
    const pile = s.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (top.faceUp) trySendToFoundation({ area: 'tableau', pileIndex: i, cardIndex: pile.length - 1 }, top);
  }

  // 2. Draw from stock
  if (s.stock.length > 0 || s.waste.length > 0) {
    moves.push({ source: { area: 'draw' }, target: { area: 'tableau', pileIndex: 0 }, priority: 10 });
  }

  // 3. Tableau to tableau (face-up stacks)
  for (let si = 0; si < 7; si++) {
    const srcPile = s.tableau[si];
    const firstFaceUp = srcPile.findIndex(c => c.faceUp);
    if (firstFaceUp === -1) continue;

    for (let ci = firstFaceUp; ci < srcPile.length; ci++) {
      const card = srcPile[ci];
      for (let ti = 0; ti < 7; ti++) {
        if (ti === si) continue;
        if (canPlaceOnTableau(card, s.tableau[ti])) {
          // Prioritise moves that reveal a face-down card
          const revealsCard = ci === firstFaceUp && firstFaceUp > 0;
          // Deprioritise moving a King to another empty column (wasteful)
          const kingToEmpty = card.rank === 13 && s.tableau[ti].length === 0 && srcPile.filter(c => c.faceUp).length === srcPile.length;
          const priority = revealsCard ? 80 : kingToEmpty ? 5 : 40;
          moves.push({ source: { area: 'tableau', pileIndex: si, cardIndex: ci }, target: { area: 'tableau', pileIndex: ti }, priority });
        }
      }
    }
  }

  // 4. Waste to tableau
  if (topWaste) {
    for (let ti = 0; ti < 7; ti++) {
      if (canPlaceOnTableau(topWaste, s.tableau[ti])) {
        moves.push({ source: { area: 'waste', pileIndex: 0 }, target: { area: 'tableau', pileIndex: ti }, priority: 30 });
      }
    }
  }

  // Sort by priority descending
  moves.sort((a, b) => b.priority - a.priority);
  return moves;
}

function applyMoveToSolver(s: SolverState, move: Move): SolverState | null {
  const ns = cloneState(s);

  // Special: draw from stock
  if (move.source.area === 'draw') {
    if (ns.stock.length === 0) {
      if (ns.waste.length === 0) return null;
      ns.stock = [...ns.waste].reverse().map(c => ({ ...c, faceUp: false }));
      ns.waste = [];
    } else {
      const count = Math.min(ns.drawCount, ns.stock.length);
      const drawn = ns.stock.splice(ns.stock.length - count, count).reverse().map(c => ({ ...c, faceUp: true }));
      ns.waste.push(...drawn);
    }
    return ns;
  }

  let cards: Card[];

  if (move.source.area === 'waste') {
    if (ns.waste.length === 0) return null;
    cards = [ns.waste.pop()!];
  } else if (move.source.area === 'tableau') {
    const pile = ns.tableau[move.source.pileIndex];
    const idx = move.source.cardIndex ?? pile.length - 1;
    cards = pile.splice(idx);
    // Flip newly exposed card
    if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
      pile[pile.length - 1].faceUp = true;
    }
  } else {
    return null;
  }

  if (move.target.area === 'foundation') {
    if (cards.length !== 1) return null;
    if (!canPlaceOnFoundation(cards[0], ns.foundations[move.target.pileIndex], move.target.pileIndex)) return null;
    ns.foundations[move.target.pileIndex].push(cards[0]);
  } else {
    if (!canPlaceOnTableau(cards[0], ns.tableau[move.target.pileIndex])) return null;
    ns.tableau[move.target.pileIndex].push(...cards);
  }

  return ns;
}

export function isSolvable(gameState: GameState): boolean {
  const initial: SolverState = {
    tableau: gameState.tableau.map(p => p.map(c => ({ ...c }))),
    foundations: gameState.foundations.map(p => p.map(c => ({ ...c }))),
    stock: gameState.stock.map(c => ({ ...c })),
    waste: gameState.waste.map(c => ({ ...c })),
    drawCount: gameState.drawCount,
  };

  const visited = new Set<string>();
  const stack: { state: SolverState; depth: number }[] = [{ state: initial, depth: 0 }];
  let totalMoves = 0;

  while (stack.length > 0 && totalMoves < MAX_MOVES) {
    const { state, depth } = stack.pop()!;

    if (isWon(state)) return true;

    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);

    totalMoves++;

    const moves = generateMoves(state);
    // Push in reverse so highest priority is popped first
    for (let i = moves.length - 1; i >= 0; i--) {
      const next = applyMoveToSolver(state, moves[i]);
      if (next) {
        stack.push({ state: next, depth: depth + 1 });
      }
    }
  }

  return false; // budget exhausted — assume unsolvable for reshuffle purposes
}
