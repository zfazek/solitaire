// Measure how often the in-app solver accepts a random deal, and how often
// the "new game" reshuffle loop would hit its cap and fall back to an
// unproven deal (see findAcceptableDeal in src/hooks/useGameState.ts).
//
// Usage: npx tsx acceptance.ts [deals=2000] [budget=5000] [draw=1] [streak=10] [rngSeed=1]
//   deals    number of random deals to test
//   budget   isSolvable() state budget (the app uses the default, 5000)
//   draw     1 or 3
//   streak   report runs of at least this many consecutive non-solvable deals
//   rngSeed  seed for picking deal seeds, so the run is reproducible
import { newGame } from './src/engine/game';
import { isSolvable, type SolveResult } from './src/engine/solver';
import { mulberry32, SEED_MAX, seedToCode } from './src/engine/deck';

const MAX_RESHUFFLE_ATTEMPTS = 10; // keep in sync with useGameState.ts

const [dealsArg, budgetArg, drawArg, streakArg, rngArg] = process.argv.slice(2);
const deals = Number(dealsArg ?? 2000);
const budget = Number(budgetArg ?? 5000);
const draw = Number(drawArg ?? 1) === 3 ? 3 : 1;
const streakLen = Number(streakArg ?? 10);
const rng = mulberry32(Number(rngArg ?? 1));

if (![deals, budget, streakLen].every((n) => Number.isInteger(n) && n > 0)) {
  console.error('Usage: npx tsx acceptance.ts [deals] [budget] [draw 1|3] [streak] [rngSeed]');
  process.exit(1);
}

const counts: Record<SolveResult, number> = { solvable: 0, unsolvable: 0, unknown: 0 };
const results: SolveResult[] = [];
const seeds: number[] = [];

// Ctrl-C: finish the current deal, then print the report for what was tested.
let stopRequested = false;
let stopAt = 0;
process.on('SIGINT', () => {
  // tsx/npx forward SIGINT too, so one Ctrl-C can arrive twice within ms.
  // Only a deliberate second press (>1.5s later) quits without a report.
  if (stopRequested) {
    if (Date.now() - stopAt > 1500) process.exit(130);
    return;
  }
  stopRequested = true;
  stopAt = Date.now();
  process.stderr.write('\nInterrupted, finishing current deal... (Ctrl-C again to quit without report)\n');
});

const t0 = Date.now();
async function main(): Promise<void> {
for (let i = 0; i < deals && !stopRequested; i++) {
  // Yield to the event loop so the SIGINT handler can run between deals.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const seed = Math.floor(rng() * SEED_MAX);
  const r = isSolvable(newGame(draw, seed), budget);
  counts[r]++;
  results.push(r);
  seeds.push(seed);

  // Progress bar on stderr (so stdout stays clean for the final report).
  const done = i + 1;
  const frac = done / deals;
  const width = 30;
  const filled = Math.round(frac * width);
  const bar = '#'.repeat(filled) + '-'.repeat(width - filled);
  const elapsed = (Date.now() - t0) / 1000;
  const eta = done < deals ? ` ETA ${Math.round((elapsed / done) * (deals - done))}s` : '';
  process.stderr.write(`\r[${bar}] ${(frac * 100).toFixed(1)}% (${done}/${deals})${eta}   `);
}
process.stderr.write('\n');
const secs = (Date.now() - t0) / 1000;

// Maximal runs of consecutive non-solvable deals with length >= streakLen.
const streaks: { start: number; length: number }[] = [];
let runStart = -1;
for (let i = 0; i <= results.length; i++) {
  const bad = i < results.length && results[i] !== 'solvable';
  if (bad && runStart < 0) runStart = i;
  if (!bad && runStart >= 0) {
    if (i - runStart >= streakLen) streaks.push({ start: runStart, length: i - runStart });
    runStart = -1;
  }
}
const longest = (() => {
  let best = 0, cur = 0;
  for (const r of results) { cur = r === 'solvable' ? 0 : cur + 1; best = Math.max(best, cur); }
  return best;
})();

// Simulate the app: each "new game" draws candidates until one is solvable or
// MAX_RESHUFFLE_ATTEMPTS+1 candidates have failed (then the last is used).
let games = 0, fallbacks = 0;
for (let i = 0; i < results.length; ) {
  let tried = 0, accepted = false;
  while (i < results.length && tried < MAX_RESHUFFLE_ATTEMPTS + 1) {
    tried++;
    if (results[i++] === 'solvable') { accepted = true; break; }
  }
  if (!accepted && tried < MAX_RESHUFFLE_ATTEMPTS + 1) break; // ran out of data mid-game
  games++;
  if (!accepted) fallbacks++;
}

const tested = results.length;
const pct = (n: number) => (tested ? `${((100 * n) / tested).toFixed(2)}%` : 'n/a');
if (stopRequested) console.log(`INTERRUPTED: partial result for ${tested}/${deals} deals`);
console.log(`deals=${tested} budget=${budget} draw=${draw} (${secs.toFixed(1)}s)`);
console.log(`solvable:   ${counts.solvable} (${pct(counts.solvable)})`);
console.log(`unknown:    ${counts.unknown} (${pct(counts.unknown)})`);
console.log(`unsolvable: ${counts.unsolvable} (${pct(counts.unsolvable)})`);
console.log(`longest run of non-solvable deals: ${longest}`);
console.log(`runs of >= ${streakLen} consecutive non-solvable deals: ${streaks.length}`);
for (const s of streaks) {
  console.log(`  start #${s.start} (seed ${seedToCode(seeds[s.start])}), length ${s.length}`);
}
console.log(`simulated new games: ${games}, fallbacks (${MAX_RESHUFFLE_ATTEMPTS + 1} failures in a row): ${fallbacks}`);
}

main();
