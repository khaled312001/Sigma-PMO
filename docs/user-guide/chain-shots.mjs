/** Screenshots of the governance-chain pages for P-1000 AFTER running the chain. */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const API = 'https://system-api.sigma-pmo.com/api/v1';
const ADMIN_PW = process.env.ADMIN_PW || 'Sg!ElFo6k4ZgZW2#26';
const PROJECT = 'P-1000';
const OUT = 'shots-chain';
const PAGES = [['L2-review', '/review'], ['L3-decisions', '/decisions'], ['L7-executive', '/executive'], ['L8-governance-command', '/governance-command'], ['audit', '/audit'], ['analytics', '/analytics']];

async function login() {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sigma.local', password: ADMIN_PW }) });
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 12000)); continue; }
    if (r.ok) return (await r.json()).apiKey;
    return null;
  }
}
const key = await login();
if (!key) { console.error('login failed'); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'], defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 } });
const page = await browser.newPage();
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate((k, p) => { localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', 'ar'); localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', 'light'); localStorage.setItem('sigma_sidebar_collapsed', '0'); }, key, PROJECT);
for (const [name, route] of PAGES) {
  await page.evaluate((p) => localStorage.setItem('sigma_project_key', p), PROJECT);
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
  try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل')); }, { timeout: 18000 }); } catch {}
  await new Promise((r) => setTimeout(r, 1600));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('shot', name);
}
await browser.close();
console.log('DONE');
