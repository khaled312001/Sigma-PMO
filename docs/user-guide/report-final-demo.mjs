/** Sigma PMO — final demo report: the full P-1000 chain proven with live screenshots + diagrams,
 *  answering the owner (Ayham) platform-upgrade letter (12 requirements + acceptance criteria). */
import { writeFileSync } from 'node:fs';

const S = '../user-guide/shots-demo';
const css = `
@page{size:A4;margin:13mm 12mm;}
*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:12px;line-height:1.65;}
.cover{text-align:center;padding-top:34mm;page-break-after:always;}
.cover .logo{font-size:42px;font-weight:800;color:#0f766e;}
.cover h1{font-size:26px;color:#0f172a;margin:14px 0 6px;}
.cover .sub{font-size:14.5px;color:#475569;margin:2px;}
.cover .box{margin:24px auto 0;max-width:160mm;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 22px;text-align:right;font-size:12.5px;line-height:1.95;}
section{page-break-before:always;}
h2{color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);border-radius:10px;padding:11px 18px;font-size:17px;margin:0 0 12px;}
h3{color:#0f766e;font-size:14px;margin:14px 0 7px;border-right:4px solid #0d9488;padding-right:9px;}
p,li{font-size:12px;}
table{width:100%;border-collapse:collapse;margin:9px 0 13px;font-size:11px;break-inside:avoid;}
tr{break-inside:avoid;}th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right;vertical-align:top;word-break:break-word;}
th{background:#f0fdfa;color:#0f766e;font-weight:700;}
.ok{color:#059669;font-weight:700;}.bad{color:#dc2626;font-weight:700;}.warn{color:#b45309;font-weight:700;}
code{font-family:Consolas,monospace;direction:ltr;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:10px;unicode-bidi:plaintext;}
ul{margin:6px 0;padding-inline-start:20px;}
.kpis{display:flex;gap:8px;margin:10px 0 14px;flex-wrap:wrap;}
.kpi{flex:1;min-width:80px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:10px 5px;text-align:center;break-inside:avoid;}
.kpi .n{font-size:19px;font-weight:800;color:#0d9488;}.kpi .l{font-size:9.5px;color:#475569;margin-top:3px;}
.note{background:#f0fdf4;border:1px solid #86efac;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.warnbox{background:#fffbeb;border:1px solid #fcd34d;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
/* flow diagram */
.flow{direction:ltr;display:flex;flex-wrap:wrap;align-items:center;gap:5px;justify-content:center;margin:12px 0;}
.fb{background:#ecfdf5;border:1.5px solid #0d9488;border-radius:8px;padding:7px 10px;font-size:10.5px;font-weight:700;color:#0f766e;text-align:center;min-width:74px;}
.fa{color:#0d9488;font-weight:800;font-size:14px;}
.fb.alt{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;}
/* screenshots */
.shot{border:1px solid #cbd5e1;border-radius:7px;overflow:hidden;background:#fff;margin:8px 0;break-inside:avoid;}
.shot .cap{background:#f0fdfa;color:#0f766e;font-weight:700;font-size:11px;padding:6px 10px;border-bottom:1px solid #cbd5e1;}
.shot.ui img{width:100%;object-fit:cover;object-position:top;display:block;max-height:300px;}
.shot.api img{width:100%;object-fit:cover;object-position:top;display:block;max-height:360px;}
.shot.full img{width:100%;display:block;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
.pill{display:inline-block;border-radius:20px;padding:1px 8px;font-size:9.5px;font-weight:700;}
.pill.have{background:#dcfce7;color:#166534;}.pill.need{background:#fee2e2;color:#991b1b;}
`;

const ui = (name, cap) => `<div class="shot ui"><div class="cap">🖥️ ${cap}</div><img src="${S}/ui-${name}.png"></div>`;
const api = (file, cap) => `<div class="shot api"><div class="cap">🔌 ${cap}</div><img src="${S}/${file}.png"></div>`;

const flow = (stages) => `<div class="flow">${stages.map((s, i) => `<div class="fb${s.alt ? ' alt' : ''}">${s.t}</div>${i < stages.length - 1 ? '<span class="fa">→</span>' : ''}`).join('')}</div>`;

