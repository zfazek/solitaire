import type { GameState, Card, MoveSource, MoveTarget } from './types';
import { createDeck, shuffle, mulberry32, randomSeed } from './deck';
import { canPlaceOnTableau, canPlaceOnFoundation, checkWon } from './rules';

/**
 * Create a fresh deal. When `seed` is omitted a random seed is chosen, so every
 * deal has a reproducible seed recorded on the returned state. The same seed
 * always produces the identical deal on any device.
 */
export function newGame(drawCount: 1 | 3 = 1, seed: number = randomSeed()): GameState {
  const deck = shuffle(createDeck(), mulberry32(seed));

  // Deal tableau: column i gets i+1 cards, last card face-up
  const tableau: Card[][] = [];
  let deckIndex = 0;
  for (let i = 0; i < 7; i++) {
    const pile: Card[] = [];
    for (let j = 0; j <= i; j++) {
      const card = { ...deck[deckIndex++] };
      card.faceUp = j === i;
      pile.push(card);
    }
    tableau.push(pile);
  }

  return {
    tableau,
    foundations: [[], [], [], []],
    stock: deck.slice(deckIndex).map(c => ({ ...c, faceUp: false })),
    waste: [],
    drawCount,
    won: false,
    seed,
  };
}

/** Draw from stock to waste */
export function drawFromStock(state: GameState): GameState {
  if (state.stock.length === 0) {
    // Recycle waste back to stock
    if (state.waste.length === 0) return state;
    return {
      ...state,
      stock: [...state.waste].reverse().map(c => ({ ...c, faceUp: false })),
      waste: [],
    };
  }
  const count = Math.min(state.drawCount, state.stock.length);
  const drawn = state.stock.slice(-count).map(c => ({ ...c, faceUp: true })).reverse();
  return {
    ...state,
    stock: state.stock.slice(0, state.stock.length - count),
    waste: [...state.waste, ...drawn],
  };
}

/** Move cards from source to target */
export function applyMove(state: GameState, source: MoveSource, target: MoveTarget): GameState | null {
  let cards: Card[];
  let newState = deepClone(state);

  // Extract cards from source
  if (source.area === 'waste') {
    if (newState.waste.length === 0) return null;
    cards = [newState.waste[newState.waste.length - 1]];
    newState.waste = newState.waste.slice(0, -1);
  } else if (source.area === 'tableau') {
    const pile = newState.tableau[source.pileIndex];
    const idx = source.cardIndex ?? pile.length - 1;
    cards = pile.slice(idx);
    newState.tableau[source.pileIndex] = pile.slice(0, idx);
    // Flip newly exposed top card
    const srcPile = newState.tableau[source.pileIndex];
    if (srcPile.length > 0 && !srcPile[srcPile.length - 1].faceUp) {
      srcPile[srcPile.length - 1] = { ...srcPile[srcPile.length - 1], faceUp: true };
    }
  } else if (source.area === 'foundation') {
    const pile = newState.foundations[source.pileIndex];
    if (pile.length === 0) return null;
    cards = [pile[pile.length - 1]];
    newState.foundations[source.pileIndex] = pile.slice(0, -1);
  } else {
    return null;
  }

  // Validate and place on target
  if (target.area === 'tableau') {
    if (!canPlaceOnTableau(cards[0], newState.tableau[target.pileIndex])) return null;
    newState.tableau[target.pileIndex] = [...newState.tableau[target.pileIndex], ...cards];
  } else if (target.area === 'foundation') {
    if (cards.length !== 1) return null;
    if (!canPlaceOnFoundation(cards[0], newState.foundations[target.pileIndex], target.pileIndex)) return null;
    newState.foundations[target.pileIndex] = [...newState.foundations[target.pileIndex], ...cards];
  } else {
    return null;
  }

  newState.won = checkWon(newState);
  return newState;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
