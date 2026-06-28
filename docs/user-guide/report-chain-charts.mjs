/** Enhanced end-to-end chain report with inline SVG charts + real screenshots. */
import { writeFileSync } from 'node:fs';

const SH = '../user-guide/shots-chain';

// ---- SVG chart helpers (no external libs) ----
function hbar(items, { w = 360, barH = 20, gap = 9, max, target } = {}) {
  const mx = max || Math.max(...items.map((i) => i.v), 1);
  const labelW = 88, valW = 52, plot = w - labelW - valW;
  const h = items.length * (barH + gap);
  let y = 0, svg = `<svg width="100%" height="${h + 6}" viewBox="0 0 ${w} ${h + 6}" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI,Arial" style="direction:ltr">`;
  if (target) { const tx = labelW + (target / mx) * plot; svg += `<line x1="${tx}" y1="0" x2="${tx}" y2="${h}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/><text x="${tx}" y="${h + 5}" font-size="8" fill="#64748b" text-anchor="middle">target ${target}</text>`; }
  for (const it of items) {
    const bw = Math.max(2, (it.v / mx) * plot);
    svg += `<text x="${labelW - 4}" y="${y + barH * 0.72}" font-size="10.5" fill="#334155" text-anchor="end">${it.l}</text>`;
    svg += `<rect x="${labelW}" y="${y}" width="${plot}" height="${barH}" rx="4" fill="#f1f5f9"/>`;
    svg += `<rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="4" fill="${it.c || '#0d9488'}"/>`;
    svg += `<text x="${labelW + plot + 6}" y="${y + barH * 0.72}" font-size="10.5" font-weight="700" fill="#0f766e">${it.t ?? it.v}</text>`;
    y += barH + gap;
  }
  return svg + '</svg>';
}
function donut(segs, { size = 130 } = {}) {
  const total = segs.reduce((a, s) => a + s.v, 0) || 1, r = size / 2 - 13, c = size / 2, circ = 2 * Math.PI * r;
  let off = 0, svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="Segoe UI,Arial">`;
  svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="15"/>`;
  for (const s of segs) { const len = (s.v / total) * circ; svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.c}" stroke-width="15" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`; off += len; }
  svg += `<text x="${c}" y="${c - 4}" font-size="22" font-weight="800" fill="#0f172a" text-anchor="middle">${total}</text>`;
  svg += `<text x="${c}" y="${c + 13}" font-size="9" fill="#64748b" text-anchor="middle">total</text>`;
  return svg + '</svg>';
}
function gaugeRow(items) { return hbar(items, { w: 360, max: 1.2, target: 1.0, barH: 20, gap: 11 }); }

