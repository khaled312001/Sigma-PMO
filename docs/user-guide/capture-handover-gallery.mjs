/** Re-capture ALL handover gallery screenshots fresh, authenticated as admin, on P-1000.
 *  Guards against the login-splash bug: re-navigates if a page bounces to /auth. */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const API = 'https://system-api.sigma-pmo.com/api/v1';
const ADMIN_PW = process.env.ADMIN_PW || 'Sg!ElFo6k4ZgZW2#26';
const PROJECT = 'P-1000';
const OUT = 'shots-handover';

const ROUTES = [
  ['input', '/input'], ['projects', '/projects'], ['review', '/review'],
  ['decisions', '/decisions'], ['approval', '/approval'], ['evidence', '/evidence'],
  ['analytics', '/analytics'], ['predictive', '/predictive'], ['risk', '/risk'],
  ['claims', '/claims'], ['forensic-delay', '/forensic-delay'], ['quantity-survey', '/quantity-survey'],
  ['executive', '/executive'], ['governance-command', '/governance-command'], ['audit', '/audit'],
  ['admin-roles', '/admin/roles'], ['admin-governance', '/admin/governance'],
];

async function login() {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sigma.local', password: ADMIN_PW }) });
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 12000)); continue; }
    if (r.ok) return (await r.json()).apiKey;
    return null;
  }
}
const key = await login();
if (!key) { console.error('login failed'); process.exit(1); }
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'], defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 } });
const page = await browser.newPage();
const seed = (k, p) => { localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', 'ar'); localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', 'light'); localStorage.setItem('sigma_sidebar_collapsed', '0'); };
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate(seed, key, PROJECT);

const isLogin = () => page.evaluate(() => { const u = location.pathname; const t = document.body.innerText; return u.startsWith('/auth') || t.includes('سجّل شركتك') || t.includes('تسجيل الدخول') && t.includes('منصّة حوكمة'); });
const results = [];
for (const [name, route] of ROUTES) {
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    await page.evaluate(seed, key, PROJECT);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
    try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('جارٍ التحميل')); }, { timeout: 18000 }); } catch {}
    await new Promise((r) => setTimeout(r, 2200));
    if (await isLogin()) { continue; } // bounced to login → retry
    ok = true;
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  results.push(`${ok ? 'OK ' : 'WARN(login?) '} ${name}`);
  console.log(results[results.length - 1]);
}
await browser.close();
console.log('DONE\n' + results.join('\n'));
