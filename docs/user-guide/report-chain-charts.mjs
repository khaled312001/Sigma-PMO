/** Multi-page end-to-end chain report — one clean page per stage, with charts +
 *  large real screenshots, sized so nothing splits across a page. */
import { writeFileSync } from 'node:fs';
const SH = '../user-guide/shots-chain';

// ---- SVG chart helpers ----
function hbar(items, { w = 380, barH = 22, gap = 12, max, target } = {}) {
  const mx = max || Math.max(...items.map((i) => i.v), 1);
  const labelW = 104, valW = 60, plot = w - labelW - valW;
  const h = items.length * (barH + gap);
  let y = 0, svg = `<svg width="100%" height="${h + 12}" viewBox="0 0 ${w} ${h + 12}" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI,Arial" style="direction:ltr">`;
  if (target) { const tx = labelW + (target / mx) * plot; svg += `<line x1="${tx}" y1="0" x2="${tx}" y2="${h}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3 3"/><text x="${tx}" y="${h + 9}" font-size="11" fill="#64748b" text-anchor="middle">target ${target}</text>`; }
  for (const it of items) {
    const bw = Math.max(3, (it.v / mx) * plot);
    svg += `<text x="${labelW - 6}" y="${y + barH * 0.7}" font-size="14" fill="#334155" text-anchor="end">${it.l}</text>`;
    svg += `<rect x="${labelW}" y="${y}" width="${plot}" height="${barH}" rx="5" fill="#f1f5f9"/>`;
    svg += `<rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="5" fill="${it.c || '#0d9488'}"/>`;
    svg += `<text x="${labelW + plot + 8}" y="${y + barH * 0.7}" font-size="14" font-weight="700" fill="#0f766e">${it.t ?? it.v}</text>`;
    y += barH + gap;
  }
  return svg + '</svg>';
}
function donut(segs, { size = 168 } = {}) {
  const total = segs.reduce((a, s) => a + s.v, 0) || 1, r = size / 2 - 18, c = size / 2, circ = 2 * Math.PI * r;
  let off = 0, svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="Segoe UI,Arial">`;
  svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="21"/>`;
  for (const s of segs) { const len = (s.v / total) * circ; svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.c}" stroke-width="21" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`; off += len; }
  svg += `<text x="${c}" y="${c - 3}" font-size="30" font-weight="800" fill="#0f172a" text-anchor="middle">${total}</text>`;
  svg += `<text x="${c}" y="${c + 16}" font-size="12" fill="#64748b" text-anchor="middle">total</text>`;
  return svg + '</svg>';
}
const C = {
  records: hbar([{ l: 'project', v: 1 }, { l: 'activity', v: 2 }, { l: 'resource', v: 1 }, { l: 'assignment', v: 1 }, { l: 'report', v: 1 }], { max: 2 }),
  alerts: donut([{ v: 3, c: '#d97706' }, { v: 1, c: '#dc2626' }]),
  indices: hbar([{ l: 'Confidence', v: 0.97, c: '#059669', t: '0.97' }, { l: 'CPI (cost)', v: 0.909, c: '#d97706', t: '0.909' }, { l: 'SPI (sched)', v: 0.819, c: '#dc2626', t: '0.819' }], { max: 1.2, target: 1.0 }),
  evm: hbar([{ l: 'BAC', v: 414.7, c: '#0369a1', t: '414.7M' }, { l: 'EV (earned)', v: 46.2, c: '#0d9488', t: '46.2M' }, { l: 'AC (actual)', v: 1.6, c: '#7c3aed', t: '1.6M' }], { max: 414.7 }),
  decisions: hbar([{ l: 'L1', v: 3, c: '#d97706' }, { l: 'L3 (critical)', v: 1, c: '#dc2626' }], { max: 4 }),
};

