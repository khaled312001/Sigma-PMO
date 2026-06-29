/** Sigma PMO — subscriptions / external APIs needed to run the remaining capabilities. */
import { writeFileSync } from 'node:fs';

const css = `
@page{size:A4;margin:14mm 13mm;}
*{box-sizing:border-box;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:12px;line-height:1.7;}
.cover{text-align:center;padding-top:40mm;page-break-after:always;}
.cover .logo{font-size:42px;font-weight:800;color:#0f766e;}
.cover h1{font-size:28px;color:#0f172a;margin:14px 0 6px;}
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
.note{background:#f0fdf4;border:1px solid #86efac;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.warnbox{background:#fffbeb;border:1px solid #fcd34d;border-radius:9px;padding:11px 15px;font-size:11.5px;margin:10px 0;break-inside:avoid;}
.pill{display:inline-block;border-radius:20px;padding:1px 9px;font-size:10px;font-weight:700;}
.pill.have{background:#dcfce7;color:#166534;}.pill.need{background:#fee2e2;color:#991b1b;}.pill.opt{background:#e0e7ff;color:#3730a3;}
`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="cover">
  <div class="logo">Sigma PMO</div>
  <h1>الاشتراكات والـAPIs المطلوبة لتشغيل الباقي</h1>
  <div class="sub">تقرير موجز لصاحب المنصة — يونيو 2026</div>
  <div class="box">
    <b>الخلاصة في سطر:</b> معظم المنصة شغّالة فعلًا على الإنتاج <u>بدون أي اشتراك جديد</u>. اللي «باقي» محصور في:<br>
    • قدرة واحدة تحتاج طرفًا خارجيًا: <b>كشف الـclash الهندسي من AutoCAD</b> (Autodesk APS — فيه فري للبداية)<br>
    • <b>مزوّد إيميل</b> (اختياري لكن مهم) عشان الخطابات/التنبيهات تتبعت فعليًا<br>
    • اشتراكات عندنا بالفعل (Anthropic · R2 · Stripe) أو اختيارية (Primavera Cloud)
  </div>
</div>

<section><h2>1 · ما يعمل الآن — بدون أي اشتراك جديد</h2>
  <p>البنود دي كلها منشورة ومتحقَّقة حيًّا على الإنتاج، وما بتحتاجش أي اشتراك إضافي:</p>
  <table>
  <tr><th style="width:34%">القدرة</th><th>الحالة</th></tr>
  <tr><td>الرحلة الكاملة P-1000 (6 مجالات: procurement/clashes/drawings/bim/feasibility/monthly)</td><td class="ok">✅ مزروعة حيّ</td></tr>
  <tr><td>الـpipeline الموحّد <code>/journey/:projectKey</code> (correlationId مختوم + ربط الفرصة)</td><td class="ok">✅ شغّال</td></tr>
  <tr><td>قناة smart glasses <code>/site-evidence/capture</code> (صورة/فيديو/صوت + finding تلقائي)</td><td class="ok">✅ مثبت حيّ</td></tr>
  <tr><td>سلسلة أدلة forensic <code>/claims/:id/chain</code> (صورة/BOQ/تقرير/بند FIDIC)</td><td class="ok">✅ مثبت حيّ</td></tr>
  <tr><td>Primavera CPM (رفع XER/XML + clash → نشاط حرج → EOT)</td><td class="ok">✅ مثبت حيّ (15 يوم EOT)</td></tr>
  <tr><td>executive/kpis · النسخ والتعافي (restore) · إبطال المفاتيح · 948 اختبار</td><td class="ok">✅ شغّال + مثبت</td></tr>
  <tr><td><b>كشف الـclash</b> عبر رفع تصدير Navisworks/Revit (Excel)</td><td class="ok">✅ شغّال — المقاول يطلّعه من أداته ويرفعه</td></tr>
  </table>
  <div class="note"><b>مهم:</b> الذكاء الاصطناعي (التحليلات/التقارير/السرد) شغّال بمفتاح <b>Anthropic Claude</b> موجود عندنا بالفعل — يُحاسب بالاستخدام (pay-as-you-go) ومش محتاج إجراء منك.</div>
</section>

<section><h2>2 · الاشتراكات المطلوبة لتشغيل الباقي</h2>
  <table>
  <tr><th style="width:18%">الخدمة</th><th>تفتح إيه</th><th style="width:13%">الحالة</th><th style="width:16%">التكلفة</th><th>المطلوب منك</th></tr>
  <tr><td><b>Autodesk APS</b></td><td>تحويل DWG/RVT → <b>IFC</b> + استخراج الكميات/العناصر + عرض ثلاثي الأبعاد (والمسار نحو الـclash السحابي)</td><td><span class="pill need">مطلوب</span></td><td>فري للبداية · بعدها ~0.5 token/موديل</td><td>تعمل App مجاني على <code>aps.autodesk.com</code> وتبعت <b>Client ID + Secret</b></td></tr>
  <tr><td><b>مزوّد إيميل</b><br>(Resend / SendGrid / SES)</td><td>إرسال الخطابات FIDIC + التنبيهات + التقارير الشهرية بالإيميل فعليًا</td><td><span class="pill need">يُنصح</span></td><td>فري tier (آلاف رسائل/شهر)</td><td>تختار مزوّد وتبعت API key</td></tr>
  <tr><td><b>Anthropic (Claude)</b></td><td>كل تحليلات وتقارير وسرد الـAI</td><td><span class="pill have">عندنا</span></td><td>pay-as-you-go</td><td>لا شيء (المفتاح مفعّل)</td></tr>
  <tr><td><b>Cloudflare R2</b></td><td>تخزين الملفات + النسخ الاحتياطي المشفّر</td><td><span class="pill have">مفعّل</span></td><td>رخيص جدًا</td><td>لا شيء</td></tr>
  <tr><td><b>Stripe</b></td><td>فوترة اشتراكات الشركات (نموذج SaaS)</td><td><span class="pill opt">مدمج</span></td><td>% لكل عملية</td><td>مفاتيح Stripe لو هتفعّل البيع الفعلي</td></tr>
  <tr><td><b>Oracle Primavera Cloud</b></td><td>مزامنة P6 لايف (بدل رفع ملفات XER/XML)</td><td><span class="pill opt">اختياري</span></td><td>مدفوع (Oracle)</td><td>لا شيء الآن — الرفع شغّال مجانًا</td></tr>
  </table>
  <div class="note"><b>الأساسي المطلوب منك فعليًا:</b> (1) مفاتيح <b>Autodesk APS</b> (فري) · (2) اختيار <b>مزوّد إيميل</b>. الباقي موجود أو اختياري.</div>
