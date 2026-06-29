/** Capture live proof for the final report: chain-stage UI pages (P-1000) + Swagger + live API-response cards. */
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const API = 'https://system-api.sigma-pmo.com/api/v1';
const KEY = readFileSync('C:/Users/KHALE/AppData/Local/Temp/claude/e--Sigma-PMO/8c581043-4551-4f6d-bbed-be94f9177a32/scratchpad/seedkey.txt', 'utf8').trim();
const P = 'P-1000';
const OUT = 'shots-demo';

// Chain-stage UI pages (route, filename, caption).
const PAGES = [
  ['/feasibility', 'feasibility', 'الجدوى — فرص الاستثمار'],
  ['/bankability', 'bankability', 'الجدارة البنكية (Bankability)'],
  ['/funding', 'funding', 'التمويل (DSCR/Facilities)'],
  ['/drawings', 'drawings', 'الرسومات (PDF/DWG/DXF)'],
  ['/clashes', 'clashes', 'التعارضات (Clash Detection)'],
  ['/quantity-survey', 'quantity-survey', 'حصر الكميات + التكلفة (BOQ/NRM/Cost)'],
  ['/forensic-delay', 'forensic-delay', 'تحليل التأخير (CPM/EOT)'],
  ['/claims', 'claims', 'المطالبات (FIDIC Claims)'],
  ['/contract-rules', 'contract-rules', 'قواعد العقد (FIDIC clauses)'],
  ['/reports', 'reports', 'التقارير الدورية'],
  ['/executive', 'executive', 'التنفيذية (Executive KPIs)'],
  ['/governance-command', 'governance-command', 'مركز الحوكمة'],
];

// Live API-response cards (label, method, path, body?).
const CARDS = [
  ['GET /journey/P-1000 — الرحلة الموحّدة', 'GET', `/journey/${P}`],
  ['GET /projects/P-1000/cpm — المسار الحرج', 'GET', `/projects/${P}/cpm`],
  ['GET /clashes/:id — تفاصيل التعارض', 'GET', `/clashes?projectKey=${P}`, null, 'firstClash'],
  ['GET /executive/governance-dashboard — لوحة الحوكمة', 'GET', `/executive/governance-dashboard?projectKey=${P}`],
  ['POST /backup/restore-verify — إثبات الاستعادة', 'POST', '/backup/restore-verify', {}],
  ['GET /drawings/capabilities — قدرات CAD/APS', 'GET', '/drawings/capabilities'],
  ['GET /bankability/assessment?projectKey=P-1000', 'GET', `/bankability/assessment?projectKey=${P}`],
];

const card = (label, status, json) => `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>
body{font-family:"Segoe UI",sans-serif;margin:0;background:#0f172a;}
.h{background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;padding:14px 22px;font-size:17px;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.s{background:#16a34a;border-radius:20px;padding:3px 14px;font-size:14px;}
pre{margin:0;padding:20px 22px;color:#e2e8f0;font-family:Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:1000px;overflow:hidden;}
.k{color:#5eead4;}.v{color:#fde68a;}.n{color:#93c5fd;}
</style></head><body><div class="h"><span>${label}</span><span class="s">${status} OK</span></div><pre>${json}</pre></body></html>`;

const hl = (obj) => JSON.stringify(obj, null, 2)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
  .replace(/: "([^"]*)"/g, ': <span class="v">"$1"</span>')
  .replace(/: (\d+\.?\d*)/g, ': <span class="n">$1</span>');

async function fetchJson(method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'x-api-key': KEY, 'content-type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'], defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 } });
const page = await browser.newPage();

// 1) UI pages
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate((k, p) => { localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', 'ar'); localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', 'light'); localStorage.setItem('sigma_sidebar_collapsed', '0'); }, KEY, P);
for (const [route, name] of PAGES) {
  try {
    await page.evaluate((p) => localStorage.setItem('sigma_project_key', p), P);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
    try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('جارٍ التحميل')); }, { timeout: 14000 }); } catch {}
    await new Promise((r) => setTimeout(r, 2200));
    await page.screenshot({ path: `${OUT}/ui-${name}.png`, fullPage: true });
    console.log('UI  ' + name);
  } catch (e) { console.log('UI ERR ' + name + ' ' + e.message); }
}

// 2) Swagger
try {
  await page.goto(`${API}/docs`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: `${OUT}/swagger.png`, fullPage: false });
  console.log('swagger');
} catch (e) { console.log('swagger ERR ' + e.message); }

// 3) API-response cards
for (const [label, method, path, body, mode] of CARDS) {
  try {
    let res = await fetchJson(method, path, body);
    let obj = res.json;
    if (mode === 'firstClash' && Array.isArray(obj) && obj[0]) {
      const detail = await fetchJson('GET', `/clashes/${obj[0].id}`);
      obj = detail.json; res = detail;
    }
    const name = label.split(' ')[1].replace(/[^\w]/g, '_');
    await page.setContent(card(label, res.status, hl(obj)), { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 400));
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 1100, height: Math.min(h, 1050), deviceScaleFactor: 1.4 });
    await page.screenshot({ path: `${OUT}/api-${name}.png` });
    await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.1 });
    console.log('API ' + name + ' (' + res.status + ')');
  } catch (e) { console.log('API ERR ' + label + ' ' + e.message); }
}

await browser.close();
console.log('DONE');
