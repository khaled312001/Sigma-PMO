/**
 * LIVE server test against the deployed Sigma demo environment.
 * Proves tenant isolation + registration scoping + rotated demo creds on the
 * real server. Super-admin scenarios run only if ADMIN_PW is provided.
 *
 *   BASE=https://system-api.sigma-pmo.com/api/v1 DEMO_PW=Sigma$Demo2026 \
 *     [ADMIN_PW=...] node run-live-test.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'https://system-api.sigma-pmo.com/api/v1';
const DEMO_PW = process.env.DEMO_PW || 'Sigma$Demo2026';
const ADMIN_PW = process.env.ADMIN_PW || '';
const RUN = Date.now().toString(36).slice(-6);
const evidence = [];
let pass = 0, fail = 0, skip = 0;

function rec(id, name, req, expected, res, ok, detail = '') {
  const status = ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  if (ok === 'skip') skip++; else if (ok) pass++; else fail++;
  evidence.push({ id, name, request: req, expected, actual: typeof res === 'object' ? `HTTP ${res.status}` : String(res), result: status, detail });
  console.log(`[${status}] ${id} ${name} — expected ${expected}, got ${typeof res === 'object' ? 'HTTP ' + res.status : res} ${detail}`);
}

async function call(method, path, { key, body } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    return { status: res.status, json };
  } catch (e) { return { status: 0, json: null, err: e.message }; }
}
const b64 = (rel) => readFileSync(new URL(rel, import.meta.url)).toString('base64');
const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });
const register = (companyName, companyType) => call('POST', '/onboarding/register', {
  body: { companyName, companyType, country: 'AE', ownerEmail: `live-${RUN}@${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.test`, ownerDisplayName: `${companyName} Owner`, ownerPassword: 'Owner!Pass#2026' },
});

console.log(`\n=== Sigma LIVE server test ===\nTarget: ${BASE}\n`);

// T1 — rotated demo credential authenticates on the demo env
const demo = await login('client@sigma.ae', DEMO_PW);
rec('L1', 'Rotated demo password authenticates (demo env)', 'POST /auth/login (client@sigma.ae)', 'HTTP 200', demo, demo.status === 200, '(proves rotated DEMO_SEED_PASSWORD is live)');

// T2/T3 — two tenants
const a = await register('Alpha Live ' + RUN, 'pmo');
const keyA = a.json?.apiKey, cidA = a.json?.company?.id, roleA = a.json?.user?.role;
rec('L2', 'Company A registers (tenant A)', 'POST /onboarding/register', 'HTTP 200 + tenant id', a, a.status === 200 && !!cidA, `companyId=${cidA}`);
const b = await register('Beta Live ' + RUN, 'contractor');
const keyB = b.json?.apiKey, cidB = b.json?.company?.id;
rec('L3', 'Company B registers (separate tenant)', 'POST /onboarding/register', 'different tenant id', b, b.status === 200 && cidB && cidB !== cidA, `companyId=${cidB}`);

// T4/T5 — no privilege escalation
rec('L4', 'Registered owner is not platform admin', 'derived', 'role != sigma_admin', roleA === 'sigma_admin' ? 'sigma_admin' : 'HTTP 200', roleA !== 'sigma_admin', `role=${roleA}`);
const esc = await call('GET', '/super-admin/companies', { key: keyA });
rec('L5', 'Company A cannot reach super-admin console', 'GET /super-admin/companies (A)', 'HTTP 401/403', esc, esc.status === 401 || esc.status === 403);

// T6/T7 — A owns a real project
const up = await call('POST', '/ingestion/upload', { key: keyA, body: { filename: 'projects.csv', contentBase64: b64('../../data/samples/projects.csv') } });
rec('L6', 'Company A ingests a project', 'POST /ingestion/upload (A)', 'HTTP 200', up, up.status === 200, `counts=${JSON.stringify(up.json?.counts)}`);
const aOwn = await call('GET', '/executive/overview?projectKey=P-1000', { key: keyA });
rec('L7', 'Company A reads its own project', 'GET /executive/overview?projectKey=P-1000 (A)', 'HTTP 200', aOwn, aOwn.status === 200);

// T8/T9 — cross-tenant denial
const bCross = await call('GET', '/executive/overview?projectKey=P-1000', { key: keyB });
rec('L8', "Company B DENIED Company A's project", 'GET /executive/overview?projectKey=P-1000 (B)', 'HTTP 403', bCross, bCross.status === 403, '(cross-tenant read blocked on live)');
const bList = await call('GET', '/projects', { key: keyB });
const bSeesA = Array.isArray(bList.json) && bList.json.some((p) => p.businessKey === 'P-1000');
rec('L9', "Company B's project list excludes A's project", 'GET /projects (B)', 'P-1000 absent', bList, bList.status === 200 && !bSeesA, `B sees ${Array.isArray(bList.json) ? bList.json.length : '?'}`);

// T10 — runs isolation
const aRuns = await call('GET', '/ingestion/runs', { key: keyA });
const bRuns = await call('GET', '/ingestion/runs', { key: keyB });
const aN = Array.isArray(aRuns.json) ? aRuns.json.length : -1, bN = Array.isArray(bRuns.json) ? bRuns.json.length : -1;
rec('L10', 'Ingestion-run history isolated per tenant', 'GET /ingestion/runs (A vs B)', 'A>=1, B=0', aN >= 1 && bN === 0 ? 'ok' : 'mismatch', aN >= 1 && bN === 0, `A=${aN}, B=${bN}`);

// T11 — no key
const noKey = await call('GET', '/executive/overview?projectKey=P-1000', {});
rec('L11', 'Direct API without a key rejected', 'GET /executive/overview (no key)', 'HTTP 401', noKey, noKey.status === 401);

// ── Super-admin scenarios (only if ADMIN_PW provided) ──
if (ADMIN_PW) {
  const sa = await login('admin@sigma.local', ADMIN_PW);
  const sk = sa.json?.apiKey;
  rec('L12', 'Super-admin authenticates', 'POST /auth/login (admin)', 'HTTP 200', sa, sa.status === 200 && !!sk);
  if (sk) {
    const susp = await call('PATCH', `/super-admin/companies/${cidA}/status`, { key: sk, body: { status: 'suspended' } });
    const aSusp = await call('GET', '/projects', { key: keyA });
    rec('L13', 'Suspend company A blocks its access', 'PATCH status=suspended then GET /projects (A)', 'HTTP 403', aSusp, susp.status === 200 && aSusp.status === 403, `suspend=${susp.status}`);
    await call('PATCH', `/super-admin/companies/${cidA}/status`, { key: sk, body: { status: 'active' } });
    const aRe = await call('GET', '/projects', { key: keyA });
    rec('L14', 'Reactivation restores access', 'GET /projects (A)', 'HTTP 200', aRe, aRe.status === 200);
    const subs = await call('GET', '/super-admin/subscriptions', { key: sk });
    const subA = Array.isArray(subs.json) ? subs.json.find((s) => s.companyId === cidA) : null;
    if (subA) {
      const past = new Date(Date.now() - 864e5).toISOString();
      await call('PATCH', `/super-admin/subscriptions/${subA.id}`, { key: sk, body: { status: 'trial', trialEndsAt: past } });
      const exp = await call('GET', '/projects', { key: keyA });
      rec('L15', 'Expired trial blocks access', 'GET /projects (A, trial expired)', 'HTTP 403', exp, exp.status === 403);
      await call('PATCH', `/super-admin/subscriptions/${subA.id}`, { key: sk, body: { status: 'active', trialEndsAt: null } });
    }
    const audit = await call('GET', '/audit?limit=200', { key: sk });
    const rows = Array.isArray(audit.json) ? audit.json : [];
    rec('L16', 'Audit log captured logins + mutations', 'GET /audit (admin)', 'rows present', audit, rows.length > 0 && rows.some((r) => r.action === 'auth.login'), `${rows.length} entries`);
  }
} else {
  rec('L12', 'Super-admin scenarios (suspend/subscription/trial/audit)', 'needs ADMIN_PW', 'set ADMIN_SEED_PASSWORD', 'no admin cred', 'skip');
}

const summary = { target: BASE, total: evidence.length, passed: pass, failed: fail, skipped: skip, ranAt: new Date().toISOString() };
writeFileSync(new URL('./live-evidence.json', import.meta.url), JSON.stringify({ summary, evidence }, null, 2));
console.log(`\n=== LIVE RESULT: ${pass} PASS, ${fail} FAIL, ${skip} SKIP (of ${evidence.length}) ===`);
process.exit(fail === 0 ? 0 : 1);
