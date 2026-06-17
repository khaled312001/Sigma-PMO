/**
 * Capture every documented page of the platform into shots-guide/{en,ar}/*.png
 * for the full user guide (Mr. Ayham, 2026-06-17). Logs in as admin on P-1000.
 *   node capture-user-guide.mjs
 */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api/v1';
const PROJECT = 'P-1000';

// slug -> route. Slug is the screenshot filename (matches the guide's route map).
const ROUTES = [
  ['overview', '/'],
  ['governance-command', '/governance-command'],
  ['executive', '/executive'],
  ['hierarchy', '/hierarchy'],
  ['agents', '/agents'],
  ['projects', '/projects'],
  ['knowledge', '/knowledge'],
  ['input', '/input'],
  ['review', '/review'],
  ['decisions', '/decisions'],
  ['analytics', '/analytics'],
  ['risk', '/risk'],
  ['claims', '/claims'],
  ['opportunity', '/opportunity'],
  ['feasibility', '/feasibility'],
  ['quantity-survey', '/quantity-survey'],
  ['procurement', '/procurement'],
  ['revenue', '/revenue'],
  ['funding', '/funding'],
  ['predictive', '/predictive'],
  ['bankability', '/bankability'],
  ['safety', '/safety'],
  ['fire-safety', '/fire-safety'],
  ['authority', '/authority'],
  ['utility', '/utility'],
  ['operational-readiness', '/operational-readiness'],
  ['acceptance', '/acceptance'],
  ['baselines', '/baselines'],
  ['simulation', '/simulation'],
  ['clashes', '/clashes'],
  ['drawings', '/drawings'],
  ['letters', '/letters'],
  ['sources', '/sources'],
  ['reports-monthly', '/reports/monthly'],
  ['repository', '/repository'],
  ['evidence', '/evidence'],
  ['approval', '/approval'],
  ['comparison', '/comparison'],
  ['account', '/account'],
  ['help', '/help'],
  ['admin-roles', '/admin/roles'],
  ['admin-users', '/admin/users'],
  ['admin-governance', '/admin/governance'],
  ['admin-policy', '/admin/policy'],
  ['admin-personas', '/admin/personas'],
  ['audit', '/audit'],
  ['admin-settings', '/admin/settings'],
];

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}`);
  return (await res.json()).apiKey;
}

async function main() {
  rmSync('shots-guide', { recursive: true, force: true });
  mkdirSync('shots-guide/en', { recursive: true });
  mkdirSync('shots-guide/ar', { recursive: true });

  const adminKey = await login('admin@sigma.local', 'AdminSigma#2026');
  console.log('logged in: admin');

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
    defaultViewport: { width: 1460, height: 900, deviceScaleFactor: 1.1 },
  });
  const page = await browser.newPage();
  let prepared = false;

  async function setSession(lang) {
    if (!prepared) { await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' }); prepared = true; }
    await page.evaluate((k, l, p) => {
      localStorage.setItem('sigma_api_key', k);
      localStorage.setItem('sigma_theme', 'light');
      localStorage.setItem('sigma_lang', l);
      localStorage.setItem('sigma_project_key', p);
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, adminKey, lang, PROJECT);
  }

  async function waitLoaded() {
    try {
      await page.waitForFunction(() => {
        const t = document.body.innerText;
        if (t.includes('Loading workspace') || t.includes('جارٍ تحميل')) return false;
        if (t.includes('Loading…') || t.includes('Loading...')) return false;
        return true;
      }, { timeout: 25000 });
    } catch { /* late shot > none */ }
    await new Promise((r) => setTimeout(r, 1800));
  }

  async function shot(dir, name, path) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await waitLoaded();
      await page.screenshot({ path: `shots-guide/${dir}/${name}.png`, fullPage: true });
      console.log(`shot ${dir}: ${name}`);
    } catch (err) { console.warn(`FAILED ${dir}/${name}: ${err.message}`); }
  }

  for (const lang of ['en', 'ar']) {
    await setSession(lang);
    for (const [name, route] of ROUTES) {
      await shot(lang, name, route);
    }
  }

  await browser.close();
  console.log('CAPTURE DONE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
