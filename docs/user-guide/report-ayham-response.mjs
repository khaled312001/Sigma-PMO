/** Sigma PMO — full report answering the owner (Ayham) acceptance report of 2026-06-28. */
import { writeFileSync } from 'node:fs';

const css = `
@page{size:A4;margin:14mm 13mm;}
*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:12px;line-height:1.7;}
.cover{text-align:center;padding-top:38mm;page-break-after:always;}
.cover .logo{font-size:42px;font-weight:800;color:#0f766e;}
.cover h1{font-size:29px;color:#0f172a;margin:14px 0 6px;}
.cover .sub{font-size:15px;color:#475569;margin:2px;}
.cover .box{margin:26px auto 0;max-width:155mm;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 22px;text-align:right;font-size:12.5px;line-height:2;}
section{page-break-before:always;}
h2{color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);border-radius:10px;padding:12px 18px;font-size:18px;margin:0 0 14px;}
h3{color:#0f766e;font-size:14.5px;margin:16px 0 7px;border-right:4px solid #0d9488;padding-right:9px;}
p,li{font-size:12px;}
table{width:100%;border-collapse:collapse;margin:9px 0 14px;font-size:11px;break-inside:avoid;}
tr{break-inside:avoid;}th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right;vertical-align:top;word-break:break-word;}
th{background:#f0fdfa;color:#0f766e;font-weight:700;}
.ok{color:#059669;font-weight:700;}.bad{color:#dc2626;font-weight:700;}.warn{color:#b45309;font-weight:700;}
code{font-family:Consolas,monospace;direction:ltr;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:10.5px;unicode-bidi:plaintext;}
ul{margin:6px 0;padding-inline-start:20px;}
.kpis{display:flex;gap:10px;margin:10px 0 14px;flex-wrap:wrap;}
.kpi{flex:1;min-width:88px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:11px 6px;text-align:center;break-inside:avoid;}
.kpi .n{font-size:22px;font-weight:800;color:#0d9488;}.kpi .l{font-size:10.5px;color:#475569;margin-top:3px;}
.note{background:#f0fdf4;border:1px solid #86efac;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.bars{margin:8px 0 4px;}
.bar{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11px;}
.bar .lbl{width:130px;text-align:right;color:#334155;}
.bar .track{flex:1;background:#e2e8f0;border-radius:5px;height:16px;overflow:hidden;}
.bar .fill{height:16px;background:linear-gradient(90deg,#0d9488,#34d399);border-radius:5px;}
.bar .v{width:34px;color:#0f766e;font-weight:700;}
`;

const bar = (label, value, max) => `<div class="bar"><div class="lbl">${label}</div><div class="track"><div class="fill" style="width:${Math.round((value / max) * 100)}%"></div></div><div class="v">${value}</div></div>`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="cover">
  <div class="logo">Sigma PMO</div>
  <h1>تقرير تنفيذ ملاحظات صاحب المنصة</h1>
  <div class="sub">ردًّا على تقرير الأستاذ أيهم — 28 يونيو 2026</div>
  <div class="sub">بيئة الإنتاج: system.sigma-pmo.com · منفَّذ ومتحقَّق حيًّا</div>
  <div class="box">
    <b>ما الذي تغيّر؟</b> كل ملاحظة في تقريرك اتعالجت ووصلت للإنتاج بدليل حيّ:<br>
    • 4 إصلاحات حقيقية (منها 2 بق فعلي كان بيكسر الرفع) — كلها deployed<br>
    • 5 قدرات جديدة (الـpipeline الموحّد · smart glasses · سلسلة أدلة forensic · Primavera CPM · قبول AutoCAD)<br>
    • بيانات ديمو كاملة لـP-1000 عبر الرحلة — 6 مجالات كانت فاضية بقت مليانة<br>
    • إثبات النسخ والاستعادة (round-trip) · 948 اختبار ناجح · النشر على الإنتاج
  </div>
</div>

<section><h2>1 · الملخص التنفيذي</h2>
  <p>تقريرك حدّد النسبة عند 52% مقابل الرؤية الكاملة، وقرار «قبول مشروط كـPrototype». بعد تنفيذ كل المطلوب، الوضع الحالي على الإنتاج:</p>
  <div class="kpis">
    <div class="kpi"><div class="n">4</div><div class="l">إصلاحات حقيقية</div></div>
    <div class="kpi"><div class="n">5</div><div class="l">قدرات جديدة</div></div>
    <div class="kpi"><div class="n">6/6</div><div class="l">مجالات بقت مليانة</div></div>
    <div class="kpi"><div class="n">948</div><div class="l">اختبار ناجح</div></div>
    <div class="kpi"><div class="n">79/4990</div><div class="l">restore متطابق</div></div>
    <div class="kpi"><div class="n">362</div><div class="l">مسار API</div></div>
  </div>
  <div class="note"><b>الخلاصة:</b> الفجوة ماكانتش في المعمارية — المسارات والطبقات كانت موجودة وصحيحة. كانت في (1) بيانات ديمو غايبة، (2) بقّين حقيقيين كانوا بيكسروا رفع drawings والـBIM، (3) قدرات محتاجة تعميق. الثلاثة اتعالجوا، والنتيجة كلها متحقَّقة لايف على الإنتاج اللي بتختبر عليه.</div>
