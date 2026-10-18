/**
 * Persists small UI layout preferences in localStorage so they survive a
 * page reload / browser restart — the same way sound and saved games do.
 *
 * Currently: whether the top row is flipped horizontally. The DEFAULT layout
 * is flipped (foundations on the left, stock/waste on the right); clicking the
 * "Solitaire" title toggles it back to stock/waste on the left.
 */

const STORAGE_KEY = 'solitaire_board_flipped';

/** Read the persisted flip state (defaults to true — stock/waste on the right). */
export function isBoardFlipped(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

/** Persist the flip state. */
export function setBoardFlipped(flipped: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(flipped));
  } catch {
    // Storage full or private mode — silently ignore
  }
}
