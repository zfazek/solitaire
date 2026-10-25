/**
 * Play a short horizontal "no" shake on a DOM element using the Web Animations
 * API. Using WAAPI (rather than toggling a CSS class) keeps the element's
 * standing CSS `animation` (the cardIn mount fade) untouched, so the card does
 * not re-run cardIn — and therefore does not flicker — once the shake ends.
 */
export function shakeElement(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== 'function') return;

  // Respect the user's reduced-motion preference.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 400, easing: 'ease-in-out' },
  );
}
