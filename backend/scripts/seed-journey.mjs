/**
 * Seed the full P-1000 "Hospital Tower" journey demo data across the domains the
 * owner audit (2026-06-28) found empty: feasibility, drawings, BIM, clashes,
 * procurement (incl. long-lead), and monthly reports. Drives the REAL HTTP API
 * (so all controller validation + tenant scope + derivations run exactly as in
 * production). Generates valid PDF / IFC / XLSX assets on the fly.
 *
 * Usage (on the server, against the running backend):
 *   ADMIN_KEY=sk_xxx node scripts/seed-journey.mjs
 *   # or with login fallback:
 *   ADMIN_EMAIL=admin@sigma.local ADMIN_PW='...' node scripts/seed-journey.mjs
 *   # custom base URL:
 *   BASE=http://localhost:3001/api/v1 ADMIN_KEY=sk_xxx node scripts/seed-journey.mjs
 *
 * Idempotency: re-running adds more rows (fine for a demo). Every call logs its
 * HTTP status so a 4xx is visible immediately.
 */
import ExcelJS from 'exceljs';

const BASE = process.env.BASE || 'http://localhost:3001/api/v1';
const PROJECT = process.env.PROJECT || 'P-1000';
let KEY = process.env.ADMIN_KEY || '';

/* eslint-disable no-console */
const ok = [];
const fail = [];

async function login() {
  const email = process.env.ADMIN_EMAIL || 'admin@sigma.local';
  const password = process.env.ADMIN_PW;
  if (!password) return '';
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) { console.error(`login ${r.status}: ${(await r.text()).slice(0, 160)}`); return ''; }
  return (await r.json()).apiKey;
}

async function call(method, path, body, kind) {
  const headers = { 'x-api-key': KEY };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  const line = `${String(r.status).padEnd(4)} ${method.padEnd(4)} ${path}`;
  if (r.ok) { ok.push(`${kind || ''} ${line}`); console.log('OK  ' + line); }
  else { fail.push(`${kind || ''} ${line} -> ${text.slice(0, 200)}`); console.log('ERR ' + line + ' -> ' + text.slice(0, 200)); }
  return { status: r.status, json, okFlag: r.ok };
}
const post = (p, b, kind) => call('POST', p, b, kind);
const get = (p) => call('GET', p, undefined, 'read');

