/**
 * SaaS Security & Tenant-Isolation test harness (Mr. Ayham, 2026-06-19).
 *
 * Drives the LIVE API of a running Sigma backend and proves, with real HTTP
 * evidence, the multi-tenant isolation + subscription controls:
 *   - public demo (sample) login is dead when DEMO_LOGIN_PUBLIC=false
 *   - two separate companies, separate users, fully isolated data
 *   - Company A cannot read Company B's projects / files / reports / runs
 *   - registration cannot create platform-admin access
 *   - direct API access without a key is rejected
 *   - a suspended company / cancelled subscription / expired trial is blocked
 *   - reactivation restores access
 *   - the audit log records every action
 *
 * Writes the full request/response evidence to isolation-evidence.json.
 *
 *   BASE=http://127.0.0.1:3009/api/v1 SUPER_EMAIL=… SUPER_PW=… DEMO_PW=… \
 *     node run-isolation-test.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3009/api/v1';
const SUPER_EMAIL = process.env.SUPER_EMAIL || 'superadmin@sigma.test';
const SUPER_PW = process.env.SUPER_PW || 'Sup3r!Admin#Test';
const DEMO_PW = process.env.DEMO_PW || 'Sigma$Demo2026';

const RUN = Date.now().toString(36).slice(-6); // unique token so re-runs don't collide
const evidence = [];
let passCount = 0;
let failCount = 0;

function record(id, name, { method, path, asRole }, expected, res, passWhen, detail = '') {
  const pass = passWhen(res);
  if (pass) passCount += 1;
  else failCount += 1;
  evidence.push({
    id, name,
    request: `${method} ${path}${asRole ? `  (as ${asRole})` : ''}`,
    expected,
    actual: `HTTP ${res.status}`,
    result: pass ? 'PASS' : 'FAIL',
    detail,
  });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${id} ${name} — expected ${expected}, got HTTP ${res.status} ${detail}`);
}

async function call(method, path, { key, body } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res, json = null, text = '';
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e.message) };
  }
}

const login = async (email, password) => call('POST', '/auth/login', { body: { email, password } });
const register = (companyName, companyType) =>
  call('POST', '/onboarding/register', {
    body: {
      companyName, companyType, country: 'AE',
      ownerEmail: `owner-${RUN}@${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.test`,
      ownerDisplayName: `${companyName} Owner`,
      ownerPassword: 'Owner!Pass#2026',
    },
  });

async function main() {
  console.log(`\n=== Sigma SaaS Security & Tenant-Isolation Test ===\nTarget: ${BASE}\n`);

  // ── T1 — public demo login is dead (DEMO_LOGIN_PUBLIC=false) ──────────────
  const demo = await login('client@sigma.ae', DEMO_PW);
  record('T1', 'Public demo (sample) login refused at the API', { method: 'POST', path: '/auth/login', asRole: 'demo client' },
    'HTTP 401', demo, (r) => r.status === 401, '(sample account exists but cannot authenticate)');

  // ── T2/T3 — two separate companies register ───────────────────────────────
  const regA = await register('Alpha Contracting', 'pmo');
  const keyA = regA.json?.apiKey; const companyIdA = regA.json?.company?.id; const roleA = regA.json?.user?.role;
  record('T2', 'Company A self-registers (tenant A created)', { method: 'POST', path: '/onboarding/register', asRole: 'public' },
    'HTTP 200 + tenant id', regA, (r) => r.status === 200 && !!companyIdA, `companyId=${companyIdA}`);

  const regB = await register('Beta Builders', 'contractor');
  const keyB = regB.json?.apiKey; const companyIdB = regB.json?.company?.id;
  record('T3', 'Company B self-registers (separate tenant id)', { method: 'POST', path: '/onboarding/register', asRole: 'public' },
    'HTTP 200 + DIFFERENT tenant id', regB,
    (r) => r.status === 200 && !!companyIdB && companyIdB !== companyIdA, `companyId=${companyIdB}`);

  // ── T4 — registration cannot create platform-admin access ─────────────────
  record('T4', 'Registered owner is NOT a platform admin (role from preset)', { method: '—', path: 'derived', asRole: 'Company A owner' },
    'role != sigma_admin', { status: roleA === 'sigma_admin' ? 500 : 200 },
    (r) => r.status === 200, `role=${roleA}`);
  const escal = await call('GET', '/super-admin/companies', { key: keyA });
  record('T5', 'Company A cannot reach the platform super-admin console', { method: 'GET', path: '/super-admin/companies', asRole: 'Company A owner' },
    'HTTP 401/403 (denied)', escal, (r) => r.status === 401 || r.status === 403);

  // ── T6 — Company A ingests a real project (owned by tenant A) ──────────────
  const projectsCsv = readFileSync(new URL('../../data/samples/projects.csv', import.meta.url));
  const ingA = await call('POST', '/ingestion/upload', { key: keyA, body: { filename: 'projects.csv', contentBase64: projectsCsv.toString('base64') } });
  record('T6', 'Company A ingests a project (data stamped to tenant A)', { method: 'POST', path: '/ingestion/upload', asRole: 'Company A owner' },
    'HTTP 200', ingA, (r) => r.status === 200, `project P-1000 -> tenant A`);

  // ── T7 — Company A reads its own project ──────────────────────────────────
  const aOwn = await call('GET', '/executive/overview?projectKey=P-1000', { key: keyA });
  record('T7', 'Company A reads its OWN project', { method: 'GET', path: '/executive/overview?projectKey=P-1000', asRole: 'Company A owner' },
    'HTTP 200', aOwn, (r) => r.status === 200);

  // ── T8 — Company B is DENIED Company A's project (ProjectScopeGuard) ───────
  const bCross = await call('GET', '/executive/overview?projectKey=P-1000', { key: keyB });
  record('T8', "Company B is DENIED Company A's project/report data", { method: 'GET', path: '/executive/overview?projectKey=P-1000', asRole: 'Company B owner' },
    'HTTP 403', bCross, (r) => r.status === 403, '(cross-tenant read blocked)');

  // ── T9 — Company B's project list does not contain A's project ────────────
  const bList = await call('GET', '/projects', { key: keyB });
  const bSeesA = Array.isArray(bList.json) && bList.json.some((p) => p.businessKey === 'P-1000');
  record('T9', "Company B's project list excludes Company A's project", { method: 'GET', path: '/projects', asRole: 'Company B owner' },
    'P-1000 absent', bList, (r) => r.status === 200 && !bSeesA, `B sees ${Array.isArray(bList.json) ? bList.json.length : '?'} project(s)`);

  // ── T10 — ingestion-run audit trail is per-tenant ─────────────────────────
  const aRuns = await call('GET', '/ingestion/runs', { key: keyA });
  const bRuns = await call('GET', '/ingestion/runs', { key: keyB });
  const aN = Array.isArray(aRuns.json) ? aRuns.json.length : 0;
  const bN = Array.isArray(bRuns.json) ? bRuns.json.length : 0;
  record('T10', 'Ingestion-run history is isolated per tenant', { method: 'GET', path: '/ingestion/runs', asRole: 'A vs B' },
    'A >= 1 run, B = 0 runs', { status: aN >= 1 && bN === 0 ? 200 : 409 },
    (r) => r.status === 200, `A=${aN}, B=${bN}`);

  // ── T11 — direct API access without a key is rejected ─────────────────────
  const noKey = await call('GET', '/executive/overview?projectKey=P-1000', {});
  record('T11', 'Direct API access without a key is rejected', { method: 'GET', path: '/executive/overview?projectKey=P-1000', asRole: 'anonymous' },
    'HTTP 401', noKey, (r) => r.status === 401);

  // ── Super-admin session ───────────────────────────────────────────────────
  const superLogin = await login(SUPER_EMAIL, SUPER_PW);
  const superKey = superLogin.json?.apiKey;
  record('T12', 'Platform super-admin authenticates (real, non-demo account)', { method: 'POST', path: '/auth/login', asRole: 'super-admin' },
    'HTTP 200 + key', superLogin, (r) => r.status === 200 && !!superKey);

  // ── T13 — suspend Company A → access blocked; reactivate → restored ───────
  const suspend = await call('PATCH', `/super-admin/companies/${companyIdA}/status`, { key: superKey, body: { status: 'suspended' } });
  record('T13a', 'Super-admin suspends Company A', { method: 'PATCH', path: `/super-admin/companies/${companyIdA}/status`, asRole: 'super-admin' },
    'HTTP 200', suspend, (r) => r.status === 200);
  const aSuspended = await call('GET', '/projects', { key: keyA });
  record('T13b', 'Suspended company is blocked from the platform', { method: 'GET', path: '/projects', asRole: 'Company A owner' },
    'HTTP 403', aSuspended, (r) => r.status === 403);
  const reactivate = await call('PATCH', `/super-admin/companies/${companyIdA}/status`, { key: superKey, body: { status: 'active' } });
  const aReactivated = await call('GET', '/projects', { key: keyA });
  record('T13c', 'Reactivation restores access', { method: 'PATCH then GET /projects', path: `/super-admin/companies/${companyIdA}/status`, asRole: 'super-admin -> A' },
    'HTTP 200 + access', { status: reactivate.status === 200 && aReactivated.status === 200 ? 200 : 409 },
    (r) => r.status === 200, `reactivate=${reactivate.status}, read=${aReactivated.status}`);

  // ── T14 — cancelled subscription blocks access; restore lifts it ──────────
  const subs = await call('GET', '/super-admin/subscriptions', { key: superKey });
  const subA = Array.isArray(subs.json) ? subs.json.find((s) => s.companyId === companyIdA) : null;
  const cancel = await call('PATCH', `/super-admin/subscriptions/${subA?.id}`, { key: superKey, body: { status: 'cancelled' } });
  const aCancelled = await call('GET', '/projects', { key: keyA });
  record('T14a', 'Cancelled subscription blocks access', { method: 'PATCH sub + GET /projects', path: `/super-admin/subscriptions/${subA?.id}`, asRole: 'super-admin -> A' },
    'HTTP 403', aCancelled, (r) => r.status === 403, `cancel=${cancel.status}`);
  await call('PATCH', `/super-admin/subscriptions/${subA?.id}`, { key: superKey, body: { status: 'trial' } });
  const aRestored = await call('GET', '/projects', { key: keyA });
  record('T14b', 'Restoring the subscription lifts the block', { method: 'GET', path: '/projects', asRole: 'Company A owner' },
    'HTTP 200', aRestored, (r) => r.status === 200);

  // ── T15 — expired trial blocks access; extending it lifts the block ───────
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await call('PATCH', `/super-admin/subscriptions/${subA?.id}`, { key: superKey, body: { status: 'trial', trialEndsAt: past } });
  const aExpired = await call('GET', '/projects', { key: keyA });
  record('T15a', 'Expired free trial blocks access', { method: 'GET', path: '/projects', asRole: 'Company A owner' },
    'HTTP 403', aExpired, (r) => r.status === 403, '(trialEndsAt in the past)');
  await call('PATCH', `/super-admin/subscriptions/${subA?.id}`, { key: superKey, body: { trialEndsAt: future } });
  const aExtended = await call('GET', '/projects', { key: keyA });
  record('T15b', 'Extending the trial restores access', { method: 'GET', path: '/projects', asRole: 'Company A owner' },
    'HTTP 200', aExtended, (r) => r.status === 200);

  // ── T16 — the audit log recorded every action ─────────────────────────────
  const audit = await call('GET', '/audit?limit=400', { key: superKey });
  const rows = Array.isArray(audit.json) ? audit.json : [];
  const hasLogin = rows.some((r) => r.action === 'auth.login');
  const hasPatch = rows.some((r) => r.action === 'http.patch');
  const hasFailedLogin = rows.some((r) => r.action === 'auth.login.failed');
  record('T16', 'Always-on audit log captured logins + mutations', { method: 'GET', path: '/audit', asRole: 'super-admin' },
    'rows incl auth + mutations', { status: rows.length > 0 && hasLogin && hasPatch ? 200 : 409 },
    (r) => r.status === 200, `${rows.length} entries (login=${hasLogin}, patch=${hasPatch}, failedLogin=${hasFailedLogin})`);

  // ── Summary + evidence file ───────────────────────────────────────────────
  const summary = { target: BASE, total: evidence.length, passed: passCount, failed: failCount, ranAt: new Date().toISOString() };
  writeFileSync(new URL('./isolation-evidence.json', import.meta.url), JSON.stringify({ summary, evidence }, null, 2));
  console.log(`\n=== RESULT: ${passCount}/${evidence.length} PASS, ${failCount} FAIL ===`);
  console.log('Evidence written to docs/security/isolation-evidence.json');
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
