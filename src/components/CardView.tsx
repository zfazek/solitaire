import { type FC, type CSSProperties } from 'react';
import type { Card, MoveSource } from '../engine/types';
import { RANK_LABELS, SUIT_SYMBOLS, isRed } from '../engine/deck';

interface CardViewProps {
  card: Card;
  source: MoveSource;
  stackedCards?: Card[];
  style?: CSSProperties;
  selected?: boolean;
  onTap?: (source: MoveSource, cards: Card[]) => void;
}

export const CardView: FC<CardViewProps> = ({
  card,
  source,
  stackedCards,
  style,
  selected,
  onTap,
}) => {
  const red = isRed(card.suit);
  const label = RANK_LABELS[card.rank];
  const symbol = SUIT_SYMBOLS[card.suit];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card.faceUp || !onTap) return;
    const cards = stackedCards ?? [card];
    onTap(source, cards);
  };

  if (!card.faceUp) {
    return <div className="card card-back" style={style} />;
  }

  return (
    <div
      className={`card card-face${red ? ' card-red' : ' card-black'}${selected ? ' card-selected' : ''}`}
      style={style}
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
};