</section>

<section><h2>3 · تفصيل Autodesk APS + مسألة الـclash</h2>
  <p>نظام APS الجديد (بدأ 8 ديسمبر 2025) بقى مستويين: <b>Free</b> و <b>Paid (Flex tokens)</b>.</p>
  <table>
  <tr><th style="width:34%">العنصر</th><th>التفاصيل</th></tr>
  <tr><td>مجاني تمامًا</td><td>Authentication · Data Management (تخزين الموديلات) · Viewer · Webhooks</td></tr>
  <tr><td>مجاني بحصة شهرية</td><td><b>Model Derivative</b> (تحويل DWG/RVT → IFC + كميات/خصائص) — حصة شهرية للتجربة والاستخدام الخفيف</td></tr>
  <tr><td>التكلفة بعد الحصة</td><td>~<b>0.5 token</b> للموديل المعقّد (Revit/IFC/Navisworks) · الحد الأدنى للشراء 100 token · تنتهي بعد سنة</td></tr>
  <tr><td>كشف الـclash</td><td class="warn">مفيش API مباشر في APS يكتشف الـclash — الكشف يتعمل في Navisworks / ACC Model Coordination (منتج Autodesk منفصل مدفوع)</td></tr>
  </table>
  <h3>توصيتنا لمسألة الـclash (3 خيارات)</h3>
  <table>
  <tr><th style="width:30%">الخيار</th><th>التكلفة</th><th>الحالة عندنا</th></tr>
  <tr><td>① المقاول يطلّع الـclash من Navisworks/Revit (اللي عنده أصلًا) ويرفع التصدير</td><td class="ok">مجاني</td><td class="ok">✅ شغّال في المنصة دلوقتي</td></tr>
  <tr><td>② Autodesk ACC Model Coordination (clash سحابي تلقائي)</td><td class="bad">مدفوع (منتج منفصل)</td><td>يحتاج اشتراك ACC</td></tr>
  <tr><td>③ Design Automation + Navisworks (تشغيل الكشف بالـtokens)</td><td>2 token/ساعة + رخصة Navisworks</td><td>للحجم الكبير لاحقًا</td></tr>
  </table>
  <div class="warnbox"><b>الصراحة:</b> «بناء محرك كشف clash هندسي من الصفر» غير عملي — ده شغل Navisworks/Solibri المتخصص. الأنسب: الخيار ① (مجاني، شغّال)، ونضيف APS الفري لتحويل/عرض/كميات الموديل. لو في طلب فعلي للـclash السحابي التلقائي، نروح للخيار ②.</div>
</section>

<section><h2>4 · الخطوات العملية + الأولويات</h2>
  <table>
  <tr><th style="width:8%">#</th><th>الخطوة</th><th style="width:18%">من</th><th style="width:16%">الأثر</th></tr>
  <tr><td>1</td><td>إنشاء App مجاني على <code>aps.autodesk.com</code> وتسليم <b>Client ID + Secret</b></td><td>أنت (5 دقائق)</td><td class="ok">يفعّل DWG/RVT → IFC + كميات + عرض</td></tr>
  <tr><td>2</td><td>اختيار <b>مزوّد إيميل</b> (Resend الأبسط) وتسليم API key</td><td>أنت</td><td class="ok">إرسال الخطابات/التنبيهات فعليًا</td></tr>
  <tr><td>3</td><td>أضبط المفاتيح في Coolify env وأفعّل الموصّلات (الكود جاهز)</td><td>أنا</td><td class="ok">تشغيل فوري</td></tr>
  <tr><td>4</td><td>(اختياري) مفاتيح Stripe لو هتبدأ البيع · Primavera Cloud لو عايز P6 لايف</td><td>عند الحاجة</td><td>توسّع لاحق</td></tr>
  </table>
  <div class="note"><b>الخلاصة:</b> القدرات الأساسية كلها شغّالة بدون أي مصروف جديد. لإكمال «الباقي» محتاجين منك حاجتين بس: <b>Autodesk APS (فري)</b> + <b>مزوّد إيميل</b> — وأنا أوصّلهم فورًا. كشف الـclash الهندسي يفضل عبر رفع تصدير Navisworks (مجاني وشغّال) لحد ما يكون في طلب فعلي للأتمتة السحابية المدفوعة.</div>
</section>

</body></html>`;

writeFileSync('../reports/_subscriptions.html', html);
console.log('wrote ../reports/_subscriptions.html');