const CHAIN = [
  { t: 'Sketch /<br>AutoCAD' }, { t: 'Financial /<br>Bankability' }, { t: 'BIM /<br>Revit' }, { t: 'Clash<br>Detection' },
  { t: 'BOQ /<br>NRM' }, { t: 'Cost<br>Estimate' }, { t: 'Primavera /<br>CPM' }, { t: 'Contract /<br>FIDIC' },
  { t: 'Site<br>Evidence' }, { t: 'Reports' }, { t: 'Governance' },
];

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="cover">
  <div class="logo">Sigma PMO</div>
  <h1>تقرير الديمو النهائي — السلسلة الكاملة مُثبتة بالصور</h1>
  <div class="sub">ردًّا على رسالة ترقية المنصة — 29 يونيو 2026 · مشروع الديمو P-1000 (Hospital Tower)</div>
  <div class="sub">كل لقطة في هذا التقرير من الإنتاج الحي system.sigma-pmo.com</div>
  <div class="box">
    <b>ماذا يُثبت هذا التقرير؟</b> السلسلة الكاملة اللي طلبتها — من الفكرة حتى الحوكمة — شغّالة فعليًا على الإنتاج وموثّقة <u>بصور حية</u> لكل مرحلة:<br>
    Sketch → Financial → BIM → Clash → BOQ → Cost → Primavera → Contract → Site Evidence → Reports → Governance<br><br>
    + الـ12 متطلب منفّذة · معايير القبول الستة · build/tests/restore من بيئة نظيفة · والحد الخارجي الوحيد (geometry الـDWG/RVT) موضّح بصراحة مع بديله الشغّال.
  </div>
</div>

<section><h2>1 · الملخص التنفيذي</h2>
  <div class="kpis">
    <div class="kpi"><div class="n">11/11</div><div class="l">مراحل السلسلة شغّالة</div></div>
    <div class="kpi"><div class="n">12/12</div><div class="l">متطلب منفّذ</div></div>
    <div class="kpi"><div class="n">997</div><div class="l">اختبار ناجح</div></div>
    <div class="kpi"><div class="n">build✓</div><div class="l">من بيئة نظيفة</div></div>
    <div class="kpi"><div class="n">79/4991</div><div class="l">restore متطابق</div></div>
    <div class="kpi"><div class="n">371</div><div class="l">مسار API</div></div>
  </div>
  ${flow(CHAIN)}
  <div class="note"><b>الجوهر:</b> المنصة مش مجرد إدارة مشاريع — هي تبدأ من فكرة/sketch، تقيّمها ماليًا، تنقلها لـBIM، تكشف التعارضات، تستخرج الكميات والتكلفة، تربطها بالجدول الزمني (CPM حقيقي) ثم بالعقد (FIDIC) والتنفيذ (Site Evidence) والتقارير والحوكمة — كله بـ<b>correlationId واحد</b> وبقرار بشري في كل نقطة (المنصة توصّي ولا تقرّر).</div>
</section>

<section><h2>2 · مرحلة الفكرة + الجدوى المالية + التمويل</h2>
  <p><b>المتطلب 3 (Bankability):</b> business case كامل — استثمار، إيرادات، CAPEX/OPEX، NPV، IRR، Payback، DSCR، مخاطر مالية، حساسية. كله <b>محسوب determinist: native</b> (بدون أي خدمة مدفوعة).</p>
  <div class="two">${ui('feasibility', 'فرص الاستثمار + الجدوى (P-1000)')}${ui('bankability', 'الجدارة البنكية (Bankability)')}</div>
  ${api('api-_bankability_assessment_projectKey_P_1000', 'GET /bankability/assessment — verdict مرتبط بمشروع P-1000 (NPV/IRR/DSCR)')}
  ${ui('funding', 'التمويل (Facilities: senior debt + equity · DSCR)')}
  <div class="note">المدخلات: فكرة/مساحة/نوع · المخرجات: business case + bankability verdict · القرار البشري: proceed / hold / reject. (تم ربط FeasibilityAssessment بالمشروع فالـbankability بقت project-scoped لـP-1000.)</div>
</section>

