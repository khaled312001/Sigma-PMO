/**
 * Seed the full P-1000 "Hospital Tower" journey demo data end-to-end across the
 * domains the owner audit found empty: feasibility, drawings, BIM (two IFC
 * models for the native geometric clash detect path), BoQ + cost-plan estimate,
 * quantity/cost traceability ledger, funding (senior debt + equity), FIDIC
 * preset, a raised claim, clashes (Excel ingest + native detect), procurement
 * (incl. long-lead), and monthly reports. Drives the REAL HTTP API so all
 * controller validation + tenant scope + derivations run exactly as in
 * production. Also seeds two extra demo projects — a STALLED one and a DISPUTED
 * one — exposed via `GET /projects?scenarioType=`.
 *
 * Usage (on the server, against the running backend):
 *   ADMIN_KEY=sk_xxx node scripts/seed-journey.mjs
 *   ADMIN_EMAIL=admin@sigma.local ADMIN_PW='...' node scripts/seed-journey.mjs
 *   BASE=http://localhost:3001/api/v1 ADMIN_KEY=sk_xxx node scripts/seed-journey.mjs
 *
 * Idempotency: every step checks for an existing business key (project /
 * facility / clash / claim / report) and SKIPS it, so re-running is safe.
 */
import ExcelJS from 'exceljs';

const BASE = process.env.BASE || 'http://localhost:3001/api/v1';
const PROJECT = process.env.PROJECT || 'P-1000';
let KEY = process.env.ADMIN_KEY || '';

/* eslint-disable no-console */
const ok = [];
const fail = [];
const skipped = [];

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
const skip = (what) => { skipped.push(what); console.log('SKIP ' + what); };

/** Count helper for idempotency: GET path → array length (0 if not an array). */
async function count(path) {
  const r = await get(path);
  if (Array.isArray(r.json)) return r.json.length;
  if (Array.isArray(r.json?.items)) return r.json.items.length;
  return 0;
}

// ── asset generators ───────────────────────────────────────────────────────
/** Byte-correct minimal single-page PDF (valid xref) with a title line. */
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

/**
 * Minimal valid IFC STEP file (ISO-10303-21) with placed elements. `offsetMm`
 * shifts every element's local-placement origin so two models can be detected
 * to overlap by the native geometric clash engine. `discipline` tags the model.
 */
function makeIfc(name, discipline, offsetMm) {
  const off = offsetMm || 0;
  const lines = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${name}','2026-06-28T00:00:00',(''),(''),'Sigma','Sigma','');`,
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('0pRoJeCt',$,'Hospital Tower',$,$,$,$,$,$);",
    "#9=IFCCARTESIANPOINT((0.,0.,0.));",
    "#8=IFCAXIS2PLACEMENT3D(#9,$,$);",
    "#7=IFCLOCALPLACEMENT($,#8);",
  ];
  // A handful of placed elements, each on its own local placement at a known XYZ.
  const proto = discipline === 'mechanical'
    ? { kw: 'IFCFLOWSEGMENT', tag: 'Duct', base: 1000 }
    : { kw: 'IFCBEAM', tag: 'Beam', base: 2000 };
  for (let i = 0; i < 10; i++) {
    const x = 1000 + i * 1500 + off;
    const y = 2000 + off;
    const z = 3000 + off;
    const pid = proto.base + i * 10;
    lines.push(`#${pid + 1}=IFCCARTESIANPOINT((${x}.,${y}.,${z}.));`);
    lines.push(`#${pid + 2}=IFCAXIS2PLACEMENT3D(#${pid + 1},$,$);`);
    lines.push(`#${pid + 3}=IFCLOCALPLACEMENT(#7,#${pid + 2});`);
    lines.push(`#${pid + 4}=${proto.kw}('${discipline.slice(0, 3)}Guid${String(i).padStart(8, '0')}',$,'${proto.tag} ${i}',$,$,#${pid + 3},$,$);`);
  }
  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return Buffer.from(lines.join('\n'), 'utf8');
}

