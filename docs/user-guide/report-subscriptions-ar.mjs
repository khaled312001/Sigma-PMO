/** Sigma PMO — subscriptions document, fully RTL (right-aligned Arabic). */
import { writeFileSync } from 'node:fs';

const css = `
@page{size:A4;margin:15mm 14mm;}
*{box-sizing:border-box;}
html,body{direction:rtl;}
body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1e293b;margin:0;font-size:12.5px;line-height:1.85;text-align:right;}
.head{border-bottom:2px solid #0d9488;padding-bottom:8px;margin-bottom:14px;}
.head .t{font-size:13px;color:#0f766e;font-weight:700;}
.head .d{font-size:11px;color:#64748b;}
h1{font-size:22px;color:#0f172a;margin:12px 0 4px;text-align:right;}
.lead{font-size:12.5px;color:#334155;margin:4px 0 12px;}
h2{color:#fff;background:linear-gradient(135deg,#0f766e,#0d9488);border-radius:9px;padding:9px 16px;font-size:16px;margin:20px 0 11px;text-align:right;}
h3{color:#0f766e;font-size:14px;margin:14px 0 6px;border-right:4px solid #0d9488;padding-right:9px;text-align:right;}
p,li{font-size:12.5px;text-align:right;}
ul{margin:6px 0;padding:0;list-style:none;}
li{position:relative;padding-right:18px;margin:4px 0;}
li::before{content:"•";color:#0d9488;font-weight:800;position:absolute;right:0;}
table{width:100%;border-collapse:collapse;margin:9px 0 13px;font-size:11.5px;break-inside:avoid;direction:rtl;}
tr{break-inside:avoid;}th,td{border:1px solid #cbd5e1;padding:7px 10px;text-align:right;vertical-align:top;word-break:break-word;}
th{background:#0f766e;color:#fff;font-weight:700;text-align:right;}
tr:nth-child(even) td{background:#f8fafc;}
code,.ltr{font-family:Consolas,monospace;direction:ltr;unicode-bidi:embed;display:inline-block;background:#f1f5f9;padding:0 4px;border-radius:3px;font-size:11px;}
a{color:#0d9488;text-decoration:underline;direction:ltr;unicode-bidi:embed;word-break:break-all;}
.box{background:#f0fdfa;border:1px solid #99f6e4;border-right:5px solid #0d9488;border-radius:9px;padding:12px 16px;margin:12px 0;font-size:12.5px;break-inside:avoid;}
.warnbox{background:#fffbeb;border:1px solid #fcd34d;border-right:5px solid #f59e0b;border-radius:9px;padding:12px 16px;margin:12px 0;font-size:12.5px;break-inside:avoid;}
.foot{margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px;color:#94a3b8;font-size:10.5px;text-align:center;}
b{color:#0f172a;}
`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="head"><span class="t">Sigma PMO — اشتراكات التشغيل المطلوبة</span><br><span class="d">ملخص تنفيذي للروابط والاشتراكات المطلوبة · 29 يونيو 2026</span></div>

<p>أستاذ أيهم،</p>
<h1>الاشتراكات المطلوبة لتشغيل الجزء المتبقي من منصة Sigma PMO</h1>
<p class="lead">ملخص منظّم يوضّح فائدة كل خدمة والسعر المتوقع والرابط الرسمي للاشتراك وما المطلوب فعليًا من العميل لبدء التشغيل.</p>
<div class="box"><b>الخلاصة التنفيذية:</b> المطلوب فعليًا الآن بندان فقط — تفعيل <b>Autodesk APS</b> لتحويل ملفات <span class="ltr">DWG/RVT</span>، وتوفير بيانات <b>SMTP</b> الخاصة بإيميل الدومين الرسمي. باقي البنود إمّا مفعّلة بالفعل أو اختيارية حسب المرحلة التجارية القادمة.</div>