const css = `
@page{size:A4;margin:0;}*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:13px;line-height:1.6;}
.page{width:210mm;min-height:297mm;padding:14mm 14mm;page-break-after:always;position:relative;}
.band{background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;border-radius:14px;padding:20px 26px;margin-bottom:16px;}
.band h1{margin:0 0 6px;font-size:23px;}.band .meta{font-size:13px;opacity:.93;}
.chainbar{margin-top:11px;font-size:12.5px;font-weight:600;line-height:1.8;}
.tag{display:inline-block;background:#0f766e;color:#fff;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;margin-bottom:8px;}
h2{color:#0f766e;font-size:18px;border-bottom:2.5px solid #ccfbf1;padding-bottom:6px;margin:4px 0 14px;}
h3{color:#0e7490;font-size:14px;margin:14px 0 6px;}
table{width:100%;border-collapse:collapse;margin:7px 0 14px;font-size:12.5px;break-inside:avoid;}
tr{break-inside:avoid;}
th,td{border:1px solid #cbd5e1;padding:8px 11px;text-align:right;vertical-align:top;}
th{background:#f0fdfa;color:#0f766e;font-weight:700;}
.ok{color:#059669;font-weight:700;white-space:nowrap;}.crit{color:#dc2626;font-weight:700;}.warn{color:#d97706;font-weight:700;}
code{font-family:Consolas,monospace;direction:ltr;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:11.5px;unicode-bidi:plaintext;}
.kpis{display:flex;gap:12px;margin:8px 0 16px;}
.kpi{flex:1;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 8px;text-align:center;break-inside:avoid;}
.kpi .n{font-size:27px;font-weight:800;color:#0d9488;}.kpi .l{font-size:12px;color:#475569;margin-top:4px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.card{border:1px solid #d1fae5;border-radius:12px;padding:14px 16px;background:#fafffe;break-inside:avoid;}
.card h3{margin:0 0 10px;font-size:15px;color:#0f766e;}
.cardrow{display:flex;align-items:center;gap:16px;justify-content:center;}
.deliver{background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;padding:16px 20px;margin:10px 0;font-size:13px;line-height:2;break-inside:avoid;}
.deliver b{color:#0e7490;}
.shot{width:100%;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.07);break-inside:avoid;}
.shot.lg{height:560px;}.shot.md{height:420px;}.shot.sm{height:360px;}
.shot img{width:100%;object-fit:cover;object-position:top;display:block;}
.cap{font-size:14px;color:#0f766e;margin:14px 0 6px;font-weight:700;}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:9px;font-size:12px;unicode-bidi:plaintext;direction:ltr;text-align:left;white-space:pre-wrap;line-height:1.75;break-inside:avoid;}
.legend{font-size:12px;color:#475569;margin-top:8px;}.sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;margin-left:4px;}
.foot{position:absolute;bottom:8mm;right:14mm;left:14mm;border-top:1px solid #e2e8f0;padding-top:8px;color:#64748b;font-size:10.5px;}
.note{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;font-size:12.5px;margin:8px 0;}
`;

const foot = (n) => `<div class="foot">Sigma PMO · تقرير التحقّق النهائي للسلسلة الكاملة · 28 يونيو 2026 · صفحة ${n}/9</div>`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<!-- P1: cover -->
<div class="page">
  <div class="band"><h1>تقرير التحقّق النهائي — السلسلة الكاملة end-to-end</h1>
  <div class="meta">Sigma PMO · المشروع: Hospital Tower — Phase 1 (<code>P-1000</code>) · بيئة الإنتاج · 28 يونيو 2026</div>
  <div class="chainbar">✅ Template → Ingestion → Stored Records → Workflow (jobId) → Alerts (L2) → Decisions (L3)<br>→ Evidence → Approval → Audit → L7 Executive → L8 Governance</div></div>
  <div class="kpis">
    <div class="kpi"><div class="n">10/10</div><div class="l">خطوات السلسلة ناجحة</div></div>
    <div class="kpi"><div class="n">6</div><div class="l">سجلات أُنشئت</div></div>
    <div class="kpi"><div class="n">4 / 4</div><div class="l">تنبيهات / قرارات</div></div>
    <div class="kpi"><div class="n">0.97</div><div class="l">درجة الثقة</div></div>
    <div class="kpi"><div class="n">completed</div><div class="l">حالة الـjob</div></div>
  </div>
  <div class="note"><b>الهدف:</b> إثبات أن المنصّة تعمل كسلسلة تشغيل حقيقية من الإدخال وحتى القرار والتدقيق والداشبورد — وليست مجرد لوحات عرض. هذا التقرير يوثّق <b>كل مرحلة في صفحة مستقلة</b> بمخرجات خام حقيقية (IDs · hash · confidence · بنود FIDIC) ولقطات حيّة ورسوم بيانية.</div>
  <h2>فهرس المراحل</h2>
  <table>
    <tr><th style="width:12%">الصفحة</th><th>المرحلة</th><th style="width:18%">الحالة</th></tr>
    <tr><td>2</td><td>لوحة الرسوم البيانية (ملخّص بصري)</td><td class="ok">✅</td></tr>
    <tr><td>3</td><td>المراحل 1-4: القالب · الاستيعاب · السجلات · الـWorkflow</td><td class="ok">✅</td></tr>
    <tr><td>4</td><td>المرحلة 5: التنبيهات L2 Review + لقطة</td><td class="ok">✅</td></tr>
    <tr><td>5</td><td>المرحلة 6: القرارات L3 + مراجع FIDIC + لقطة</td><td class="ok">✅</td></tr>
    <tr><td>6</td><td>المراحل 7-9: الأدلة · الاعتماد · التدقيق + لقطة</td><td class="ok">✅</td></tr>
    <tr><td>7</td><td>المرحلة 10أ: L7 لوحة القيادة التنفيذية + لقطة</td><td class="ok">✅</td></tr>
    <tr><td>8</td><td>المرحلة 10ب: L8 مركز الحوكمة + التحليلات + لقطات</td><td class="ok">✅</td></tr>
    <tr><td>9</td><td>المُخرجات (Deliverables) والخلاصة</td><td class="ok">✅</td></tr>
  </table>
  ${foot(1)}
