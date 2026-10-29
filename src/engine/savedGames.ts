import type { GameState, Card, Suit, Rank } from './types';
import { cardId } from './deck';

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

// ---------------------------------------------------------------------------
// Compact serialization
//
// The old format stored every card as a full object
//   {"suit":"diamonds","rank":13,"faceUp":true,"id":"diamonds-13"}
// (~58 bytes). A single long game appends a full board snapshot to `history`
// on every move, so one entry could grow to ~1 MB and blow past iOS Safari's
// ~5 MB localStorage quota — once `setItem` throws, autosave silently stops
// and the game appears to "lose" its latest moves on reload.
//
// The compact format encodes each card as a tiny string:  suit letter + rank,
// with a trailing "+" when the card is face up.  e.g.  "d13+"  "s1"  "h11".
// `id` is NOT stored — it is pure derivation of suit+rank and is rebuilt via
// cardId() on load.  This is ~14x smaller, keeping saves well under quota
// without limiting undo depth.
// ---------------------------------------------------------------------------

const SUIT_TO_CHAR: Record<Suit, string> = {
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
  spades: 's',
};
const CHAR_TO_SUIT: Record<string, Suit> = {
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
  s: 'spades',
};

function encodeCard(card: Card): string {
  return `${SUIT_TO_CHAR[card.suit]}${card.rank}${card.faceUp ? '+' : ''}`;
}

function decodeCard(code: string): Card {
  const faceUp = code.endsWith('+');
  const body = faceUp ? code.slice(0, -1) : code;
  const suit = CHAR_TO_SUIT[body[0]];
  const rank = Number(body.slice(1)) as Rank;
  return { suit, rank, faceUp, id: cardId(suit, rank) };
}

function encodePile(cards: Card[]): string[] {
  return cards.map(encodeCard);
}
function decodePile(codes: string[]): Card[] {
  return codes.map(decodeCard);
}

/** Compact wire shape of a GameState (cards as short strings). */
interface CompactGameState {
  t: string[][]; // tableau
  f: string[][]; // foundations
  s: string[];   // stock
  w: string[];   // waste
  d: 1 | 3;      // drawCount
  won: boolean;
  seed: number;
}

function encodeGameState(g: GameState): CompactGameState {
  return {
    t: g.tableau.map(encodePile),
    f: g.foundations.map(encodePile),
    s: encodePile(g.stock),
    w: encodePile(g.waste),
    d: g.drawCount,
    won: g.won,
    seed: g.seed,
  };
}

function decodeGameState(c: CompactGameState): GameState {
  return {
    tableau: c.t.map(decodePile),
    foundations: c.f.map(decodePile),
    stock: decodePile(c.s),
    waste: decodePile(c.w),
    drawCount: c.d,
    won: c.won,
    seed: c.seed,
  };
}

/** Compact wire shape of a SavedGame. `v` marks the schema version. */
interface CompactSavedGame {
  v: 2;
  id: string;
  createdAt: number;
  lastPlayed: number;
  drawCount: 1 | 3;
  initial: CompactGameState;
  current: CompactGameState;
  history: CompactGameState[];
}

function encodeSavedGame(g: SavedGame): CompactSavedGame {
  return {
    v: 2,
    id: g.id,
    createdAt: g.createdAt,
    lastPlayed: g.lastPlayed,
    drawCount: g.drawCount,
    initial: encodeGameState(g.initial),
    current: encodeGameState(g.current),
    history: g.history.map(encodeGameState),
  };
}

function decodeSavedGame(c: CompactSavedGame): SavedGame {
  return {
    id: c.id,
    createdAt: c.createdAt,
    lastPlayed: c.lastPlayed,
    drawCount: c.drawCount,
    initial: decodeGameState(c.initial),
    current: decodeGameState(c.current),
    history: (c.history ?? []).map(decodeGameState),
  };
}

// ---- Migration from the legacy (v1) object format -------------------------
//
// Legacy entries stored full GameState objects (cards as {suit,rank,faceUp,id}).
// They have no `v` field and their GameStates carry a `tableau` array. We read
// such entries as-is (they already match the in-memory GameState shape), and
// they get rewritten in the compact format on the next writeAll(). This runs
// transparently and only needs to happen once per user; the migration branch
// can be removed in a future release.

function isLegacyEntry(raw: unknown): raw is SavedGame {
  if (!raw || typeof raw !== 'object') return false;
  const g = raw as Record<string, unknown>;
  return (
    typeof g.id === 'string' &&
    !!g.initial &&
    !!g.current &&
    // Legacy GameStates have a `tableau`; compact ones use `t`.
    typeof (g.current as Record<string, unknown>).tableau !== 'undefined'
  );
}

function isCompactEntry(raw: unknown): raw is CompactSavedGame {
  if (!raw || typeof raw !== 'object') return false;
  const g = raw as Record<string, unknown>;
  return g.v === 2 && typeof g.id === 'string' && !!g.initial && !!g.current;
}

/** Decode one stored entry from either format, or null if unrecognizable. */
function decodeEntry(raw: unknown): SavedGame | null {
  try {
    if (isCompactEntry(raw)) return decodeSavedGame(raw);
    if (isLegacyEntry(raw)) {
      // Already in the in-memory shape; normalize history to an array.
      const g = raw as SavedGame;
      return { ...g, history: Array.isArray(g.history) ? g.history : [] };
    }
    return null;
  } catch {
    return null;
  }
}

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
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Decode each entry from either the compact (v2) or legacy object format.
    // Unrecognizable entries are dropped rather than crashing the load.
    return parsed
      .map(decodeEntry)
      .filter((g): g is SavedGame => g !== null);
  } catch {
    return [];
  }
}

function writeAll(games: SavedGame[]): void {
  // Always persist in the compact format. On quota overflow (notably iOS
  // Safari's smaller limit) we evict the least-recently-played game and retry,
  // so a save can degrade gracefully instead of silently vanishing.
  let list = [...games];
  for (;;) {
    try {
      const payload = JSON.stringify(list.map(encodeSavedGame));
      localStorage.setItem(STORAGE_KEY, payload);
      return;
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      if (!quota || list.length <= 1) {
        // Either not a quota error, or we're down to the single active game and
        // still can't fit it — nothing more we can safely drop.
        return;
      }
      // Drop the least-recently-played entry and try again.
      let oldestIdx = 0;
      for (let i = 1; i < list.length; i++) {
        if (list[i].lastPlayed < list[oldestIdx].lastPlayed) oldestIdx = i;
      }
      list.splice(oldestIdx, 1);
    }
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
