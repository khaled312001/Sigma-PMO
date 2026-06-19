/**
 * Frontend smoke test: load every page of the deployed app and check it renders
 * without a crash / error boundary / fatal console error.
 *   ADMIN_PW=... node frontend-smoke.mjs
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('e:/Sigma PMO/docs/user-guide/package.json');
const puppeteer = require('puppeteer-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.FE_BASE || 'https://system.sigma-pmo.com';
const API = process.env.API_BASE || 'https://system-api.sigma-pmo.com/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sigma.local';
const ADMIN_PW = process.env.ADMIN_PW || 'Sg!ElFo6k4ZgZW2#26';

const ROUTES = [
  '/', '/intro', '/auth', '/register', '/account', '/help',
  '/projects', '/input', '/repository', '/review', '/evidence', '/decisions', '/approval',
  '/executive', '/analytics', '/hierarchy', '/governance-command', '/risk', '/claims',
  '/letters', '/sources', '/knowledge', '/agents', '/comparison', '/simulation',
  '/reports/monthly', '/drawings', '/clashes', '/baselines',
  '/feasibility', '/quantity-survey', '/procurement', '/revenue', '/opportunity',
  '/funding', '/predictive', '/bankability',
  '/safety', '/fire-safety', '/authority', '/utility', '/operational-readiness',
  '/acceptance', '/super-admin',
  '/admin/users', '/admin/roles', '/admin/personas', '/admin/policy', '/admin/governance', '/admin/settings',
];

const ERR_MARKERS = [
  'Application error', 'client-side exception', 'Something went wrong',
  'Unhandled Runtime Error', 'This page could not be found', 'TypeError:', 'ReferenceError:',
];

async function getKey() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PW }),
  });
  if (!r.ok) throw new Error(`admin login -> ${r.status}`);
  return (await r.json()).apiKey;
}

async function main() {
  const key = await getKey();
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  // Seed auth + prefs so pages render their authenticated content.
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => {
    localStorage.setItem('sigma_api_key', k);
    localStorage.setItem('sigma_lang', 'en');
    localStorage.setItem('sigma_theme', 'light');
    localStorage.setItem('sigma_project_key', 'P-1000');
  }, key);

  const results = [];
  let pass = 0, fail = 0;
  for (const route of ROUTES) {
    const consoleErrors = [];
    const pageErrors = [];
    const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); };
    const onErr = (e) => pageErrors.push(String(e.message || e).slice(0, 200));
    page.on('console', onConsole);
    page.on('pageerror', onErr);
    let navStatus = 0, errText = '', bodyLen = 0;
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      navStatus = resp ? resp.status() : 0;
      await new Promise((r) => setTimeout(r, 1500));
      const body = await page.evaluate(() => document.body ? document.body.innerText : '');
      bodyLen = body.length;
      errText = ERR_MARKERS.find((m) => body.includes(m)) || '';
    } catch (e) {
      errText = `nav-failed: ${String(e.message).slice(0, 120)}`;
    }
    page.off('console', onConsole);
    page.off('pageerror', onErr);
    // Ignore benign console noise (favicon, 401 from a background poll before key applies, etc.)
    const fatalConsole = consoleErrors.filter((t) => !/favicon|401|Failed to load resource: the server responded/.test(t));
    const ok = navStatus < 400 && !errText && pageErrors.length === 0 && bodyLen > 40;
    if (ok) pass++; else fail++;
    results.push({ route, navStatus, bodyLen, errText, pageErrors: pageErrors.slice(0, 2), consoleErrors: fatalConsole.slice(0, 3), verdict: ok ? 'PASS' : 'FAIL' });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${route} — http=${navStatus} bodyLen=${bodyLen} ${errText ? '| ' + errText : ''}${pageErrors.length ? ' | pageerr:' + pageErrors[0] : ''}`);
  }
  writeFileSync(new URL('./frontend-smoke-results.json', import.meta.url), JSON.stringify({ base: BASE, total: results.length, pass, fail, results }, null, 2));
  console.log(`\n=== FRONTEND SMOKE: ${pass} PASS, ${fail} FAIL of ${results.length} ===`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