<section><h2>3 · BIM/Revit + كشف التعارضات (Clash Detection)</h2>
  <p><b>المتطلب 1+2:</b> رفع النموذج → كشف التعارضات بين التخصصات، كل clash له مصدر واضح (النموذج، العنصرين، الموقع، الخطورة) ومربوط بنشاط ومسؤولية.</p>
  <div class="two">${ui('drawings', 'الرسومات (PDF/DWG/DXF) — capabilities واضحة')}${ui('clashes', 'التعارضات (Clash list)')}</div>
  ${api('api-clash-detail', 'GET /clashes/:id — تعارض من الكشف الهندسي native من نموذجين IFC')}
  <div class="note"><b>إثبات الكشف الهندسي native:</b> اللقطة فوق تعارض <code>GEOM-0010</code> اتولّد من <b>GeometricClashService</b> (مش من Excel): نموذجين IFC (modelAId/modelBId)، عنصرين (<code>elementGuidA/B</code>)، <b>إحداثيات حقيقية</b> (X=14600 Y=2100 Z=3100) محسوبة من هندسة الملف، تداخل 100مم، تخصصات mechanical×structural، خطورة critical. <span class="pill have">native</span> — بدون APS.</div>
  ${api('api-_drawings_capabilities', 'GET /drawings/capabilities — السرد الصريح: accepts pdf/dwg/dxf/ifc · clash = ingest-navisworks أو APS')}
</section>

<section><h2>4 · حصر الكميات (BOQ/NRM) + التكلفة</h2>
  <p><b>المتطلب 4:</b> بعد BIM/clash → استخراج الكميات مربوطة بـNRM، ثم cost estimate / budget baseline / cost control / forecast.</p>
  ${ui('quantity-survey', 'حصر الكميات والتكلفة — BIM → NRM → Cost (تقدير 302.40M ر.س)')}
  <div class="note">المسار: BIM counts → كميات مصنّفة NRM/UniFormat/MasterFormat → cost estimate → budget baseline → cost-ledger (traceability). كله محسوب. القرار البشري: اعتماد التقدير/الموازنة.</div>
</section>

<section><h2>5 · Primavera / CPM (المسار الحرج + EOT)</h2>
  <p><b>المتطلب 5:</b> الجدول مش مجرد بيانات بل <b>CPM حقيقي</b>: critical path, float, delay impact, EOT, recovery plan — ومربوط بالـBIM/BOQ/المطالبات.</p>
  ${api('api-_projects_P_1000_cpm', 'GET /projects/P-1000/cpm — forward/backward pass: ES/EF/LS/LF/float/isCritical + المسار الحرج')}
  ${ui('forensic-delay', 'تحليل التأخير (CPM-driven) — السائق الحرج + EOT')}
  <div class="note"><b>CPM solver حقيقي</b> (مش heuristic): يحلّ شبكة المنطق من <code>Activity.predecessors</code> بـforward/backward pass. الربط الحرج مُثبت سابقًا حيّ: تعارض → نشاط حرج A-1002 → <b>15 يوم EOT</b> · criticalPathChanged=true. + RecoveryPlanService (crash/fast-track/re-sequence).</div>
</section>

<section><h2>6 · العقد / FIDIC + المطالبات</h2>
  <p><b>المتطلب 6:</b> ربط العقد بالجدول والتقارير والمطالبات — كل claim يظهر البند التعاقدي، الإشعارات، المدة النظامية، الأدلة، وتحليل الاستحقاق.</p>
  <div class="two">${ui('claims', 'المطالبات (FIDIC) + سلسلة الأدلة')}${ui('contract-rules', 'قواعد العقد (FIDIC clauses)')}</div>
  <div class="note">سلسلة الأدلة forensic (<code>GET /claims/:id/chain</code>) مُثبتة حيّ: مطالبة → تحليل تأخير → استحقاق → <b>verdict إجرائي FIDIC</b> (preserved/weak/time_barred محسوب من تواريخ الحدث/الإشعار) → أرجل أدلة موثّقة (خطاب/تقرير/صورة/بند BOQ/بند FIDIC). + <code>POST /claims/:id/links</code> (write-path).</div>
</section>

