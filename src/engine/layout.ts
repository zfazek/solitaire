/**
 * Persists small UI layout preferences in localStorage so they survive a
 * page reload / browser restart — the same way sound and saved games do.
 *
 * The top-row layout has THREE sensible modes, cycled round-robin by tapping
 * the title. Two aspects combine into a mode:
 *   - group side: is the stock/waste group on the LEFT or the RIGHT
 *   - deck swapped: within that group, is the stock (deck) in the
 *     conventional position or swapped to the outer edge
 *
 *   Mode 0: group LEFT,  conventional  (stock | waste  … foundations)
 *   Mode 2: group RIGHT, conventional  (foundations …  stock | waste)
 *   Mode 3: group RIGHT, deck swapped  (foundations …  waste | stock)  ← default,
 *                                        deck (stock) on the far-right edge
 *                                        (easy thumb reach)
 *
 * (Mode value 1 — group LEFT with the waste on the far-left edge — was removed
 * because it is neither conventional nor ergonomic. The numbering of the
 * remaining modes is kept stable.)
 *
 * The DEFAULT is mode 3 (group on the right, stock/deck on the far-right edge)
 * so the pile you tap most is easiest to reach with the thumb.
 */

const STORAGE_KEY = 'solitaire_layout_mode';

export type LayoutMode = 0 | 2 | 3;

/** The modes the title-tap cycles through, in order. */
const CYCLE: readonly LayoutMode[] = [0, 2, 3];

const DEFAULT_MODE: LayoutMode = 3;

/** Read the persisted layout mode (defaults to 3; invalid/removed values fall back). */
export function getLayoutMode(): LayoutMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_MODE;
    const n = Number(raw);
    return CYCLE.includes(n as LayoutMode) ? (n as LayoutMode) : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persist the layout mode. */
export function setLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(mode));
  } catch {
    // Storage full or private mode — silently ignore
  }
}

/** The next mode in round-robin order (wraps around the cycle list). */
export function nextLayoutMode(mode: LayoutMode): LayoutMode {
  const i = CYCLE.indexOf(mode);
  // If the current value is unknown, start the cycle from the beginning.
  return CYCLE[(i + 1) % CYCLE.length];
}

/** True when the stock/waste group is on the right (modes 2 and 3). */
export function isGroupRight(mode: LayoutMode): boolean {
  return mode >= 2;
}

/** True when the deck is swapped to the outer edge of the pair (mode 3). */
export function isDeckSwapped(mode: LayoutMode): boolean {
  return mode === 3;
}
