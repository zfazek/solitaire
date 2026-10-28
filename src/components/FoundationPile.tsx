import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import { CardView } from './CardView';

interface FoundationPileProps {
  pileIndex: number;
  cards: Card[];
  onTapCard: (source: MoveSource, cards: Card[]) => boolean | void;
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
  // The card directly beneath the top one. Rendered (static, non-interactive)
  // so that when the top card flies IN via the move animation, the slot isn't
  // momentarily empty — it shows the previous card until the new one lands.
  const underCard = cards.length > 1 ? cards[cards.length - 2] : null;
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
      {underCard && (
        <CardView
          key={underCard.id}
          card={underCard}
          source={source}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}
      {topCard && (
        <CardView
          key={topCard.id}
          card={topCard}
          source={source}
          style={underCard ? { position: 'absolute', inset: 0 } : undefined}
          onTap={(src, cds) => onTapCard(src, cds)}
        />
      )}
    </div>
  );
};
