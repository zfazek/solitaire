import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { codeToSeed } from './src/engine/deck';
import type { SolveAnalysis } from './src/engine/solver';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0'; // all interfaces
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // set when behind nginx/Cloudflare/etc.
const WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1));
const MAX_QUEUE = 50;
const CACHE_SIZE = 10_000;
const RATE_LIMIT = 30; // requests per IP per minute

// Workers don't inherit tsx's TypeScript loader, so register it in the worker first.
const WORKER_BOOT = `
import { register } from 'tsx/esm/api';
register();
await import(${JSON.stringify(new URL('./solve-worker.ts', import.meta.url).href)});
`;

// --- worker pool: solving runs off the main thread ---
type Job = { seed: number; resolve: (r: SolveAnalysis) => void; reject: (e: Error) => void };
const queue: Job[] = [];
const idle: Worker[] = [];
const current = new Map<Worker, Job>();

function spawn() {
  const w = new Worker(WORKER_BOOT, { eval: true });
  w.on('message', ({ result }: { result: SolveAnalysis }) => {
    current.get(w)?.resolve(result);
    current.delete(w);
    idle.push(w);
    pump();
  });
  w.on('error', (err) => {
    console.error(err);
    current.get(w)?.reject(err);
    current.delete(w);
    const i = idle.indexOf(w);
    if (i >= 0) idle.splice(i, 1);
    spawn();
    pump();
  });
  idle.push(w);
}
for (let i = 0; i < WORKERS; i++) spawn();

function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop()!;
    const job = queue.shift()!;
    current.set(w, job);
    w.postMessage({ id: 0, seed: job.seed });
  }
}

function solve(seed: number): Promise<SolveAnalysis> {
  return new Promise((resolve, reject) => {
    queue.push({ seed, resolve, reject });
    pump();
  });
}

// --- cache (LRU) and in-flight de-duplication ---
const cache = new Map<number, SolveAnalysis>();
const inflight = new Map<number, Promise<SolveAnalysis>>();

// --- per-IP rate limit ---
const hits = new Map<string, { count: number; reset: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
}, 60_000).unref();

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.count > RATE_LIMIT;
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = /^\/seed\/([^/]+)\/?$/.exec(url.pathname);
  if (req.method !== 'GET' || !match) return send(res, 404, { error: 'Not found' });

  if (limited(clientIp(req))) return send(res, 429, { error: 'Too many requests' }, { 'Retry-After': '60' });

  let code: string;
  try {
    code = decodeURIComponent(match[1]);
  } catch {
    return send(res, 400, { error: 'Bad request' });
  }
  const seed = codeToSeed(code);
  if (seed === null) return send(res, 400, { error: 'Invalid seed: expected 4 characters 0-9, a-z' });

  const hit = cache.get(seed);
  if (hit) {
    cache.delete(seed);
    cache.set(seed, hit); // refresh LRU position
    return send(res, 200, hit);
  }

  let p = inflight.get(seed);
  if (!p) {
    if (queue.length >= MAX_QUEUE) return send(res, 503, { error: 'Busy, try again' }, { 'Retry-After': '5' });
    p = solve(seed).finally(() => inflight.delete(seed));
    inflight.set(seed, p);
  }
  try {
    const result = await p;
    cache.set(seed, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    send(res, 200, result);
  } catch {
    send(res, 500, { error: 'Internal error' });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 10_000;
server.listen(PORT, HOST, () => console.log(`Listening on ${HOST}:${PORT} (${WORKERS} workers)`));
