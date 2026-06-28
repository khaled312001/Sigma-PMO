/**
 * Capture EVERY page of the platform scoped to the NEW project created from the
 * official template (Hospital Tower — P-1000), as proof the new project flows
 * through every module/page. Admin session, project switcher pinned to P-1000.
 * Output: shots-e2e-newproject/<page>.png + manifest-newproject.json
 *   node e2e-newproject.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'https://system.sigma-pmo.com';
const API = process.env.API || 'https://system-api.sigma-pmo.com/api/v1';
const ADMIN_PW = process.env.ADMIN_PW || 'Sg!ElFo6k4ZgZW2#26';
const PROJECT = process.env.PROJECT || 'P-1000';
const LANG = process.env.LANG || 'ar';
const THEME = process.env.THEME || 'light';
const OUT = process.env.OUT || 'shots-e2e-newproject';

const PAGES = [
  ['overview', '/'], ['projects', '/projects'], ['hierarchy', '/hierarchy'], ['input', '/input'],
  ['review', '/review'], ['baselines', '/baselines'], ['decisions', '/decisions'], ['analytics', '/analytics'],
  ['executive', '/executive'], ['governance-command', '/governance-command'], ['predictive', '/predictive'],
  ['agents', '/agents'], ['communications', '/communications'], ['reports-monthly', '/reports/monthly'],
  ['opportunity', '/opportunity'], ['feasibility', '/feasibility'], ['funding', '/funding'], ['bankability', '/bankability'],
  ['quantity-survey', '/quantity-survey'], ['procurement', '/procurement'], ['revenue', '/revenue'],
  ['risk', '/risk'], ['claims', '/claims'], ['forensic-delay', '/forensic-delay'], ['contract-rules', '/contract-rules'],
  ['legal-holds', '/legal-holds'], ['dispute-rooms', '/dispute-rooms'], ['authority-matrix', '/authority-matrix'],
  ['authority', '/authority'], ['quality', '/quality'], ['safety', '/safety'], ['fire-safety', '/fire-safety'],
  ['utility', '/utility'], ['operational-readiness', '/operational-readiness'], ['repository', '/repository'],
  ['drawings', '/drawings'], ['clashes', '/clashes'], ['simulation', '/simulation'], ['comparison', '/comparison'],
  ['approval', '/approval'], ['letters', '/letters'], ['evidence', '/evidence'], ['sources', '/sources'],
  ['knowledge', '/knowledge'], ['acceptance', '/acceptance'], ['audit', '/audit'],
];
const ERR = ['Application error', 'something went wrong', 'Unhandled Runtime', 'client-side exception', 'could not be found'];

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const key = await (async () => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@sigma.local', password: ADMIN_PW }) });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 12000)); continue; }
      if (r.ok) return (await r.json()).apiKey;
      return null;
    }
    return null;
  })();
  if (!key) throw new Error('admin login failed');

  // confirm the new project exists + grab its display name
  const projects = await (await fetch(`${API}/projects`, { headers: { 'x-api-key': key } })).json();
  const proj = (projects || []).find((p) => p.businessKey === PROJECT) || {};
  console.log(`project ${PROJECT}: ${proj.name || '(name?)'} — found=${!!proj.businessKey}`);

  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
    defaultViewport: { width: 1500, height: 950, deviceScaleFactor: 1.1 },
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k, l, p, t) => {
    localStorage.setItem('sigma_api_key', k); localStorage.setItem('sigma_lang', l);
    localStorage.setItem('sigma_project_key', p); localStorage.setItem('sigma_theme', t);
    localStorage.setItem('sigma_sidebar_collapsed', '0');
  }, key, LANG, PROJECT, THEME);

  const manifest = { base: BASE, project: PROJECT, projectName: proj.name || null, pages: [] };
  for (const [name, route] of PAGES) {
    try {
      // re-assert the selected project each navigation (defends against resets)
      await page.evaluate((p) => localStorage.setItem('sigma_project_key', p), PROJECT);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
      try { await page.waitForFunction(() => { const t = document.body.innerText; return !(t.includes('Loading workspace') || t.includes('جارٍ تحميل') || t.includes('Loading…')); }, { timeout: 20000 }); } catch {}
      await new Promise((r) => setTimeout(r, 1300));
      const info = await page.evaluate((markers, proj) => {
        const txt = document.body.innerText || '';
        return {
          err: markers.find((m) => txt.includes(m)) || null,
          intro: txt.includes('سجّل شركتك') || txt.includes('AI GOVERNANCE OS'),
          mentionsProject: txt.includes(proj),
          len: txt.length,
        };
      }, ERR, PROJECT);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      const ok = !info.err && !info.intro;
      manifest.pages.push({ route, name, ok, mentionsProject: info.mentionsProject, note: info.err || (info.intro ? 'lost-session' : 'ok') });
      console.log(`${name}: ${ok ? 'OK' : 'X'}${info.mentionsProject ? ' [shows '+PROJECT+']' : ''}`);
    } catch (e) {
      manifest.pages.push({ route, name, ok: false, note: e.message.slice(0, 60) });
      console.log(`${name}: X ${e.message.slice(0, 50)}`);
    }
  }

  await browser.close();
  writeFileSync(`${OUT}/manifest-newproject.json`, JSON.stringify(manifest, null, 2));
  const ok = manifest.pages.filter((p) => p.ok).length;
  const mp = manifest.pages.filter((p) => p.mentionsProject).length;
  console.log(`\n=== NEW-PROJECT CAPTURE DONE === ${ok}/${manifest.pages.length} pages OK, ${mp} explicitly show ${PROJECT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
