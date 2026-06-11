/**
 * Sigma PMO user-guide screenshot capture.
 *
 * Drives the locally running app (frontend :3000 / backend :3001) with
 * puppeteer-core + the installed Edge browser and captures every page into
 * ./shots/*.png. Per the guide spec: ALL pages in LIGHT mode / English,
 * plus exactly one DARK shot of the home page and one ARABIC shot.
 * Re-runnable any time the UI changes: `node capture.mjs`.
 */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';

const ROLES = {
  admin:         { email: 'admin@sigma.local',      password: 'AdminSigma#2026' },
  reviewer:      { email: 'reviewer@sigma.local',   password: 'ReviewerSigma#2026' },
  client:        { email: 'client@sigma.ae',        password: 'ClientSigma#2026' },
  consultant:    { email: 'consultant@sigma.ae',    password: 'ConsultantSigma#2026' },
  contractor:    { email: 'contractor@sigma.ae',    password: 'ContractorSigma#2026' },
  subcontractor: { email: 'subcontractor@sigma.ae', password: 'SubcontractorSigma#2026' },
};

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}`);
  return (await res.json()).apiKey;
}

/** All admin-visible routes, in guide order. */
const ADMIN_ROUTES = [
  ['overview', '/'],
  ['governance-command', '/governance-command'],
  ['executive', '/executive'],
  ['hierarchy', '/hierarchy'],
  ['agents', '/agents'],
  ['feasibility', '/feasibility'],
  ['projects', '/projects'],
  ['knowledge', '/knowledge'],
  ['input', '/input'],
  ['review', '/review'],
  ['decisions', '/decisions'],
  ['analytics', '/analytics'],
  ['risk', '/risk'],
  ['claims', '/claims'],
  ['repository', '/repository'],
  ['evidence', '/evidence'],
  ['approval', '/approval'],
  ['baselines', '/baselines'],
  ['simulation', '/simulation'],
  ['clashes', '/clashes'],
  ['drawings', '/drawings'],
  ['letters', '/letters'],
  ['sources', '/sources'],
  ['reports-monthly', '/reports/monthly'],
  ['comparison', '/comparison'],
  ['admin-roles', '/admin/roles'],
  ['admin-policy', '/admin/policy'],
  ['admin-personas', '/admin/personas'],
  ['admin-users', '/admin/users'],
  ['admin-settings', '/admin/settings'],
  ['audit', '/audit'],
];

async function main() {
  rmSync('shots', { recursive: true, force: true });
  mkdirSync('shots', { recursive: true });

  // One login per role (each login rotates that user's key — once only).
  const keys = {};
  for (const [role, cred] of Object.entries(ROLES)) {
    keys[role] = await login(cred.email, cred.password);
    console.log(`logged in: ${role}`);
  }

  // Feasibility detail target (first opportunity).
  let oppId = null;
  try {
    const res = await fetch(`${API}/feasibility/opportunities`, { headers: { 'x-api-key': keys.admin } });
    const rows = await res.json();
    // Prefer an opportunity that already has a Level-2 study (richer shots).
    oppId = rows.find((r) => r.stage === 'study')?.id ?? rows[0]?.id ?? null;
  } catch { /* optional */ }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.25'],
    defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1.25 },
  });

  const page = await browser.newPage();
  let prepared = false;

  /** Set localStorage for the app origin (navigate once first so the origin exists). */
  async function setSession({ apiKey, theme = 'light', lang = 'en', projectKey = 'P-1000' }) {
    if (!prepared) {
      await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
      prepared = true;
    }
    await page.evaluate((k, t, l, p) => {
      if (k) localStorage.setItem('sigma_api_key', k); else localStorage.removeItem('sigma_api_key');
      localStorage.setItem('sigma_theme', t);
      localStorage.setItem('sigma_lang', l);
      localStorage.setItem('sigma_project_key', p);
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, apiKey ?? null, theme, lang, projectKey);
  }

  /** Wait until the workspace is REALLY loaded (no loading text, app shell present). */
  async function waitLoaded(authed) {
    try {
      await page.waitForFunction(
        (needAuth) => {
          const text = document.body.innerText;
          if (text.includes('Loading workspace') || text.includes('جارٍ تحميل')) return false;
          if (text.includes('Loading…') || text.includes('Loading...')) return false;
          // When authenticated, the top bar must show the user (no Sign in button).
          if (needAuth && /Sign in|تسجيل الدخول/.test(text) && !location.pathname.startsWith('/auth')) return false;
          return true;
        },
        { timeout: 30000 },
        authed,
      );
    } catch { /* keep going — better a late shot than none */ }
    // Charts/animations settle.
    await new Promise((r) => setTimeout(r, 2500));
  }

  async function shot(name, path, opts = {}) {
    const file = `shots/${name}.png`;
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await waitLoaded(opts.authed ?? true);
      if (opts.clickText) {
        await page.evaluate((txt) => {
          const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(txt));
          if (btn) btn.click();
        }, opts.clickText);
        await new Promise((r) => setTimeout(r, 1200));
      }
      await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
      console.log(`shot: ${name}`);
    } catch (err) {
      console.warn(`FAILED ${name}: ${err.message}`);
    }
  }

  // ── Anonymous: the sign-in page (light, like the rest of the guide) ──
  await setSession({ apiKey: null });
  await shot('auth', '/auth', { authed: false });

  // ── Admin: every route (LIGHT / EN) ──
  await setSession({ apiKey: keys.admin });
  for (const [name, route] of ADMIN_ROUTES) {
    await shot(`admin-${name}`, route, { fullPage: ['overview', 'executive', 'feasibility'].includes(name) });
  }

  // Feasibility detail + its tabs.
  if (oppId) {
    await shot('admin-feasibility-detail', `/feasibility/${oppId}`, { fullPage: true });
    await shot('admin-feasibility-study', `/feasibility/${oppId}`, { clickText: 'Level 2 · Study', fullPage: true });
    await shot('admin-feasibility-packages', `/feasibility/${oppId}`, { clickText: 'Packages' });
    await shot('admin-feasibility-sketches', `/feasibility/${oppId}`, { clickText: 'Concept sketches' });
  }

  // Project switcher dropdown open (two projects).
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    await waitLoaded(true);
    await page.waitForSelector('button[aria-label="Switch project"]', { timeout: 15000 });
    await page.click('button[aria-label="Switch project"]');
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: 'shots/admin-project-switcher.png' });
    console.log('shot: admin-project-switcher');
  } catch (e) { console.warn('switcher shot failed:', e.message); }

  // ── The ONLY dark shot: home page ──
  await setSession({ apiKey: keys.admin, theme: 'dark' });
  await shot('dark-overview', '/', { fullPage: true });

  // ── The ONLY Arabic shot: home page (RTL) ──
  await setSession({ apiKey: keys.admin, theme: 'light', lang: 'ar' });
  await shot('ar-overview', '/', { fullPage: true });

  // ── Other roles: their slice (LIGHT / EN) ──
  const ROLE_SHOTS = {
    reviewer:      [['overview', '/'], ['review', '/review'], ['comparison', '/comparison']],
    client:        [['overview', '/'], ['governance-command', '/governance-command'], ['approval', '/approval'], ['feasibility', '/feasibility']],
    consultant:    [['overview', '/'], ['simulation', '/simulation'], ['analytics', '/analytics']],
    contractor:    [['overview', '/'], ['input', '/input'], ['letters', '/letters']],
    subcontractor: [['overview', '/'], ['input', '/input'], ['blocked-risk', '/risk']],
  };
  for (const [role, list] of Object.entries(ROLE_SHOTS)) {
    await setSession({ apiKey: keys[role] });
    for (const [name, route] of list) {
      await shot(`${role}-${name}`, route);
    }
  }

  await browser.close();
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
