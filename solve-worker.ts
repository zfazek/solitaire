import { parentPort } from 'node:worker_threads';
import { newGame } from './src/engine/game';
import { isSolvable } from './src/engine/solver';

const MAX_MOVES = 5000; // same limit as solve.ts

parentPort!.on('message', ({ id, seed }: { id: number; seed: number }) => {
  parentPort!.postMessage({ id, result: isSolvable(newGame(1, seed), MAX_MOVES) });
});