</div>

<!-- P2: charts -->
<div class="page">
  <span class="tag">ملخّص بصري</span>
  <h2>لوحة الرسوم البيانية — إثبات أن كل مرحلة تمام</h2>
  <div class="grid2">
    <div class="card"><h3>① السجلات المُنشأة من القالب</h3><div dir="ltr">${C.records}</div></div>
    <div class="card"><h3>② التنبيهات حسب الخطورة (L2)</h3><div class="cardrow">${C.alerts}<div class="legend"><span class="sw" style="background:#d97706"></span> warning ×3<br><span class="sw" style="background:#dc2626"></span> critical ×1</div></div></div>
    <div class="card"><h3>③ الثقة ومؤشرات الأداء (target=1.0)</h3><div dir="ltr">${C.indices}</div><div class="legend">Confidence أخضر (عالٍ) · CPI/SPI تحت الهدف = تجاوز تكلفة/تأخّر جدول → تنبيهات صحيحة</div></div>
    <div class="card"><h3>④ القيمة المكتسبة EVM (مليون)</h3><div dir="ltr">${C.evm}</div><div class="legend">EV/BAC ≈ 11.1% إنجاز · AC منخفض</div></div>
    <div class="card"><h3>⑤ القرارات حسب مستوى التصعيد (L3)</h3><div dir="ltr">${C.decisions}</div></div>
    <div class="card"><h3>⑥ ملخّص الحالة</h3>
      <table style="margin:0;font-size:12px"><tr><td>Job</td><td class="ok">completed ✅</td></tr><tr><td>Workflow</td><td class="ok">4 alerts · 4 decisions · 0 fail</td></tr><tr><td>Approval</td><td class="ok">approve ✅</td></tr><tr><td>Audit</td><td class="ok">مُسجَّل ✅</td></tr><tr><td>Evidence hash</td><td><code>ae5ac3ce…</code></td></tr></table></div>
  </div>
  ${foot(2)}
</div>

<!-- P3: stages 1-4 -->
<div class="page">
  <span class="tag">المراحل 1-4</span>
  <h2>القالب → الاستيعاب → السجلات → الـWorkflow</h2>
  <table>
    <tr><th style="width:6%">#</th><th style="width:34%">الخطوة (Endpoint)</th><th>النتيجة الفعلية (Raw)</th></tr>
    <tr><td>1</td><td>تحميل القالب الرسمي<br><code>GET /ingestion/template</code></td><td class="ok">200 · Excel 2007+ · 12,074 bytes · 5 أوراق<br>SHA-256 <code>ae5ac3ce…1467b02</code></td></tr>
    <tr><td>2-3</td><td>رفع القالب → إنشاء سجلات فعلية<br><code>POST /ingestion/upload</code></td><td class="ok">200 · <code>project:1 · activity:2 · resource:1 · assignment:1 · report:1</code> — كلها &gt; 0</td></tr>
    <tr><td>4</td><td>تشغيل الـWorkflow الرسمي<br><code>POST /rules/workflows/run</code></td><td>jobId <code>e1a79546-455f-43da-b7ff-79cfbad3573b</code><br>الحالة: <span class="ok">completed</span> · 4 alerts · 4 decisions · failures: 0</td></tr>
  </table>
  <h3>مخرجات خام — الاستيعاب والـjob</h3>
  <pre>POST /ingestion/upload  ->  200
{ "runId":"e1a79546-455f-43da-b7ff-79cfbad3573b",
  "parser":"excel", "status":"normalized",
  "counts":{ "project":1, "activity":2, "resource":1, "assignment":1, "report":1 } }

