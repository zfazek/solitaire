#!/usr/bin/env node
// Profile the solver (src/engine/solver.ts) on reproducible pseudo-random deals,
// then analyse and visualise the results.
//
//   npm run profile:solver -- [--deals N] [--start SEED] [--draw 1|3|both]
//                             [--top K] [--html] [--no-cpu] [--out DIR]
//
// Steps: bundle bench.ts with rolldown -> run it under `node --cpu-prof` ->
// print timing stats + histogram + CPU hotspots in the terminal; with --html
// also write a self-contained report (default: profile-out/solver-report.html).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
if (flag('help')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const deals = Number(opt('deals', 300));
const start = Number(opt('start', 1));
const drawOpt = opt('draw', 'both');
const draws = drawOpt === 'both' ? '1,3' : drawOpt;
const top = Number(opt('top', 15));
const outDir = resolve(root, opt('out', 'profile-out'));
const cpu = !flag('no-cpu');
if (!Number.isInteger(deals) || deals < 1 || !Number.isInteger(start) || !['1', '3', '1,3'].includes(draws)) {
  console.error('Invalid arguments. Run with --help.');
  process.exit(1);
}

// ---------- build + run ----------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, 'bench.mjs');
const resultsFile = join(outDir, 'results.json');
const cpuDir = join(outDir, 'cpu');

const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd} ${argv.join(' ')}`);
    process.exit(r.status ?? 1);
  }
};

console.log(`Bundling benchmark…`);
run(join(root, 'node_modules/.bin/rolldown'), [
  join(here, 'bench.ts'), '--platform', 'node', '--format', 'esm', '--file', bundle,
]);
console.log(`Running ${deals} deals (seeds ${start}..${start + deals - 1}), draw=${draws}${cpu ? ', with CPU profile' : ''}…`);
run(process.execPath, [
  ...(cpu ? ['--cpu-prof', `--cpu-prof-dir=${cpuDir}`] : []),
  bundle, resultsFile, String(deals), String(start), draws,
]);

const data = JSON.parse(readFileSync(resultsFile, 'utf8'));

// ---------- timing analysis ----------
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function analyse({ draw, samples }) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const total = ms.reduce((a, b) => a + b, 0);
  const states = samples.reduce((a, s) => a + s.states, 0);
  const results = {};
  for (const s of samples) results[s.result] = (results[s.result] ?? 0) + 1;
  const max = ms[ms.length - 1];
  // 10 equal-width histogram buckets from 0 to max.
  const bins = new Array(10).fill(0);
  for (const v of ms) bins[Math.min(9, Math.floor((v / max) * 10))]++;
  return {
    draw, n: samples.length, total, avg: total / samples.length,
    p50: pct(ms, 0.5), p90: pct(ms, 0.9), p99: pct(ms, 0.99), max,
    statesPerSec: states / (total / 1000), avgStates: states / samples.length,
    results, bins, binWidth: max / 10,
    slowest: [...samples].sort((a, b) => b.ms - a.ms).slice(0, 3),
  };
}
const stats = data.runs.map(analyse);

// ---------- CPU profile analysis ----------
function analyseCpu() {
  if (!cpu) return null;
  const file = readdirSync(cpuDir).find((f) => f.endsWith('.cpuprofile'));
  if (!file) return null;
  const prof = JSON.parse(readFileSync(join(cpuDir, file), 'utf8'));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  prof.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame;
    // Only attribute to our code, GC and V8 internals; skip node bootstrap noise.
    const name = cf.functionName || '(anonymous)';
    const where = cf.url ? `${cf.url.split('/').pop()}:${cf.lineNumber + 1}` : '';
    const key = ['(garbage collector)', '(program)', '(idle)', '(root)'].includes(name) ? name : `${name} ${where}`.trim();
    self.set(key, (self.get(key) ?? 0) + prof.timeDeltas[i]);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, us]) => ({ name, ms: us / 1000, share: us / total }));
}
const hot = analyseCpu();

// ---------- terminal output ----------
const bar = (frac, width = 30) => '█'.repeat(Math.max(0, Math.round(frac * width)));
const f1 = (n) => n.toFixed(1);

for (const s of stats) {
  console.log(`\n=== draw-${s.draw}: ${s.n} deals, total ${f1(s.total / 1000)} s ===`);
  console.log(`time/deal  avg ${f1(s.avg)} ms | p50 ${f1(s.p50)} | p90 ${f1(s.p90)} | p99 ${f1(s.p99)} | max ${f1(s.max)}`);
  console.log(`throughput ${Math.round(s.statesPerSec)} states/s, avg ${Math.round(s.avgStates)} states/deal`);
  console.log(
    'results    ' +
      Object.entries(s.results).map(([k, v]) => `${k} ${v} (${((v / s.n) * 100).toFixed(0)}%)`).join(', '),
  );
  console.log('distribution of time per deal:');
  const maxBin = Math.max(...s.bins);
  s.bins.forEach((c, i) => {
    const lo = f1(i * s.binWidth).padStart(7);
    const hi = f1((i + 1) * s.binWidth).padStart(7);
    console.log(`  ${lo} – ${hi} ms | ${bar(c / maxBin).padEnd(30)} ${c}`);
  });
  console.log('slowest seeds: ' + s.slowest.map((x) => `${x.seed} (${f1(x.ms)} ms, ${x.result})`).join(', '));
}

if (hot) {
  console.log(`\n=== CPU hotspots (self time, top ${hot.length}) ===`);
  for (const h of hot) {
    console.log(`  ${(h.share * 100).toFixed(1).padStart(5)}% ${bar(h.share, 40).padEnd(40)} ${h.name}`);
  }
}

// ---------- HTML report ----------
if (flag('html')) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const hbars = (rows, label, value, fmt) => {
    const maxV = Math.max(...rows.map(value));
    return rows
      .map((r) => `<div class="row"><span class="lbl">${esc(label(r))}</span><span class="b" style="width:${(value(r) / maxV) * 100}%"></span><span class="v">${esc(fmt(r))}</span></div>`)
      .join('');
  };
  const sections = stats
    .map(
      (s) => `<h2>draw-${s.draw} <small>${s.n} deals, seeds ${data.start}..${data.start + s.n - 1}</small></h2>
