import { type FC, type CSSProperties } from 'react';
import type { Card, MoveSource } from '../engine/types';
import { RANK_LABELS, SUIT_SYMBOLS, isRed } from '../engine/deck';
import { shakeElement } from '../engine/shake';

interface CardViewProps {
  card: Card;
  source: MoveSource;
  stackedCards?: Card[];
  style?: CSSProperties;
  onTap?: (source: MoveSource, cards: Card[]) => boolean | void;
}

export const CardView: FC<CardViewProps> = ({
  card,
  source,
  stackedCards,
  style,
  onTap,
}) => {
  const red = isRed(card.suit);
  const label = RANK_LABELS[card.rank];
  const symbol = SUIT_SYMBOLS[card.suit];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card.faceUp || !onTap) return;
    const cards = stackedCards ?? [card];
    const moved = onTap(source, cards);
    if (moved === false) shakeElement(e.currentTarget as HTMLElement);
  };

  if (!card.faceUp) {
    return <div className="card card-back" style={style} />;
  }

  return (
    <div
      className={`card card-face${red ? ' card-red' : ' card-black'}`}
      style={style}
      onClick={handleClick}
    >
      <span className="card-rank card-rank-top">{label}</span>
      <span className="card-suit card-suit-top">{symbol}</span>
      <span className="card-rank card-rank-bottom">{label}</span>
      <span className="card-suit card-suit-bottom">{symbol}</span>
    </div>
  );
};