// ── asset generators ───────────────────────────────────────────────────────
/** Build a byte-correct minimal single-page PDF (valid xref) with a title line. */
function makePdf(title) {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const stream = `BT /F1 16 Tf 72 720 Td (${title.replace(/[()\\]/g, ' ')}) Tj ET`;
  objs.push(`<</Length ${stream.length}>>stream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** Build a minimal valid IFC STEP file (ISO-10303-21) with countable entities. */
function makeIfc() {
  const lines = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('HospitalTower.ifc','2026-06-28T00:00:00',(''),(''),'Sigma','Sigma','');",
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('0pRoJeCt',$,'Hospital Tower',$,$,$,$,$,$);",
    "#10=IFCBUILDING('0BuiLDiNg',$,'Hospital Tower',$,$,$,$,$,$,$,$,$);",
    "#20=IFCBUILDINGSTOREY('0StoreyL1',$,'Level 1',$,$,$,$,$,$,0.0);",
    "#21=IFCBUILDINGSTOREY('0StoreyL2',$,'Level 2',$,$,$,$,$,$,4000.0);",
    "#22=IFCBUILDINGSTOREY('0StoreyL3',$,'Level 3',$,$,$,$,$,$,8000.0);",
  ];
  for (let i = 0; i < 24; i++) lines.push(`#${100 + i}=IFCWALL('0Wall${i}',$,'Wall ${i}',$,$,$,$,$,$);`);
  for (let i = 0; i < 12; i++) lines.push(`#${200 + i}=IFCSLAB('0Slab${i}',$,'Slab ${i}',$,$,$,$,$,$);`);
  for (let i = 0; i < 16; i++) lines.push(`#${300 + i}=IFCCOLUMN('0Col${i}',$,'Column ${i}',$,$,$,$,$,$);`);
  for (let i = 0; i < 8; i++) lines.push(`#${400 + i}=IFCDOOR('0Door${i}',$,'Door ${i}',$,$,$,$,$,$,$,$,$);`);
  for (let i = 0; i < 30; i++) lines.push(`#${500 + i}=IFCWINDOW('0Win${i}',$,'Window ${i}',$,$,$,$,$,$,$,$,$);`);
  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return Buffer.from(lines.join('\n'), 'utf8');
}

/** Build a Navisworks/Revit-style clash Interference-Check XLSX. */
async function makeClashXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clashes');
  ws.addRow(['Clash Name', 'Status', 'Distance(mm)', 'Item 1', 'Item 2', 'Discipline1', 'Discipline2']);
  const rows = [
    ['C-001', 'New', -65, 'HVAC Supply Duct DN400', 'RC Beam B-12', 'mechanical', 'structural'],
    ['C-002', 'New', -42, 'Cable Tray CT-3', 'Masonry Wall WA-7', 'electrical', 'architectural'],
    ['C-003', 'Active', -28, 'Sanitary Pipe SP-9', 'RC Column C-7', 'plumbing', 'structural'],
    ['C-004', 'New', -110, 'Chilled Water Pipe CHW-2', 'Steel Beam SB-4', 'mechanical', 'structural'],
    ['C-005', 'Reviewed', -8, 'Sprinkler Branch FS-5', 'Suspended Ceiling CL-1', 'fire', 'architectural'],
    ['C-006', 'Active', -55, 'Medical Gas Pipe MG-1', 'Cable Tray CT-8', 'plumbing', 'electrical'],
    ['C-007', 'New', -33, 'Return Air Duct DN350', 'Lighting Fixture LF-2', 'mechanical', 'electrical'],
    ['C-008', 'New', -19, 'Fire Damper FD-3', 'Structural Slab S-2', 'fire', 'structural'],
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── procurement packages (incl. long-lead) ─────────────────────────────────
const PACKAGES = [
  { title: 'Chillers & AHUs (HVAC)', category: 'MEP-mechanical', unit: 'no', longLead: true, leadTimeDays: 160, requiredOnSiteDate: '2026-09-15', estimatedCost: 1850000, bimQuantity: 24, status: 'rfq' },
  { title: 'MV Switchgear & Transformers', category: 'MEP-electrical', unit: 'no', longLead: true, leadTimeDays: 180, requiredOnSiteDate: '2026-10-01', estimatedCost: 1320000, bimQuantity: 6, status: 'rfq' },
  { title: 'Medical Gas Pipeline System', category: 'MEP-plumbing', unit: 'lot', longLead: true, leadTimeDays: 120, requiredOnSiteDate: '2026-11-01', estimatedCost: 640000, bimQuantity: 1, status: 'planned' },
  { title: 'Unitised Curtain-Wall Facade', category: 'facade', unit: 'm2', longLead: false, leadTimeDays: 90, requiredOnSiteDate: '2026-09-07', estimatedCost: 2750000, bimQuantity: 8400, status: 'planned' },
  { title: 'Structural Steel — Cores', category: 'structure', unit: 'ton', longLead: false, leadTimeDays: 70, requiredOnSiteDate: '2026-06-22', estimatedCost: 980000, bimQuantity: 520, status: 'awarded' },
];

async function main() {
  if (!KEY) { KEY = await login(); }
  if (!KEY) { console.error('No ADMIN_KEY and login failed — set ADMIN_KEY or ADMIN_EMAIL/ADMIN_PW.'); process.exit(1); }
  console.log(`Seeding journey for ${PROJECT} via ${BASE}\n`);

  // 1) PROCUREMENT (pure JSON; long-lead ones auto-fill /procurement/long-lead)
  for (const p of PACKAGES) await post('/procurement/packages', { projectKey: PROJECT, ...p }, 'procurement');

  // 2) CLASHES (xlsx upload)
  const clashB64 = (await makeClashXlsx()).toString('base64');
  await post('/clashes/upload', { projectKey: PROJECT, filename: 'hospital-tower-clashes.xlsx', contentBase64: clashB64 }, 'clashes');

  // 3) DRAWINGS (pdf upload, a couple of disciplines)
  for (const [name, title] of [
    ['HT-ARCH-L01.pdf', 'HT-ARCH-L01 Hospital Tower Level 1 Architectural'],
    ['HT-STR-L01.pdf', 'HT-STR-L01 Hospital Tower Level 1 Structural'],
    ['HT-MEP-L01.pdf', 'HT-MEP-L01 Hospital Tower Level 1 MEP'],
  ]) {
    await post('/drawings/upload', { projectKey: PROJECT, filename: name, contentBase64: makePdf(title).toString('base64') }, 'drawings');
  }

  // 4) BIM (ifc upload)
  await post('/bim/upload', { projectKey: PROJECT, filename: 'HospitalTower.ifc', contentBase64: makeIfc().toString('base64') }, 'bim');

  // 5) FEASIBILITY (opportunity + rapid assessment)
  const opp = await post('/feasibility/opportunities', {
    title: 'Hospital Tower investment case', projectType: 'healthcare', city: 'Abu Dhabi', country: 'UAE',
    estimatedInvestment: 420000000, currency: 'AED',
  }, 'feasibility');
  const oppId = opp.json?.id || opp.json?.opportunity?.id;
  if (oppId) await post(`/feasibility/opportunities/${oppId}/assess`, {}, 'feasibility');

  // 6) MONTHLY REPORTS (deterministic — no Claude needed)
  for (const audience of ['owner', 'pd', 'contractor']) {
    await post('/reports/monthly/generate', { projectKey: PROJECT, monthIso: '2026-05', audience }, 'monthly');
  }

  // ── verification: counts on every previously-empty surface ────────────────
  console.log('\n── verification (GET counts) ──');
  for (const p of [
    `/procurement/packages?projectKey=${PROJECT}`,
    `/procurement/long-lead?projectKey=${PROJECT}`,
    `/clashes?projectKey=${PROJECT}`,
    `/drawings?projectKey=${PROJECT}`,
    `/bim?projectKey=${PROJECT}`,
    `/feasibility/opportunities`,
    `/reports/monthly?projectKey=${PROJECT}`,
    `/executive/kpis?projectKey=${PROJECT}`,
  ]) {
    const r = await get(p);
    const n = Array.isArray(r.json) ? r.json.length : (Array.isArray(r.json?.items) ? r.json.items.length : (r.json && typeof r.json === 'object' ? 'obj' : r.json));
    console.log(`   count[${n}]  ${p}`);
  }

  console.log(`\nDONE — ${ok.length} ok, ${fail.length} failed.`);
  if (fail.length) { console.log('FAILURES:'); fail.forEach((f) => console.log('  ' + f)); }
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1); });
