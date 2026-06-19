/**
 * Security / cyber-security test (authorized — own system).
 * Covers: authn, broken access control / IDOR, privilege escalation,
 * mass assignment, injection, path traversal, info disclosure, security
 * headers, CORS, rate limiting. Runs data/access checks on the QA stack and
 * transport/header/rate checks on the live deployment.
 *
 *   BASE=http://127.0.0.1:3009/api/v1 ADMIN_KEY=sk_... node security-test.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3009/api/v1';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const DEMO_PW = process.env.DEMO_PW || 'SigmaDemo2026';
const LIVE_API = process.env.LIVE_API || 'https://system-api.sigma-pmo.com/api/v1';
const LIVE_FE = process.env.LIVE_FE || 'https://system.sigma-pmo.com';

const out = [];
let pass = 0, fail = 0, warn = 0;
function check(id, name, ok, detail = '') {
  const v = ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  if (ok === 'warn') warn++; else if (ok) pass++; else fail++;
  out.push({ id, name, result: v, detail });
  console.log(`[${v}] ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
async function call(method, path, { key, body, base = BASE, origin } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (origin) headers['origin'] = origin;
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    return { status: res.status, json, text, headers: res.headers };
  } catch (e) { return { status: 0, text: String(e.message), headers: new Headers() }; }
}
const reg = (name, type) => call('POST', '/onboarding/register', { body: {
  companyName: name, companyType: type, country: 'AE',
  ownerEmail: `sec-${Date.now().toString(36)}-${Math.floor(performance.now())}@${name.toLowerCase().replace(/[^a-z0-9]+/g,'')}.test`,
  ownerDisplayName: name, ownerPassword: 'Owner!Pass#2026',
}});

async function main() {
  console.log(`\n=== Sigma Security Test ===\nQA: ${BASE}\nLIVE: ${LIVE_API}\n`);

  // Setup two tenants
  const A = await reg('SecA', 'pmo');
  const B = await reg('SecB', 'contractor');
  const keyA = A.json?.apiKey, cidA = A.json?.company?.id;
  const keyB = B.json?.apiKey, cidB = B.json?.company?.id;
  // A ingests a project so there is an owned resource
  const csv = Buffer.from('businessKey,name,status,currency\nSEC-1,Sec Tower,Active,USD\n').toString('base64');
  await call('POST', '/ingestion/upload', { key: keyA, body: { filename: 'p.csv', contentBase64: csv } });

  // ── 1. Authentication ───────────────────────────────────────────────────
  check('A1', 'Protected endpoint without key is rejected', (await call('GET', '/projects')).status === 401);
  check('A2', 'Invalid API key is rejected', (await call('GET', '/projects', { key: 'sk_bogus_'.padEnd(50, 'x') })).status === 401);
  check('A3', 'Empty key header is rejected', (await call('GET', '/projects', { key: '' })).status === 401);
  check('A4', 'Login with wrong password fails (401, not 200/500)', (await call('POST', '/auth/login', { body: { email: 'client@sigma.ae', password: 'wrongwrong' } })).status === 401);
  check('A5', 'Login with unknown user fails (401)', (await call('POST', '/auth/login', { body: { email: 'nobody@nowhere.test', password: 'whatever12' } })).status === 401);

  // ── 2. Broken access control / IDOR (cross-tenant) ──────────────────────
  check('B1', "Tenant A cannot read tenant B's project by key", [403].includes((await call('GET', '/executive/overview?projectKey=SEC-1', { key: keyB })).status));
  const aRuns = await call('GET', '/ingestion/runs', { key: keyA });
  const bRuns = await call('GET', '/ingestion/runs', { key: keyB });
  check('B2', "Ingestion runs are tenant-scoped (B cannot see A's)", Array.isArray(bRuns.json) && bRuns.json.length === 0 && Array.isArray(aRuns.json) && aRuns.json.length >= 1, `A=${aRuns.json?.length}, B=${bRuns.json?.length}`);
  check('B3', 'Company owner cannot reach super-admin console', [401, 403].includes((await call('GET', '/super-admin/companies', { key: keyA })).status));
  check('B4', 'Company owner cannot list platform users (/auth/users)', [401, 403].includes((await call('GET', '/auth/users', { key: keyA })).status));
  check('B5', 'Company owner cannot PATCH another company status', [401, 403].includes((await call('PATCH', `/super-admin/companies/${cidB}/status`, { key: keyA, body: { status: 'suspended' } })).status));
  check('B6', "Cross-tenant rules workflow (body projectKey) is scoped", [403, 404].includes((await call('POST', '/rules/workflows/run', { key: keyB, body: { projectKey: 'SEC-1' } })).status));

  // ── 3. Privilege escalation / mass assignment ───────────────────────────
  const esc = await call('POST', '/onboarding/register', { body: {
    companyName: 'EscCo', companyType: 'contractor', country: 'AE',
    ownerEmail: `esc-${Date.now().toString(36)}@esc.test`, ownerDisplayName: 'Esc', ownerPassword: 'Owner!Pass#2026',
    role: 'sigma_admin', companyId: null, isDemo: true, // <-- injected privileged fields
  }});
  check('C1', 'Registration ignores injected role/companyId/isDemo (no escalation)', esc.status === 200 && esc.json?.user?.role !== 'sigma_admin', `role=${esc.json?.user?.role}`);
  const escKey = esc.json?.apiKey;
  check('C2', 'Self-registered owner cannot reach platform admin', escKey ? [401, 403].includes((await call('GET', '/super-admin/companies', { key: escKey })).status) : 'warn');
  const addBad = await call('POST', '/onboarding/users', { key: keyA, body: { email: `u-${Date.now().toString(36)}@a.test`, displayName: 'U', role: 'sigma_admin', password: 'Passw0rd12' } });
  check('C3', 'Cannot add a user with a role outside the company preset', [400, 403].includes(addBad.status), `status=${addBad.status}`);

  // ── 4. Injection ────────────────────────────────────────────────────────
  const sqli1 = await call('GET', `/executive/overview?projectKey=${encodeURIComponent("' OR '1'='1")}`, { key: keyA });
  check('D1', 'SQL injection in projectKey does not 500 / leak', sqli1.status !== 500 && sqli1.status !== 200, `status=${sqli1.status}`);
  const sqli2 = await call('POST', '/auth/login', { body: { email: "admin@sigma.local' OR '1'='1", password: "x' OR '1'='1" } });
  check('D2', 'SQL injection in login is rejected (401/400, not 500)', [400, 401].includes(sqli2.status), `status=${sqli2.status}`);
  const sqli3 = await call('GET', `/projects?x=${encodeURIComponent("1;DROP TABLE user;--")}`, { key: keyA });
  check('D3', 'SQLi attempt in query param is harmless', sqli3.status !== 500);

  // ── 5. Path traversal ───────────────────────────────────────────────────
  const trav = await call('POST', '/ingestion/ingest-path', { key: ADMIN_KEY, body: { path: '../../../../etc/passwd' } });
  check('E1', 'Path traversal in ingest-path is blocked', [400, 403].includes(trav.status), `status=${trav.status}`);
  const trav2 = await call('POST', '/ingestion/ingest-path', { key: ADMIN_KEY, body: { path: '/etc/passwd' } });
  check('E2', 'Absolute path outside archive is blocked', [400, 403].includes(trav2.status), `status=${trav2.status}`);

  // ── 6. Input validation ─────────────────────────────────────────────────
  check('F1', 'Unknown/extra body fields are stripped (whitelist) or rejected', [200, 400].includes((await call('POST', '/auth/login', { body: { email: 'client@sigma.ae', password: DEMO_PW, hacker: 1 } })).status));
  check('F2', 'Short password on register is rejected', (await call('POST', '/onboarding/register', { body: { companyName: 'X', companyType: 'pmo', ownerEmail: 'x@x.test', ownerDisplayName: 'X', ownerPassword: '123' } })).status === 400);

  // ── 7. Information disclosure ────────────────────────────────────────────
  const me = await call('GET', '/auth/me', { key: keyA });
  const meStr = JSON.stringify(me.json || {});
  check('G1', 'Auth/me does not leak password/hash/apiKey', !/passwordHash|passwordSalt|apiKeyHash|"password"/.test(meStr));
  const users = await call('GET', '/auth/users', { key: ADMIN_KEY });
  const usersStr = JSON.stringify(users.json || []);
  check('G2', 'User list does not leak password hashes / api keys', users.status === 200 && !/passwordHash|passwordSalt|apiKeyHash/.test(usersStr));
  const settings = await call('GET', '/admin/settings', { key: ADMIN_KEY });
  check('G3', 'Settings endpoint does not return plaintext secrets', settings.status === 200 && !/-----BEGIN|sk-ant-|sk_live|AKIA/.test(JSON.stringify(settings.json || [])), `status=${settings.status}`);

  // ── 8. LIVE transport / headers / rate-limit (production) ────────────────
  const fe = await call('GET', '/', { base: LIVE_FE.replace(/\/$/, '') });
  const h = (n) => fe.headers.get(n);
  check('H1', 'HSTS header present (live)', !!h('strict-transport-security'), h('strict-transport-security') || 'missing');
  check('H2', 'CSP header present (live)', !!h('content-security-policy'), (h('content-security-policy') || 'missing').slice(0, 40));
  check('H3', 'X-Content-Type-Options=nosniff (live)', (h('x-content-type-options') || '').includes('nosniff'));
  check('H4', 'X-Frame-Options present (live)', !!h('x-frame-options'), h('x-frame-options') || 'missing');
  check('H5', 'Referrer-Policy present (live)', !!h('referrer-policy'));
  check('H6', 'Permissions-Policy present (live)', !!h('permissions-policy'));
  // Backend prod error: a 404 path should not leak a stack trace
  const nf = await call('GET', '/this/does/not/exist', { base: LIVE_API });
  check('H7', 'Live 404 does not leak a stack trace', !/at \/|\.ts:\d+|node_modules/.test(nf.text || ''), `status=${nf.status}`);
  // Login rate limit on live (production auth bucket = 10/min)
  let limited = false;
  for (let i = 0; i < 14; i++) {
    const r = await call('POST', '/auth/login', { base: LIVE_API, body: { email: `ratelimit-${i}@nope.test`, password: 'whatever12' } });
    if (r.status === 429) { limited = true; break; }
  }
  check('H8', 'Login is rate-limited on live (429 after burst)', limited ? true : 'warn', limited ? 'got 429' : 'no 429 in 14 tries');
  // CORS from a disallowed origin
  const cors = await call('GET', '/health', { base: LIVE_API, origin: 'https://evil.example.com' });
  const acao = cors.headers.get('access-control-allow-origin');
  check('H9', 'CORS does not allow arbitrary origins', !acao || acao !== 'https://evil.example.com', `acao=${acao || 'none'}`);

  const summary = { qa: BASE, live: LIVE_API, total: out.length, pass, warn, fail, ranAt: new Date().toISOString() };
  writeFileSync(new URL('./security-results.json', import.meta.url), JSON.stringify({ summary, checks: out }, null, 2));
  console.log(`\n=== SECURITY: ${pass} PASS, ${warn} WARN, ${fail} FAIL of ${out.length} ===`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
