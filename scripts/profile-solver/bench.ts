// Solver benchmark. Not run directly: scripts/profile-solver/run.mjs bundles it
// and runs it under `node --cpu-prof`.
//
// Deals are deterministic (newGame -> mulberry32(seed)), so every run times
// exactly the same positions: seeds start..start+deals-1.
//
// Usage (via the bundle): node bench.mjs <outJson> <deals> <startSeed> <draws>
//   draws: "1", "3" or "1,3"
import { writeFileSync } from 'node:fs';
import { newGame } from '../../src/engine/game';
import { isSolvable } from '../../src/engine/solver';

const [outFile, dealsArg, startArg, drawsArg] = process.argv.slice(2);
const deals = Number(dealsArg);
const start = Number(startArg);
const draws = drawsArg.split(',').map(Number) as (1 | 3)[];

interface Sample {
  seed: number;
  ms: number;
  result: string;
  states: number;
}

const runs: { draw: 1 | 3; samples: Sample[] }[] = [];

for (const draw of draws) {
  const samples: Sample[] = [];
  for (let seed = start; seed < start + deals; seed++) {
    const game = newGame(draw, seed);
    const t0 = performance.now();
    const r = isSolvable(game);
    samples.push({ seed, ms: performance.now() - t0, result: r.result, states: r.statesExplored });
  }
  runs.push({ draw, samples });
}

writeFileSync(outFile, JSON.stringify({ deals, start, runs }));
