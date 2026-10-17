export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  id: string; // e.g. "hearts-1"
}

export type PileType = 'tableau' | 'foundation' | 'stock' | 'waste';

export interface Pile {
  type: PileType;
  index: number; // 0-6 for tableau, 0-3 for foundation, 0 for stock/waste
  cards: Card[];
}

export interface GameState {
  tableau: Card[][];   // 7 columns
  foundations: Card[][]; // 4 piles
  stock: Card[];
  waste: Card[];
  drawCount: 1 | 3;
  won: boolean;
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