GET /jobs/e1a79546-...3573b  ->  { "status":"completed",
  "rowCounts":{ "project":1,"activity":2,"resource":1,"assignment":1,"report":1 } }

POST /rules/workflows/run {projectKey:"P-1000"} -> { "totalAlertCount":4,
  "totalDecisionCount":4, "failures":[], "evaluationId":"00255fb1-...941d00" }</pre>
  ${foot(3)}
</div>

<!-- P4: L2 alerts -->
<div class="page">
  <span class="tag">المرحلة 5 — L2 Review</span>
  <h2>التنبيهات (rule code · severity · السبب · المصدر المرتبط)</h2>
  <table>
    <tr><th>Rule code</th><th>Severity</th><th>السبب</th><th>المصدر</th></tr>
    <tr><td><code>REPORTED_VS_SCHEDULE_MISMATCH</code></td><td class="warn">warning</td><td>التقرير يُبلّغ 38.0% مقابل 59.9% فعلي (فجوة 21.9 نقطة)</td><td>report + file</td></tr>
    <tr><td><code>RESOURCE_UNDERUSE</code></td><td class="warn">warning</td><td>استغلال موارد أقل من المخطّط</td><td>activity + file</td></tr>
    <tr><td><code>SCHEDULE_BEHIND_PLAN</code></td><td class="warn">warning</td><td>«Excavation» متأخّر 15% (مخطّط 60%، فعلي 45%)</td><td>activity + file</td></tr>
    <tr><td><code>SCHEDULE_FINISH_SLIPPED</code></td><td class="crit">critical</td><td>انزلاق تاريخ الانتهاء</td><td>activity + file</td></tr>
  </table>
  <div class="cap">لقطة حيّة — L2 المراجعة والتنبيهات (P-1000)</div>
  <div class="shot lg"><img src="${SH}/L2-review.png"></div>
  ${foot(4)}
</div>

<!-- P5: L3 decisions -->
<div class="page">
  <span class="tag">المرحلة 6 — L3 Decisions</span>
  <h2>القرارات (rule · recommendation · party · FIDIC · confidence)</h2>
  <table>
    <tr><th>Rule</th><th>الطرف</th><th>مرجع FIDIC</th><th>المستوى</th><th>الحالة</th></tr>
    <tr><td><code>REPORTED_VS_SCHEDULE_MISMATCH</code></td><td>shared</td><td>—</td><td>L1</td><td class="ok">معتمد ✅</td></tr>
    <tr><td><code>RESOURCE_UNDERUSE</code></td><td>contractor</td><td><b>Sub-Clause 8.3 / 8.6</b></td><td>L1</td><td>بانتظار</td></tr>
    <tr><td><code>SCHEDULE_FINISH_SLIPPED</code></td><td>contractor</td><td><b>Sub-Clause 8.5 / 20.1</b></td><td class="crit">L3</td><td>بانتظار</td></tr>
    <tr><td><code>SCHEDULE_BEHIND_PLAN</code></td><td>contractor</td><td><b>Sub-Clause 8.6</b></td><td>L1</td><td>بانتظار</td></tr>
  </table>
  <div class="cap">لقطة حيّة — L3 أرشيف القرارات (FIDIC + الطرف + قرار معتمد ✅)</div>
  <div class="shot lg"><img src="${SH}/L3-decisions.png"></div>
  ${foot(5)}
</div>

<!-- P6: evidence + approval + audit -->
<div class="page">
  <span class="tag">المراحل 7-9</span>
  <h2>الأدلة (Evidence) · الاعتماد (Approval) · التدقيق (Audit)</h2>
  <h3>Evidence Trace — للقرار المعتمد</h3>
  <pre>decision   de540110-...d70f   alert REPORTED_VS_SCHEDULE_MISMATCH/warning
ruleEval   00255fb1-...1d00   status completed    ingestionRun e1a79546-...3573b (normalized)
sourceFile sigma-pmo-data-template.xlsx   SHA-256 ae5ac3ce719b...31467b02
confidence overall 0.97 (completeness 1.0 / consistency 1.0 / sourceReliability 0.85)</pre>
  <h3>Approval + Audit log (من / متى / الإجراء / القرار)</h3>
  <pre>POST /governance/decisions/de540110-.../review {action:"approve"} -> 200
