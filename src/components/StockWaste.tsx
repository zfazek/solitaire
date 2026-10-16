import { type FC } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';
import type { Selection } from '../hooks/useSelection';
import { CardView } from './CardView';

interface StockWasteProps {
  stock: Card[];
  waste: Card[];
  selection: Selection | null;
  onDraw: () => void;
  onTapCard: (source: MoveSource, cards: Card[]) => void;
  onTapPile: (target: MoveTarget) => void;
}

export const StockWaste: FC<StockWasteProps> = ({
  stock,
  waste,
  selection,
  onDraw,
  onTapCard,
}) => {
  const topWaste = waste.length > 0 ? waste[waste.length - 1] : null;
  const wasteSelected = !!(selection && selection.source.area === 'waste');

  return (
    <div className="stock-waste">
      {/* Stock — click draws a card */}
      <div
        className="pile-slot stock-pile"
        onClick={onDraw}
        role="button"
        aria-label="Draw cards"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onDraw()}
      >
        {stock.length > 0 ? (
          <div className="card card-back" />
        ) : (
          <span className="pile-placeholder" title="Click to recycle">↺</span>
        )}
        {stock.length > 0 && (
          <span className="stock-count">{stock.length}</span>
        )}
      </div>

      {/* Waste — tap card to select/auto-move */}
      <div className="pile-slot waste-pile">
        {topWaste ? (
          <CardView
            card={topWaste}
            source={{ area: 'waste', pileIndex: 0 }}
            selected={wasteSelected}
            onTap={onTapCard}
          />
        ) : (
          <span className="pile-placeholder">—</span>
        )}
      </div>
    </div>
  );
};
