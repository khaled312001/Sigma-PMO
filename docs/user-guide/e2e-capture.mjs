/**
 * Live END-TO-END UX proof (audit 2026-06-28). For each real role account it
 * logs in to the LIVE platform, visits the pages, screenshots them, and records
 * whether each page rendered (no error boundary). It also drives a REAL data
 * flow: upload the official template -> a project + activities are created ->
 * they appear on Projects and the executive/governance dashboards.
 *
 * Output: docs/user-guide/shots-e2e/<role>/<page>.png + manifest.json
 *   node e2e-capture.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'https://system.sigma-pmo.com';
const API = process.env.API || 'https://system-api.sigma-pmo.com/api/v1';
const DEMO_PW = process.env.DEMO_PW || 'SigmaDemo2026';
const ADMIN_PW = process.env.ADMIN_PW || 'Sg!ElFo6k4ZgZW2#26';
const LANG = process.env.LANG || 'ar';
const THEME = process.env.THEME || 'light';
const OUT = process.env.OUT || 'shots-e2e';

// role, email, password, deep=capture ALL pages (else landing + signatures)
const ACCOUNTS = [
  { role: 'sigma_admin', email: 'admin@sigma.local', pw: ADMIN_PW, deep: true },
  { role: 'client', email: 'client@sigma.ae', pw: DEMO_PW, deep: true },
  { role: 'pmo', email: 'pmo@sigma.ae', pw: DEMO_PW, deep: true },
  { role: 'contractor', email: 'contractor@sigma.ae', pw: DEMO_PW, deep: true },
  { role: 'sigma_reviewer', email: 'reviewer@sigma.local', pw: ADMIN_PW },
  { role: 'consultant', email: 'consultant@sigma.ae', pw: DEMO_PW },
  { role: 'owner', email: 'owner@sigma.ae', pw: DEMO_PW },
  { role: 'operator', email: 'operator@sigma.ae', pw: DEMO_PW },
  { role: 'investor', email: 'investor@sigma.ae', pw: DEMO_PW },
  { role: 'lender', email: 'lender@sigma.ae', pw: DEMO_PW },
  { role: 'subcontractor', email: 'subcontractor@sigma.ae', pw: DEMO_PW },
  { role: 'governance_board', email: 'board@sigma.ae', pw: DEMO_PW },
  { role: 'bank', email: 'bank@sigma.ae', pw: DEMO_PW },
  { role: 'government_regulator', email: 'regulator@sigma.ae', pw: DEMO_PW },
  { role: 'asset_manager', email: 'assetmgr@sigma.ae', pw: DEMO_PW },
];

// every authenticated page in the product
const ALL_PAGES = [
  ['overview', '/'], ['input', '/input'], ['projects', '/projects'], ['hierarchy', '/hierarchy'],
  ['review', '/review'], ['communications', '/communications'], ['reports-monthly', '/reports/monthly'],
  ['executive', '/executive'], ['governance-command', '/governance-command'], ['analytics', '/analytics'],
  ['predictive', '/predictive'], ['decisions', '/decisions'], ['agents', '/agents'],
  ['opportunity', '/opportunity'], ['feasibility', '/feasibility'], ['funding', '/funding'],
  ['bankability', '/bankability'], ['quantity-survey', '/quantity-survey'], ['procurement', '/procurement'],
  ['revenue', '/revenue'], ['risk', '/risk'], ['claims', '/claims'], ['forensic-delay', '/forensic-delay'],
  ['contract-rules', '/contract-rules'], ['legal-holds', '/legal-holds'], ['dispute-rooms', '/dispute-rooms'],
  ['authority-matrix', '/authority-matrix'], ['authority', '/authority'], ['quality', '/quality'],
  ['safety', '/safety'], ['fire-safety', '/fire-safety'], ['utility', '/utility'],
  ['operational-readiness', '/operational-readiness'], ['repository', '/repository'], ['drawings', '/drawings'],
  ['clashes', '/clashes'], ['baselines', '/baselines'], ['simulation', '/simulation'],
  ['comparison', '/comparison'], ['approval', '/approval'], ['letters', '/letters'], ['evidence', '/evidence'],
  ['sources', '/sources'], ['knowledge', '/knowledge'], ['acceptance', '/acceptance'],
  ['admin-users', '/admin/users'], ['admin-roles', '/admin/roles'], ['admin-governance', '/admin/governance'],
  ['admin-policy', '/admin/policy'], ['admin-personas', '/admin/personas'], ['admin-settings', '/admin/settings'],
  ['admin-communications-rules', '/admin/communications-rules'], ['super-admin', '/super-admin'],
  ['audit', '/audit'], ['account', '/account'], ['help', '/help'],
];
// shown to every role (login + landing + a couple of universally-readable pages)
const LANDING_PAGES = [['overview', '/'], ['projects', '/projects'], ['review', '/review'], ['reports-monthly', '/reports/monthly']];
const DATA_FLOW = [['projects', '/projects'], ['baselines', '/baselines'], ['review', '/review'], ['decisions', '/decisions'], ['analytics', '/analytics'], ['executive', '/executive'], ['governance-command', '/governance-command']];

const ERROR_MARKERS = ['Application error', 'something went wrong', 'Unhandled Runtime', 'client-side exception', '500 -', 'This page could not be found', '404'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The login route is rate-limited; retry on 429 with a backoff so every role
// account gets in without tripping the throttle.
async function login(email, pw) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      if (r.status === 429) { await sleep(15000); continue; }
      if (!r.ok) return null;
      return (await r.json()).apiKey;
    } catch { await sleep(3000); }
  }
  return null;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const manifest = { base: BASE, lang: LANG, theme: THEME, roles: [], dataFlow: null };

  // resolve a real project key for the project switcher
  let projectKey = 'P-1000';
  const adminKey = await login('admin@sigma.local', ADMIN_PW);

  // ---- REAL DATA FLOW: upload the official template -> creates a project ----
  if (adminKey) {
    try {
      const t = await fetch(`${API}/ingestion/template`);
      const xlsx = Buffer.from(await t.arrayBuffer()).toString('base64');
      const up = await fetch(`${API}/ingestion/upload`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': adminKey },
        body: JSON.stringify({ filename: 'sigma-pmo-data-template.xlsx', contentBase64: xlsx }),
      });
      const outcome = await up.json().catch(() => ({}));
      const projects = await (await fetch(`${API}/projects`, { headers: { 'x-api-key': adminKey } })).json().catch(() => []);
      if (Array.isArray(projects) && projects.length) projectKey = projects[0].businessKey;
      manifest.dataFlow = { uploadHttp: up.status, outcome, projectCount: Array.isArray(projects) ? projects.length : 0, projectKey };
      console.log(`DATA FLOW: upload=${up.status} counts=${JSON.stringify(outcome.counts || outcome)} projects=${manifest.dataFlow.projectCount}`);
    } catch (e) { manifest.dataFlow = { error: e.message }; console.warn('data flow failed:', e.message); }
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
    defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });

  async function setSession(key) {
    await page.evaluate((k, l, p, t) => {
      localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', l);
      localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', t);
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, key, LANG, projectKey, THEME);
  }
  async function waitLoaded() {
    try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('Loading…')); }, { timeout: 20000 }); } catch {}
    await new Promise((r) => setTimeout(r, 1200));
  }
  async function shot(role, name, route) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await waitLoaded();
      const info = await page.evaluate((markers) => {
        const txt = document.body.innerText || '';
        const err = markers.find((m) => txt.includes(m)) || null;
        const gated = /تسجيل الدخول|Sign in with|أدخل مفتاح|enter your API key/i.test(txt) && location.pathname.includes('/auth');
        return { err, gated, len: txt.length };
      }, ERROR_MARKERS);
      await page.screenshot({ path: `${OUT}/${role}/${name}.png`, fullPage: true });
      return { route, name, ok: !info.err, gated: info.gated, note: info.err || (info.gated ? 'auth-gate' : 'ok'), len: info.len };
    } catch (e) {
      return { route, name, ok: false, note: e.message.slice(0, 80) };
    }
  }

  for (const acc of ACCOUNTS) {
    const key = acc.role === 'sigma_admin' ? adminKey : await login(acc.email, acc.pw);
    const rec = { role: acc.role, email: acc.email, loggedIn: !!key, deep: !!acc.deep, pages: [] };
    if (!key) { console.warn(`LOGIN FAILED: ${acc.role} (${acc.email})`); manifest.roles.push(rec); continue; }
    mkdirSync(`${OUT}/${acc.role}`, { recursive: true });
    await setSession(key);
    const pages = acc.deep ? ALL_PAGES : LANDING_PAGES;
    for (const [name, route] of pages) {
      const r = await shot(acc.role, name, route);
      rec.pages.push(r);
      console.log(`${acc.role}/${name}: ${r.ok ? 'OK' : 'X'}${r.gated ? ' (gated)' : ''}`);
    }
    const okCount = rec.pages.filter((p) => p.ok).length;
    rec.summary = `${okCount}/${rec.pages.length} pages OK`;
    manifest.roles.push(rec);
  }

  // ---- data-flow dashboards (as admin) ----
  if (adminKey) {
    await setSession(adminKey);
    mkdirSync(`${OUT}/_data-flow`, { recursive: true });
    const flow = [];
    for (const [name, route] of DATA_FLOW) {
      const r = await shot('_data-flow', name, route);
      flow.push(r); console.log(`_data-flow/${name}: ${r.ok ? 'OK' : 'X'}`);
    }
    manifest.dataFlowShots = flow;
  }

  await browser.close();
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
  const totalShots = manifest.roles.reduce((a, r) => a + r.pages.length, 0) + (manifest.dataFlowShots?.length || 0);
  const rolesIn = manifest.roles.filter((r) => r.loggedIn).length;
  console.log(`\n=== E2E DONE === roles logged in: ${rolesIn}/${ACCOUNTS.length}, screenshots: ${totalShots}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
