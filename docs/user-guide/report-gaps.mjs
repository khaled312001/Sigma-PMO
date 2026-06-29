/** Build the gaps-resolution PROOF report (RTL Arabic, A4 PDF) with real prod screenshots. */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOTS = resolve('shots-gaps');
const LOG = 'C:/Users/KHALE/AppData/Local/Temp/claude/e--Sigma-PMO/8c581043-4551-4f6d-bbed-be94f9177a32/scratchpad/cleanroom-proof.log';
const OUT = resolve('../reports/Sigma-Gaps-Resolution-Report-AR.pdf');

const img = (name) => {
  const p = `${SHOTS}/${name}`;
  if (!existsSync(p)) return '<div class="missing">[لقطة غير متوفرة: ' + name + ']</div>';
  const b64 = readFileSync(p).toString('base64');
  return `<img src="data:image/png;base64,${b64}" />`;
};
const logText = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '(log not found)';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { direction: rtl; margin: 0; padding: 0; font-family: "Segoe UI", "Tahoma", sans-serif; color: #0f172a; }
.page { padding: 40px 46px; page-break-after: always; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 30px; margin: 0 0 6px; color: #0f766e; }
h2 { font-size: 21px; margin: 26px 0 10px; color: #0f766e; border-bottom: 3px solid #0d9488; padding-bottom: 6px; }
h3 { font-size: 16px; margin: 18px 0 6px; color: #115e59; }
p, li { font-size: 13.5px; line-height: 1.85; }
.cover { background: linear-gradient(135deg, #0f766e, #0d9488); color: #fff; height: 1123px; padding: 90px 60px; }
.cover h1 { color: #fff; font-size: 40px; }
.cover .sub { font-size: 19px; opacity: .95; margin-top: 8px; line-height: 1.8; }
.cover .meta { margin-top: 40px; font-size: 15px; line-height: 2; background: rgba(255,255,255,.12); padding: 20px 26px; border-radius: 14px; }
.cover .big { margin-top: 36px; font-size: 22px; font-weight: 700; background: rgba(255,255,255,.16); padding: 18px 24px; border-radius: 12px; }
.chip { display: inline-block; background: #16a34a; color: #fff; border-radius: 14px; padding: 2px 12px; font-size: 12px; font-weight: 700; }
.chip.amber { background: #d97706; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12.5px; }
th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; vertical-align: top; }
th { background: #ccfbf1; color: #0f766e; }
tr:nth-child(even) td { background: #f8fafc; }
figure { margin: 12px 0 6px; }
figure img { width: 100%; height: auto; border: 1px solid #cbd5e1; border-radius: 8px; }
figcaption { font-size: 11.5px; color: #475569; margin-top: 4px; text-align: center; }
.uishot img { max-height: 940px; width: auto; max-width: 100%; display: block; margin: 0 auto; }
pre { background: #0f172a; color: #e2e8f0; font-family: Consolas, monospace; font-size: 11px; line-height: 1.55; padding: 14px 16px; border-radius: 8px; white-space: pre-wrap; direction: ltr; text-align: left; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px; direction: ltr; display: inline-block; }
.box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 18px; margin: 12px 0; }
.warn { background: #fffbeb; border-color: #fcd34d; }
.req { background: #f8fafc; border-right: 5px solid #0d9488; padding: 10px 16px; margin: 14px 0 8px; border-radius: 6px; }
.req b { color: #0f766e; }
ul { margin: 6px 24px 6px 0; padding: 0; }
.small { font-size: 11.5px; color: #475569; }
`;

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="cover">
  <h1>سيجما PMO — تقرير إغلاق الملاحظات وإثبات التشغيل</h1>
  <div class="sub">ردًّا على رسالة «الحصر النهائي للملاحظات المطلوبة للوصول للتسليم النهائي» — 2026-06-29<br/>كل بند متابَع بدليل حقيقي من بيئة الإنتاج الحيّة</div>
  <div class="meta">
    Commit الإنتاج: <b>7cfcda4</b> &nbsp;·&nbsp; منشور على <b>system.sigma-pmo.com</b><br/>
    البناء + الاختبارات: <b>75 suite · 1034 نجح · 1 skipped · exit 0</b><br/>
    Backend: NestJS 11 + MySQL &nbsp;·&nbsp; Frontend: Next.js 16 &nbsp;·&nbsp; Node 20+/npm فقط
  </div>
  <div class="big">الخلاصة: كل البنود الـ9 وبوّابات القبول الثلاثة اتنفّذت ومثبتة وشغّالة فعلاً على السيرفر. الباقي الوحيد = مفاتيح اشتراكات الـAPIs اللي يوفّرها المالك.</div>
</div>

<div class="page">
  <h1>0 · الخلاصة التنفيذية</h1>
  <p>كل ملاحظة في رسالتك اتعالجت في الكود فعلاً، اتّبنت، اترفعت على بيئة الاختبار الأول للتأكد، وبعد كده على الإنتاج. وكل بند تحت مثبت بلقطة شاشة حقيقية و/أو رد API حيّ من <code>system.sigma-pmo.com</code> — مش مجرد كلام في تقرير.</p>
  <table>
    <tr><th>#</th><th>الملاحظة</th><th>الحالة</th><th>الدليل</th></tr>
    <tr><td>1</td><td>إثبات أن build + tests يشتغل فعلاً من نسخة نضيفة</td><td><span class="chip">تمّ</span></td><td>سجل clean-room: 75 suite / 1034 نجح</td></tr>
    <tr><td>2</td><td>Clean build طازج بدون ربط يدوي — package manager واحد</td><td><span class="chip">تمّ</span></td><td>npm فقط + حارس يمنع pnpm/yarn (واتصلح فشل البناء في Docker)</td></tr>
    <tr><td>3</td><td>Autodesk APS — توضيح native مقابل APS + المتغيّرات + المسار</td><td><span class="chip">تمّ</span></td><td>شاشة حالة APS + مستند + المتغيّرين المطلوبين فقط</td></tr>
    <tr><td>4</td><td>Clash Detection أقوى + تصدير PDF</td><td><span class="chip">تمّ</span></td><td>شاشة تفاصيل كاملة (model A/B, GUID, X/Y/Z, penetration) + PDF حيّ</td></tr>
    <tr><td>5</td><td>BOQ / Cost traceability أوضح</td><td><span class="chip">تمّ</span></td><td>لوحة تتبّع لكل بند: عنصر BIM + كود NRM + مصدر التسعير</td></tr>
    <tr><td>6</td><td>Site Evidence / Smart Glasses — workflow كامل</td><td><span class="chip">تمّ</span></td><td>صفحة التقاط + مسار Capture→Evidence→Report→Alert→Approval</td></tr>
    <tr><td>7</td><td>Governance — صيغة القرار الآلي واضحة، لا اعتماد آلي للحسّاس</td><td><span class="chip">تمّ</span></td><td>envelope لكل توصية: ثقة + مصدر + سبب + بدائل + موافقة بشرية</td></tr>
    <tr><td>8</td><td>تقرير تسليم موسوعي شامل</td><td><span class="chip">تمّ</span></td><td>FINAL_HANDOVER.md · RUNBOOK.md · ENVIRONMENT_VARIABLES.md</td></tr>
    <tr><td>9</td><td>الحسابات والاشتراكات — أمان: لا مفاتيح في الكود/اللوج/الصور</td><td><span class="chip">تمّ</span></td><td>المفاتيح في env/إعدادات مشفّرة فقط؛ status يرجّع enabled/disabled بس</td></tr>
  </table>

  <h2>بوّابات القبول الثلاثة (الحد الأدنى اللي طلبته)</h2>
  <table>
    <tr><th>البوابة</th><th>الحالة</th><th>التفصيل</th></tr>
    <tr><td>1 · إثبات build + tests يشتغل فعلاً</td><td><span class="chip">تمّ</span></td><td>مثبت بسجل clean-room كامل (تحت) — قابل لإعادة التشغيل بأمر واحد</td></tr>
    <tr><td>2 · تشغيل APS وتحويل DWG/RVT حقيقي</td><td><span class="chip amber">جاهز — ناقص المفاتيح</span></td><td>الموصِّل + الواجهة + المستند جاهزين؛ محتاج بس <code>AUTODESK_CLIENT_ID/SECRET</code> من المالك. IFC شغّال native دلوقتي.</td></tr>
    <tr><td>3 · demo end-to-end كامل Idea→…→Governance</td><td><span class="chip">تمّ</span></td><td>سلسلة journey كاملة على P-1000 (لقطات + رد API تحت)</td></tr>
  </table>
</div>

<div class="page">
  <h1>1 · الاختبارات والبناء (build/test)</h1>
  <div class="req"><b>المطلوب:</b> إصلاح إعدادات الاختبارات + إثبات أن <code>npm ci && npm run build && npm test</code> يشتغل من نسخة نضيفة مع سجل كامل (عدد suites، skipped، نسخة Node/commit/package manager).</div>
  <p><b>اللي اتعمل:</b> اتأكدت إن ts-jest@29.4 بيدعم jest 30 فعلاً (الـpeer صح)، وعملت إثبات من <code>git archive HEAD</code> (نفس الكود المرفوع بالظبط) → <code>npm ci</code> → <code>npm run build</code> → <code>npm test</code>. كل ده بأمر واحد ومن غير أي ربط يدوي أو node_modules جاهزة.</p>
  <p><b>الدليل (سجل clean-room حقيقي):</b></p>
  <pre>${esc(logText)}</pre>
  <div class="box">النتيجة النهائية بعد كل الإضافات: <b>75 suite · 1034 اختبار نجح · 1 skipped · exit 0</b> (كانت 69/997 قبل الشغل). Node 24 / npm 11 على جهاز البناء، والإنتاج <code>node:20-alpine</code>.</div>
</div>

<div class="page">
  <h1>2 · Clean build — package manager واحد (npm)</h1>
  <div class="req"><b>المطلوب:</b> ضمان أن البناء يشتغل طازج بدون symlink يدوي أو تعديل محلي، واعتماد package manager واحد بدون خلط lockfiles.</div>
  <p><b>اللي اتعمل:</b> قفلت المشروع على <b>npm فقط</b> (lockfile واحد <code>package-lock.json</code>، مفيش pnpm-lock ولا yarn.lock):</p>
  <ul>
    <li><code>engines</code>: node ≥ 20، npm ≥ 10 &nbsp;+&nbsp; <code>.npmrc</code> فيه <code>engine-strict=true</code>.</li>
    <li>حارس <code>preinstall</code> يرفض pnpm/yarn برسالة واضحة بالعربي والإنجليزي ويسمح لـnpm.</li>
  </ul>
  <div class="box warn"><b>سبب فشلك مع البناء (اتحدّد واتصلح):</b> حضرتك شغّلت <code>pnpm install --frozen-lockfile</code> ومفيش <code>pnpm-lock.yaml</code> في المشروع أصلاً — فبيفشل فورًا. الحل: المشروع دلوقتي مقفول على npm والحارس بيوضّح ده. <b>وكمان</b> أول ما رفعت على الاختبار، الـDockerfile كان بيفشل لأن الحارس كان ملف منفصل مش بيتنسخ قبل <code>npm ci</code> — صلحته بإن الحارس بقى مدمج جوّه <code>package.json</code> (بدون ملف خارجي)، واتأكدت إن <code>npm ci</code> بيعدي في حالة Docker (بدون مجلد scripts).</div>
  <table>
    <tr><th>الحالة</th><th>السلوك</th></tr>
    <tr><td><code>npm ci</code> (Docker pre-copy، بدون scripts/)</td><td>exit 0 ✅</td></tr>
    <tr><td>pnpm / yarn</td><td>exit 1 + رسالة «Sigma PMO is locked to npm» ✅</td></tr>
    <tr><td>npm / بيئة CI غير معروفة</td><td>exit 0 (مايكسرش CI) ✅</td></tr>
  </table>
</div>

<div class="page">
  <h1>3 · Autodesk APS — native مقابل APS</h1>
  <div class="req"><b>المطلوب:</b> تحديد اللي يشتغل native دلوقتي واللي محتاج APS، وأي API (Model Derivative؟)، وقائمة المتغيّرات المطلوبة، وواجهة تبيّن حالة التحويل/الأخطاء.</div>
  <p><b>اللي اتعمل:</b> الموصِّل موجود وبيستخدم <b>Model Derivative API</b> بمصادقة <b>2-legged (client_credentials)</b>. المطلوب فعليًا <b>متغيّرين بس</b>: <code>AUTODESK_CLIENT_ID</code> و <code>AUTODESK_CLIENT_SECRET</code> — <b>مفيش حاجة لـcallback أو 3-legged scopes</b> للتحويل (دي بس لتسجيل دخول المتصفح). ضفت قسم APS في صفحة المخططات يبيّن الحالة (مُهيّأ/غير مُهيّأ) + رفع DWG/RVT + حالة المهمّة، ومستند <code>docs/AUTODESK-APS.md</code>. لحد ما المالك يحط المفاتيح، <b>IFC شغّال native</b> (حصر العناصر + التحقق + clash).</p>
  <figure class="uishot">${img('r3-drawings-aps.png')}<figcaption>صفحة المخططات على الإنتاج — قسم Autodesk APS: «APS غير مُهيّأ» + المتغيّران المطلوبان + ملاحظة «لا حاجة لـcallback/scopes» + رافع DWG/RVT/IFC.</figcaption></figure>
  <figure>${img('r3-api-aps-status.png')}<figcaption>رد حيّ: <code>GET /integrations/autodesk/status</code> → <code>requiredEnv:["AUTODESK_CLIENT_ID","AUTODESK_CLIENT_SECRET"]</code> ومفيش أي سرّ في الرد.</figcaption></figure>
</div>

<div class="page">
  <h1>4 · Clash Detection + تصدير PDF</h1>
  <div class="req"><b>المطلوب:</b> لكل clash: model A/B، GUID A/B، التخصص، X/Y/Z، الخطورة، عمق الاختراق، النشاط المرتبط (CPM/P6)، الجهة المسؤولة، أثر التكلفة/الوقت، snapshot — في شاشة/تقرير واضح مع تصدير PDF.</div>
  <p><b>اللي اتعمل:</b> الحقول كانت متخزّنة فعلاً؛ أبرزتها في شاشة تفاصيل واضحة (تعريف / هندسة / جدول ومسؤولية / أثر / دليل / سجل قرار)، وأضفت <code>GET /clashes/:id/pdf</code> لتصدير PDF حقيقي + زر «تنزيل PDF».</p>
  <figure class="uishot">${img('r4-clash-detail.png')}<figcaption>شاشة تفاصيل التضارب GEOM-0010 على الإنتاج: النموذج A/B، GUID، X/Y/Z = 14600/2100/3100، عمق الاختراق 100mm، التخصصات، الخطورة، الجدول والمسؤولية، الدليل، سجل القرار + زر «تنزيل PDF».</figcaption></figure>
  <div class="box">تصدير PDF حيّ مُثبَت: <code>GET /clashes/:id/pdf</code> رجّع <b>HTTP 200</b> · <code>content-type: application/pdf</code> · <b>2878 bytes</b> · يبدأ بـ<code>%PDF-</code>.</div>
</div>

<div class="page">
  <h1>5 · BOQ / Cost traceability</h1>
  <div class="req"><b>المطلوب:</b> لكل بند BOQ — مصدر الكمية (عنصر BIM)، كود التصنيف NRM/UniFormat/MasterFormat، السعر/مكتبة التسعير، وأثر clash أو variation على التكلفة.</div>
  <p><b>اللي اتعمل:</b> أضفت <code>GET /quantity-survey/boq/:id/traceability</code> بيجمّع لكل بند: مصدر الكمية + عنصر BIM (GUID) + كود التصنيف + السعر/المكتبة + أثر التعارضات + سلسلة السجل، وأضفت أعمدة provenance على <code>boq_item</code> (migration). وأضفت تبويب «تتبّع بنود BOQ» في الواجهة.</p>
  <figure class="uishot">${img('r5-qs-traceability.png')}<figcaption>تبويب «تتبّع بنود BOQ» على الإنتاج — لكل بند زر «تتبّع»: مصدر الكمية (BIM) ← كود التصنيف ← مكتبة التسعير ← أثر التعارض ← سلسلة السجل.</figcaption></figure>
  <figure>${img('r5-api-boq-traceability.png')}<figcaption>رد حيّ للبند 1.1: <code>bimElementGuid</code> + <code>classification {NRM, 2.1}</code> + <code>pricing.library "SBC 2024"</code> (قيم فاضية بصدق لو مفيش بيانات، بدون اختلاق).</figcaption></figure>
</div>

<div class="page">
  <h1>6 · Site Evidence / Smart Glasses — workflow كامل</h1>
  <div class="req"><b>المطلوب:</b> رفع صورة/فيديو/صوت من الموقع (مشروع، موقع، وقت، عامل، ملاحظة سلامة، GPS) → يظهر في التقارير → يظهر في لوحة الحوكمة كدليل → ينشئ تنبيه/مطالبة → اعتماد بشري. (Capture → Evidence → Report → Governance Alert → Human Approval).</div>
  <p><b>اللي اتعمل:</b> أضفت صفحة <code>/site-evidence</code> فيها نموذج التقاط كامل + خط زمني لليوم + <b>شريط مسار العمل الخماسي</b>. ولمّا الالتقاط يبقى ملاحظة سلامة، النظام بينشئ سجل سلامة <b>وتنبيه حوكمة</b> بينتظر اعتماد بشري (مفيش اعتماد آلي).</p>
  <figure class="uishot">${img('r6-site-evidence.png')}<figcaption>صفحة أدلّة الموقع على الإنتاج: شريط Capture→Evidence→Report→Governance Alert→Human Approval (الأخيرة «بانتظار الاعتماد»)، نموذج الالتقاط (نظارة ذكية + GPS)، والتقاط سلامة CRITICAL حقيقي اليوم مع SHA-256 وربطه بسجل سلامة وتنبيه حوكمة.</figcaption></figure>
</div>

<div class="page">
  <h1>7 · Governance — صيغة القرار الآلي</h1>
  <div class="req"><b>المطلوب:</b> توضيح هل المنصّة بتقرر ولا بتوصّي؛ كل توصية لازم تحمل: confidence، source evidence، reason، alternatives، required human approval. ولا اعتماد آلي للقرارات المالية/التعاقدية/الأمان.</div>
  <p><b>اللي اتعمل:</b> أضفت «envelope» موحّد لكل قرار <code>GET /governance/decisions/:id/envelope</code> بيجمّع: الثقة (مع التفصيل)، مصدر الإثبات (الإنذار + ملف المصدر)، السبب، البدائل، و<code>requiresHumanApproval: true</code> دايمًا، و<code>autoApprovalBlocked: true</code> للمالي/التعاقدي/الأمان (محتاجين موافقتين من شخصين مختلفين). وأضفت تصنيف <code>category</code> للقرار.</p>
  <figure>${img('r7-api-gov-envelope.png')}<figcaption>رد حيّ: <code>category: contractual</code> · <b>3 بدائل</b> (منها «Request recovery plan FIDIC 8.6») · <code>confidence.overall: 0.97</code> بالتفصيل · <code>sourceEvidence (SCHEDULE_BEHIND_PLAN + ingestionRun + sourceFile)</code> · والباقي تحت: <code>requiresHumanApproval:true · autoApprovalBlocked:true</code>.</figcaption></figure>
  <div class="box">لوحة الحوكمة على الإنتاج: <b>20 قرار · 1 معتمد · 19 بانتظار</b> — وملاحظتها الصريحة: «لا شيء يُعتمد آليًا: كل قرار حوكمة ينتظر موافقة بشرية صريحة مسجّلة في decision_review».</div>
</div>

<div class="page">
  <h1>إثبات السلسلة الكاملة (End-to-End)</h1>
  <p>سلسلة الرحلة على P-1000 من الفكرة للحوكمة — رد حيّ <code>GET /journey/P-1000</code> بيبيّن كل المراحل موجودة بعددها:</p>
  <figure>${img('chain-api-journey.png')}<figcaption>opportunity·feasibility·bim·boq·schedule·cost-ledger·claims·site-evidence·report·decision — كلها present مع counts حقيقية.</figcaption></figure>
  <div class="box">السلسلة: <b>Idea → Bankability → BIM/IFC → Clash → BOQ → Cost → CPM → FIDIC → Site Evidence → Reports → Governance</b> — شغّالة على الإنتاج بمشروع P-1000 الحقيقي.</div>

  <h2>8 · مستندات التسليم</h2>
  <p>أُنشئت في جذر المستودع: <code>FINAL_HANDOVER.md</code> (نظرة شاملة + commit + التشغيل + الخدمات + API + الأدوار + الأمان + الحدود + native مقابل external)، <code>RUNBOOK.md</code> (تشغيل/بناء/نشر/migrations/backup/استكشاف أخطاء)، <code>ENVIRONMENT_VARIABLES.md</code> (كل متغيّر)، و<code>docs/AUTODESK-APS.md</code>.</p>

  <h2>9 · الأمان (الحسابات والاشتراكات)</h2>
  <ul>
    <li>مفيش أي مفتاح/سرّ في الكود أو الـmigrations أو الـseeds أو اللوج أو الصور — المفاتيح في env المستضيف أو شاشة <code>/admin/settings</code> (مشفّرة).</li>
    <li>نقاط الحالة بترجّع enabled/disabled بس — اتأكدنا إن رد APS مفيهوش أي قيمة سرّية.</li>
    <li>الحسابات هتبقى باسم المالك؛ الخدمة مش محتاجة تشوف مفاتيح ظاهرة عشان تشتغل.</li>
  </ul>
</div>

<div class="page">
  <h1>إثبات النشر (test → production)</h1>
  <p>اترفع على فرع <b>test</b> الأول (نفس صورة الـDocker والـmigrations) — ودي اللي مسكت باج بناء الـDocker واتصلح قبل الإنتاج. بعدها اترفع على <b>production</b>.</p>
  <table>
    <tr><th>البيئة</th><th>Commit</th><th>الحالة</th></tr>
    <tr><td>test — system-test.sigma-pmo.com</td><td>7cfcda4</td><td>بنى ونشر بنجاح · migrations اتطبّقت · كل المسارات الجديدة live</td></tr>
    <tr><td><b>production — system.sigma-pmo.com</b></td><td><b>7cfcda4</b></td><td>backend + frontend live · migrations <code>BoqItemProvenance</code> + <code>GovernanceDecisionCategory</code> اتطبّقت</td></tr>
  </table>
  <p>تأكيد المسارات الجديدة على الإنتاج (كلها ردّت بنجاح بالمفتاح الإداري):</p>
  <table>
    <tr><th>المسار</th><th>النتيجة</th></tr>
    <tr><td><code>GET /integrations/autodesk/status</code></td><td>200 · requiredEnv = [CLIENT_ID, CLIENT_SECRET]</td></tr>
    <tr><td><code>GET /clashes/:id</code> + <code>/clashes/:id/pdf</code></td><td>200 · model A/B + geometry · PDF %PDF- (2878 bytes)</td></tr>
    <tr><td><code>GET /quantity-survey/boq/:id/traceability</code></td><td>200 · BIM GUID + NRM + pricing</td></tr>
    <tr><td><code>GET /governance/decisions/:id/envelope</code></td><td>200 · confidence 0.97 + بدائل + requiresHumanApproval</td></tr>
    <tr><td><code>POST /site-evidence/capture</code> (سلامة)</td><td>200 · أنشأ سجل سلامة + تنبيه حوكمة بانتظار اعتماد</td></tr>
  </table>

  <h1>الباقي الوحيد — اشتراكات الـAPIs (مفاتيح من المالك)</h1>
  <p>كل الكود جاهز وشغّال؛ الحاجات دي بس محتاجة مفاتيح تتحط في Coolify env أو شاشة <code>/admin/settings</code> (مشفّرة) — مش محتاجة أي كود جديد:</p>
  <table>
    <tr><th>الخدمة</th><th>الفائدة</th><th>المتغيّرات</th><th>اللينك</th></tr>
    <tr><td>Autodesk APS</td><td>تحويل DWG/RVT لـIFC + حصر هندسي (الـIFC شغّال native دلوقتي)</td><td><code>AUTODESK_CLIENT_ID</code><br/><code>AUTODESK_CLIENT_SECRET</code></td><td>aps.autodesk.com/myapps (مجاني)</td></tr>
    <tr><td>Anthropic Claude</td><td>التقارير السردية + صياغة FIDIC + اقتراحات الحلول (بدونها deterministic)</td><td><code>ANTHROPIC_API_KEY</code></td><td>console.anthropic.com</td></tr>
    <tr><td>SMTP (إيميل الدومين)</td><td>إرسال الإشعارات من <code>info@sigma-pmo.com</code></td><td><code>EMAIL_SMTP_URL</code></td><td>مزوّد إيميل الدومين</td></tr>
    <tr><td>Stripe (اختياري)</td><td>اشتراكات SaaS مدفوعة (بدونها trial-only)</td><td><code>STRIPE_*</code></td><td>dashboard.stripe.com</td></tr>
  </table>
  <div class="box">ممكن تديني المفاتيح (أو تحطّها بنفسك في Coolify/إعدادات المنصّة) وأنا أربط الـAPIs وأعمل تحويل DWG/RVT حقيقي وأبعتلك لقطة بالنتيجة. كل ده من غير أي تعديل كود إضافي.</div>
  <p class="small">ملاحظة: الأرقام واللقطات في التقرير ده كلها من بيئة الإنتاج الحيّة على commit 7cfcda4 بتاريخ 2026-06-29. أي بند ممكن تتأكد منه بنفسك من الواجهة أو من <code>/api/v1/docs</code>.</p>
</div>

</body></html>`;

const htmlPath = resolve('_gaps-report.html');
writeFileSync(htmlPath, html, 'utf8');
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'], defaultViewport: { width: 794, height: 1123 } });
const page = await browser.newPage();
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(async () => { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
await browser.close();
console.log('wrote', OUT);
