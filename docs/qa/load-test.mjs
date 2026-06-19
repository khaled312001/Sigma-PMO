/**
 * Load / stress test (authorized — own system, isolated QA stack).
 * Drives thousands of concurrent operations + bulk user creation and reports
 * throughput + latency percentiles + error/429 breakdown per scenario.
 *
 *   BASE=http://127.0.0.1:3009/api/v1 ADMIN_KEY=sk_... node load-test.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3009/api/v1';
const KEY = process.env.ADMIN_KEY || '';
const SCALE = Number(process.env.SCALE || 1);

async function call(method, path, { key = KEY, body } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  await res.text();
  return res.status;
}

async function runPool(name, total, concurrency, taskFn) {
  const durations = [];
  const statuses = {};
  let errors = 0;
  let next = 0;
  const t0 = performance.now();
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= total) break;
      const s = performance.now();
      try {
        const st = await taskFn(i);
        statuses[st] = (statuses[st] || 0) + 1;
      } catch {
        errors++;
        statuses['ERR'] = (statuses['ERR'] || 0) + 1;
      }
      durations.push(performance.now() - s);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = performance.now() - t0;
  durations.sort((a, b) => a - b);
  const pct = (p) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] : 0);
  const ok = Object.entries(statuses).filter(([s]) => +s >= 200 && +s < 400).reduce((a, [, n]) => a + n, 0);
  const r = {
    scenario: name, total, concurrency, wallMs: Math.round(wall),
    throughputRps: +(total / (wall / 1000)).toFixed(1),
    ok, errors, statuses,
    latencyMs: { avg: Math.round(durations.reduce((a, b) => a + b, 0) / (durations.length || 1)), p50: Math.round(pct(0.5)), p95: Math.round(pct(0.95)), p99: Math.round(pct(0.99)), max: Math.round(durations[durations.length - 1] || 0) },
  };
  console.log(`\n[${name}] total=${total} conc=${concurrency} wall=${r.wallMs}ms tput=${r.throughputRps}/s ok=${ok} err=${errors}`);
  console.log(`   latency ms: avg=${r.latencyMs.avg} p50=${r.latencyMs.p50} p95=${r.latencyMs.p95} p99=${r.latencyMs.p99} max=${r.latencyMs.max} | statuses=${JSON.stringify(statuses)}`);
  return r;
}

async function main() {
  console.log(`\n=== Sigma Load / Stress Test ===\nTarget: ${BASE} (scale x${SCALE})\n`);
  const stamp = Date.now().toString(36);
  const results = [];

  // S1 — bulk user creation via admin (writes + scrypt hashing; CPU-bound).
  results.push(await runPool('bulk-create-users', Math.round(1000 * SCALE), 60, (i) =>
    call('POST', '/auth/users', { body: { email: `load-${stamp}-${i}@load.test`, displayName: `Load ${i}`, role: 'consultant', password: 'Passw0rd!23' } })));

  // S2 — high-concurrency simple reads.
  results.push(await runPool('read-projects', Math.round(6000 * SCALE), 400, () => call('GET', '/projects')));

  // S3 — high-concurrency computed reads (executive overview = KPIs).
  results.push(await runPool('read-executive-overview', Math.round(4000 * SCALE), 250, () => call('GET', '/executive/overview?projectKey=P-1000')));

  // S4 — concurrent writes (support tickets = a real DB insert).
  results.push(await runPool('write-support-tickets', Math.round(3000 * SCALE), 200, (i) =>
    call('POST', '/onboarding/support', { body: { kind: 'support', subject: `load ${stamp} ${i}` } })));

  // S5 — mixed burst (thousands of mixed ops "at the same moment").
  results.push(await runPool('mixed-burst', Math.round(5000 * SCALE), 500, (i) => {
    const m = i % 5;
    if (m === 0) return call('POST', '/onboarding/support', { body: { subject: `burst ${i}` } });
    if (m === 1) return call('GET', '/executive/overview?projectKey=P-1000');
    if (m === 2) return call('GET', '/ingestion/runs?limit=20');
    if (m === 3) return call('GET', '/rules/alerts?limit=50&projectKey=P-1000');
    return call('GET', '/projects');
  }));

  const grand = {
    target: BASE,
    totalOps: results.reduce((a, r) => a + r.total, 0),
    totalOk: results.reduce((a, r) => a + r.ok, 0),
    totalErr: results.reduce((a, r) => a + r.errors, 0),
    scenarios: results,
    ranAt: new Date().toISOString(),
  };
  writeFileSync(new URL('./load-results.json', import.meta.url), JSON.stringify(grand, null, 2));
  console.log(`\n=== LOAD DONE: ${grand.totalOps} ops, ${grand.totalOk} ok, ${grand.totalErr} errors ===`);
  console.log('Results -> docs/qa/load-results.json');
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
