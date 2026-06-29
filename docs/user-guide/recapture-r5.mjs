/** Targeted re-capture: open the BOQ Traceability tab + the enriched item panel. */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const KEY = readFileSync('C:/Users/KHALE/AppData/Local/Temp/claude/e--Sigma-PMO/8c581043-4551-4f6d-bbed-be94f9177a32/scratchpad/seedkey.txt', 'utf8').trim();
const P = 'P-1000';
const OUT = 'shots-gaps';
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'], defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 } });
const page = await browser.newPage();
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate((k, p) => { localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', 'ar'); localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', 'light'); localStorage.setItem('sigma_sidebar_collapsed', '0'); }, KEY, P);
await page.goto(`${BASE}/quantity-survey`, { waitUntil: 'networkidle2', timeout: 50000 });
await settle(2500);

async function clickExact(text) {
  const h = await page.evaluateHandle((t) => {
    const els = [...document.querySelectorAll('button,a,[role="tab"],div,span')];
    return els.find((e) => (e.innerText || '').trim() === t && e.offsetParent !== null) || els.find((e) => (e.innerText || '').includes(t) && e.offsetParent !== null) || null;
  }, text);
  const el = h.asElement();
  if (el) { await el.click(); return true; }
  return false;
}

console.log('tab BOQ traceability:', await clickExact('تتبّع بنود BOQ'));
await settle(2000);
// open the first item's trace panel
const opened = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => /أثر|تتبّع|تتبع|Trace/.test(b.innerText) && b.offsetParent !== null);
  if (btns[0]) { btns[0].click(); return btns.length; }
  return 0;
});
console.log('trace buttons found:', opened);
await settle(2200);
await page.screenshot({ path: `${OUT}/r5-qs-traceability.png`, fullPage: true });
console.log('re-captured r5-qs-traceability');
await browser.close();
