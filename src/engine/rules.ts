import type { Card, GameState, Suit } from './types';
import { isRed } from './deck';

/** Bridge-order suit assignment for the 4 foundation piles */
export const FOUNDATION_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Is `cards` a valid movable tableau sequence?
 * All cards must be face-up and form a descending, alternating-color run.
 */
export function isMovableSequence(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].faceUp) return false;
    if (i > 0) {
      const prev = cards[i - 1];
      const cur = cards[i];
      if (isRed(prev.suit) === isRed(cur.suit)) return false;
      if (cur.rank !== prev.rank - 1) return false;
    }
  }
  return true;
}

/** Can a card (or stack starting with `card`) be placed on top of a tableau pile? */
export function canPlaceOnTableau(card: Card, targetPile: Card[]): boolean {
  if (targetPile.length === 0) {
    // Only Kings go on empty columns
    return card.rank === 13;
  }
  const top = targetPile[targetPile.length - 1];
  if (!top.faceUp) return false;
  // Must alternate colors and be one rank lower
  return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
}

/**
 * Can a card be placed on a foundation pile?
 * If pileIndex is given, the card's suit must match that pile's assigned suit.
 */
export function canPlaceOnFoundation(card: Card, foundationPile: Card[], pileIndex?: number): boolean {
  // Enforce fixed suit slot if a pile index is provided
  if (pileIndex !== undefined && card.suit !== FOUNDATION_SUITS[pileIndex]) {
    return false;
  }
  if (foundationPile.length === 0) {
    return card.rank === 1; // Only Aces start foundations
  }
  const top = foundationPile[foundationPile.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/** Find which foundation pile matches a card's suit */
export function findFoundationIndex(state: GameState, card: Card): number {
  return state.foundations.findIndex(
    (pile) =>
      (pile.length === 0 && card.rank === 1) ||
      (pile.length > 0 && pile[pile.length - 1].suit === card.suit)
  );
}

/** Check if the game is won */
export function checkWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

/** Get a face-up top card that can be auto-moved to its suit's foundation.
 *  Returns the SOURCE location (area + source pile index) and the card. */
export function getAutoMoveCard(state: GameState): { area: 'tableau' | 'waste'; pileIndex: number; card: Card } | null {
  // Check waste first
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fi = FOUNDATION_SUITS.indexOf(card.suit);
    if (fi !== -1 && canPlaceOnFoundation(card, state.foundations[fi], fi)) {
      return { area: 'waste', pileIndex: 0, card };
    }
  }
  // Check tableau tops
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    if (pile.length === 0) continue;
    const card = pile[pile.length - 1];
    if (!card.faceUp) continue;
    const fi = FOUNDATION_SUITS.indexOf(card.suit);
    if (fi !== -1 && canPlaceOnFoundation(card, state.foundations[fi], fi)) {
      return { area: 'tableau', pileIndex: i, card };
    }
  }
  return null;
}

/** Safe auto-complete: only auto-move if all tableau cards are face-up */
export function canAutoComplete(state: GameState): boolean {
  return state.tableau.every(pile => pile.every(c => c.faceUp)) && state.stock.length === 0 && state.waste.length === 0;
}
