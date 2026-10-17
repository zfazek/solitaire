import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import { RANK_LABELS, SUIT_SYMBOLS, isRed } from '../engine/deck';

interface TableauColumnProps {
  pileIndex: number;
  cards: Card[];
  onTapCard: (source: MoveSource, cards: Card[]) => void;
  onTapPile: (target: MoveTarget) => void;
}

// How much of each card peeks out above the one on top of it
// expressed as a negative margin-bottom (pulls next card up)
const PEEK_DOWN = 'calc(var(--card-h) * -0.82)';   // face-down: small peek
const PEEK_UP   = 'calc(var(--card-h) * -0.75)';   // face-up: just enough peek to show rank+suit

export const TableauColumn: FC<TableauColumnProps> = ({
  pileIndex,
  cards,
  onTapCard,
  onTapPile,
}) => {
  return (
    <div
      className="tableau-column pile-slot"
      style={{
        height: 'auto',
        minHeight: 'var(--card-h)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        overflow: 'visible',
      }}
      onClick={() => onTapPile({ area: 'tableau', pileIndex })}
    >
      {cards.length === 0 && (
        <span className="pile-placeholder">K</span>
      )}
      {cards.map((card, idx) => {
        const isLast = idx === cards.length - 1;
        const source: MoveSource = { area: 'tableau', pileIndex, cardIndex: idx };
        const stackedCards = card.faceUp ? cards.slice(idx) : undefined;
        const red = isRed(card.suit);
        const label = RANK_LABELS[card.rank];
        const symbol = SUIT_SYMBOLS[card.suit];

        const marginBottom = isLast ? 0 : card.faceUp ? PEEK_UP : PEEK_DOWN;

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!card.faceUp) return;
          onTapCard(source, stackedCards ?? [card]);
        };

        if (!card.faceUp) {
          return (
            <div
              key={card.id}
              className="card card-back"
              style={{
                position: 'relative',
                flexShrink: 0,
                marginBottom,
              }}
            />
          );
        }

        return (
          <div
            key={card.id}
            className={`card card-face${red ? ' card-red' : ' card-black'}`}
            style={{
              position: 'relative',
              flexShrink: 0,
              marginBottom,
              cursor: 'pointer',
            }}
            onClick={handleClick}
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
