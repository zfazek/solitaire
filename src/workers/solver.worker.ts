import { isSolvable, type SolveAnalysis } from '../engine/solver';
import type { GameState } from '../engine/types';

self.onmessage = (e: MessageEvent<GameState>) => {
  const analysis: SolveAnalysis = isSolvable(e.data);
  self.postMessage(analysis);
};
