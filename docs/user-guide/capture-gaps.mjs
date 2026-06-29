/** Capture live PROOF (prod) for the gaps-resolution report: new-feature UI pages
 * (deep-linked to real P-1000 records) + the generated clash PDF + live API cards. */
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://system.sigma-pmo.com';
const API = 'https://system-api.sigma-pmo.com/api/v1';
const KEY = readFileSync('C:/Users/KHALE/AppData/Local/Temp/claude/e--Sigma-PMO/8c581043-4551-4f6d-bbed-be94f9177a32/scratchpad/seedkey.txt', 'utf8').trim();
const P = 'P-1000';
const OUT = 'shots-gaps';

// Real prod record ids (from the live verification run).
const CLASH_ID = '466ce0d8-e179-4be3-8fca-1cce19f1aeb4';
const BOQ_ITEM_ID = 'dae66b2b-87ca-4514-ada7-3f777800516c';
const DEC_ID = '8d6ab693-6340-466e-8151-7929acfd596e';

const card = (label, status, json) => `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>
body{font-family:"Segoe UI",sans-serif;margin:0;background:#0f172a;}
.h{background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;padding:14px 22px;font-size:17px;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.s{background:#16a34a;border-radius:20px;padding:3px 14px;font-size:14px;}
pre{margin:0;padding:20px 22px;color:#e2e8f0;font-family:Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:1400px;overflow:hidden;}
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

// Save the live-generated clash PDF for a visual render.
const pdfRes = await fetch(`${API}/clashes/${CLASH_ID}/pdf`, { headers: { 'x-api-key': KEY } });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
writeFileSync(`${OUT}/clash-${CLASH_ID}.pdf`, pdfBuf);
console.log('clash PDF saved', pdfBuf.length, 'bytes, header', pdfBuf.slice(0, 5).toString());

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1.1'], defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 } });
const page = await browser.newPage();

// Auth + context.
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate((k, p) => {
  localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', 'ar');
  localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', 'light');
  localStorage.setItem('sigma_sidebar_collapsed', '0');
}, KEY, P);

const settle = async (ms = 2200) => new Promise((r) => setTimeout(r, ms));
async function waitLoaded() {
  try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('جارٍ التحميل')); }, { timeout: 15000 }); } catch {}
}
async function clickByText(re) {
  try {
    const handle = await page.evaluateHandle((pattern) => {
      const rx = new RegExp(pattern);
      const els = [...document.querySelectorAll('button, a, [role="tab"], div, span')];
      return els.find((e) => rx.test((e.innerText || '').trim()) && e.offsetParent !== null) || null;
    }, re.source);
    const el = handle.asElement();
    if (el) { await el.click(); return true; }
  } catch {}
  return false;
}

async function shoot(route, name, action) {
  try {
    await page.evaluate((p) => localStorage.setItem('sigma_project_key', p), P);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 50000 });
    await waitLoaded();
    await settle();
    if (action) { await action(); await settle(1800); }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log('UI  ', name);
  } catch (e) { console.log('UI ERR', name, e.message); }
}

// ── New-feature + chain UI pages ──
await shoot('/drawings', 'r3-drawings-aps', async () => { await clickByText(/APS|Autodesk/); });
await shoot('/clashes', 'r4-clashes-list');
await shoot(`/clashes/${CLASH_ID}`, 'r4-clash-detail');
await shoot('/quantity-survey', 'r5-qs-traceability', async () => {
  await clickByText(/Traceability|تتبّع|تتبع/);
  await settle(1200);
  await clickByText(/Trace|أثر|تتبّع/);
});
await shoot('/site-evidence', 'r6-site-evidence');
await shoot('/decisions', 'r7-decisions', async () => { await clickByText(/التفاصيل|Why|Envelope|تنسيق|عرض/); });
await shoot('/approval', 'r7-approval');
await shoot('/executive', 'chain-executive');
await shoot('/governance-command', 'chain-governance-command');
await shoot('/feasibility', 'chain-feasibility');
await shoot('/bankability', 'chain-bankability');

// ── The generated clash PDF, rendered ──
try {
  await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + `/${OUT}/clash-${CLASH_ID}.pdf`, { waitUntil: 'networkidle2', timeout: 20000 });
  await settle(2500);
  await page.screenshot({ path: `${OUT}/r4-clash-pdf-render.png` });
  console.log('UI   r4-clash-pdf-render');
} catch (e) { console.log('PDF render ERR', e.message); }

// ── Live API-response cards (proof of real responses) ──
const CARDS = [
  ['r3-api-aps-status', 'GET /integrations/autodesk/status', 'GET', '/integrations/autodesk/status'],
  ['r4-api-clash-detail', 'GET /clashes/:id  (model A/B + geometry)', 'GET', `/clashes/${CLASH_ID}`],
  ['r5-api-boq-traceability', 'GET /quantity-survey/boq/:id/traceability', 'GET', `/quantity-survey/boq/${BOQ_ITEM_ID}/traceability`],
  ['r7-api-gov-envelope', 'GET /governance/decisions/:id/envelope', 'GET', `/governance/decisions/${DEC_ID}/envelope`],
  ['r7-api-gov-dashboard', 'GET /executive/governance-dashboard', 'GET', `/executive/governance-dashboard?projectKey=${P}`],
  ['chain-api-journey', 'GET /journey/:projectKey  (end-to-end chain)', 'GET', `/journey/${P}`],
];
for (const [name, label, method, path] of CARDS) {
  try {
    const res = await fetchJson(method, path);
    await page.setContent(card(label, res.status, hl(res.json)), { waitUntil: 'domcontentloaded' });
    await settle(400);
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 1150, height: Math.min(h, 1500), deviceScaleFactor: 1.4 });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.1 });
    console.log('API ', name, res.status);
  } catch (e) { console.log('API ERR', name, e.message); }
}

await browser.close();
console.log('DONE');