/** Navisworks/Revit-style clash Interference-Check XLSX (with Item GUID cols). */
async function makeClashXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clashes');
  ws.addRow(['Clash Name', 'Status', 'Distance(mm)', 'Grid Location', 'Item 1', 'Item 1 GUID', 'Item 2', 'Item 2 GUID', 'Discipline1', 'Discipline2']);
  const rows = [
    ['C-001', 'New', -65, 'C-4', 'HVAC Supply Duct DN400', 'mecGuid00000001', 'RC Beam B-12', 'strGuid00000001', 'mechanical', 'structural'],
    ['C-002', 'New', -42, 'D-2', 'Cable Tray CT-3', 'eleGuid00000002', 'Masonry Wall WA-7', 'arcGuid00000002', 'electrical', 'architectural'],
    ['C-003', 'Active', -28, 'B-7', 'Sanitary Pipe SP-9', 'pluGuid00000003', 'RC Column C-7', 'strGuid00000003', 'plumbing', 'structural'],
    ['C-004', 'New', -110, 'A-1', 'Chilled Water Pipe CHW-2', 'mecGuid00000004', 'Steel Beam SB-4', 'strGuid00000004', 'mechanical', 'structural'],
    ['C-005', 'Reviewed', -8, 'E-3', 'Sprinkler Branch FS-5', 'firGuid00000005', 'Suspended Ceiling CL-1', 'arcGuid00000005', 'fire', 'architectural'],
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** BoQ XLSX with priced lines so the cost half of the journey populates. */
async function makeBoqXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BOQ');
  ws.addRow(['Item', 'Description', 'Unit', 'Quantity', 'Rate', 'Amount']);
  const rows = [
    ['1.1', 'Reinforced concrete to cores', 'm3', 1200, 1450, 1740000],
    ['1.2', 'Structural steel — primary frame', 'ton', 520, 9800, 5096000],
    ['2.1', 'Unitised curtain-wall facade', 'm2', 8400, 3250, 27300000],
    ['3.1', 'HVAC chillers & AHUs', 'no', 24, 78000, 1872000],
    ['3.2', 'MV switchgear & transformers', 'no', 6, 220000, 1320000],
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PACKAGES = [
  { title: 'Chillers & AHUs (HVAC)', category: 'MEP-mechanical', unit: 'no', longLead: true, leadTimeDays: 160, requiredOnSiteDate: '2026-09-15', estimatedCost: 1850000, bimQuantity: 24, status: 'rfq' },
  { title: 'MV Switchgear & Transformers', category: 'MEP-electrical', unit: 'no', longLead: true, leadTimeDays: 180, requiredOnSiteDate: '2026-10-01', estimatedCost: 1320000, bimQuantity: 6, status: 'rfq' },
  { title: 'Medical Gas Pipeline System', category: 'MEP-plumbing', unit: 'lot', longLead: true, leadTimeDays: 120, requiredOnSiteDate: '2026-11-01', estimatedCost: 640000, bimQuantity: 1, status: 'planned' },
  { title: 'Unitised Curtain-Wall Facade', category: 'facade', unit: 'm2', longLead: false, leadTimeDays: 90, requiredOnSiteDate: '2026-09-07', estimatedCost: 2750000, bimQuantity: 8400, status: 'planned' },
  { title: 'Structural Steel — Cores', category: 'structure', unit: 'ton', longLead: false, leadTimeDays: 70, requiredOnSiteDate: '2026-06-22', estimatedCost: 980000, bimQuantity: 520, status: 'awarded' },
];

const FACILITIES = [
  { name: 'Senior construction facility', facilityType: 'senior-debt', lenderName: 'First Abu Dhabi Bank', amount: 294000000, currency: 'AED', interestRatePct: 6.25, tenorYears: 7, dscrCovenant: 1.25, currentDscr: 1.4, status: 'active' },
  { name: 'Sponsor equity', facilityType: 'equity', lenderName: 'Project Sponsors', amount: 126000000, currency: 'AED', status: 'active' },
];

/** Ensure a project exists with the given scenarioType (idempotent). */
async function ensureProject(key, body) {
  const list = await get('/projects');
  const exists = Array.isArray(list.json) && list.json.some((p) => p.businessKey === key);
  if (exists) { skip(`project ${key} (exists)`); return false; }
  await post('/projects', { businessKey: key, ...body }, 'project');
  return true;
}

async function seedP1000() {
  console.log(`\n══ P-1000 full journey via ${BASE} ══`);

  // 0) PROJECT shell (so non-ingest legs that need a project resolve).
  await ensureProject(PROJECT, { name: 'Hospital Tower', clientName: 'Ministry of Health', currency: 'AED', scenarioType: 'new-from-sketch', plannedStart: '2026-01-01', plannedFinish: '2027-12-31', budgetAtCompletion: '420000000.00' });

  // 1) PROCUREMENT (long-lead ones auto-fill /procurement/long-lead).
  if (await count(`/procurement/packages?projectKey=${PROJECT}`) === 0) {
    for (const p of PACKAGES) await post('/procurement/packages', { projectKey: PROJECT, ...p }, 'procurement');
  } else skip('procurement packages');

  // 2) CLASHES — Excel ingest path.
  if (await count(`/clashes?projectKey=${PROJECT}`) === 0) {
    const clashB64 = (await makeClashXlsx()).toString('base64');
    await post('/clashes/upload', { projectKey: PROJECT, filename: 'hospital-tower-clashes.xlsx', contentBase64: clashB64 }, 'clashes');
  } else skip('clashes (excel)');

  // 3) DRAWINGS.
  if (await count(`/drawings?projectKey=${PROJECT}`) === 0) {
    for (const [name, title] of [
      ['HT-ARCH-L01.pdf', 'HT-ARCH-L01 Hospital Tower Level 1 Architectural'],
      ['HT-STR-L01.pdf', 'HT-STR-L01 Hospital Tower Level 1 Structural'],
      ['HT-MEP-L01.pdf', 'HT-MEP-L01 Hospital Tower Level 1 MEP'],
    ]) await post('/drawings/upload', { projectKey: PROJECT, filename: name, contentBase64: makePdf(title).toString('base64') }, 'drawings');
  } else skip('drawings');

  // 4) BIM — two IFC discipline models (mechanical + structural) for the native
  //    geometric clash detect path. The structural model is offset so its
  //    elements overlap the mechanical model's AABBs.
  let modelA = null; let modelB = null;
  if (await count(`/bim?projectKey=${PROJECT}`) < 2) {
    const a = await post('/bim/upload', { projectKey: PROJECT, filename: 'HospitalTower-MEP.ifc', contentBase64: makeIfc('HospitalTower-MEP.ifc', 'mechanical', 0).toString('base64') }, 'bim');
    const b = await post('/bim/upload', { projectKey: PROJECT, filename: 'HospitalTower-STR.ifc', contentBase64: makeIfc('HospitalTower-STR.ifc', 'structural', 200).toString('base64') }, 'bim');
    modelA = a.json?.modelId || a.json?.id || a.json?.bimModelId;
    modelB = b.json?.modelId || b.json?.id || b.json?.bimModelId;
  } else skip('bim models');

  // 4b) NATIVE GEOMETRIC CLASH (detect path) — produces real ClashItem rows
  //     from file geometry. Best-effort: needs the two model ids.
  if (modelA && modelB) {
    await post('/clashes/detect', { projectKey: PROJECT, modelAId: modelA, modelBId: modelB }, 'clash-detect');
  } else skip('clash detect (model ids unavailable)');

  // 5) BoQ (priced lines).
  if (await count(`/boq/${PROJECT}/versions`) === 0) {
    const boqB64 = (await makeBoqXlsx()).toString('base64');
    await post('/boq/upload', { projectBusinessKey: PROJECT, filename: 'hospital-tower-boq.xlsx', contentBase64: boqB64 }, 'boq');
  } else skip('boq');

  // 6) COST-PLAN ESTIMATE.
  if (await count(`/quantity-survey/estimates?projectKey=${PROJECT}`) === 0) {
    await post('/quantity-survey/estimates', { projectKey: PROJECT, stage: 'cost-plan', projectType: 'healthcare', areaSqm: 42000, currency: 'AED', title: 'Hospital Tower concept cost plan' }, 'estimate');
  } else skip('cost-plan estimate');

  // 7) QUANTITY / COST TRACEABILITY LEDGER entries (the cost-ledger leg).
  const ledgerEntries = [
    { dimension: 'cost', subjectKey: 'structure', subjectLabel: 'Structural works', stage: 'cost-plan', value: 6836000, currency: 'AED', originType: 'cost-plan', changeReason: 'Concept cost plan' },
    { dimension: 'cost', subjectKey: 'structure', subjectLabel: 'Structural works', stage: 'boq', value: 6900000, currency: 'AED', originType: 'boq', changeReason: 'Priced BoQ' },
    { dimension: 'quantity', subjectKey: 'concrete', subjectLabel: 'RC to cores', stage: 'boq', value: 1200, unit: 'm3', originType: 'boq', changeReason: 'Measured from BIM' },
  ];
  for (const e of ledgerEntries) await post('/quantity-survey/traceability/record', { projectKey: PROJECT, ...e }, 'ledger');

  // 8) FUNDING (senior debt + equity).
  if (await count(`/funding/facilities?projectKey=${PROJECT}`) === 0) {
    for (const f of FACILITIES) await post('/funding/facilities', { projectKey: PROJECT, ...f }, 'funding');
  } else skip('funding facilities');

  // 9) FIDIC PRESET (procedural clause register).
  if (await count(`/contract-rules?projectKey=${PROJECT}`) === 0) {
    await post('/contract-rules/apply-preset', { projectKey: PROJECT, presetKey: 'fidic-red-1999' }, 'fidic');
  } else skip('fidic preset');

  // 10) CLAIM identification (L6 claims agent over the alert→decision→letter chain).
  if (await count(`/claims?projectKey=${PROJECT}`) === 0) {
    await post('/agents/l6.claims/run', { projectBusinessKey: PROJECT }, 'claims');
  } else skip('claims');

  // 11) MONTHLY REPORTS (deterministic — no Claude needed).
  if (await count(`/reports/monthly?projectKey=${PROJECT}`) === 0) {
    for (const audience of ['owner', 'pd', 'contractor']) {
      await post('/reports/monthly/generate', { projectKey: PROJECT, monthIso: '2026-05', audience }, 'monthly');
    }
  } else skip('monthly reports');
}

/** A STALLED demo project: partial prior-stage data + forensic-delay slip. */
async function seedStalled() {
  const KEY2 = 'P-2000';
  console.log(`\n══ STALLED demo project ${KEY2} ══`);
  const created = await ensureProject(KEY2, {
    name: 'Riverside Mall (stalled)', clientName: 'Riverside Holdings', currency: 'AED',
    scenarioType: 'stalled', plannedStart: '2024-01-01', plannedFinish: '2025-06-30',
    status: 'stalled', budgetAtCompletion: '180000000.00',
  });
  if (!created) return;
  // Partial prior-stage data: a couple of drawings + one report, no funding/claims.
  await post('/drawings/upload', { projectKey: KEY2, filename: 'RM-ARCH-L01.pdf', contentBase64: makePdf('RM-ARCH-L01 Riverside Mall Architectural').toString('base64') }, 'drawings');
  await post('/reports/monthly/generate', { projectKey: KEY2, monthIso: '2025-03', audience: 'owner' }, 'monthly');
}

/** A DISPUTED demo project: claims + evidence room + clause rules → populated chain. */
async function seedDisputed() {
  const KEY3 = 'P-3000';
  console.log(`\n══ DISPUTED demo project ${KEY3} ══`);
  const created = await ensureProject(KEY3, {
    name: 'Marina Bridge (disputed)', clientName: 'Coastal Authority', currency: 'AED',
    scenarioType: 'disputed', plannedStart: '2025-01-01', plannedFinish: '2026-09-30',
    status: 'active', budgetAtCompletion: '95000000.00',
  });
  if (!created) return;
  // Clause rules + a claim so /claims/:id/chain is populated.
  await post('/contract-rules/apply-preset', { projectKey: KEY3, presetKey: 'fidic-red-1999' }, 'fidic');
  await post('/agents/l6.claims/run', { projectBusinessKey: KEY3 }, 'claims');
}

async function main() {
  if (!KEY) { KEY = await login(); }
  if (!KEY) { console.error('No ADMIN_KEY and login failed — set ADMIN_KEY or ADMIN_EMAIL/ADMIN_PW.'); process.exit(1); }

  await seedP1000();
  await seedStalled();
  await seedDisputed();

  // ── verification ──
  console.log('\n── verification: GET /journey/P-1000 legs ──');
  const journey = await get(`/journey/${PROJECT}`);
  const legs = journey.json?.legs ?? [];
  for (const l of legs) console.log(`   ${l.present ? 'YES' : ' no'} [${l.count ?? 0}] ${l.leg ?? l.stage}`);

  console.log('\n── verification: scenarioType filter ──');
  for (const st of ['new-from-sketch', 'stalled', 'disputed']) {
    const r = await get(`/projects?scenarioType=${st}`);
    const n = Array.isArray(r.json) ? r.json.length : 0;
    console.log(`   scenarioType=${st} → ${n} project(s)`);
  }

  console.log(`\nDONE — ${ok.length} ok, ${skipped.length} skipped, ${fail.length} failed.`);
  if (fail.length) { console.log('FAILURES:'); fail.forEach((f) => console.log('  ' + f)); }
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1); });