<h2>أولًا — ملخص سريع للاشتراكات</h2>
<table>
<tr><th>الخدمة</th><th>الأهمية</th><th>الفائدة داخل المنصة</th><th>السعر / التكلفة</th><th>المطلوب من العميل</th></tr>
<tr><td><b>Autodesk APS</b></td><td>أساسي جدًا</td><td>تحويل ملفات AutoCAD/Revit إلى نموذج قابل للعرض والاستخراج، ثم تشغيل الكميات والتحليلات على ملفات IFC.</td><td>بداية مجانية بحدود شهرية، ثم <span class="ltr">Flex Tokens</span> (دفع حسب الاستخدام). الحد الأدنى 100 توكن، والتوكن صالح سنة. التوكن ≈ 3$، وتحويل الموديل ≈ 0.5 توكن (≈ 1.5$).</td><td>إنشاء حساب Developer + App، ثم إرسال <span class="ltr">Client ID</span> و<span class="ltr">Client Secret</span> عبر قناة آمنة.</td></tr>
<tr><td><b>SMTP Email</b></td><td>أساسي</td><td>إرسال خطابات FIDIC والتنبيهات والتقارير تلقائيًا من إيميل رسمي على دومين العميل.</td><td>بدون تكلفة إضافية إذا كان إيميل الدومين متاحًا. البديل: Resend بخطة مجانية حتى 3,000 إيميل/شهر.</td><td>بيانات <span class="ltr">SMTP</span> (host / port / username / password) واسم المرسل والإيميل.</td></tr>
<tr><td><b>Anthropic / Claude</b></td><td>مفعّل حاليًا</td><td>محرك الذكاء الاصطناعي للتحليلات والتقارير والسرد الذكي داخل المنصة.</td><td>دفع حسب الاستخدام بالتوكن. المفتاح متاح ومفعّل حاليًا.</td><td>لا يوجد إجراء مطلوب الآن، فقط متابعة الرصيد والاستهلاك.</td></tr>
</table>

<h2>ثانيًا — التفاصيل الفنية والتجارية</h2>
<h3>١ — Autodesk APS — البند الأهم للتشغيل</h3>
<p><b>الغرض:</b> تفعيل التحويل السحابي لملفات <span class="ltr">DWG</span> و<span class="ltr">RVT</span> إلى صيغة تتعامل معها المنصة، ثم عرض النموذج واستخراج البيانات والكميات منه. الكشف الهندسي من ملفات IFC يعمل لدينا <span class="ltr">native</span> بدون اشتراك إضافي؛ الجزء الخارجي المطلوب هنا هو طبقة التحويل السحابي من Autodesk.</p>
<ul>
<li>الـ <span class="ltr">Model Derivative API</span> مسؤول عن ترجمة ملفات التصميم إلى صيغ قابلة للعرض واستخراج البيانات والـ<span class="ltr">metadata</span>.</li>
<li>الخطة المجانية مناسبة للديمو والاستخدام الخفيف ضمن حدود شهرية.</li>
<li>عند زيادة الاستخدام يتم الانتقال إلى <span class="ltr">Flex Tokens</span> (Prepay) أو <span class="ltr">Pay as You Go</span> حسب توافرها للحساب/الدولة.</li>
<li>وفق السعر المنشور: <span class="ltr">Model Derivative</span> يستهلك 0.5 توكن للـ<span class="ltr">complex job</span> و1 توكن للـ<span class="ltr">simple job</span>. الحد الأدنى للشراء 100 توكن، والتوكنز صالحة سنة من تاريخ الشراء.</li>
<li>التكلفة العملية للتحويل الواحد منخفضة؛ الرقم النهائي يعتمد على نوع الملف وحجم الاستخدام الفعلي.</li>
</ul>
<table>
<tr><th style="width:42%">الاستخدام</th><th>الرابط</th></tr>
<tr><td>التسجيل والدخول لمنصة Autodesk Platform Services</td><td><a href="https://aps.autodesk.com">https://aps.autodesk.com</a></td></tr>
<tr><td>الخطة المجانية وخيارات الدفع (الأسعار)</td><td><a href="https://aps.autodesk.com/pricing-flex-tokens">https://aps.autodesk.com/pricing-flex-tokens</a></td></tr>
<tr><td>إنشاء App واستخراج Client ID و Client Secret</td><td><a href="https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/">https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/</a></td></tr>
<tr><td>شراء Flex Tokens ومراجعة Rate Sheet</td><td><a href="https://www.autodesk.com/buying/flex">https://www.autodesk.com/buying/flex</a></td></tr>
</table>

