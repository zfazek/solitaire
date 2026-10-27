import { useLayoutEffect, useRef } from 'react';

/**
 * Generic FLIP (First, Last, Invert, Play) travel animation for cards.
 *
 * Every card node in the DOM carries a stable `data-card-id`. After each render
 * we measure where every card is now (Last) and compare it to where it was on
 * the previous render (First). For any card that moved, we apply an inverted
 * transform (Invert) so it visually starts at its old position, then animate
 * that transform away to zero (Play) with the Web Animations API — making the
 * card appear to glide from its old pile to its new one.
 *
 * This is driven purely by DOM position diffing, so it automatically covers
 * EVERY way a card can move — tap-to-move, tap-to-foundation, auto-move,
 * auto-complete, stock→waste draw, and undo — without touching any of those
 * code paths.
 *
 * Respects `prefers-reduced-motion`: when set, positions are tracked but no
 * animation plays.
 *
 * @param deps A value that changes on every move (the game state object). The
 *             effect re-runs whenever it changes.
 */
export function useCardFlip(deps: unknown): void {
  // Last-known *untransformed* screen rect for each card id.
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  // Last-known face state per card id ('back' | 'face'), to detect the moment a
  // tableau card is turned face-up so we can delay its reveal until the moving
  // card has finished travelling.
  const prevFace = useRef<Map<string, 'back' | 'face'>>(new Map());
  // The in-flight FLIP animation per card id, so we can cancel it before
  // re-measuring (a running transform would otherwise corrupt the rect, since
  // getBoundingClientRect() reflects CSS transforms).
  const anims = useRef<Map<string, Animation>>(new Map());

  useLayoutEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-card-id]');

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const nextRects = new Map<string, DOMRect>();
    const nextFace = new Map<string, 'back' | 'face'>();

    // Collect the back→face reveals seen this render so we can delay them only
    // when a travel animation is actually happening (i.e. a card moved away).
    const reveals: HTMLElement[] = [];
    let anyTravel = false;

    nodes.forEach((node) => {
      const id = node.dataset.cardId;
      if (!id) return;

      // Cancel any still-running FLIP on this node so the measurement below
      // reflects the card's true laid-out position, not a mid-flight transform.
      const running = anims.current.get(id);
      if (running) {
        running.cancel();
        anims.current.delete(id);
        node.classList.remove('card-flipping');
      }

      const rect = node.getBoundingClientRect();
      nextRects.set(id, rect);

      // Track face state. A node is "face" unless it is a plain card back.
      const face: 'back' | 'face' = node.classList.contains('card-back') ? 'back' : 'face';
      nextFace.set(id, face);
      const wasFace = prevFace.current.get(id);

      if (reduceMotion) return;

      const prev = prevRects.current.get(id);
      if (!prev) return; // newly dealt card — no travel to animate

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;

      // Only animate genuine pile-to-pile moves, not incidental layout reflow.
      // A real move spans tens-to-hundreds of pixels; small shifts (a few px of
      // flex re-rounding when a pile's height changes) must NOT flick a card
      // that merely stayed put — e.g. a card already resting on a foundation.
      const MOVE_THRESHOLD = 24;
      const moved = Math.abs(dx) >= MOVE_THRESHOLD || Math.abs(dy) >= MOVE_THRESHOLD;

      // A tableau card that just turned face-up WITHOUT moving is a newly
      // exposed card. Defer revealing it until the travelling card lands.
      if (!moved && wasFace === 'back' && face === 'face') {
        reveals.push(node);
        return;
      }

      if (!moved) return;
      anyTravel = true;

      // Suppress the standing `cardIn` mount animation for the duration of the
      // FLIP so the two don't fight (cardIn also nudges translateY).
      node.classList.add('card-flipping');

      const anim = node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 400,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        },
      );
      anims.current.set(id, anim);

      anim.onfinish = anim.oncancel = () => {
        // Swap to a permanent "settled" class instead of just removing
        // card-flipping. Reverting to the default .card rule would re-enable
        // `animation: cardIn` and the browser replays it from opacity:0 —
        // making the just-landed card blink out. The card is already in place
        // and fully visible, so it never needs the mount animation again.
        node.classList.remove('card-flipping');
        node.classList.add('card-settled');
        if (anims.current.get(id) === anim) anims.current.delete(id);
      };
    });

    // Play the deferred reveals: only delay them when a card actually travelled
    // this render (otherwise reveal immediately so nothing looks stuck).
    for (const node of reveals) {
      const delay = anyTravel ? 370 : 0;
      node.classList.add('card-revealing');
      const reveal = node.animate(
        [
          { transform: 'perspective(600px) rotateY(90deg)', opacity: 0 },
          { transform: 'perspective(600px) rotateY(90deg)', opacity: 0, offset: 0.0001 },
          { transform: 'perspective(600px) rotateY(0deg)', opacity: 1 },
        ],
        {
          duration: 300,
          delay,
          easing: 'ease-out',
          fill: 'both',
        },
      );
      reveal.onfinish = reveal.oncancel = () => {
        node.classList.remove('card-revealing');
        node.classList.add('card-settled');
      };
    }

    prevRects.current = nextRects;
    prevFace.current = nextFace;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
}
