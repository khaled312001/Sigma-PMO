/** Sigma PMO — full combined report: response to Mr. Ayham (all updates, live-proven) + subscriptions needed for the rest. */
import { writeFileSync } from 'node:fs';

const css = `
@page{size:A4;margin:14mm 13mm;}
*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:12px;line-height:1.7;}
.cover{text-align:center;padding-top:36mm;page-break-after:always;}
.cover .logo{font-size:42px;font-weight:800;color:#0f766e;}
.cover h1{font-size:27px;color:#0f172a;margin:14px 0 6px;}
.cover .sub{font-size:14.5px;color:#475569;margin:2px;}
.cover .box{margin:24px auto 0;max-width:158mm;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 22px;text-align:right;font-size:12.5px;line-height:1.95;}
section{page-break-before:always;}
h2{color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);border-radius:10px;padding:11px 18px;font-size:17.5px;margin:0 0 13px;}
h3{color:#0f766e;font-size:14px;margin:15px 0 7px;border-right:4px solid #0d9488;padding-right:9px;}
p,li{font-size:12px;}
table{width:100%;border-collapse:collapse;margin:9px 0 13px;font-size:11px;break-inside:avoid;}
tr{break-inside:avoid;}th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right;vertical-align:top;word-break:break-word;}
th{background:#f0fdfa;color:#0f766e;font-weight:700;}
.ok{color:#059669;font-weight:700;}.bad{color:#dc2626;font-weight:700;}.warn{color:#b45309;font-weight:700;}
code{font-family:Consolas,monospace;direction:ltr;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:10.5px;unicode-bidi:plaintext;}
ul{margin:6px 0;padding-inline-start:20px;}
.kpis{display:flex;gap:9px;margin:10px 0 14px;flex-wrap:wrap;}
.kpi{flex:1;min-width:82px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:10px 5px;text-align:center;break-inside:avoid;}
.kpi .n{font-size:20px;font-weight:800;color:#0d9488;}.kpi .l{font-size:10px;color:#475569;margin-top:3px;}
.note{background:#f0fdf4;border:1px solid #86efac;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.warnbox{background:#fffbeb;border:1px solid #fcd34d;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.bar{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11px;}
.bar .lbl{width:128px;text-align:right;color:#334155;}
.bar .track{flex:1;background:#e2e8f0;border-radius:5px;height:15px;overflow:hidden;}
.bar .fill{height:15px;background:linear-gradient(90deg,#0d9488,#34d399);border-radius:5px;}
.bar .v{width:32px;color:#0f766e;font-weight:700;}
.pill{display:inline-block;border-radius:20px;padding:1px 9px;font-size:10px;font-weight:700;}
.pill.have{background:#dcfce7;color:#166534;}.pill.need{background:#fee2e2;color:#991b1b;}.pill.opt{background:#e0e7ff;color:#3730a3;}
`;
const bar = (l, v, max) => `<div class="bar"><div class="lbl">${l}</div><div class="track"><div class="fill" style="width:${Math.round((v / max) * 100)}%"></div></div><div class="v">${v}</div></div>`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="cover">
  <div class="logo">Sigma PMO</div>
  <h1>تقرير شامل — تنفيذ ملاحظات مستر أيهم + الاشتراكات المطلوبة</h1>
  <div class="sub">ردًّا على تقرير 28 يونيو 2026 · بيئة الإنتاج system.sigma-pmo.com</div>
  <div class="sub">كل الأرقام أدناه متحقَّقة حيًّا على الإنتاج</div>
  <div class="box">
    <b>الفهرس:</b><br>
    1. الملخص التنفيذي &nbsp;·&nbsp; 2. الإصلاحات الحقيقية &nbsp;·&nbsp; 3. القدرات الجديدة<br>
    4. إثبات البيانات الحيّة &nbsp;·&nbsp; 5. الـpipeline والنسخ &nbsp;·&nbsp; 6. forensic + CPM + smart glasses (إثبات حيّ)<br>
    7. الجودة والنشر &nbsp;·&nbsp; 8. مطابقة نقاط أيهم &nbsp;·&nbsp; 9. الحالة الصادقة<br>
    10. الاشتراكات المطلوبة لتشغيل الباقي &nbsp;·&nbsp; 11. تفصيل Autodesk APS &nbsp;·&nbsp; 12. الخطوات
  </div>
</div>