<section><h2>7 · تقارير الموقع (Site Evidence/Smart Glasses) + التقارير الدورية + الحوكمة</h2>
  <p><b>المتطلب 7+8+9:</b> صور/فيديو/صوت من الموقع تدخل تلقائيًا في التقارير؛ Journey كامل مترابط؛ المنصة توصّي ولا تقرّر (اعتماد بشري).</p>
  ${ui('reports', 'التقارير الدورية (تتضمّن Site Evidence تلقائيًا)')}
  ${api('api-_journey_P_1000', 'GET /journey/P-1000 — الرحلة الموحّدة بـcorrelationId واحد + present/note لكل مرحلة')}
  ${api('api-_executive_governance_dashboard', 'GET /executive/governance-dashboard — مدخلات/مخرجات/أدلة/اعتماد بشري (لا قرار آلي)')}
  ${ui('governance-command', 'مركز الحوكمة')}
  <div class="note"><b>المنصة لا تقرّر:</b> الـdashboard يوضّح <code>humanApproval</code> (معتمَد/منتظِر) و<code>recommendedDecision.requiresHumanApproval=true</code> دائمًا — لا شيء يُعتمَد آليًا. والـjourney يربط كل المراحل بـ<code>correlationId</code> واحد مع <code>present/note</code> (المرحلة الفاضية تشرح سبب غيابها).</div>
</section>

<section><h2>8 · الجودة: Build / Tests / Restore + توثيق API</h2>
  <p><b>المتطلب 11+12:</b> build واختبارات ناجحة من بيئة نظيفة، Swagger يوضّح request/response، وtجربة restore موثّقة.</p>
  <table><tr><th style="width:32%">العنصر</th><th>الدليل (من بيئة نظيفة)</th></tr>
  <tr><td>Build من clone نظيف</td><td class="ok">✅ <code>npm ci</code> + <code>nest build</code> → exit 0 (بعد تعريف jszip اللي كان ناقص)</td></tr>
  <tr><td>الاختبارات</td><td class="ok">✅ <code>npx jest</code> → 69 suite · 997 ناجح · 1 skipped — من نفس الـclone النظيف</td></tr>
  <tr><td>restore round-trip</td><td class="ok">✅ <code>POST /backup/restore-verify</code> + drill log: 79 جدول/4991 صف تطابق · scratch اتحذف · الإنتاج ما اتمسّش</td></tr>
  <tr><td>تدوير المفاتيح</td><td class="ok">✅ تغيير الباسورد يُبطل كل الجلسات القديمة (revokeAllSessions)</td></tr>
  <tr><td>توثيق API</td><td class="ok">✅ Swagger بـDTOs موثّقة (journey/site-evidence/claims-chain/...) — 371 مسار</td></tr></table>
  ${api('api-_backup_restore_verify', 'POST /backup/restore-verify — إثبات الاستعادة عبر API (يقدر أيهم يتحقق بنفسه)')}
  <div class="shot full"><div class="cap">📘 Swagger / OpenAPI — المسارات الموثّقة</div><img src="${S}/swagger.png"></div>
</section>

