import type { Difficulty } from './solver';

/** Persists the New Game dialog's difficulty ticks across page reloads. */

const STORAGE_KEY = 'solitaire_difficulty_levels';

const ALL: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Read the persisted ticks (defaults to all three; invalid data falls back). */
export function getDifficultyLevels(): Difficulty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [...ALL];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL];
    // Keep only known values, in canonical order. An empty selection is valid
    // (the user unticked everything; Shuffle is simply disabled).
    return ALL.filter((l) => parsed.includes(l));
  } catch {
    return [...ALL];
  }
}

export function setDifficultyLevels(levels: readonly Difficulty[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    // Storage unavailable — the in-memory selection still works.
  }
}
