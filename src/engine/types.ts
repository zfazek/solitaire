export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  id: string; // e.g. "hearts-1"
}

export interface GameState {
  tableau: Card[][];   // 7 columns
  foundations: Card[][]; // 4 piles
  stock: Card[];
  waste: Card[];
  drawCount: 1 | 3;
  won: boolean;
  seed: number;        // the seed that produced this deal (reproducible)
}

export interface MoveSource {
  area: 'tableau' | 'waste' | 'foundation';
  pileIndex: number;
  cardIndex?: number; // index in the pile (for tableau)
}

export interface MoveTarget {
  area: 'tableau' | 'foundation';
  pileIndex: number;
}

export interface Move {
  source: MoveSource;
  target: MoveTarget;
  cards: Card[];
}