<h3>٢ — SMTP Email — إرسال الإيميلات من دومين العميل</h3>
<p>الأفضل أن يتم الإرسال من إيميل رسمي على دومين العميل مثل <span class="ltr">info@sigma-pmo.com</span>، لأن ذلك يعطي الخطابات والتنبيهات والتقارير شكلًا رسميًا ويقلّل احتمال وصول الإيميلات إلى <span class="ltr">Spam</span> عند ضبط الإعدادات بشكل صحيح.</p>
<ul>
<li>الاستخدام داخل المنصة: خطابات FIDIC، تنبيهات، إشعارات، تقارير، ومراسلات تلقائية.</li>
<li>السعر: بدون اشتراك إضافي إذا كان إيميل الدومين مفعّلًا بالفعل ضمن الاستضافة أو خدمة البريد الحالية.</li>
<li>المطلوب: <span class="ltr">SMTP Host / Port / Username / Password</span> (أو App Password)، الإيميل المستخدم للإرسال، واسم المرسل الظاهر للمستلم.</li>
<li>في حالة عدم وجود بريد للدومين حاليًا يمكن استخدام Resend كبديل سريع بخطة مجانية حتى 3,000 إيميل/شهر و100 إيميل/يوم.</li>
</ul>
<table>
<tr><th style="width:42%">الاستخدام</th><th>الرابط</th></tr>
<tr><td>بديل لإرسال الإيميلات عبر SMTP/API عند عدم توفر بريد دومين جاهز</td><td><a href="https://resend.com">https://resend.com</a></td></tr>
<tr><td>مراجعة الخطة المجانية والخطط المدفوعة</td><td><a href="https://resend.com/pricing">https://resend.com/pricing</a></td></tr>
</table>

<h3>٣ — Anthropic / Claude — محرك الذكاء الاصطناعي</h3>
<p>Claude هو محرك الذكاء الاصطناعي المستخدم لتشغيل التحليلات وصياغة التقارير والسرد الذكي داخل المنصة. المفتاح موجود ومفعّل بالفعل، لذلك لا توجد خطوة اشتراك مطلوبة من العميل في هذه المرحلة، مع متابعة الرصيد والاستهلاك دوريًا.</p>
<ul>
<li>طريقة التسعير: <span class="ltr">Pay-as-you-go</span> حسب عدد التوكنات المستخدمة.</li>
<li>المتابعة المطلوبة: مراقبة الرصيد، وتحديد حدّ إنفاق مناسب، ومراجعة الاستهلاك بعد أول فترة تشغيل فعلية.</li>
</ul>
<table>
<tr><th style="width:42%">الاستخدام</th><th>الرابط</th></tr>
<tr><td>إدارة API Keys والرصيد والاستهلاك</td><td><a href="https://console.anthropic.com">https://console.anthropic.com</a></td></tr>
<tr><td>مراجعة أسعار API حسب الموديل</td><td><a href="https://www.anthropic.com/pricing">https://www.anthropic.com/pricing</a></td></tr>
</table>

<h2>ثالثًا — البنود الاختيارية</h2>
<h3>٤ — Stripe — تفعيل بيع الاشتراكات داخل المنصة</h3>
<p>Stripe مطلوب فقط إذا تم تفعيل بيع اشتراكات المنصة أونلاين للعملاء. التكامل نفسه لا يحتاج تكلفة إعداد شهرية في الخطة القياسية، ويتم احتساب عمولة على كل عملية دفع ناجحة وفق بلد الحساب ونوع البطاقة والعملة.</p>
<ul>
<li>الرابط الرسمي: <a href="https://stripe.com">https://stripe.com</a></li>
<li>رابط الأسعار: <a href="https://stripe.com/pricing">https://stripe.com/pricing</a></li>
<li>قرار التفعيل يُؤجَّل لمرحلة الإطلاق التجاري أو عند بدء بيع خطط SaaS للعملاء.</li>
</ul>
<h3>٥ — Oracle Primavera Cloud — غير مطلوب حاليًا</h3>
<p>لا توجد حاجة لتفعيل Oracle Primavera Cloud في المرحلة الحالية، لأن رفع ملفات P6 وقراءة بياناتها يعمل داخل المنصة بدون اشتراك إضافي.</p>

