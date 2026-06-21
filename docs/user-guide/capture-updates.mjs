/**
 * Capture REAL screenshots of today's shipped updates from the LIVE platform:
 *   - /input  with the new "تصنيف الإدخال/المشروع" section + HierarchyPicker
 *   - /input  focused crop of that classification section
 *   - /projects full page (shows the reordered sidebar: Projects under Input, Hierarchy beside)
 *   - /projects Add-Project modal (full hierarchy chain)
 *   - sidebar element crop
 *
 * Logs in as the PMO demo user (has canIngestSchedule + canManageHierarchy).
 *   node capture-updates.mjs            # ar, dark
 *   LANG=en THEME=light node capture-updates.mjs
 */
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'https://system.sigma-pmo.com';
const API = process.env.API || 'https://system-api.sigma-pmo.com/api/v1';
const PW = process.env.DEMO_PW || 'SigmaDemo2026';
const LANG = process.env.LANG || 'ar';
const THEME = process.env.THEME || 'dark';
const OUT = process.env.OUT || 'shots-updates';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}`);
  return (await res.json()).apiKey;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}/${LANG}`, { recursive: true });

  const key = await login('pmo@sigma.ae', PW);
  let projectKey = 'P-CODEX-001';
  try {
    const r = await fetch(`${API}/projects`, { headers: { 'x-api-key': key } });
    const list = await r.json();
    if (Array.isArray(list) && list.length) projectKey = list[0].businessKey;
  } catch { /* keep default */ }
  console.log(`login ok; project=${projectKey}; lang=${LANG}; theme=${THEME}`);

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.25'],
    defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.25 },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k, l, p, t) => {
    localStorage.setItem('sigma_api_key', k);
    localStorage.setItem('sigma_lang', l);
    localStorage.setItem('sigma_project_key', p);
    localStorage.setItem('sigma_theme', t);
    localStorage.setItem('sigma_sidebar_collapsed', '0');
  }, key, LANG, projectKey, THEME);

  async function waitLoaded() {
    try {
      await page.waitForFunction(() => {
        const t = document.body.innerText;
        return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('Loading…') || t.includes('Loading...'));
      }, { timeout: 25000 });
    } catch { /* late shot > none */ }
    await new Promise((r) => setTimeout(r, 1900));
  }
  const dir = `${OUT}/${LANG}`;
  const shot = async (name, opts = {}) => { await page.screenshot({ path: `${dir}/${name}.png`, ...opts }); console.log('shot', name); };

  // 1) /input — full page: new sidebar + classification section + hierarchy picker
  await page.goto(`${BASE}/input`, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitLoaded();
  await shot('input-full', { fullPage: true });

  // 1b) focused crop of the "تصنيف الإدخال / المشروع" section
  try {
    const handle = await page.evaluateHandle(() => {
      const p = [...document.querySelectorAll('p')].find((e) => e.textContent && (e.textContent.includes('تصنيف الإدخال') || e.textContent.includes('Assign this input')));
      return p ? p.closest('div') : null;
    });
    const el = handle.asElement();
    if (el) { await el.screenshot({ path: `${dir}/input-classification.png` }); console.log('shot input-classification'); }
    else console.warn('classification section not found (role lacks canManageHierarchy?)');
  } catch (e) { console.warn('classification crop failed:', e.message); }

  // 2) /projects — full page: shows the reordered sidebar
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitLoaded();
  await shot('projects-full', { fullPage: true });

  // 3) Add-Project modal with the full hierarchy chain
  try {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const txt = (b.textContent || '').trim();
        return txt.includes('إضافة مشروع') || txt.includes('مشروع جديد') || /add project/i.test(txt) || /new project/i.test(txt);
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) { await new Promise((r) => setTimeout(r, 1600)); await shot('projects-add-modal', { fullPage: true }); }
    else console.warn('Add Project button not found');
  } catch (e) { console.warn('modal capture failed:', e.message); }

  // 4) sidebar element crop (from projects page, modal closed first)
  try {
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));
    const aside = await page.$('aside');
    if (aside) { await aside.screenshot({ path: `${dir}/sidebar.png` }); console.log('shot sidebar'); }
  } catch (e) { console.warn('sidebar crop failed:', e.message); }

  await browser.close();
  console.log('CAPTURE DONE ->', dir);
}

main().catch((e) => { console.error(e); process.exit(1); });