<section><h2>1 · الملخص التنفيذي</h2>
  <p>تقريرك حدّد النسبة 52% وقرار «قبول مشروط كـPrototype». بعد التنفيذ الكامل والتحقق الحيّ:</p>
  <div class="kpis">
    <div class="kpi"><div class="n">4</div><div class="l">إصلاحات حقيقية</div></div>
    <div class="kpi"><div class="n">5</div><div class="l">قدرات جديدة</div></div>
    <div class="kpi"><div class="n">6/6</div><div class="l">مجالات مليانة</div></div>
    <div class="kpi"><div class="n">948</div><div class="l">اختبار ناجح</div></div>
    <div class="kpi"><div class="n">79/4990</div><div class="l">restore متطابق</div></div>
    <div class="kpi"><div class="n">15d</div><div class="l">EOT مثبت حيّ</div></div>
    <div class="kpi"><div class="n">362</div><div class="l">مسار API</div></div>
  </div>
  <div class="note"><b>الخلاصة:</b> كل نقاط P0 و P1 في تقريرك اتنفّذت ووصلت الإنتاج بدليل حيّ. القدرة الوحيدة اللي تحتاج طرفًا خارجيًا هي <b>كشف الـclash الهندسي من AutoCAD</b> (تحتاج Autodesk APS — فيها فري للبداية، تفصيلها في §10–11). كل ما عداها شغّال بدون أي اشتراك جديد.</div>
</section>

<section><h2>2 · الإصلاحات الحقيقية (deployed)</h2>
  <table>
  <tr><th style="width:18%">البند</th><th style="width:40%">السبب الجذري</th><th>الحل + الدليل</th></tr>
  <tr><td>إبطال المفاتيح عند تغيير الباسورد <span class="warn">(كان صح)</span></td><td><code>setPassword</code> ما كانش يمسح <code>apiKeyHashes</code> → لحد 5 مفاتيح قديمة تفضل شغّالة.</td><td class="ok">✅ <code>revokeAllSessions</code> + rotate-key حصري + 3 اختبارات</td></tr>
  <tr><td>executive/kpis يرجع 400</td><td>validation مقصود لما projectKey ناقص (مش بق).</td><td class="ok">✅ يحلّ لمشروع الشركة تلقائيًا → 200</td></tr>
  <tr><td>رفع drawings مكسور</td><td>ترقية <code>pdf-parse</code> لـv2 سابت مسارين على API قديم → exception.</td><td class="ok">✅ أداة parsePdf موحّدة — drawings شغّال (3)</td></tr>
  <tr><td>رفع BIM يرجع 500 <span class="warn">(اتكشف أثناء الزرع)</span></td><td>كان يحطّ مسار S3 الطويل في <code>sourceFileId</code> char(36) → Data too long.</td><td class="ok">✅ sentinel قصير — BIM شغّال (1)</td></tr>
  </table>
  <div class="note">ادعاء «build فاشل/tests مكسورة» غير صحيح: البناء نظيف و<b>948 اختبار ناجح</b>.</div>
</section>

<section><h2>3 · القدرات الجديدة (deployed + مثبتة حيّ)</h2>
  <table>
  <tr><th style="width:24%">القدرة</th><th>الوصف + المسار</th><th style="width:13%">الإثبات</th></tr>
  <tr><td>الـpipeline الموحّد (P0)</td><td><code>GET /journey/:projectKey</code> يجمّع opportunity→feasibility→BIM→BoQ→schedule→contract→evidence→report→decision + correlationId مختوم</td><td class="ok">✅ حيّ</td></tr>
  <tr><td>smart glasses (P1)</td><td><code>POST /site-evidence/capture</code> صورة/فيديو/صوت + timestamp/GPS/worker/device → finding تلقائي</td><td class="ok">✅ حيّ</td></tr>
  <tr><td>سلسلة forensic (P1)</td><td><code>GET /claims/:id/chain</code> مطالبة→تأخير→استحقاق→FIDIC→أدلة (صورة/تقرير/BOQ)</td><td class="ok">✅ حيّ</td></tr>
  <tr><td>Primavera CPM (P1)</td><td>قراءة TASKPRED + float؛ clash→نشاط حرج→EOT</td><td class="ok">✅ حيّ</td></tr>
  <tr><td>قبول AutoCAD (P1)</td><td>قبول DWG/DXF (أرشفة) + مخرج APS قابل للضبط لـIFC</td><td class="warn">جزئي*</td></tr>
  </table>
  <p style="font-size:11px">* القبول والأرشفة شغّالين؛ <b>الكشف الهندسي للتعارضات</b> من DWG يحتاج Autodesk APS — التفصيل في §9–11.</p>
</section>

