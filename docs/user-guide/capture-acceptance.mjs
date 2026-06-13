/**
 * Capture the NEW governance-lifecycle pages + the 23-test Acceptance page
 * (Mr. Ayham, 2026-06-13) into ./shots-new/*.png, on the seeded project P-1000.
 * Reuses the user-guide capture approach (puppeteer-core + installed Edge).
 *   node capture-acceptance.mjs
 */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
const PROJECT = 'P-1000';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}`);
  return (await res.json()).apiKey;
}

// The six new lifecycle pages (light / EN, full page so findings + AI panel show).
const NEW_ROUTES = [
  ['bankability', '/bankability'],
  ['safety', '/safety'],
  ['fire-safety', '/fire-safety'],
  ['authority', '/authority'],
  ['utility', '/utility'],
  ['operational-readiness', '/operational-readiness'],
];

// Existing lifecycle / governance modules — so the guide covers every module.
const EXISTING_ROUTES = [
  ['overview', '/'],
  ['command-center', '/governance-command'],
  ['executive', '/executive'],
  ['hierarchy', '/hierarchy'],
  ['agents', '/agents'],
  ['opportunity', '/opportunity'],
  ['feasibility', '/feasibility'],
  ['quantity-survey', '/quantity-survey'],
  ['procurement', '/procurement'],
  ['revenue', '/revenue'],
  ['funding', '/funding'],
  ['predictive', '/predictive'],
  ['knowledge', '/knowledge'],
  ['input', '/input'],
  ['review', '/review'],
  ['decisions', '/decisions'],
  ['analytics', '/analytics'],
  ['risk', '/risk'],
  ['claims', '/claims'],
  ['baselines', '/baselines'],
  ['simulation', '/simulation'],
  ['reports-monthly', '/reports/monthly'],
  ['admin-governance', '/admin/governance'],
  ['admin-roles', '/admin/roles'],
];

async function main() {
  rmSync('shots-new', { recursive: true, force: true });
  mkdirSync('shots-new', { recursive: true });

  const adminKey = await login('admin@sigma.local', 'AdminSigma#2026');
  console.log('logged in: admin');

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.25'],
    defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1.25 },
  });
  const page = await browser.newPage();
  let prepared = false;

  async function setSession({ apiKey, theme = 'light', lang = 'en', projectKey = PROJECT }) {
    if (!prepared) { await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' }); prepared = true; }
    await page.evaluate((k, t, l, p) => {
      if (k) localStorage.setItem('sigma_api_key', k); else localStorage.removeItem('sigma_api_key');
      localStorage.setItem('sigma_theme', t);
      localStorage.setItem('sigma_lang', l);
      localStorage.setItem('sigma_project_key', p);
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, apiKey ?? null, theme, lang, projectKey);
  }

  async function waitLoaded() {
    try {
      await page.waitForFunction(() => {
        const t = document.body.innerText;
        if (t.includes('Loading workspace') || t.includes('جارٍ تحميل')) return false;
        if (t.includes('Loading…') || t.includes('Loading...')) return false;
        return true;
      }, { timeout: 30000 });
    } catch { /* late shot > none */ }
    await new Promise((r) => setTimeout(r, 2200));
  }

  async function shot(name, path, opts = {}) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await waitLoaded();
      if (opts.clickText) {
        await page.evaluate((txt) => {
          const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.toLowerCase().includes(txt.toLowerCase()));
          if (btn) btn.click();
        }, opts.clickText);
        await new Promise((r) => setTimeout(r, opts.waitAfterClick ?? 1500));
        await waitLoaded();
      }
      await page.screenshot({ path: `shots-new/${name}.png`, fullPage: opts.fullPage ?? true });
      console.log(`shot: ${name}`);
    } catch (err) { console.warn(`FAILED ${name}: ${err.message}`); }
  }

  await setSession({ apiKey: adminKey });

  // The six new pages (light / EN).
  for (const [name, route] of NEW_ROUTES) {
    await shot(name, route, { fullPage: true });
  }
  // Existing modules (light / EN) — full coverage for the usage guide.
  for (const [name, route] of EXISTING_ROUTES) {
    await shot('ex-' + name, route, { fullPage: true });
  }

  // The Acceptance page — run the 23 tests live, then capture the matrix.
  await shot('acceptance', '/acceptance', { clickText: 'Run', waitAfterClick: 35000, fullPage: true });

  // Bilingual proof (Arabic / RTL) for two of the new pages.
  await setSession({ apiKey: adminKey, lang: 'ar' });
  await shot('ar-safety', '/safety', { fullPage: true });
  await shot('ar-authority', '/authority', { fullPage: true });

  await browser.close();
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
