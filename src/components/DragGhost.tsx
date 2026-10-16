import { type FC } from 'react';
import type { Card } from '../engine/types';
import { RANK_LABELS, SUIT_SYMBOLS, isRed } from '../engine/deck';

interface DragGhostProps {
  cards: Card[];
  x: number;
  y: number;
}

const GHOST_OFFSET = 28;

export const DragGhost: FC<DragGhostProps> = ({ cards, x, y }) => {
  return (
    <div
      className="drag-ghost"
      style={{
        position: 'fixed',
        left: x - 35,
        top: y - 20,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {cards.map((card, idx) => {
        const red = isRed(card.suit);
        const label = RANK_LABELS[card.rank];
        const symbol = SUIT_SYMBOLS[card.suit];
        return (
          <div
            key={card.id}
            className={`card card-face${red ? ' card-red' : ' card-black'} card-ghost`}
            style={{
              position: idx === 0 ? 'relative' : 'absolute',
              top: idx === 0 ? 0 : idx * GHOST_OFFSET,
              left: 0,
            }}
          >
            <div className="card-corner card-corner-top">
              <span className="card-rank">{label}</span>
              <span className="card-suit">{symbol}</span>
            </div>
            <div className="card-center">{symbol}</div>
            <div className="card-corner card-corner-bottom">
              <span className="card-rank">{label}</span>
              <span className="card-suit">{symbol}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
