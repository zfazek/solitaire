import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import { CardView } from './CardView';

interface FoundationPileProps {
  pileIndex: number;
  cards: Card[];
  onTapCard: (source: MoveSource, cards: Card[]) => void;
  onTapPile: (target: MoveTarget) => void;
}

const SUIT_PLACEHOLDERS = ['♠', '♥', '♦', '♣'];
const SUIT_IS_RED = [false, true, true, false];

export const FoundationPile: FC<FoundationPileProps> = ({
  pileIndex,
  cards,
  onTapCard,
  onTapPile,
}) => {
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const target: MoveTarget = { area: 'foundation', pileIndex };
  const source: MoveSource = { area: 'foundation', pileIndex };

  return (
    <div
      className="foundation-pile pile-slot"
      onClick={() => onTapPile(target)}
    >
      {!topCard && (
        <span
          className="pile-placeholder"
          style={{ color: SUIT_IS_RED[pileIndex] ? 'rgba(192,57,43,0.4)' : 'rgba(255,255,255,0.3)' }}
        >
          {SUIT_PLACEHOLDERS[pileIndex]}
        </span>
      )}
      {topCard && (
        <CardView
          card={topCard}
          source={source}
          onTap={(src, cds) => onTapCard(src, cds)}
        />
      )}
    </div>
  );
};