<section><h2>4 · إثبات البيانات الحيّة — P-1000 (Hospital Tower)</h2>
  <p>المجالات اللي رصدها تقريرك فاضية بقت كلها مليانة على الإنتاج عبر مسارات API الحقيقية:</p>
  ${bar('Procurement', 5, 8)}${bar('Long-lead', 3, 8)}${bar('Clashes', 8, 8)}${bar('Drawings', 3, 8)}${bar('BIM models', 1, 8)}${bar('Feasibility', 1, 8)}${bar('Monthly reports', 3, 8)}
  <table>
  <tr><th>المسار</th><th style="width:12%">قبل</th><th style="width:12%">بعد</th><th>ملاحظة</th></tr>
  <tr><td><code>/procurement/packages</code></td><td class="bad">0</td><td class="ok">5</td><td>منها 3 long-lead</td></tr>
  <tr><td><code>/clashes</code></td><td class="bad">0</td><td class="ok">8</td><td>مصفوفة تخصصات</td></tr>
  <tr><td><code>/drawings</code></td><td class="bad">0</td><td class="ok">3</td><td>بعد إصلاح pdf-parse</td></tr>
  <tr><td><code>/bim</code></td><td class="bad">0</td><td class="ok">1</td><td>IFC — بعد إصلاح BIM</td></tr>
  <tr><td><code>/feasibility/opportunities</code></td><td class="bad">0</td><td class="ok">1</td><td>+ assessment</td></tr>
  <tr><td><code>/reports/monthly</code></td><td class="bad">0</td><td class="ok">3</td><td>owner/pd/contractor</td></tr>
  <tr><td><code>/executive/kpis</code></td><td class="bad">400</td><td class="ok">200</td><td>health=25 · SPI=0.819 · CPI=0.909</td></tr>
  </table>
</section>

<section><h2>5 · الـpipeline الموحّد + النسخ والتعافي</h2>
  <h3>الرحلة الواحدة (journey)</h3>
  <p><code>GET /journey/P-1000</code> = <span class="ok">200</span> · opportunityId مربوط · correlationId مختوم <code>1111…555</code> · 13 رِجل مرتبة (opportunity→feasibility→BIM→BoQ→schedule→claims→report→decision).</p>
  <h3>إثبات النسخ والاستعادة (round-trip)</h3>
  <table><tr><th style="width:42%">العنصر</th><th>القيمة</th></tr>
  <tr><td>ملف النسخة (R2 · AES-256-GCM)</td><td><code>default-2026-06-28T22-51-30Z.sql.gz.enc</code></td></tr>
  <tr><td>أعداد النسخة المسجّلة</td><td>79 جدول · 4990 صف</td></tr>
  <tr><td>بعد الاستعادة في DB منفصلة (scratch)</td><td class="ok">79 جدول · 4990 صف — تطابق تام</td></tr>
  <tr><td>الإنتاج</td><td class="ok">لم يُمَس (scratch اتحذفت)</td></tr></table>
</section>

<section><h2>6 · forensic + CPM + smart glasses — الإثبات الحيّ</h2>
  <h3>Primavera CPM: clash → نشاط حرج → EOT</h3>
  <table><tr><th style="width:34%">الخطوة</th><th>النتيجة الحيّة</th></tr>
  <tr><td>الـclash</td><td>C-008 (HVAC duct × RC beam)</td></tr>
  <tr><td>الحل المقترح (option 0)</td><td>إعادة توجيه الدكت — 15 يوم · 120,000 ر.س</td></tr>
  <tr><td>النشاط المتأثر</td><td>A-1002 (Excavation) — <b>حرج</b> (totalFloat=0)</td></tr>
  <tr><td>أثر المسار الحرج</td><td class="ok">finish: 2026-03-15 → 2026-03-30 = <b>15 يوم EOT</b> · criticalPathChanged=true</td></tr></table>
  <h3>سلسلة الأدلة forensic للمطالبة</h3>
  <table><tr><th style="width:34%">العنصر</th><th>المحتوى الحيّ</th></tr>
  <tr><td>المطالبة</td><td>EOT · FIDIC Sub-Clause 8.5 / 20.1</td></tr>
  <tr><td>أرجل الأدلة الموثّقة</td><td class="ok">تقرير يومي(1) · صورة موقع(1) · بند BOQ(1) · بند FIDIC(1)</td></tr></table>
  <h3>smart glasses</h3>
  <p><code>POST /site-evidence/capture</code> = <span class="ok">200</span>: صورة موقع (Level 3 East · GPS · device=smart_glasses) → أُرشفت على S3 + <b>SafetyRecord اتعمل تلقائي</b> ومربوط بالصورة.</p>
