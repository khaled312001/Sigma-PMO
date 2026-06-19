/**
 * Capture every reachable page of the LIVE platform into shots-live/{en,ar}/*.png
 * for the complete screenshot user guide. Uses the PMO demo key for most pages
 * and the CLIENT key for the canEditPolicy admin pages. 3 pages (roles, personas,
 * super-admin) need a sigma_admin key — set ADMIN_KEY env to include them.
 *
 *   PROJECT=P-XXXX node capture-live.mjs
 */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'https://system.sigma-pmo.com';
const API = process.env.API || 'https://system-api.sigma-pmo.com/api/v1';
const PROJECT = process.env.PROJECT || 'P-CODEX-001';
const PW = process.env.DEMO_PW || 'SigmaDemo2026';

// [slug, route, keyRole]  keyRole: 'pmo' | 'client' | 'admin'
const ROUTES = [
  ['overview', '/', 'pmo'],
  ['governance-command', '/governance-command', 'pmo'],
  ['executive', '/executive', 'pmo'],
  ['hierarchy', '/hierarchy', 'pmo'],
  ['agents', '/agents', 'pmo'],
  ['projects', '/projects', 'pmo'],
  ['input', '/input', 'pmo'],
  ['communications', '/communications', 'pmo'],
  ['review', '/review', 'pmo'],
  ['decisions', '/decisions', 'pmo'],
  ['analytics', '/analytics', 'pmo'],
  ['risk', '/risk', 'pmo'],
  ['claims', '/claims', 'pmo'],
  ['opportunity', '/opportunity', 'pmo'],
  ['feasibility', '/feasibility', 'pmo'],
  ['quantity-survey', '/quantity-survey', 'pmo'],
  ['procurement', '/procurement', 'pmo'],
  ['revenue', '/revenue', 'pmo'],
  ['funding', '/funding', 'pmo'],
  ['predictive', '/predictive', 'pmo'],
  ['bankability', '/bankability', 'pmo'],
  ['safety', '/safety', 'pmo'],
  ['fire-safety', '/fire-safety', 'pmo'],
  ['authority', '/authority', 'pmo'],
  ['utility', '/utility', 'pmo'],
  ['operational-readiness', '/operational-readiness', 'pmo'],
  ['acceptance', '/acceptance', 'pmo'],
  ['baselines', '/baselines', 'pmo'],
  ['simulation', '/simulation', 'pmo'],
  ['clashes', '/clashes', 'pmo'],
  ['drawings', '/drawings', 'pmo'],
  ['letters', '/letters', 'pmo'],
  ['sources', '/sources', 'pmo'],
  ['reports-monthly', '/reports/monthly', 'pmo'],
  ['repository', '/repository', 'pmo'],
  ['evidence', '/evidence', 'pmo'],
  ['approval', '/approval', 'pmo'],
  ['comparison', '/comparison', 'pmo'],
  ['knowledge', '/knowledge', 'pmo'],
  ['account', '/account', 'pmo'],
  ['help', '/help', 'pmo'],
  ['audit', '/audit', 'pmo'],
  ['admin-users', '/admin/users', 'pmo'],
  // canEditPolicy → CLIENT key
  ['admin-governance', '/admin/governance', 'client'],
  ['admin-communications-rules', '/admin/communications-rules', 'client'],
  ['admin-policy', '/admin/policy', 'client'],
  ['admin-settings', '/admin/settings', 'client'],
  // need sigma_admin (captured only if ADMIN_KEY is set)
  ['admin-roles', '/admin/roles', 'admin'],
  ['admin-personas', '/admin/personas', 'admin'],
  ['super-admin', '/super-admin', 'admin'],
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
  rmSync('shots-live', { recursive: true, force: true });
  mkdirSync('shots-live/en', { recursive: true });
  mkdirSync('shots-live/ar', { recursive: true });

  const keys = {
    pmo: await login('pmo@sigma.ae', PW),
    client: await login('client@sigma.ae', PW),
    admin: process.env.ADMIN_KEY || null,
  };
  console.log(`keys: pmo=${!!keys.pmo} client=${!!keys.client} admin=${!!keys.admin}`);

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
    defaultViewport: { width: 1460, height: 900, deviceScaleFactor: 1.1 },
  });
  const page = await browser.newPage();
  let prepared = false;

  async function setSession(key, lang) {
    if (!prepared) { await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' }); prepared = true; }
    await page.evaluate((k, l, p) => {
      localStorage.setItem('sigma_api_key', k);
      localStorage.setItem('sigma_theme', 'light');
      localStorage.setItem('sigma_lang', l);
      localStorage.setItem('sigma_project_key', p);
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, key, lang, PROJECT);
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
    await new Promise((r) => setTimeout(r, 1600));
  }

  let done = 0, skipped = 0;
  for (const lang of ['ar', 'en']) {
    let curRole = null;
    for (const [name, route, role] of ROUTES) {
      const key = keys[role];
      if (!key) { skipped++; console.warn(`SKIP ${lang}/${name} (no ${role} key)`); continue; }
      if (role !== curRole) { await setSession(key, lang); curRole = role; }
      else await setSession(key, lang);
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await waitLoaded();
        await page.screenshot({ path: `shots-live/${lang}/${name}.png`, fullPage: true });
        done++; console.log(`shot ${lang}: ${name}`);
      } catch (err) { console.warn(`FAILED ${lang}/${name}: ${err.message}`); }
    }
  }

  await browser.close();
  console.log(`CAPTURE DONE. ${done} shots, ${skipped} skipped (need admin key).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
