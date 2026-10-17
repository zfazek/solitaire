import { useCallback } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';

export function useSelection(
  _onMove: (source: MoveSource, target: MoveTarget) => boolean,
  onAutoMove: (source: MoveSource, cards?: Card[]) => boolean,
) {
  /**
   * Tap on a face-up card: always auto-move it to the first valid position
   * (foundation first, then the first valid tableau column, skipping its own
   * column). Tapping the same card again cycles it to the next valid spot.
   */
  const tapCard = useCallback((source: MoveSource, cards: Card[]) => {
    onAutoMove(source, cards);
  }, [onAutoMove]);

  /** Tap on a pile container — no manual placement, auto-move handles moves. */
  const tapPile = useCallback((_target: MoveTarget) => {}, []);

  return { tapCard, tapPile };
}
