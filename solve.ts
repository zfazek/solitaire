import { codeToSeed } from './src/engine/deck';
import { newGame } from './src/engine/game';
import { isSolvable } from './src/engine/solver';

const hashArg = process.argv[2];

if (!hashArg) {
  console.error('Usage: npx tsx solve.ts <4-char-hash>');
  process.exit(1);
}

const seed = codeToSeed(hashArg);
if (seed === null) {
  console.error(`Error: Invalid 4-character hash "${hashArg}"`);
  process.exit(1);
}

const game = newGame(1, seed);
const result = isSolvable(game, 5000);

console.log(result);