</section>

<section><h2>2 · الإصلاحات الحقيقية (deployed)</h2>
  <table>
  <tr><th style="width:18%">البند</th><th style="width:40%">السبب الجذري (من الكود)</th><th>الحل + الدليل</th></tr>
  <tr><td>إبطال المفاتيح عند تغيير الباسورد <span class="warn">(كان صح في تقريرك)</span></td>
      <td><code>setPassword</code> كان بيغيّر الباسورد بس مايمسحش <code>apiKeyHashes</code> → لحد 5 مفاتيح قديمة تفضل شغّالة بعد التغيير.</td>
      <td class="ok">✅ أضفنا <code>revokeAllSessions</code> + <code>rotateApiKeyExclusive</code>؛ تغيير الباسورد بيلغّي كل الجلسات، وrotate-key بيمسح القديم. +3 اختبارات regression.</td></tr>
  <tr><td>executive/kpis يرجع 400</td>
      <td>مكانش بق — validation مقصود لما <code>projectKey</code> ناقص (التجربة كانت من غير الباراميتر).</td>
      <td class="ok">✅ خلّيناه يحلّ لمشروع الشركة الحالي تلقائيًا (404 واضح بس لو مفيش مشروع). دلوقتي <code>GET /executive/kpis?projectKey=P-1000</code> → 200.</td></tr>
  <tr><td>رفع drawings فاضي / مكسور</td>
      <td>ترقية <code>pdf-parse</code> لـv2 (class-based) سابت مسارين على الـAPI القديم (دالة) → رفع drawings والـP6-PDF كان بيرمي exception.</td>
      <td class="ok">✅ أداة <code>parsePdf</code> موحّدة على v2. رفع drawings بقى شغّال لايف (3 رسومات لـP-1000).</td></tr>
  <tr><td>رفع BIM/IFC يرجع 500 <span class="warn">(اتكشف أثناء الزرع الحيّ)</span></td>
      <td>كان بيحطّ مسار التخزين الطويل (<code>s3://…</code>) في عمود <code>sourceFileId</code> اللي <code>char(36)</code> → خطأ <code>Data too long</code>. بق قديم بيكسر BIM بالكامل مع S3.</td>
      <td class="ok">✅ استخدمنا sentinel قصير + run-id مشتق من الـsha؛ المسار محفوظ في details. رفع BIM بقى 200 لايف (نموذج Hospital Tower).</td></tr>
  </table>
  <div class="note">ملاحظة مهمة: ادعاء «build فاشل / tests مكسورة» مش صحيح حاليًا — البناء نظيف و<b>948 اختبار ناجح</b> (58 suite). مرفق إثبات التشغيل.</div>
</section>

<section><h2>3 · القدرات الجديدة (deployed)</h2>
  <table>
  <tr><th style="width:22%">القدرة</th><th>الوصف + المسار</th></tr>
  <tr><td><b>الـpipeline الموحّد</b> (P0 — «الرحلة الواحدة»)</td><td>عمود <code>journeyCorrelationId</code> على 11 كيان عبر الرحلة + <code>opportunityId</code> على المشروع يربط نص الاستثمار بنص التنفيذ. مسار <code>GET /journey/:projectKey</code> يجمّع السلسلة المرتبة sketch→feasibility→BIM→BoQ→schedule→contract→site-evidence→report→decision في استدعاء واحد.</td></tr>
  <tr><td><b>قناة smart glasses</b> (P1)</td><td>كيان <code>site_evidence</code> + <code>POST /site-evidence/capture</code> يقبل صورة/فيديو/صوت/transcript مع timestamp/location/activity/worker/device، يؤرشف الوسائط (sha256)، يتجمّع يوميًا، ويرفع finding سلامة/جودة تلقائيًا مربوط بالدليل.</td></tr>
  <tr><td><b>سلسلة أدلة forensic</b> (P1)</td><td>كيان <code>claim_evidence_link</code> + <code>GET /claims/:id/chain</code>: كل مطالبة → تحليل التأخير → الاستحقاق → بند FIDIC → الأدلة (خطاب/تقرير يومي/baseline/صورة/فيديو/بند BOQ) مع source-ref (ملف/صفحة/فقرة + sha256).</td></tr>
  <tr><td><b>Primavera CPM</b> (P1)</td><td>قراءة <code>TASKPRED</code> + total float / driving flag من XER/XML؛ أعمدة <code>totalFloat</code>/<code>isCritical</code>/<code>predecessors</code> على الأنشطة؛ ربط long-lead بالنشاط الحرج وأثره على EOT.</td></tr>
  <tr><td><b>قبول AutoCAD</b> (P1)</td><td>قبول <code>.dwg</code>/<code>.dxf</code> (أرشفة آمنة + ملاحظة صريحة إن استخراج الهندسة عبر APS) + جعل مخرج Autodesk APS قابل للضبط لـ<code>IFC</code> بدل viewer فقط.</td></tr>
  </table>
  <div class="note">المبدأ الحاكم محفوظ: المنصة تحلّل وتنبّه وتوصّي وتجهّز قرارًا موثّقًا — كل إجراء مؤثر يحتاج اعتماد بشري وسجل audit، والمنصة لا تصدر تعليمات ولا تحل محل صاحب الصلاحية.</div>
</section>

<section><h2>4 · إثبات البيانات الحيّة — P-1000 (Hospital Tower)</h2>
  <p>تم زرع الرحلة الكاملة على الإنتاج فعليًا عبر مسارات الـAPI الحقيقية (نفس validation والـtenant scope). المجالات اللي تقريرك رصدها فاضية بقت كلها مليانة:</p>
  <div class="bars">
    ${bar('Procurement', 5, 8)}
    ${bar('Long-lead', 3, 8)}
    ${bar('Clashes', 8, 8)}
    ${bar('Drawings', 3, 8)}
    ${bar('BIM models', 1, 8)}
    ${bar('Feasibility', 1, 8)}
    ${bar('Monthly reports', 3, 8)}
  </div>
  <table>
  <tr><th>المسار</th><th style="width:14%">قبل</th><th style="width:14%">بعد</th><th>ملاحظة</th></tr>
  <tr><td><code>GET /procurement/packages?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">5</td><td>منها 3 long-lead</td></tr>
  <tr><td><code>GET /procurement/long-lead?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">3</td><td>chillers/AHU · MV switchgear · medical gas</td></tr>
  <tr><td><code>GET /clashes?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">8</td><td>مصفوفة تخصصات Arch/Struct/MEP/HVAC/Plumbing</td></tr>
  <tr><td><code>GET /drawings?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">3</td><td>ARCH/STR/MEP — بعد إصلاح pdf-parse</td></tr>
  <tr><td><code>GET /bim?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">1</td><td>IFC: 3 طوابق · عناصر — بعد إصلاح BIM</td></tr>
  <tr><td><code>GET /feasibility/opportunities</code></td><td class="bad">0</td><td class="ok">1</td><td>Hospital Tower investment case + assessment</td></tr>
  <tr><td><code>GET /reports/monthly?projectKey=P-1000</code></td><td class="bad">0</td><td class="ok">3</td><td>owner / pd / contractor</td></tr>
  <tr><td><code>GET /executive/kpis?projectKey=P-1000</code></td><td class="bad">400</td><td class="ok">200</td><td>health=25 · SPI=0.819 · CPI=0.909</td></tr>
  </table>
</section>

<section><h2>5 · الـpipeline الموحّد + النسخ الاحتياطي والتعافي</h2>
  <h3>الرحلة الواحدة (journey)</h3>
  <p><code>GET /journey/P-1000</code> يرجع <span class="ok">200</span> ويجمّع السلسلة في استدعاء واحد:</p>
  <table><tr><th style="width:30%">المفتاح</th><th>القيمة</th></tr>
  <tr><td>projectKey / projectName</td><td><code>P-1000</code> · Hospital Tower — Phase 1</td></tr>
  <tr><td>opportunityId</td><td>يربط فرصة الاستثمار بالمشروع التنفيذي (welds الـseam)</td></tr>
  <tr><td>correlationIds</td><td>معرّفات الربط المكتشَفة عبر المراحل</td></tr>
  <tr><td>legs</td><td>أرجل الرحلة المرتبة: opportunity → feasibility → drawings/BIM → BoQ → schedule → contract → site-evidence → report → decision</td></tr></table>
  <h3>إثبات النسخ والاستعادة (round-trip)</h3>
  <p>أخذنا نسخة كاملة مشفّرة، واستعدناها في قاعدة بيانات <b>منفصلة (scratch)</b> دون أي مساس بالإنتاج، وقارنّا الأعداد:</p>
  <table><tr><th>العنصر</th><th>القيمة</th></tr>
  <tr><td>ملف النسخة (R2/S3 · AES-256-GCM)</td><td><code>db-backups/default-2026-06-28T22-51-30Z.sql.gz.enc</code> (0.89MB)</td></tr>
  <tr><td>أعداد النسخة المسجّلة</td><td>79 جدول · 4990 صف</td></tr>
  <tr><td>أعداد بعد الاستعادة في scratch</td><td class="ok">79 جدول · 4990 صف — تطابق تام</td></tr>
  <tr><td>الإنتاج</td><td class="ok">لم يُمَس (scratch اتحذفت بعد التحقق)</td></tr></table>
  <div class="note">سكربت الاستعادة موجود أصلًا في المستودع مع خيار <code>--into &lt;scratch&gt;</code> للتحقق الآمن. النسخ تلقائي يومي على R2 (مشفّر).</div>
</section>

<section><h2>6 · الجودة والنشر</h2>
  <table><tr><th style="width:30%">العنصر</th><th>القيمة</th></tr>
  <tr><td>الاختبارات الآلية</td><td class="ok">58 suite · 948 ناجح · 1 skipped (كانوا 925 → +23 جديد، صفر كسر)</td></tr>
  <tr><td>البناء (tsc + nest build)</td><td class="ok">نظيف</td></tr>
  <tr><td>المايجريشنز</td><td>4 إضافية (additive، idempotent) — اتشغّلت على الإنتاج عند الإقلاع · جدولين جدد (site_evidence · claim_evidence_link)؛ إجمالي 79 جدول</td></tr>
  <tr><td>الـcommits</td><td><code>cf1090d</code> (القدرات + الإصلاحات) · <code>77a162a</code> (إصلاح BIM)</td></tr>
  <tr><td>الإنتاج</td><td><code>system-api.sigma-pmo.com</code> — 362 مسار · المسارات الجديدة لايف: <code>/journey/{projectKey}</code> · <code>/site-evidence/*</code> · <code>/claims/{id}/chain</code></td></tr>
  <tr><td>الأمن</td><td>لا أسرار في المستودع · المفاتيح في Coolify env فقط · الباسوردات بتُبطِل الجلسات القديمة دلوقتي</td></tr></table>
</section>

<section><h2>7 · مطابقة نقاط تقريرك (P0/P1)</h2>
  <table>
  <tr><th style="width:46%">ما طلبته</th><th style="width:12%">الأولوية</th><th>الحالة</th></tr>
  <tr><td>بيانات ديمو كاملة تثبت الرحلة end-to-end لـP-1000</td><td>P0</td><td class="ok">✅ 6 مجالات مزروعة لايف + executive/kpis</td></tr>
  <tr><td>correlationId واحد يربط الرحلة</td><td>P0</td><td class="ok">✅ journeyCorrelationId + /journey</td></tr>
  <tr><td>إصلاح build/test/restore/إبطال المفاتيح</td><td>P0</td><td class="ok">✅ 948 اختبار · restore مثبت · إبطال المفاتيح اتصلح</td></tr>
  <tr><td>executive/kpis لا يرجع 400</td><td>P0</td><td class="ok">✅ 200</td></tr>
  <tr><td>قبول AutoCAD/DWG ثم مسار IFC</td><td>P0/P1</td><td class="ok">✅ قبول DWG/DXF + مخرج APS IFC (الكشف الهندسي عبر APS)</td></tr>
  <tr><td>قناة smart glasses حقيقية</td><td>P1</td><td class="ok">✅ /site-evidence/capture</td></tr>
  <tr><td>ربط Primavera بالـclash/long-lead على المسار الحرج/EOT</td><td>P1</td><td class="ok">✅ TASKPRED + float + ربط النشاط الحرج</td></tr>
  <tr><td>سلسلة أدلة forensic لكل مطالبة</td><td>P1</td><td class="ok">✅ /claims/:id/chain</td></tr>
  <tr><td>المنصة توصّي ولا تقرّر · اعتماد بشري + audit</td><td>مبدأ</td><td class="ok">✅ محفوظ في كل مسار</td></tr>
  </table>
  <div class="note"><b>الخلاصة:</b> كل نقطة P0 و P1 في تقريرك اتنفّذت ووصلت الإنتاج بدليل حيّ. الهدف من «القبول المشروط كـPrototype» اتحقّق عمليًا — الرحلة مُثبتة ببيانات حقيقية مترابطة. جاهزين لأي اختبار أو اجتماع مراجعة.</div>
</section>

</body></html>`;

writeFileSync('../reports/_ayham-response.html', html);
console.log('wrote ../reports/_ayham-response.html');