</section>

<section><h2>7 · الجودة والنشر</h2>
  <table><tr><th style="width:30%">العنصر</th><th>القيمة</th></tr>
  <tr><td>الاختبارات</td><td class="ok">58 suite · 948 ناجح · 1 skipped (+23 جديد، صفر كسر)</td></tr>
  <tr><td>البناء</td><td class="ok">tsc + nest build نظيف</td></tr>
  <tr><td>المايجريشنز</td><td>4 إضافية idempotent — اتشغّلت على الإنتاج · جدولان جدد · 79 جدول</td></tr>
  <tr><td>الـcommits</td><td><code>cf1090d</code> · <code>77a162a</code> على main (منشورة)</td></tr>
  <tr><td>الإنتاج</td><td>362 مسار · <code>/journey</code> · <code>/site-evidence</code> · <code>/claims/:id/chain</code> لايف</td></tr></table>
</section>

<section><h2>8 · مطابقة نقاط تقريرك (P0/P1)</h2>
  <table>
  <tr><th style="width:52%">ما طلبته</th><th style="width:10%">الأولوية</th><th>الحالة</th></tr>
  <tr><td>بيانات ديمو كاملة تثبت الرحلة لـP-1000</td><td>P0</td><td class="ok">✅ مزروعة حيّ</td></tr>
  <tr><td>correlationId واحد يربط الرحلة</td><td>P0</td><td class="ok">✅ مختوم + journey</td></tr>
  <tr><td>build/test/restore/إبطال المفاتيح</td><td>P0</td><td class="ok">✅ كلها</td></tr>
  <tr><td>executive/kpis لا يرجع 400</td><td>P0</td><td class="ok">✅ 200</td></tr>
  <tr><td>قناة smart glasses</td><td>P1</td><td class="ok">✅ مثبت حيّ</td></tr>
  <tr><td>Primavera: clash/long-lead → مسار حرج → EOT</td><td>P1</td><td class="ok">✅ 15 يوم EOT حيّ</td></tr>
  <tr><td>سلسلة أدلة forensic لكل مطالبة</td><td>P1</td><td class="ok">✅ أدلة موثّقة حيّ</td></tr>
  <tr><td>AutoCAD/DWG → IFC → كشف clash هندسي</td><td>P0/P1</td><td class="warn">⚠️ القبول+IFC ممكن · الكشف الهندسي يحتاج Autodesk APS (§10)</td></tr>
  <tr><td>المنصة توصّي ولا تقرّر · اعتماد بشري + audit</td><td>مبدأ</td><td class="ok">✅ محفوظ</td></tr>
  </table>
</section>

<section><h2>9 · الحالة الصادقة</h2>
  <table>
  <tr><th style="width:22%">الفئة</th><th>البنود</th></tr>
  <tr><td class="ok">شغّال ومثبت حيّ</td><td>6 مجالات داتا · executive/kpis · restore · إبطال المفاتيح · 948 اختبار · journey (مختوم) · smart glasses · forensic chain · Primavera CPM (EOT 15 يوم)</td></tr>
  <tr><td class="warn">يحتاج طرفًا خارجيًا</td><td><b>كشف الـclash الهندسي من AutoCAD</b> — محرك هندسي متخصص (شغل Navisworks/Solibri)؛ يتعمل عبر Autodesk APS/ACC أو برفع تصدير Navisworks (شغّال مجانًا في المنصة دلوقتي)</td></tr>
  </table>
  <div class="warnbox"><b>بصراحة:</b> «بناء محرك كشف clash هندسي من الصفر» غير عملي — مش مسألة كود أكتر، دي خدمة خارجية. الأنسب: نكمل بالخيار المجاني (رفع تصدير Navisworks الشغّال) + نفعّل APS الفري لتحويل/عرض/كميات الموديل.</div>
</section>

