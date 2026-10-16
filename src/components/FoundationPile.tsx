import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import type { Selection } from '../hooks/useSelection';
import { CardView } from './CardView';

interface FoundationPileProps {
  pileIndex: number;
  cards: Card[];
  selection: Selection | null;
  onTapCard: (source: MoveSource, cards: Card[]) => void;
  onTapPile: (target: MoveTarget) => void;
}

const SUIT_PLACEHOLDERS = ['♠', '♥', '♦', '♣'];
const SUIT_IS_RED = [false, true, true, false];

export const FoundationPile: FC<FoundationPileProps> = ({
  pileIndex,
  cards,
  selection,
  onTapCard,
  onTapPile,
}) => {
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const target: MoveTarget = { area: 'foundation', pileIndex };
  const source: MoveSource = { area: 'foundation', pileIndex };
  const isSelected = !!(selection && selection.source.area === 'foundation' && selection.source.pileIndex === pileIndex);

  return (
    <div
      className={`foundation-pile pile-slot${selection ? ' pile-slot-active' : ''}`}
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
          selected={isSelected}
          onTap={(src, cds) => onTapCard(src, cds)}
        />
      )}
    </div>
  );
};
