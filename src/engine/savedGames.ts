import type { GameState } from './types';

/**
 * A saved game entry. `initial` is the exact shuffled deal (for Restart),
 * while `current` + `history` capture live progress so a game can be resumed
 * exactly where it was left off.
 */
export interface SavedGame {
  id: string;          // unique id = creation timestamp (ms since epoch, as string)
  createdAt: number;   // ms since epoch — when the deal was created
  lastPlayed: number;  // ms since epoch — last time the game was opened/updated
  drawCount: 1 | 3;
  initial: GameState;
  current: GameState;
  history: GameState[];
}

const STORAGE_KEY = 'solitaire_saved_games';

/** A plain label for an entry: "2026-10-17 07:26:12" from its createdAt. */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function readAll(): SavedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedGame[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g) => g && typeof g.id === 'string' && g.initial && g.current && Array.isArray(g.history),
    );
  } catch {
    return [];
  }
}

function writeAll(games: SavedGame[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // Storage full or private mode — silently ignore
  }
}

/** All saved games, ordered by lastPlayed descending (most recent first). */
export function listSavedGames(): SavedGame[] {
  return readAll().sort((a, b) => b.lastPlayed - a.lastPlayed);
}

/** Get one saved game by id, or null. */
export function getSavedGame(id: string): SavedGame | null {
  return readAll().find((g) => g.id === id) ?? null;
}

/** Insert or update a saved game (matched by id). */
export function upsertSavedGame(game: SavedGame): void {
  const games = readAll();
  const idx = games.findIndex((g) => g.id === game.id);
  if (idx >= 0) {
    games[idx] = game;
  } else {
    games.push(game);
  }
  writeAll(games);
}

/** Remove a saved game by id. */
export function removeSavedGame(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id));
}

/** Generate a unique id based on the current time (ms since epoch). */
export function newSavedGameId(): string {
  return String(Date.now());
}
