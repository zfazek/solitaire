import type { GameState } from '../engine/types';
import type { SolveAnalysis, Difficulty, SolveResult } from '../engine/solver';
import SolverWorker from './solver.worker?worker';

// What we remember about a deal. A deal is fully determined by its seed and
// draw mode, so the analysis can be cached under that key and shared by the
// New-game search and the Saved-games list.
export interface DealRating {
  result: SolveResult;
  difficulty: Difficulty | null;
}

// Bump the suffix whenever the solver budget or difficulty thresholds change,
// so stale ratings are discarded.
const STORAGE_KEY = 'solitaire_deal_ratings_v1';

const dealKey = (seed: number, drawCount: 1 | 3) => `${seed}-${drawCount}`;

let cache: Map<string, DealRating> | null = null;

function load(): Map<string, DealRating> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, DealRating>)) {
        cache.set(k, v);
      }
    }
  } catch {
    // Corrupt or unavailable storage — start with an empty cache.
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(load())));
  } catch {
    // Quota / unavailable — the in-memory cache still works.
  }
}

export function getCachedRating(seed: number, drawCount: 1 | 3): DealRating | undefined {
  return load().get(dealKey(seed, drawCount));
}

/** Remember the rating of a deal the player actually keeps. */
export function rememberRating(game: GameState, analysis: SolveAnalysis): void {
  if (!Number.isFinite(game.seed)) return;
  load().set(dealKey(game.seed, game.drawCount), {
    result: analysis.result,
    difficulty: analysis.difficulty,
  });
  persist();
}

/**
 * Run the solver on a deal in a background Web Worker. Does NOT cache — the
 * New-game search analyses many throwaway candidates; only kept deals are
 * remembered (see rememberRating).
 */
// Set once a worker error has been logged, so a broken worker (which would
// fail on every call) doesn't spam the console.
let warnedWorkerError = false;

export function analyzeDeal(game: GameState): Promise<SolveAnalysis> {
  return new Promise((resolve) => {
    // A worker that fails to load (e.g. blocked by a strict CSP in some
    // WebViews, or a bundling regression) would otherwise never fire
    // `onmessage`, leaving the promise — and the new-game search — pending
    // forever on "Searching…". Degrade gracefully to 'unknown' so the caller
    // treats the deal as unproven (and reshuffles) instead of hanging.
    const fallback: SolveAnalysis = {
      result: 'unknown',
      statesExplored: 0,
      solutionLength: null,
      deadEndRatio: 1,
      difficulty: null,
    };

    const worker = new SolverWorker();
    let settled = false;
    const settle = (analysis: SolveAnalysis) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(analysis);
    };

    worker.onmessage = (e: MessageEvent<SolveAnalysis>) => settle(e.data);
    worker.onerror = () => {
      if (!warnedWorkerError) {
        warnedWorkerError = true;
        console.warn('Solitaire solver worker failed to load; treating deals as unproven.');
      }
      settle(fallback);
    };
    worker.postMessage(game);
  });
}