<table><tr><th>avg</th><th>p50</th><th>p90</th><th>p99</th><th>max</th><th>states/s</th><th>avg states</th></tr>
<tr><td>${f1(s.avg)} ms</td><td>${f1(s.p50)}</td><td>${f1(s.p90)}</td><td>${f1(s.p99)}</td><td>${f1(s.max)}</td><td>${Math.round(s.statesPerSec)}</td><td>${Math.round(s.avgStates)}</td></tr></table>
<h3>Results</h3>${hbars(Object.entries(s.results), (r) => r[0], (r) => r[1], (r) => `${r[1]} (${((r[1] / s.n) * 100).toFixed(0)}%)`)}
<h3>Time per deal (ms)</h3>${hbars(s.bins.map((c, i) => [i, c]), (r) => `${f1(r[0] * s.binWidth)}–${f1((r[0] + 1) * s.binWidth)}`, (r) => r[1], (r) => r[1])}`,
    )
    .join('');
  const hotHtml = hot
    ? `<h2>CPU hotspots <small>self time</small></h2>${hbars(hot, (r) => r.name, (r) => r.share, (r) => `${(r.share * 100).toFixed(1)}%`)}`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><title>Solver profile</title>
<style>body{font:14px system-ui;margin:2rem;max-width:960px}h2 small{font-weight:400;color:#666;font-size:.7em}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .7rem;text-align:right}
.row{display:flex;align-items:center;gap:.5rem;margin:2px 0}.lbl{width:260px;flex:none;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.b{background:#4a7bd0;height:14px;display:inline-block}.v{font-family:monospace}</style>
<h1>Solver profile</h1>${sections}${hotHtml}`;
  const htmlFile = join(outDir, 'solver-report.html');
  writeFileSync(htmlFile, html);
  console.log(`\nHTML report: ${htmlFile}`);
}
console.log(`Raw data: ${resultsFile}${cpu ? `, CPU profile: ${cpuDir} (open in Chrome DevTools / speedscope)` : ''}`);
