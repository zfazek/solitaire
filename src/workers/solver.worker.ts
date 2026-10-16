import { isSolvable } from '../engine/solver';
import type { GameState } from '../engine/types';

self.onmessage = (e: MessageEvent<GameState>) => {
  const result = isSolvable(e.data);
  self.postMessage(result);
};