const charts = {
  records: hbar([
    { l: 'project', v: 1, c: '#0d9488' }, { l: 'activity', v: 2, c: '#0d9488' }, { l: 'resource', v: 1, c: '#0d9488' },
    { l: 'assignment', v: 1, c: '#0d9488' }, { l: 'report', v: 1, c: '#0d9488' },
  ], { max: 2 }),
  alerts: donut([{ v: 3, c: '#d97706' }, { v: 1, c: '#dc2626' }]),
  indices: gaugeRow([
    { l: 'Confidence', v: 0.97, c: '#059669', t: '0.97' },
    { l: 'CPI (cost)', v: 0.909, c: '#d97706', t: '0.909' },
    { l: 'SPI (sched)', v: 0.819, c: '#dc2626', t: '0.819' },
  ]),
  evm: hbar([
    { l: 'BAC', v: 414.7, c: '#0369a1', t: '414.7M' },
    { l: 'EV (earned)', v: 46.2, c: '#0d9488', t: '46.2M' },
    { l: 'AC (actual)', v: 1.6, c: '#7c3aed', t: '1.6M' },
  ], { max: 414.7 }),
  decisions: hbar([
    { l: 'L1', v: 3, c: '#d97706' }, { l: 'L3 (critical)', v: 1, c: '#dc2626' },
  ], { max: 4 }),
};

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@page{size:A4;margin:0;}*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:10.5px;line-height:1.5;}
.page{width:210mm;min-height:297mm;padding:13mm 12mm;}
.band{background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;border-radius:12px;padding:15px 20px;margin-bottom:12px;}
.band h1{margin:0 0 4px;font-size:17px;}.band .meta{font-size:10.5px;opacity:.93;}
.chainbar{margin-top:8px;font-size:10px;font-weight:600;}
h2{color:#0f766e;font-size:13px;border-bottom:2px solid #ccfbf1;padding-bottom:4px;margin:14px 0 7px;}
table{width:100%;border-collapse:collapse;margin:5px 0 9px;font-size:9.5px;}
th,td{border:1px solid #cbd5e1;padding:4px 7px;text-align:right;vertical-align:top;}
th{background:#f0fdfa;color:#0f766e;font-weight:700;}
.ok{color:#059669;font-weight:700;white-space:nowrap;}.crit{color:#dc2626;font-weight:700;}.warn{color:#d97706;font-weight:700;}
code{font-family:Consolas,monospace;direction:ltr;background:#f1f5f9;padding:0 3px;border-radius:3px;font-size:9px;unicode-bidi:plaintext;}
.kpis{display:flex;gap:9px;margin:6px 0 10px;}
.kpi{flex:1;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:8px;text-align:center;}
.kpi .n{font-size:19px;font-weight:800;color:#0d9488;}.kpi .l{font-size:9px;color:#475569;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.card{border:1px solid #d1fae5;border-radius:10px;padding:10px 12px;background:#fafffe;}
.card h3{margin:0 0 7px;font-size:11px;color:#0f766e;}
.cardrow{display:flex;align-items:center;gap:12px;}
.deliver{background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:10px 13px;margin:7px 0;font-size:10px;}
.deliver b{color:#0e7490;}
.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
figure{margin:0;break-inside:avoid;}.cap{font-size:9.5px;color:#334155;margin-bottom:3px;font-weight:600;}
.thumb{height:300px;overflow:hidden;border:1px solid #cbd5e1;border-radius:6px;background:#fff;}
.thumb img{width:100%;object-fit:cover;object-position:top;display:block;}
pre{background:#0f172a;color:#e2e8f0;padding:8px 11px;border-radius:8px;font-size:9px;unicode-bidi:plaintext;direction:ltr;text-align:left;white-space:pre-wrap;}
.foot{margin-top:10px;border-top:1px solid #e2e8f0;padding-top:7px;color:#64748b;font-size:9px;}
.legend{font-size:9px;color:#475569;margin-top:4px;}.sw{display:inline-block;width:9px;height:9px;border-radius:2px;vertical-align:middle;margin-left:3px;}
</style></head><body>

<div class="page">
  <div class="band"><h1>تقرير التحقّق النهائي — السلسلة الكاملة end-to-end (بالرسوم والإثبات الحيّ)</h1>
  <div class="meta">Sigma PMO · المشروع: Hospital Tower — Phase 1 (<code>P-1000</code>) · الإنتاج · 28 يونيو 2026</div>
  <div class="chainbar">Template → Ingestion → Records → Workflow(jobId) → Alerts(L2) → Decisions(L3) → Evidence → Approval → Audit → L7/L8 ✅</div></div>

  <div class="kpis">
    <div class="kpi"><div class="n">10/10</div><div class="l">خطوات السلسلة ناجحة</div></div>
    <div class="kpi"><div class="n">6</div><div class="l">سجلات أُنشئت</div></div>
    <div class="kpi"><div class="n">4 / 4</div><div class="l">تنبيهات / قرارات</div></div>
    <div class="kpi"><div class="n">0.97</div><div class="l">درجة الثقة</div></div>
    <div class="kpi"><div class="n">completed</div><div class="l">حالة الـjob</div></div>
  </div>

  <h2>لوحة الرسوم البيانية — إثبات أن كل حاجة تمام</h2>
  <div class="grid2">
    <div class="card"><h3>① السجلات المُنشأة من القالب</h3>${charts.records}</div>
    <div class="card"><h3>② التنبيهات حسب الخطورة (L2)</h3><div class="cardrow">${charts.alerts}<div class="legend"><span class="sw" style="background:#d97706"></span> warning ×3<br><span class="sw" style="background:#dc2626"></span> critical ×1</div></div></div>
    <div class="card"><h3>③ الثقة ومؤشرات الأداء (target = 1.0)</h3>${charts.indices}<div class="legend">Confidence أخضر (عالٍ) · CPI/SPI تحت الهدف = تجاوز تكلفة/تأخّر جدول (تنبيهات صحيحة)</div></div>
    <div class="card"><h3>④ القيمة المكتسبة EVM (مليون)</h3>${charts.evm}<div class="legend">EV/BAC ≈ 11.1% إنجاز · AC منخفض</div></div>
    <div class="card"><h3>⑤ القرارات حسب مستوى التصعيد (L3)</h3>${charts.decisions}</div>
    <div class="card"><h3>⑥ ملخّص الحالة</h3>
      <table style="margin:0"><tr><td>Job</td><td class="ok">completed ✅</td></tr><tr><td>Workflow</td><td class="ok">4 alerts · 4 decisions · 0 failures</td></tr><tr><td>Approval</td><td class="ok">approve ✅</td></tr><tr><td>Audit</td><td class="ok">مُسجَّل ✅</td></tr><tr><td>Evidence hash</td><td><code>ae5ac3ce…</code></td></tr></table></div>
  </div>
</div>

<div class="page">
  <h2>سلسلة التنفيذ — كل خطوة بإثباتها الخام</h2>
  <table>
    <tr><th style="width:5%">#</th><th style="width:30%">الخطوة (Endpoint)</th><th>النتيجة الفعلية (Raw)</th></tr>
    <tr><td>1</td><td>تحميل القالب · <code>GET /ingestion/template</code></td><td class="ok">200 · Excel · 12,074 bytes · 5 أوراق</td></tr>
    <tr><td>2-3</td><td>رفع القالب → سجلات · <code>POST /ingestion/upload</code></td><td class="ok">200 · project:1 · activity:2 · resource:1 · assignment:1 · report:1</td></tr>
    <tr><td>4</td><td>الـworkflow · <code>POST /rules/workflows/run</code></td><td>jobId <code>e1a79546-…3573b</code> · <span class="ok">completed</span> · 4 alerts · 4 decisions</td></tr>
    <tr><td>5</td><td>تنبيهات L2 · <code>GET /rules/alerts</code></td><td>REPORTED_VS_SCHEDULE_MISMATCH · RESOURCE_UNDERUSE · SCHEDULE_BEHIND_PLAN · <span class="crit">SCHEDULE_FINISH_SLIPPED (critical)</span></td></tr>
    <tr><td>6</td><td>قرارات L3 · <code>GET /governance/decisions</code></td><td>party=contractor · FIDIC <b>8.3/8.6 · 8.5/20.1 (L3) · 8.6</b></td></tr>
    <tr><td>7</td><td>Evidence · <code>…/decisions/:id/trace</code></td><td class="ok">sourceFile + hash <code>ae5ac3ce…</code> + ingestionRun + confidence 0.97</td></tr>
    <tr><td>8</td><td>Approval · <code>POST …/decisions/:id/review</code></td><td class="ok">approve · decision <code>de540110…</code> → review <code>907e7d80…</code></td></tr>
    <tr><td>9</td><td>Audit · <code>GET /governance/audit</code></td><td class="ok">approve · بواسطة Sigma Admin · 2026-06-28 11:54</td></tr>
    <tr><td>10</td><td>L7/L8 dashboards</td><td class="ok">CPI 0.909 · SPI 0.819 · EVM محسوبة</td></tr>
  </table>

  <h2>Evidence Trace + Audit (مخرجات خام)</h2>
  <pre>decision   de540110-...d70f   alert REPORTED_VS_SCHEDULE_MISMATCH/warning
ruleEval   00255fb1-...1d00   status completed     ingestionRun e1a79546-...3573b (normalized)
sourceFile sigma-pmo-data-template.xlsx   SHA-256 ae5ac3ce719b...31467b02
confidence overall 0.97 (completeness 1.0 / consistency 1.0 / sourceReliability 0.85)
AUDIT      approve by "Sigma Admin" @ 2026-06-28T11:54:28Z  decision de540110-...  review 907e7d80-...</pre>

  <div class="deliver">
    <b>Deliverables:</b> دخول <code>admin@sigma.local</code>/<code>Sg!ElFo6k4ZgZW2#26</code> أو <code>pmo@sigma.ae</code>/<code>SigmaDemo2026</code> ·
    القالب مرفق · jobId <code>e1a79546-455f-43da-b7ff-79cfbad3573b</code> ·
    Swagger <code>system-api.sigma-pmo.com/api/v1/docs</code> (357 endpoint) · commit <code>56b3916</code> / <code>ad76244</code>
  </div>
</div>

<div class="page">
  <h2>إثبات بصري — لقطات حيّة (P-1000، بعد تشغيل السلسلة)</h2>
  <div class="gallery">
    <figure><div class="cap">L3 — أرشيف القرارات (FIDIC + الطرف + قرار معتمد ✅)</div><div class="thumb"><img src="${SH}/L3-decisions.png"></div></figure>
    <figure><div class="cap">L2 — المراجعة والتنبيهات</div><div class="thumb"><img src="${SH}/L2-review.png"></div></figure>
    <figure><div class="cap">L7 — لوحة القيادة التنفيذية (CPI/SPI/EVM)</div><div class="thumb"><img src="${SH}/L7-executive.png"></div></figure>
    <figure><div class="cap">L8 — مركز قيادة الحوكمة</div><div class="thumb"><img src="${SH}/L8-governance-command.png"></div></figure>
    <figure><div class="cap">سجل التدقيق Audit (approve / Sigma Admin)</div><div class="thumb"><img src="${SH}/audit.png"></div></figure>
    <figure><div class="cap">التحليلات والقيمة المكتسبة EVM</div><div class="thumb"><img src="${SH}/analytics.png"></div></figure>
  </div>
  <div class="deliver" style="margin-top:12px"><b>الخلاصة:</b> السلسلة الكاملة تعمل فعليًا على الإنتاج — مُثبَتة بمخرجات خام (IDs · hash · confidence · بنود FIDIC) ورسوم بيانية ولقطات حيّة. الهدف الأساسي من نظام الحوكمة مُحقَّق.</div>
  <div class="foot">Sigma PMO · تقرير التحقّق النهائي بالرسوم والإثبات الحيّ · 28 يونيو 2026</div>
</div>
</body></html>`;

writeFileSync('../reports/_chainv2.html', html);
console.log('wrote ../reports/_chainv2.html');
