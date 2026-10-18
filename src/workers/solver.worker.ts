import { isSolvable, type SolveResult } from '../engine/solver';
import type { GameState } from '../engine/types';

self.onmessage = (e: MessageEvent<GameState>) => {
  const result: SolveResult = isSolvable(e.data);
  self.postMessage(result);
};
