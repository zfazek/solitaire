import { useCallback, useState } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';

export interface Selection {
  source: MoveSource;
  cards: Card[];
}

export function useSelection(
  onMove: (source: MoveSource, target: MoveTarget) => boolean,
  onAutoMove: (source: MoveSource, cards?: Card[]) => boolean,
) {
  const [selected, setSelected] = useState<Selection | null>(null);

  /** Tap on a face-up card */
  const tapCard = useCallback((source: MoveSource, cards: Card[]) => {
    // Tap the already-selected card → deselect
    if (selected &&
        selected.source.area === source.area &&
        selected.source.pileIndex === source.pileIndex &&
        selected.source.cardIndex === source.cardIndex) {
      setSelected(null);
      return;
    }

    const sameePile = selected &&
      selected.source.area === source.area &&
      selected.source.pileIndex === source.pileIndex;

    // Something selected AND the tapped card is in a DIFFERENT pile → try move
    if (selected && !sameePile) {
      const target: MoveTarget = {
        area: source.area === 'foundation' ? 'foundation' : 'tableau',
        pileIndex: source.pileIndex,
      };
      const moved = onMove(selected.source, target);
      if (moved) {
        setSelected(null);
        return;
      }
      // Move failed — fall through to (re)select the tapped card
    }

    // No selection, OR tapped a card in the same pile, OR move failed:
    // try auto-move to foundation, else select this card
    const autoMoved = onAutoMove(source, cards);
    if (autoMoved) {
      setSelected(null);
      return;
    }

    setSelected({ source, cards });
  }, [selected, onMove, onAutoMove]);

  /** Tap on a pile container (empty space or the column background) */
  const tapPile = useCallback((target: MoveTarget) => {
    if (!selected) return;
    // Don't move onto the pile the selection came from
    if (selected.source.area === target.area && selected.source.pileIndex === target.pileIndex) {
      setSelected(null);
      return;
    }
    onMove(selected.source, target);
    setSelected(null);
  }, [selected, onMove]);

  const clearSelection = useCallback(() => setSelected(null), []);

  return { selected, tapCard, tapPile, clearSelection };
}