<h2>رابعًا — المطلوب الآن من العميل</h2>
<ul>
<li>تفعيل <b>Autodesk APS</b> أو إنشاء Developer Hub/App وإرسال <span class="ltr">Client ID</span> و<span class="ltr">Client Secret</span> عبر قناة آمنة.</li>
<li>توفير بيانات <b>SMTP</b> لإيميل الدومين الرسمي مثل <span class="ltr">info@sigma-pmo.com</span>: <span class="ltr">Host / Port / Username / Password</span> (أو App Password).</li>
<li>تحديد اسم المرسل الذي سيظهر في الإيميلات الرسمية، مثل <span class="ltr">Sigma PMO</span> أو <span class="ltr">Sigma Contracts</span>.</li>
<li>تأكيد الحد المتوقع للإيميلات الشهرية لمعرفة هل SMTP الحالي كافٍ أم نحتاج Resend.</li>
</ul>

<div class="warnbox"><b>خامسًا — ملاحظة أمان مهمة:</b> لتسريع التنفيذ يمكنني تجهيز الاشتراكات وربط الـAPI بالكامل، والأفضل أن يتم ذلك بإحدى طريقتين آمنتين: إمّا الدفع من طرفكم أثناء جلسة قصيرة، أو توفير صلاحية مؤقتة للحساب دون مشاركة بيانات البطاقة كاملة عبر واتساب أو البريد. بعد الربط تُسلَّم المنصة جاهزة للتشغيل، ويمكن تدوير كلمات المرور والمفاتيح بعد الانتهاء.</div>

<h2>سادسًا — صيغة مختصرة للرسالة</h2>
<div class="box">أستاذ أيهم، المطلوب فعليًا لتشغيل الجزء المتبقي من المنصة هو تفعيل <b>Autodesk APS</b> لتحويل ملفات <span class="ltr">DWG/RVT</span>، وتوفير بيانات <b>SMTP</b> لإيميل الدومين الرسمي حتى ترسل المنصة الخطابات والتنبيهات والتقارير تلقائيًا. <b>Claude</b> مفعّل بالفعل كمحرك AI، و<b>Stripe</b> اختياري فقط عند بدء بيع اشتراكات المنصة. يمكننا تنفيذ الربط بالكامل بعد توفير بيانات APS وSMTP، مع إرسال المفاتيح وكلمات المرور عبر قناة آمنة.</div>

<h3>مصادر وروابط رسمية للتحقق</h3>
<ul>
<li>Autodesk APS Pricing — <a href="https://aps.autodesk.com/pricing-flex-tokens">https://aps.autodesk.com/pricing-flex-tokens</a></li>
<li>Autodesk Flex — <a href="https://www.autodesk.com/buying/flex">https://www.autodesk.com/buying/flex</a></li>
<li>APS Create App — <a href="https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/">https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/</a></li>
<li>Resend Pricing — <a href="https://resend.com/pricing">https://resend.com/pricing</a></li>
<li>Anthropic Console — <a href="https://console.anthropic.com">https://console.anthropic.com</a></li>
<li>Claude Pricing — <a href="https://www.anthropic.com/pricing">https://www.anthropic.com/pricing</a></li>
<li>Stripe Pricing — <a href="https://stripe.com/pricing">https://stripe.com/pricing</a></li>
</ul>

<div class="foot">تم إعداد هذا المستند كملخص تنفيذي للروابط والاشتراكات المطلوبة — 29 يونيو 2026 · Sigma PMO</div>

</body></html>`;

writeFileSync('../reports/_subscriptions-ar.html', html);
console.log('wrote ../reports/_subscriptions-ar.html');