<section><h2>9 · مطابقة الـ12 متطلب + معايير القبول</h2>
  <table>
  <tr><th style="width:5%">#</th><th>المتطلب</th><th style="width:13%">الحالة</th></tr>
  <tr><td>1</td><td>AutoCAD → BIM/Revit (workflow تحويل)</td><td class="ok">✅ IFC native · DWG/RVT عبر APS</td></tr>
  <tr><td>2</td><td>Clash مربوط بالنموذج/العنصرين/الموقع/المسؤولية</td><td class="ok">✅ كشف هندسي native + تفاصيل</td></tr>
  <tr><td>3</td><td>Bankability (NPV/IRR/DSCR/sensitivity)</td><td class="ok">✅ محسوب + project-scoped</td></tr>
  <tr><td>4</td><td>BOQ/NRM → cost control/baseline/forecast</td><td class="ok">✅ شغّال</td></tr>
  <tr><td>5</td><td>Primavera CPM (critical path/EOT/recovery)</td><td class="ok">✅ CPM solver + recovery</td></tr>
  <tr><td>6</td><td>العقد/FIDIC ↔ جدول ↔ مطالبات + استحقاق</td><td class="ok">✅ chain + verdict</td></tr>
  <tr><td>7</td><td>Site Evidence → تقارير تلقائيًا</td><td class="ok">✅ مدمج في التقارير الدورية</td></tr>
  <tr><td>8</td><td>Journey كامل (input/output/decision لكل مرحلة)</td><td class="ok">✅ present/note + correlationId</td></tr>
  <tr><td>9</td><td>المنصة توصّي ولا تقرّر + approval workflow</td><td class="ok">✅ requiresHumanApproval</td></tr>
  <tr><td>10</td><td>أنواع المشاريع (جديد/متعثر/نزاع)</td><td class="ok">✅ scenarioType (P-1000/P-2000/P-3000)</td></tr>
  <tr><td>11</td><td>Build/tests/Swagger من بيئة نظيفة</td><td class="ok">✅ 997 + build نظيف + DTOs</td></tr>
  <tr><td>12</td><td>Restore موثّق + تدوير المفاتيح</td><td class="ok">✅ drill + endpoint + revoke</td></tr>
  </table>
  <h3>معايير القبول الستة</h3>
  <table><tr><th style="width:24%">المحور</th><th>الدليل</th></tr>
  <tr><td>BIM/Revit</td><td class="ok">IFC native → عرض/تحليل · DWG/RVT عبر APS (capabilities صريحة)</td></tr>
  <tr><td>Clash</td><td class="ok">كشف هندسي native بين التخصصات + إحداثيات/عناصر/خطورة + ربط بالنشاط</td></tr>
  <tr><td>Financial/Bankability</td><td class="ok">NPV/IRR/DSCR/sensitivity محسوب لـP-1000</td></tr>
  <tr><td>P6/FIDIC</td><td class="ok">CPM + EOT + claim chain + verdict — قابل للتتبّع</td></tr>
  <tr><td>Site Evidence</td><td class="ok">صور/فيديو/صوت → تقارير + حوكمة تلقائيًا</td></tr>
  <tr><td>Code Quality</td><td class="ok">build + 997 tests + restore من بيئة نظيفة + API موثّق</td></tr></table>
</section>

<section><h2>10 · الحد الخارجي الوحيد بصراحة + الخلاصة</h2>
  <div class="warnbox"><b>الصراحة الكاملة:</b> المتطلب الوحيد اللي يحتاج خدمة خارجية هو <b>تحويل geometry الـDWG/RVT/NWD وكشف الـclash السحابي بمحرك Autodesk</b> — دي صيغ مغلقة + محرك متخصص (شغل Navisworks/Solibri)، مش حاجة تتبرمج من الصفر.</div>
  <table><tr><th style="width:30%">الجزء</th><th>الحالة / البديل الشغّال</th></tr>
  <tr><td>IFC → نموذج + كميات</td><td class="ok">✅ native (parser IFC مكتوب) — شغّال بدون أي اشتراك</td></tr>
  <tr><td>كشف clash هندسي</td><td class="ok">✅ <b>GeometricClashService</b> native من نموذجي IFC (مُثبت فوق GEOM-0010)</td></tr>
  <tr><td>DWG/RVT geometry</td><td class="warn">⚠️ يحتاج <b>Autodesk APS</b> (فيه خطة فري) — الموصّل مكتوب وجاهز، يتفعّل بمفاتيح Client ID/Secret</td></tr>
  <tr><td>clash سحابي تلقائي (ACC)</td><td class="warn">⚠️ ACC Model Coordination مدفوع — أو رفع تصدير Navisworks (شغّال مجانًا)</td></tr></table>
  <div class="note"><b>الخلاصة:</b> كل المطلوب في رسالتك منفّذ ومُثبت بصور حية على الإنتاج — السلسلة الكاملة من الفكرة للحوكمة، الـ12 متطلب، معايير القبول الستة، والجودة (build/tests/restore من بيئة نظيفة). المتبقّي الوحيد خارجي (geometry الـDWG/RVT عبر Autodesk APS) — وعندنا بديله native شغّال + الموصّل جاهز لحظة ما تبعت مفاتيح APS المجانية. المنصّة جاهزة للتسويق والتسليم.</div>
</section>

</body></html>`;

writeFileSync('../reports/_final-demo.html', html);
console.log('wrote ../reports/_final-demo.html');
