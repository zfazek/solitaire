import { useCallback, useRef, useState } from 'react';
import type { Card, MoveSource, MoveTarget } from '../engine/types';

export interface DragItem {
  source: MoveSource;
  cards: Card[];
}

export interface DragState {
  isDragging: boolean;
  item: DragItem | null;
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 8;

export function useDragDrop(
  onMove: (source: MoveSource, target: MoveTarget) => void,
  onAutoMove: (source: MoveSource) => void,
) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    item: null,
    x: 0,
    y: 0,
  });

  const pending = useRef<{ item: DragItem; startX: number; startY: number; pointerId: number } | null>(null);
  const dragging = useRef<{ item: DragItem; pointerId: number } | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const pointerDown = useCallback((item: DragItem, e: PointerEvent, captureTarget: Element) => {
    // Capture so we keep receiving events even when pointer leaves the element
    (captureTarget as HTMLElement).setPointerCapture(e.pointerId);
    pending.current = { item, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (pending.current && pending.current.pointerId === e.pointerId) {
      const dx = e.clientX - pending.current.startX;
      const dy = e.clientY - pending.current.startY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        const item = pending.current.item;
        dragging.current = { item, pointerId: e.pointerId };
        pending.current = null;
        setDragState({ isDragging: true, item, x: e.clientX, y: e.clientY });
      }
      return;
    }
    if (dragging.current && dragging.current.pointerId === e.pointerId) {
      setDragState(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
    }
  }, []);

  const onPointerUp = useCallback((e: PointerEvent, target: MoveTarget | null) => {
    if (dragging.current && dragging.current.pointerId === e.pointerId) {
      const item = dragging.current.item;
      dragging.current = null;
      setDragState(prev => ({ ...prev, isDragging: false, item: null }));

      if (item && target) {
        onMove(item.source, target);
      } else if (item && !target) {
        // Released outside any valid target — find via elementFromPoint
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const resolved = resolveDropTarget(el);
        if (resolved) onMove(item.source, resolved);
      }
    } else if (pending.current && pending.current.pointerId === e.pointerId) {
      // Tap: no movement → auto-move to foundation
      const source = pending.current.item.source;
      pending.current = null;
      onAutoMove(source);
    }
  }, [onMove, onAutoMove]);

  const cancelDrag = useCallback(() => {
    pending.current = null;
    dragging.current = null;
    setDragState(prev => ({ ...prev, isDragging: false, item: null }));
  }, []);

  return { dragState, pointerDown, onPointerMove, onPointerUp, cancelDrag };
}

function resolveDropTarget(el: Element | null): MoveTarget | null {
  let node = el;
  while (node) {
    const dataset = (node as HTMLElement).dataset;
    if (dataset.dropArea && dataset.dropIndex !== undefined) {
      return {
        area: dataset.dropArea as MoveTarget['area'],
        pileIndex: parseInt(dataset.dropIndex, 10),
      };
    }
    node = node.parentElement;
  }
  return null;
}