AUDIT: action=approve  by="Sigma Admin"  at=2026-06-28T11:54:28Z
       decisionId=de540110-...d70f   review=907e7d80-...   alert=REPORTED_VS_SCHEDULE_MISMATCH</pre>
  <div class="cap">لقطة حيّة — سجل التدقيق Audit</div>
  <div class="shot md"><img src="${SH}/audit.png"></div>
  ${foot(6)}
</div>

<!-- P7: L7 executive -->
<div class="page">
  <span class="tag">المرحلة 10أ — L7 Executive</span>
  <h2>لوحة القيادة التنفيذية (CPI · SPI · EVM)</h2>
  <div class="note">المؤشرات محسوبة فعليًا للمشروع P-1000: <b>CPI 0.909</b> (تجاوز تكلفة) · <b>SPI 0.819</b> (تأخّر جدول) · القيمة المكتسبة <b>EV 46.2M</b> من <b>BAC 414.7M</b> · الحالة: governance n/a · schedule slipping · cost over-budget.</div>
  <div class="cap">لقطة حيّة — L7 لوحة القيادة التنفيذية (P-1000)</div>
  <div class="shot lg"><img src="${SH}/L7-executive.png"></div>
  ${foot(7)}
</div>

<!-- P8: L8 + analytics -->
<div class="page">
  <span class="tag">المرحلة 10ب — L8 + التحليلات</span>
  <h2>مركز قيادة الحوكمة + التحليلات (EVM)</h2>
  <div class="cap">لقطة حيّة — L8 مركز قيادة الحوكمة</div>
  <div class="shot md"><img src="${SH}/L8-governance-command.png"></div>
  <div class="cap">لقطة حيّة — التحليلات والقيمة المكتسبة EVM</div>
  <div class="shot md"><img src="${SH}/analytics.png"></div>
  ${foot(8)}
</div>

<!-- P9: deliverables -->
<div class="page">
  <span class="tag">المُخرجات</span>
  <h2>Deliverables والخلاصة</h2>
  <div class="deliver">
    <b>① بيانات الدخول التجريبية:</b><br>Admin: <code>admin@sigma.local</code> / <code>Sg!ElFo6k4ZgZW2#26</code> (sigma_admin)<br>أو حساب اختبار: <code>pmo@sigma.ae</code> / <code>SigmaDemo2026</code><br><br>
    <b>② ملف القالب الرسمي المُستخدَم:</b> <code>sigma-pmo-data-template.xlsx</code> (مرفق مع التقرير)<br>SHA-256 النسخة المُستوعَبة: <code>ae5ac3ce719b54a52f63f48bbacb45eae9904f091184a9eaf5836fbf31467b02</code><br><br>
    <b>③ jobId للـWorkflow:</b> ingestion <code>e1a79546-455f-43da-b7ff-79cfbad3573b</code> (completed)<br>ruleEvaluation <code>00255fb1-d798-4956-9c35-a6657a941d00</code> (completed)<br><br>
    <b>④ OpenAPI / Swagger:</b> الواجهة <code>https://system-api.sigma-pmo.com/api/v1/docs</code><br>المواصفات <code>https://system-api.sigma-pmo.com/api/v1/docs-json</code> (OpenAPI 3.0 · 357 endpoint)<br><br>
    <b>⑤ commit hash:</b> <code>56b3916</code> (إغلاق التدقيق) · <code>ad76244</code> (آخر إصلاح) — مستودع khaled312001/Sigma-PMO
  </div>
  <div class="note"><b>الخلاصة:</b> السلسلة الكاملة <b>Template → Ingestion → Stored Records → Alerts → Decisions → Evidence → Approval → Audit → L7/L8</b> تعمل فعليًا على الإنتاج، مُثبَتة بمخرجات خام حقيقية ورسوم بيانية ولقطات حيّة لكل مرحلة. الهدف الأساسي من نظام الحوكمة مُحقَّق، وجاهزون للانتقال لمراجعة الملاحظات التفصيلية والتحسينات النهائية.</div>
  ${foot(9)}
</div>
</body></html>`;

writeFileSync('../reports/_chainv2.html', html);
console.log('wrote ../reports/_chainv2.html (9 pages)');