<section><h2>10 · الاشتراكات المطلوبة لتشغيل الباقي</h2>
  <table>
  <tr><th style="width:17%">الخدمة</th><th>تفتح إيه</th><th style="width:12%">الحالة</th><th style="width:15%">التكلفة</th><th>المطلوب منك</th></tr>
  <tr><td><b>Autodesk APS</b></td><td>DWG/RVT → IFC + كميات + عرض 3D (والمسار نحو الـclash السحابي)</td><td><span class="pill need">مطلوب</span></td><td>فري للبداية · ~0.5 token/موديل</td><td>App مجاني على <code>aps.autodesk.com</code> + <b>Client ID/Secret</b></td></tr>
  <tr><td><b>مزوّد إيميل</b><br>(Resend/SendGrid/SES)</td><td>إرسال الخطابات FIDIC + التنبيهات + التقارير فعليًا</td><td><span class="pill need">يُنصح</span></td><td>فري tier</td><td>اختيار مزوّد + API key</td></tr>
  <tr><td><b>Anthropic (Claude)</b></td><td>كل تحليلات/تقارير/سرد الـAI</td><td><span class="pill have">عندنا</span></td><td>pay-as-you-go</td><td>لا شيء</td></tr>
  <tr><td><b>Cloudflare R2</b></td><td>تخزين + نسخ مشفّرة</td><td><span class="pill have">مفعّل</span></td><td>رخيص</td><td>لا شيء</td></tr>
  <tr><td><b>Stripe</b></td><td>فوترة اشتراكات الشركات (SaaS)</td><td><span class="pill opt">مدمج</span></td><td>% لكل عملية</td><td>مفاتيح لو هتفعّل البيع</td></tr>
  <tr><td><b>Oracle Primavera Cloud</b></td><td>مزامنة P6 لايف</td><td><span class="pill opt">اختياري</span></td><td>مدفوع</td><td>لا شيء — الرفع شغّال مجانًا</td></tr>
  </table>
  <div class="note"><b>المطلوب منك فعليًا حاجتين بس:</b> (1) مفاتيح <b>Autodesk APS</b> (فري) · (2) اختيار <b>مزوّد إيميل</b>. الباقي موجود أو اختياري.</div>
</section>

<section><h2>11 · تفصيل Autodesk APS + خيارات الـclash</h2>
  <table>
  <tr><th style="width:32%">العنصر</th><th>التفاصيل (نظام ديسمبر 2025)</th></tr>
  <tr><td>مجاني تمامًا</td><td>Authentication · تخزين الموديلات · Viewer · Webhooks</td></tr>
  <tr><td>مجاني بحصة شهرية</td><td>Model Derivative: DWG/RVT → IFC + كميات/خصائص</td></tr>
  <tr><td>بعد الحصة</td><td>~0.5 token/موديل معقّد · حد أدنى 100 token · تنتهي بعد سنة</td></tr>
  <tr><td class="warn">كشف الـclash</td><td>مفيش API مباشر — يتعمل في Navisworks / ACC Model Coordination (مدفوع منفصل)</td></tr>
  </table>
  <h3>خيارات الـclash الهندسي</h3>
  <table><tr><th style="width:38%">الخيار</th><th style="width:24%">التكلفة</th><th>الحالة</th></tr>
  <tr><td>① رفع تصدير Navisworks/Revit (Excel)</td><td class="ok">مجاني</td><td class="ok">✅ شغّال دلوقتي</td></tr>
  <tr><td>② ACC Model Coordination (سحابي تلقائي)</td><td class="bad">مدفوع</td><td>عند الطلب</td></tr>
  <tr><td>③ Design Automation + Navisworks</td><td>2 token/ساعة + رخصة</td><td>للحجم الكبير</td></tr></table>
</section>

<section><h2>12 · الخطوات والخلاصة</h2>
  <table>
  <tr><th style="width:7%">#</th><th>الخطوة</th><th style="width:18%">من</th></tr>
  <tr><td>1</td><td>App مجاني على <code>aps.autodesk.com</code> → <b>Client ID + Secret</b></td><td>أنت (5 دقائق)</td></tr>
  <tr><td>2</td><td>اختيار <b>مزوّد إيميل</b> (Resend الأبسط) → API key</td><td>أنت</td></tr>
  <tr><td>3</td><td>ضبط المفاتيح في Coolify + تفعيل الموصّلات (الكود جاهز)</td><td>أنا</td></tr>
  <tr><td>4</td><td>(اختياري) Stripe للبيع · Primavera Cloud لـP6 لايف</td><td>عند الحاجة</td></tr>
  </table>
  <div class="note"><b>الخلاصة النهائية:</b> كل نقاط تقريرك اتنفّذت ومثبتة حيّ على الإنتاج اللي بتختبر عليه — ماعدا كشف الـclash الهندسي اللي يحتاج Autodesk (فيه حل مجاني شغّال + مسار مدفوع عند الطلب). المنصّة جاهزة وآمنة وقابلة للصيانة. محتاجين منك بس مفاتيح APS (فري) ومزوّد إيميل لإكمال الباقي.</div>
</section>

</body></html>`;

writeFileSync('../reports/_ayham-full.html', html);
console.log('wrote ../reports/_ayham-full.html');
