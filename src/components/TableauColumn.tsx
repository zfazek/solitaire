import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import { RANK_LABELS, SUIT_SYMBOLS, isRed } from '../engine/deck';
import { shakeElement } from '../engine/shake';

interface TableauColumnProps {
  pileIndex: number;
  cards: Card[];
  onTapCard: (source: MoveSource, cards: Card[]) => boolean | void;
  onTapPile: (target: MoveTarget) => void;
  revealAll?: boolean;
}

// How much of each card peeks out above the one on top of it, expressed as a
// negative margin-bottom (pulls the next card up). The fractions live in CSS
// (--peek-up / --peek-down) so they can differ per breakpoint.
const PEEK_DOWN = 'calc(var(--card-h) * var(--peek-down))';   // face-down: small peek
const PEEK_UP   = 'calc(var(--card-h) * var(--peek-up))';     // face-up: shows rank+suit

export const TableauColumn: FC<TableauColumnProps> = ({
  pileIndex,
  cards,
  onTapCard,
  onTapPile,
  revealAll = false,
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

        const marginBottom = isLast ? 0 : (card.faceUp || revealAll) ? PEEK_UP : PEEK_DOWN;

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!card.faceUp) return;
          const moved = onTapCard(source, stackedCards ?? [card]);
          if (moved === false) shakeElement(e.currentTarget as HTMLElement);
        };

        if (!card.faceUp) {
          // Cheat mode: show the card's face while a key is held, but keep it
          // non-interactive so the real game state and move rules are untouched.
          if (revealAll) {
            return (
              <div
                key={card.id}
                className={`card card-face card-peek${red ? ' card-red' : ' card-black'}`}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  marginBottom,
                }}
              >
                <span className="card-rank card-rank-top">{label}</span>
                <span className="card-suit card-suit-top">{symbol}</span>
                <span className="card-suit card-suit-center" aria-hidden="true">{symbol}</span>
                <span className="card-rank card-rank-bottom">{label}</span>
                <span className="card-suit card-suit-bottom">{symbol}</span>
              </div>
            );
          }
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
            <span className="card-rank card-rank-top">{label}</span>
            <span className="card-suit card-suit-top">{symbol}</span>
            <span className="card-suit card-suit-center" aria-hidden="true">{symbol}</span>
            <span className="card-rank card-rank-bottom">{label}</span>
            <span className="card-suit card-suit-bottom">{symbol}</span>
          </div>
        );
      })}
    </div>
  );
};
