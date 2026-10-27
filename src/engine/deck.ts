import type { Card, Rank, Suit } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const RANK_LABELS: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function cardId(suit: Suit, rank: Rank): string {
  return `${suit}-${rank}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: false, id: cardId(suit, rank) });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle. Uses Math.random() unless a deterministic RNG is given. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Seeded deals ---------------------------------------------------------
//
// A deal is reproducible across devices by driving the shuffle with a seeded
// PRNG instead of Math.random(). The seed is a small integer shown to the user
// as a fixed-length base-36 string so it is easy to share and type.

/** Seeds live in [0, SEED_MAX). 36^4 = 1,679,616 distinct deals. */
export const SEED_LENGTH = 4;
export const SEED_MAX = 36 ** SEED_LENGTH; // 1,679,616

/** mulberry32 — a tiny, fast, well-distributed deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh random seed in the valid range. */
export function randomSeed(): number {
  return Math.floor(Math.random() * SEED_MAX);
}

/** Format a seed as a fixed-length, uppercase base-36 code (e.g. "07F3"). */
export function seedToCode(seed: number): string {
  return (seed % SEED_MAX).toString(36).toUpperCase().padStart(SEED_LENGTH, '0');
}

/**
 * Parse a user-entered code back to a seed, or null if invalid. Accepts any
 * case and ignores surrounding whitespace; must be exactly SEED_LENGTH chars
 * of base-36 (0-9, a-z).
 */
export function codeToSeed(code: string): number | null {
  const trimmed = code.trim().toLowerCase();
  if (!new RegExp(`^[0-9a-z]{${SEED_LENGTH}}$`).test(trimmed)) return null;
  const n = parseInt(trimmed, 36);
  if (!Number.isFinite(n) || n < 0 || n >= SEED_MAX) return null;
  return n;
}
