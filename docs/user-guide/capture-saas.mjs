/**
 * Capture the public SaaS journey (intro -> register -> login) + the dashboard
 * from the LIVE deployment for the Arabic SaaS guide PDF.
 *   node capture-saas.mjs
 */
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const API = 'https://system-api.sigma-pmo.com/api/v1';

const PUBLIC = [
  ['intro', '/intro'],
  ['register', '/register'],
  ['auth', '/auth'],
  ['company-login', '/c/company'], // a registered company's own login portal
];

// Logged-in (super-admin) surfaces — the new SaaS control plane.
const ADMIN_PAGES = [
  ['overview', '/'],
  ['super-admin-overview', '/super-admin'],
  ['super-admin-companies', '/super-admin?tab=companies'],
  ['super-admin-subscriptions', '/super-admin?tab=subscriptions'],
  ['super-admin-requests', '/super-admin?tab=requests'],
];

async function login(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  return (await r.json()).apiKey;
}

async function settle(page, ms = 2600) {
  try {
    await page.waitForFunction(() => {
      const t = document.body ? document.body.innerText : '';
      return !/جارٍ التحميل|Loading workspace|Loading…|Loading\.\.\./.test(t);
    }, { timeout: 20000 });
  } catch { /* take a late shot anyway */ }
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mkdirSync('shots-guide/ar', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
    defaultViewport: { width: 1460, height: 920, deviceScaleFactor: 1.1 },
  });
  const page = await browser.newPage();

  // Prime Arabic + light theme so every shot is RTL Arabic.
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('sigma_lang', 'ar');
    localStorage.setItem('sigma_theme', 'light');
    localStorage.setItem('sigma_sidebar_collapsed', '0');
  });

  for (const [name, route] of PUBLIC) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await settle(page);
      await page.screenshot({ path: `shots-guide/ar/${name}.png`, fullPage: true });
      console.log(`shot: ${name}`);
    } catch (e) { console.warn(`FAILED ${name}: ${e.message}`); }
  }

  // Logged-in surfaces (dashboard + super-admin console) as the seeded admin.
  try {
    const key = await login('admin@sigma.local', 'AdminSigma#2026');
    await page.evaluate((k) => {
      localStorage.setItem('sigma_api_key', k);
      localStorage.setItem('sigma_lang', 'ar');
      localStorage.setItem('sigma_theme', 'light');
      localStorage.setItem('sigma_sidebar_collapsed', '0');
    }, key);
    for (const [name, route] of ADMIN_PAGES) {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await settle(page, 3000);
        await page.screenshot({ path: `shots-guide/ar/${name}.png`, fullPage: true });
        console.log(`shot: ${name}`);
      } catch (e) { console.warn(`FAILED ${name}: ${e.message}`); }
    }
  } catch (e) { console.warn(`FAILED admin login: ${e.message}`); }

  await browser.close();
  console.log('CAPTURE DONE.');
}

main().catch((e) => { console.error(e); process.exit(1); });
