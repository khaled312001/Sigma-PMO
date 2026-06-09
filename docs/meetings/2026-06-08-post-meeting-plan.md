# Sigma PMO — خطة ما بعد اجتماع 2026-06-08
## (Post-Meeting Plan — Concept Corrections + New Features + Revised Cycle Plan)

> الوثيقة دي بتلخّص اجتماع 8 يونيو 2026 بين الأستاذ الأيهم والمهندس خالد، وبتترجم الكلام اللي اتقال لخطة عمل قابلة للتنفيذ. لغتها الأساسية عربية مصرية فصيحة، والعناوين بالإنجليزي عشان البنية التقنية تفضل واضحة لأي طرف غير عربي. كل قسم بيقارن الوضع الحالي للكود الموجود في الريبو بما طلبه الاجتماع، وبيحدد الفجوة والخطوة التالية. كل رقم أو تقدير في هذه الوثيقة موسوم بمصدره: إما "Meeting" (قاله الأستاذ الأيهم بالنص) أو "Khaled estimate" (تقدير مهندسي مني للنقاش).

---

## 1. ملخّص تنفيذي — Executive Summary

**الفقرة الأولى — اللي شغّال وموثَّق فعلاً.** المنصة في وضعها الحالي بتمشي على المسار الذي رسمناه في ADR-0006 و ADR-0009: نموذج بيانات Canonical موحّد مع نسخ Append-Only، طبقة Ingestion مع بصمة SHA-256 لكل ملف وآلة حالات للـ IngestionRun، ستة قواعد كشف انحرافات حتمية (Deterministic) تنتج Alerts مرتبطة بصفوف Canonical وبأدلة قابلة للتتبّع، وطبقة حوكمة بتربط كل Alert ببند FIDIC ومستوى تصعيد ومجموعة تدخّلات من خريطة سياسة قابلة للنسخ على مستوى المشروع. كمان فيه مراجعة قرارات بتسجّل توقيع الفاعل، ومسار تدقيق على مستوى المنصة، وملخّص تنفيذي أسبوعي حتمي يقدر LLM يعيد صياغته للأسلوب فقط دون تغيير الحقائق. الأستاذ الأيهم في الاجتماع أكّد قبوله لميزة البصمة والتدقيق بالنص ("هذه الميزة مهمة جداً")، والأدوار الخمسة موجودة في `roles.enum.ts` بالشكل المتفق عليه تقريباً.

**الفقرة الثانية — اللي بنضيفه بناءً على الاجتماع.** الاجتماع وسّع نطاق المنتج بشكل جوهري: المنصة لازم تتحول من "محلِّل سلبي" إلى "خبير نشط يُنشئ ويقترح ويُحاكي وينفّذ تحت موافقة بشرية". على حدّ تعبير الأستاذ الأيهم: **"المنصة لا تستبدل البشر — هي بتضغط شغل PMO يدير 20+ مشروع في وقت واحد"**. هذه الجملة هي بيت القصيد التجاري للمنتج. الإضافات الكبرى: (1) **إنشاء Baseline تلقائي على Primavera** من الرسومات و BoQ فقط، عبر مولِّد داخلي يُصدِر PMXML، مع مسار عرضي ثانوي يستخدم **Anthropic Computer Use** لإظهار AI يبني المشروع داخل P6 أمام العميل لرفع الثقة (انظر قسم 3.1 لتفصيل التمييز بين المسارين)؛ (2) **ميزة المحاكاة (What-If)** كقدرة من الدرجة الأولى لأدوار غير الإدارة بدون تلويث الحالة الحقيقية؛ (3) **اقتراح ثلاثة حلول لكل اشتباك Revit** (الأستاذ الأيهم أعطى المثال الملموس: "100 نقطة اشتباك بين الكهربائي والميكانيكي والمعماري والإنشائي") مع محاكاة الأثر على الزمن والتكلفة باستخدام جدول الكميات BoQ؛ (4) **مولِّد ردود FIDIC** يقرأ خطاب المقاول ويحدد البند المنطبق وينتج رد جاهز مع حساب المهلة؛ (5) **مدقّق التزام PMI** لمقارنة الهيكل التنظيمي للمقاول مع المعيار؛ (6) **التقرير الشهري السردي** ك PDF بأسلوب بشري مع مقتطفات من الرسومات وعرض متعدّد الجهات؛ (7) **Prompts خبيرة دائمة مسمّاة وقابلة للتحرير** كأصل من أصول المنصة، واحد لكل صفحة/طبقة. كل ده بيبني على Claude API كمزوّد أول بشكل صريح (وليس "أي LLM")، **مع فهم صريح أن Claude يُجَسِّد (impersonates) كل دور خبير عبر Prompt مُتخصِّص** — الـ Persona تساوي حدود الـ Session، ولا تنتقل بين Personas في نفس المحادثة.

**الفقرة الثالثة — التأثير الصافي على النطاق والزمن والتكلفة.** الإضافات دي تتجاوز نطاق العقد الأصلي بوضوح. الأستاذ الأيهم نفسه في الاجتماع أقرّ إن "ده شغل أكتر مما حدّدته أصلاً، لكني عايزه". بناءً عليه، الخطة بتفعّل **بند إعادة تحديد النطاق في الملحق 2 من اتفاقية الخدمة**. **مهم: الأرقام في القسم 11 هي تقدير مهندسي مني (Khaled estimate)، ولم تُناقَش في الاجتماع. الأستاذ الأيهم لم يلتزم بأي رقم.** التقدير الأوّلي الصادق بعد مراجعة هندسية: **8–10 سايكلز إضافية (لا 4 فقط)، 24–36 أسبوع إضافي، وكلفة إضافية بنسبة 150–220% فوق العقد الأصلي**. السبب: تشغيل P6 الفعلي عبر Computer Use كمسار إنتاج (وليس عرض فقط) هو مشروع بحثي وليس هندسي، وقاعدة C1 الموسَّعة وحدها تساوي 2–3 سايكلز عمل صادق. الأرقام النهائية تُحدَّد في **جلسة Sizing مخصّصة** بعد إقرار قائمة الإضافات بالنص، ونُفصِّل الأساس في القسم 11.

**North Star (single line, both languages):**

> **AR:** سيجما بي إم أو هي فريق هندسي وتعاقدي افتراضي بيشتغل تحت إشراف بشري — يُنشئ ويُحلّل ويقترح ويُحاكي ويُنفّذ، والإنسان يعتمد. الهدف ليس استبدال البشر — بل ضغط شغل PMO يُدير 20+ مشروع في وقت واحد.
>
> **EN:** Sigma PMO is a virtual senior engineering + contracts team that creates, analyzes, proposes, simulates and executes under human approval — not a passive analyzer. The goal is not to replace humans — it is to compress the work of a PMO managing 20+ projects in parallel.

---

## 2. تصحيح المفاهيم — Concept Corrections

الجدول ده بيلخّص كل تحوّل مفاهيمي ناتج من الاجتماع. درجة الخطورة بتحدد إذا كان التغيير "تحسين بسيط" ولاّ "تحوّل كبير في النطاق".

| # | الموضوع — Topic | الفهم السابق — Previous interpretation | توضيح الاجتماع — Meeting clarification | الأثر — Impact | الخطورة — Severity |
|---|---|---|---|---|---|
| 2.1 | دور الذكاء الاصطناعي | LLM مجرّد مُعيد صياغة فوق حقائق حتمية (ADR-0006: "LLM stays a thin rewriter, never the source of governance state"). | المنصة "خبير نشط يُنشئ ويقترح ويُحاكي ويُنفّذ" تحت موافقة بشرية. **Claude يُجَسِّد (impersonates) كل دور خبير عبر Prompt مُخصَّص**، والـ Persona = حدود Session. | نحتاج مسار تنفيذ موازٍ "AI-primary, deterministic-checks-secondary"، و ADR جديد يَنسَخ حدود ADR-0006 لوحدات مُختارة، مع قاعدة معمارية: لا context-switch بين Personas في نفس المحادثة. | Major re-scope |
| 2.2 | شكل القرار | قرار حتمي واحد لكل Alert بـ `interventions[]` مسطّحة. | ثلاثة حلول لكل مشكلة: **A: تكلفة↑/زمن=** (تسريع بزيادة موارد) / **B: زمن↑/تكلفة=** (تأجيل بنفس الميزانية) / **C: إعادة تصميم — زمن=/تكلفة= مع تنسيق متعدّد التخصصات** (التكلفة هي الجهد التنسيقي بين التخصصات، لا مال ولا زمن مباشر). يختار الـ PM واحد ثم محاكاة فورية. | كيانات جديدة: `SolutionProposal`، `SimulationRun`، `BoqLine`. حقل `interventions[]` بيتحول لمرجع لـ Proposal-Bundle. | Major re-scope |
| 2.3 | طبقة التخطيط | Audit-only: المقاول يرفع Baseline والمنصة تدقّقها. | **المُدخَل اليوم:** رسومات AutoCAD 2D من الاستشاري ← نموذج Revit ثلاثي الأبعاد (**يبنيه البشر حالياً، ليس المنصة**) ← Revit يكشف الاشتباكات. **الإضافة:** المنصة **تُنشئ** الـ Baseline من الرسومات + BoQ، وتفتح P6 على سطح المكتب كمسار عرضي (انظر 3.1 للتمييز الصريح بين Author Mode و Demo Path)، **بـ 3–4 أيام × 6–7 ساعات/يوم من زمن AI compute — وليس زمن بشري** (Meeting). | عامل (Worker) طويل العُمر يدير Claude Computer Use كمسار demo، كيانات `BaselineBuildJob` و `WBSNode` و `ActivityDraft`، طابور وظائف، Streaming للتقدم، وحاوية P6 معزولة على Windows VM (لأن P6 Pro تطبيق Windows فقط، لا يعمل على صورة Anthropic المرجعية لـ Linux). | Major re-scope |
| 2.4 | المحاكاة | غير موجودة في الكود؛ كل الكتابة تذهب لـ Canonical truth. | "What-If" من الدرجة الأولى للأدوار غير الإدارية، لا تمسّ الحالة الحقيقية. | كيان `Scenario`، صلاحية `canSimulate`، واجهة سيناريوهات، شارة "Simulated only" في الأدلة والقرارات. | Significant pivot |
| 2.5 | Prompts الخبيرة | سطر واحد Hard-coded في `llm.service.ts`. لا يوجد سجل، لا نسخ، لا ربط بصفحة. | كل صفحة لها Prompt خبير دائم مسمّى وقابل للتحرير: Planner / FIDIC / Revit / PMI / Monthly Author، كأصل من أصول المنصة بنُسَخ وحوكمة. | وحدة `PromptRegistry` كاملة (`ExpertPrompt`, `PromptVersion`, `PromptBinding`)، مسار إداري `/admin/prompts`، RBAC على التحرير. | Significant pivot |
| 2.6 | مزوّد الذكاء | LLM "قابل للاستبدال" (Anthropic أو OpenAI) لإعادة الصياغة فقط. | Claude هو الخيار المحدّد ("افضلهم حاليا")، الاشتراك له طبقة (Pro/Max)، Computer Use مطلوب. | حذف التجريد المتعادل أو الإبقاء عليه مع تثبيت Claude كـ Canonical، إضافة Prompt Caching و Tool Use و Computer Use. ADR جديد. | Significant pivot |
| 2.7 | التقارير | تقرير تنفيذي أسبوعي حتمي واحد بأسلوب نقاط. | ثلاث وتيرات (يومي / أسبوعي / **شهري هو الأهم**)، الشهري سرد تحليلي بأسلوب بشري + PDF + مقتطفات رسومات + ثلاث عروض (Owner / PD / Contractor). | حقل `cadence` و `persona` على `ExecutiveSummary`، مولِّد PDF، خط أنابيب لاستخراج الرسومات، نمط Long-form يكسر قالب النقاط. | Significant pivot |
| 2.8 | حوكمة FIDIC | خريطة ثابتة Rule→Clause في `default-policy.ts`، بدون استقبال أو توليد رسائل. | استقبال خطاب → تصنيف البند عبر كل كتب FIDIC الخمسة → توليد رد مكتمل مع رياضيات المهلة. PMI: فحص الهيكل التنظيمي وإصدار خطاب تصحيح. | وحدتان جديدتان: `ContractLetter` + Letter Generator، `OrgChart` + PMI Compliance. حقل `contractType` على `Project`. | Major re-scope |
| 2.9 | الأدوار | Contractor لا يُجري قواعد ولا يُولّد ملخّصات. لا يوجد `canSimulate`. | Consultant و Contractor يقدران يشغّلان محاكاة. Consultant لا يرفع بيانات أساسية (مُستنبط من "Consultant مثل Client ناقص تعديل السياسة" + Client لا يرفع — يحتاج تأكيد). Contractor يرفع تقاريره فقط. Sigma Reviewer "لا يرفع" بالنص — لم يُذكَر صراحةً إن كان يقدر يحاكي أم لا (يحتاج تأكيد). | تعديل `ROLE_CAPABILITIES` بإضافة `canSimulate`، تضييق `canIngest` لـ per-source-type، إصلاح حالة Consultant. | Minor refinement |
| 2.10 | مصادر الأدلة | كل الأدلة من ملفات Ingest فقط (P6/Excel/CSV). | الأدلة لازم تشمل قائمة الاشتباكات (Revit) + BoQ + الرسومات. | كيانات `ClashItem`, `BoqLine`, `DrawingSheet` ومُحلّلاتها، توسيع `EvidenceService` و `ConfidenceScore`. | Significant pivot |
| 2.11 | التواصل بين الطبقات | الطبقات محاور موازية لتوسيع المنصة. | الطبقات الثلاث (Engineering / Planning / FIDIC) كيان واحد، تتبادل المعلومات. **الأولوية بين الطبقات تتحدد في اجتماع لاحق.** | حقل `Layer` على `Alert` و `Decision`، Placeholder Policy للتعارض، ADR يوثّق التأجيل. ميزات FIDIC + Clash Impact تعتمد على هذا القرار — انظر 3.7. | Minor refinement (لكن يحجب C6) |
| 2.12 | اللغة العربية | ترجمة كاملة في `ar.ts` لكن أدبية/عامة. | يجب أن تكون بمصطلحات صناعة الإنشاءات و PM، لا ترجمة حرفية. | تمرير تنقيح على `ar.ts`، عربنة `composeGrounded()` في `summary.service.ts` بدلاً من ثوابت إنجليزية. | Minor refinement |
| 2.13 | البصمة والتدقيق | مطبَّقة (SHA-256 + IngestionRun + audit feed). | الأستاذ الأيهم أثنى عليها بالنص. | لا تغيير. تطبيق نفس الانضباط على المصادر الجديدة (Clash, BoQ, Drawings, Letters). | Minor refinement |
| 2.14 | شكل ما بعد التسليم | تنتهي المشاركة عند Acceptance. | Retainer شهري/ساعي/لكل حادثة + **Pilot على مشروع حقيقي لعميل سيجما حالي — التجربة بدون مقابل للعميل** (الأستاذ الأيهم استخدم تعبير "zero cost trial"). | ملحق Retainer + وثيقة نطاق Pilot + كل وحدة جديدة تُصمَّم بـ Feature flags لتيسير الإصلاحات السريعة أثناء التشغيل. **مفتوح: هل عمل خالد على Pilot مدفوع أم ضمن الـ Retainer؟ — انظر سؤال 12.** | Significant pivot |

**خلاصة "النجمة الشمالية" (North Star) المُعاد ضبطها:**

> **AR:** لم تعد سيجما "مُدقّقة آلية"، بل أصبحت "فريق هندسي وتعاقدي افتراضي" تحت رقابة بشرية، يُنشئ Baseline حقيقي على Primavera، ويقترح حلول مدعومة بمحاكاة، ويردّ على المقاول بخطاب FIDIC مُحكَم، ويُسلِّم تقريراً شهرياً سردياً يمكن إرساله للمالك مباشرة. **الهدف:** ضغط شغل PMO يدير 20+ مشروع، لا استبدال البشر.
>
> **EN:** Sigma is no longer an automated auditor — it is a virtual senior team that actually creates a real Primavera baseline, proposes simulation-backed solutions, drafts FIDIC-grade replies to the contractor, and delivers a monthly narrative report ready for the owner. **The goal:** compress the work of a PMO managing 20+ projects, not replace humans.

---

## 3. الإضافات الجديدة — New Deliverables Introduced in the Meeting

### 3.1 إنشاء Baseline على Primavera بالذكاء الاصطناعي — AI Auto-creation of Primavera baseline

**المُدخلات:**
- مجموعة رسومات (PDF / DWG / IFC لاحقاً) من الاستشاري.
- جدول الكميات BoQ (Excel أو نظير).
- نوع العقد + هوية المشروع + هدف نهاية البناء (إن وُجد).
- **Prompt الخبير الدائم:** "مخطط Primavera P6 خبرة 25 سنة".

**المُخرَجات:**
- مشروع Primavera كامل: WBS → Activities → Durations → Relationships → Calendars → Critical Path → Baseline مدمج.
- ملف **PMXML واحد** يحتوي المشروع العامل والـ Baseline في نفس الملف (هذه ميزة جوهرية لـ PMXML).
- تقرير مرافق بالمنطق ومصدر كل تقدير زمني (المخطط حدد كل Duration من جدول الكميات + الإنتاجية المرجعية).
- درجة ثقة لكل نشاط (تورّث `ConfidenceScore` الحالية).

**بوّابة الاعتماد (Approval Gate):**
- الـ Job يدخل حالة `AWAITING_APPROVAL` قبل أي حفظ نهائي في P6.
- المُراجِع: **المخطط الرئيسي عند المقاول/الاستشاري** + **PD من جهة العميل**. توقيع الاثنين مطلوب قبل تحويل الـ Baseline لحالة `APPROVED`.
- يمكن للمُراجِع رفض البناء كاملاً، أو رفض أجزاء (Activities/Relationships بعينها) ودفع الـ Agent لإعادة المحاولة بتوجيه.

**مدة الـ Compute المتوقّعة (مأخوذة بالنص من الأستاذ الأيهم):** 3–4 أيام × 6–7 ساعات/يوم من اشتغال Claude — **هذا زمن AI compute، وليس زمن خالد البشري** (Meeting). الـ Wall-clock ممكن يطول لو فيه وقفات اعتماد بشرية. **ملاحظة هندسية صادقة:** هذه الأرقام هي تقدير حدسي من الأستاذ الأيهم لم يُقَس بعد ميدانياً. القياس الفعلي يتم في C1–C3 ويُحدَّث الرقم.

**التمييز الصريح بين مسارين — هذا التمييز يحتاج إقرار الأستاذ الأيهم (انظر سؤال 1):**

| المسار | ماذا يفعل | لماذا | الحالة |
|---|---|---|---|
| **Author Path (مسار التأليف الإنتاجي)** | AI يبني الـ Baseline داخل نموذج Sigma، ثم يصدر PMXML واحد عبر MPXJ، المخطط يستورده في P6 بنقرة واحدة. | موثوقية هندسية، مصدر حقيقة واحد، قابل للاختبار. | **هذا هو مسار الإنتاج الفعلي.** |
| **Demo Path (مسار العرض)** | Computer Use يفتح P6 على Windows VM ويعرض النتيجة بصرياً للعميل، مع نقرات مُتحكَّم بها (scripted). | الأستاذ الأيهم طلب بالنص: **"AI ACTUALLY OPENS P6 ON THE DESKTOP, creates the project, adds activities"**. هذا يُحقَّق بصرياً لرفع ثقة العميل. | **مسار عرض/إثبات مفهوم، لا مصدر حقيقة.** |

**الاستراتيجية التقنية المُوصى بها (مأخوذة من بحث Primavera + مراجعة هندسية):**

الاستراتيجية المُختارة هي هجين بين **خيار 6 (نموذج داخلي خاص بنا) + خيار 1 (MPXJ ك PMXML Writer)**:

1. **مصدر الحقيقة لدينا، وليس P6.** الذكاء الاصطناعي يبني الـ Baseline داخل نموذج NestJS/MySQL عندنا (نُوسّع schema الحالي بكيانات `BaselineBuildJob`, `WBSNode`, `ActivityDraft`, `RelationshipDraft`). كل قرار تخطيطي يحفظ مع `rationale` و `evidenceRefs` (BoQ line, drawing sheet).
2. **PMXML Writer عبر MPXJ.** عند زر "إرسال إلى Primavera"، نشغّل Mapper من نموذجنا إلى `ProjectFile` في MPXJ، نضبط `setWriteBaselines(true)`، ونصدر **ملف PMXML واحد** يحوي المشروع والـ Baseline. المُخطّط بيستورده بنقرة واحدة في P6 Pro.
3. **Computer Use كطبقة عرض/إثبات مفهوم (Demo Path).** Claude يفتح P6 ويعرض النتيجة فعلياً للعميل. **مهم: هذا ليس مُولّد الـ Baseline الحقيقي.** الـ Baseline يُولَّد في الخطوة 1، و Computer Use يُعيد استخدامه بصرياً. لا اختلافات بين الملف المُولَّد و P6 المفتوح، لأن المُدخَل واحد.
4. **رفض المسارات المُهلِكة.** SDK / Integration API القديمة من Oracle مهجورة وتُحذِّر Oracle نفسها أنها قد "تُفسد البيانات بتجاوز قواعد العمل" — لن نبني عليها. PyP6Xer كتابة من الصفر غير مُختبَرة بشكل كافٍ. EPPM REST API ك Future Cycle لما يظهر عميل عنده EPPM.

**القيود التشغيلية الصريحة (تم إضافتها بعد المراجعة الهندسية):**
- **P6 Pro تطبيق Windows فقط.** صورة Anthropic المرجعية لـ Computer Use هي Linux (Xvfb + Mutter). نحتاج Windows VM معزولة، و Computer Use على Windows أقل نضجاً من Linux. هذا قيد جوهري.
- **ترخيص P6 لكل حاوية.** P6 Pro ترخيصه per-named-user من Oracle. كل جلسة Demo Path تحتاج جلسة P6 مُسجَّلة مسبقاً. **من يملك هذه التراخيص؟ سيجما؟ خالد؟ العميل؟ — سؤال 7.**
- **PMXML XSD مرتبط بإصدار P6.** قبل بدء C10، يجب التثبيت كتابةً على إصدار P6 لدى عميل Pilot (18.x / 22.x / 24.x). نضع matrix في الـ CI.
- **Modal dialogs + Critical Path recalc** في P6 تُسبِّب توقّفات متعدّدة الثواني تكسر حلقات Screenshot ساذجة. كل سكربت Demo Path يحتاج معالجة صريحة لحالات الانتظار.

> **ملاحظة موثّقة من البحث:** PMXML لا يسمح بـ "تحديث Baseline موجود"، فقط بإنشاء واحد جديد. لذلك مسار "تعديل الـ Baseline v2" يُنشئ Baseline جديد ويستبدل القديم. هذا قيد من Oracle، نُظهره صراحة في الـ UX.

---

### 3.2 Computer Use Automation — تشغيل برامج سطح المكتب (P6 + Revit) بالذكاء الاصطناعي

**ما الذي يتحكم فيه الـ Agent (Demo Path فقط):**
- **Primavera P6 Professional** داخل **Windows VM** معزولة (P6 لا يعمل على Linux). الـ Agent يفتح المشروع، يستورد PMXML المُولَّد من الـ Author Path، يعرضه بصرياً.
- **Revit/AutoCAD Viewer** (مرحلة لاحقة): قراءة الرسومات، استخراج العناصر، تأكيد قائمة الاشتباكات.
- **LibreOffice / Excel viewer** لقراءة جدول الكميات وقت الـ Build.
- **لا يفتح:** متصفّح إنترنت عام، بريد إلكتروني، أي تطبيق دردشة، أو أي مورد خارج Allowlist.

**حواجز الأمان (Safety Guardrails) — غير قابلة للتفاوض، تم توسيعها بعد المراجعة الأمنية:**

استنباطاً من بحث Claude API ووثائق Anthropic ومراجعة Penetration testing standards:

| رقم | الحاجز | التطبيق على سيجما |
|---|---|---|
| 1 | **عزل لكل مشروع** | **gVisor أو Firecracker** (وليس Docker العاري — Docker ليس حدّ أمان لتنفيذ كود معادٍ، و P6 يدعم COM/macros). حاوية واحدة لكل مشروع نشط، تُدمَّر عند الانتهاء بعد لقطة Diff للتدقيق. |
| 2 | **Allowlist للشبكة (FQDN صريح)** | السماح فقط بـ: `licensing.oracle.com`, `autodesk.com`, `api.anthropic.com`, `<sigma-backend>`, `<project-drawing-store>`. **Outbound deny-all default**. **pcap capture لكل جلسة لمدة 30 يوم** للتدقيق. |
| 3 | **مُصنّف Prompt Injection من Anthropic** | يظل **مُفعَّلاً دائماً**. لا يُسمح بإطفائه على بيانات FIDIC أو العقود مهما كانت الذريعة. |
| 4 | **بوّابات الموافقة على الأفعال غير القابلة للتراجع — مع Re-authentication** | أداة `request_human_approval(action, screenshot, diff)` مُعرَّفة كأداة مخصّصة. **المُعتمِد لازم يعيد المصادقة (Step-up auth)** في لحظة الموافقة، لا يكفي session cookie. الـ catalog الكامل للأفعال غير القابلة للتراجع موثَّق في ADR-0010. كل استدعاء للأداة مُتحقَّق على Server-side ضد nonce صادر من Sigma backend قبل ظهور المودال للبشر (يمنع تزوير الـ tool call). |
| 5 | **محاكاة في حاوية مستقلة** | كل تشغيل محاكاة في حاوية جديدة بنسخ من البيانات. لا تمسّ الإنتاج إطلاقاً. |
| 6 | **لا اعتمادات حيّة في الـ Prompt** | P6 يكون مُسجَّل دخوله مسبقاً في الحاوية قبل بدء الـ Agent. لا يرى Claude كلمة سر أبداً. |
| 7 | **حد أقصى للحلقة + Kill Switch** | 200 تكرار لكل مهمة منطقية. عتبة ميزانية شهرية لكل مشروع. **Live screenshot stream للمشغّل في Sigma operator dashboard أثناء أي جلسة Computer Use، مع زر "halt + snapshot + destroy" بنقرة واحدة.** الـ Session تُقتَل تلقائياً عند: 200 تكرار، 30 دقيقة بدون تقدّم، أو تجاوز الميزانية. |
| 8 | **اتفاقية ZDR مع Anthropic** | تُوقَّع قبل تشغيل Pilot. Computer Use و Prompt Caching كلاهما مؤهَّل لـ ZDR. **ZDR يغطّي احتفاظ Anthropic، لا يغطّي حق العميل في معرفة أن بياناته تذهب لمزوّد LLM أمريكي.** بند تعاقدي صريح في عقد Pilot يُفصح عمّا يخرج من شبكة العميل، مع موافقة كتابية. |
| 9 | **حقن الـ Prompt من الملفات** | كل ملف مرفوع من المقاول (تقرير يومي/أسبوعي/خطاب) يمر بـ Sanitizer ويُلَفّ في `<untrusted_contractor_report>` قبل تمريره للـ Persona. |
| 10 | **Persona Read-Only من منظور الـ Agent** | الـ Agent **لا يقدر** يعدّل النص الخبير لنفسه. التحرير فقط من واجهة Sigma Admin. **إنفاذ معماري صريح:** Tool Registry يرفض بشكل قاطع أي أداة تمسّ `/admin/prompts` أو entities `ExpertPrompt`/`PromptVersion` أثناء جلسة Computer Use. |
| 11 | **Data Residency** | Anthropic API اليوم US-only؛ لا توجد منطقة UAE. **إفصاح كتابي للعميل قبل أي رفع بيانات.** هل العميل يقبل؟ سؤال يجب أن يُحسَم قبل Pilot. |
| 12 | **توقيع الـ Audit Manifest** | كل جلسة تنتهي بـ Manifest موقَّع رقمياً بمفتاح Sigma backend (HSM-backed إن أمكن، أو KMS-managed key بحد أدنى). يُخزَّن في جدول append-only، قابل للتحقق من قبل العميل عبر public key. **سياسة custody الخاصة بالمفتاح موثَّقة في ADR-0010.** |

**سجل التدقيق (Audit Trail):**
- كل tuple ‏(action, screenshot, tool_use, tool_result, approval) يُحفَظ مع: timestamp, projectId, userId (مَن أطلق الـ Session)، اسم النموذج وإصداره، رأس البيتا، slug النسخة من الـ Persona، كلفة Tokens.
- كل Session تنتهي بـ "Manifest موقَّع": *"الـ Agent بنى ملف X.xml، Hash = H، تحت موافقة Y من المستخدم Z في وقت T"*.
- ده توسيع طبيعي لميزة البصمة الحالية اللي أثنى عليها الأستاذ الأيهم.

**Incident Response Runbook (مطلوب قبل Pilot — مُضاف بعد المراجعة الأمنية):**
- مَن يُستدعى عند سلوك غير متوقَّع؟ خالد primary، السيد عوض backup.
- SLA الاستجابة: 15 دقيقة لـ "حاوية تتصرف خارج Allowlist"، ساعة لـ "Computer Use يطلب موافقة لخطاب FIDIC شاذ".
- قالب تواصل للعميل لكل سيناريو فشل.
- Tabletop exercise واحدة على الأقل قبل أول جلسة على بيانات حقيقية (مثلاً: "Claude يفتح File → Save As ويكتب مساراً خارج output mount").

---

### 3.3 Prompts الخبيرة الدائمة — Persistent expert system prompts per layer

**اصطلاح التسمية (Naming Convention):**
- صيغة: `<layer>.<sub-domain>.<role>.<locale>` — مثال: `planning.p6.expert.ar-AE`، `fidic.red_book.expert.en-AE`، `revit.clash.analyst.ar-AE`، `pmi.org_chart.auditor.en-AE`، `report.monthly.author.ar-AE`.
- الـ Slug ثابت عبر الإصدارات؛ الإصدارات (`v1`, `v2` …) تُحفَظ append-only كالعادة.

**القواعد (Rules):**
1. لا يتحدّث الـ Prompt من معرفة عامة، بل يستشهد فقط من المرفقات (FIDIC books, BoQ, schedule snapshot).
2. كل Prompt يحوي كتلة **Constraints** تذكر صلاحيات الدور الحالي.
3. كل Prompt يحوي **Refusal Policy**: متى يرفض الإجابة (طلب خارج النطاق، طلب يتجاوز صلاحية الدور).
4. كل Prompt له **Output Schema** صريح (JSON لما يكون رد منظَّم، Markdown لما يكون سردي).
5. كل تعديل على Prompt يُسجَّل كـ `PromptVersion` جديد مع `editorId`, `reviewerId`, `diff`, `effectiveFrom`.

**أين تعيش:**
- Backend: وحدة `prompts/` جديدة مع كيانات `ExpertPrompt`, `PromptVersion`, `PromptBinding`.
- المسار في الملفات (مقترح): `backend/src/modules/prompts/` و `backend/src/modules/prompts/library/` (النصوص الفعلية كملفات MD مُتحكَّم بإصدارها في Git، تُحمَّل وقت التشغيل وتُعكَس في DB).
- Frontend: `/admin/prompts` مع Diff Viewer ونسخة Preview قبل الاعتماد.

**المالك (Ownership) + IP — سؤال مفتوح:**
- **خالد** يكتب المسوّدة الأولى لكل Prompt من خلال شغله مع منهج الـ ADRs والـ Specs.
- **الأستاذ الأيهم** يُراجِع، يُعدِّل، يَعتَمِد — وهي اللي قالها بالنص في الاجتماع: "خالد يصمم، أنا أراجع ونتكرر سوياً". هذا يخلق مسؤولية مشتركة على "صوت المنصة".
- **سؤال مفتوح:** الـ Personas هي IP — مَن يملكها؟ سيجما؟ خالد؟ ملكية مشتركة؟ هل يقدر خالد إعادة استخدامها في تعاقدات PMO أخرى؟ يجب الحسم في الـ Sizing Pass — سؤال 11.

**العائلات الأربع للـ Prompts (the 4 families):**

| العائلة | Slug | الدور | المرفقات المطلوبة | النموذج المُوصى به |
|---|---|---|---|---|
| **المخطّط** | `planning.p6.expert` | مخطط Primavera P6 خبرة 25 سنة. يُنشئ، يدقّق، يحاكي. | جدول الكميات، الرسومات، نوع العقد، تاريخ البدء/الانتهاء. | Sonnet 4.6 للتدقيق والمحاكاة. Opus 4.6+ لـ Computer Use. |
| **محلِّل الاشتباكات** | `revit.clash.analyst` | خبير BIM، يقرأ قائمة الاشتباكات، يقترح 3 حلول. **مرجع تقدير الأستاذ الأيهم: ~100 نقطة اشتباك لكل مشروع متوسط الحجم** (كهربائي/ميكانيكي/معماري/إنشائي) — يُستخدَم لتقدير حجم طابور SolutionProposer وميزانية Opus. | قائمة الاشتباكات، BoQ، الرسومات. | Opus 4.8 (تفكير عميق متعدّد التخصصات). |
| **خبير FIDIC** | `fidic.<book>.expert` | خبير FIDIC حافظ كل الـ 5 كتب. يصنّف ويُولّد رد. | الكتاب المحدّد، نص العقد، خطاب المقاول. | Opus 4.8 (حساسية تعاقدية + كل خطاب يدخل بشراً لاعتماده). |
| **محلِّل PMI** | `pmi.org_chart.auditor` | خبير PMBOK، يفحص الهيكل التنظيمي. | المعيار، الهيكل المرفوع، قائمة الأدوار المطلوبة. | Sonnet 4.6. |
| (إضافية) **كاتب التقرير** | `report.monthly.author` | كاتب تقارير PMO، أسلوب سردي بشري. | الـ Snapshot، الـ Alerts، مقتطفات الرسومات، الأرقام. | Opus 4.8 (في Batch بنصف السعر). |

---

### 3.4 وضع المحاكاة — Simulation mode as a first-class role capability

**التوافر:**
- مُتاح لـ: Client, Consultant, Contractor (مع تقييد المقاول على شريحته فقط).
- **Sigma Reviewer:** الاجتماع نصّ على "لا يرفع"، **لم ينصّ على عدم المحاكاة**. تقديري الافتراضي: غير مُتاح لـ Sigma Reviewer (دور قراءة فقط). **يحتاج تأكيد** — سؤال 13.
- Sigma Admin يقدر يشغّل لأغراض التحقق لكنه لا يحتاجها عادةً.

**دلالات Sandbox (Sandbox Semantics):**
1. كل Simulation Run يُنشئ كيان `Scenario` جديد بـ `parentSnapshotId` يشير للحالة الحقيقية وقت البدء.
2. كل التغييرات (تواريخ، مدد، تخصيصات، اختيار حل من Clash) تُكتَب على فرع `Scenario` فقط.
3. القواعد الست (وأي قواعد جديدة) تعيد التقييم على الفرع.
4. **مطلقاً** لا تُحدَّث الـ Canonical truth. لا يقدر أي مسار كود يكتب من Scenario لـ Canonical إلا عبر بوّابة "Promote to canonical" التي تستلزم دور Admin + توقيع.
5. كل UI يعرض شارة "Simulated — not actual" واضحة على كل لوحة قرار / دليل تأتي من Scenario.
6. **اقتراح هندسي مني (Khaled default، لم يُناقَش في الاجتماع):** الـ Scenarios تنتهي صلاحيتها بعد 30 يوماً تلقائياً (لتفادي تضخّم DB). قابل للتعديل بعد المراجعة.
7. كل Computer Use أثناء المحاكاة يعمل في **حاوية مستقلة** بـ نسخ من ملفات P6 الحقيقية. لا تمسّ الحاوية الإنتاجية.

---

### 3.5 توليد الرسائل الجاهزة (FIDIC + PMI) — Ready-to-send letter generation

**المُحفّز (Trigger):**
- **خطاب وارد** من المقاول: المستخدم يرفع PDF/Word/نص الإيميل، أو يصل تلقائياً عبر صندوق بريد مخصّص.
- **عدم التزام مُكتشَف داخلياً**: مثل Stale reporting، schedule slippage، اختلال هيكل تنظيمي مُكتَشَف.

**خط الأنابيب (Pipeline):**
1. **Letter Intake Parser** — استخراج النص، التاريخ، الموقّع، رقم المرجع، اللغة (ar/en). **يحتمل OCR للرسائل المُسحَّبة (Tesseract كبداية).**
2. **Persona load** — `fidic.<determined-book>.expert` (الكتاب يُحدَّد من `Project.contractType`).
3. **Clause Classification** — Claude يحدّد البند/البنود المنطبقة من الكتاب المُرفَق كاملاً.
4. **Deadline Math** — حاسبة حتمية (وليست LLM): البند فيه مدة Notice، يُضاف عليها تاريخ الاستلام، تُحسَب أيام العمل بحسب التقويم (هجري/ميلادي حسب العقد).
5. **Letter Drafter** — Claude يُولّد الرد كـ Markdown مع تنسيق رسمي.
6. **بوّابة الاعتماد** — لا يُرسَل أي خطاب آلياً. PD أو Sigma Admin يعتمد، ويقدر يعدّل، ثم "إرسال" تخرج عبر `notifications.service.ts`.

**القوالب الرسمية:**
- **عربي**: قوالب مُسجَّلة في `prompts/templates/letters/ar/` بصياغة قانونية إماراتية ("بعد التحية، نُشير إلى خطابكم المؤرّخ … المستلَم بتاريخ … المتعلّق بـ … وعليه، واستناداً إلى البند الفرعي [X] من الشروط الخاصة …").
- **إنجليزي**: قوالب رسمية مماثلة في `prompts/templates/letters/en/`.
- كل قالب يحوي عناصر متغيّرة بصيغة `{{recipient}}`, `{{ref}}`, `{{clause}}`, `{{deadline}}`, `{{body}}`, `{{signatory}}`.

**حسابات المهلة (Deadline Math):**
- مَرجِع البند → عدد الأيام → نوع الأيام (Calendar / Working) → التقويم الإسلامي/الميلادي حسب العقد → الناتج: `must-send-by` و `must-respond-by`.
- تُعرَض كـ Banner في الـ UI: "خطاب يجب إرساله قبل 14 يوليو 2026 (5 أيام عمل متبقّية)".

**تنبيه: يعتمد على قرار Layer Priority** (انظر 3.7). مثال EOT في سؤال 1 يوضح: لا يمكن شحن Letter generator نهائياً قبل حسم سياسة الأولوية بين الطبقات. C6 يحجبه C5 وقرار سياسة الأولوية معاً.

---

### 3.6 التقرير الشهري السردي — Monthly narrative report (human-written feel)

**ما هو "السردي البشري" تحديداً:**
- لا نقاط Bullet، بل فقرات مترابطة.
- يبدأ بفقرة افتتاحية تضع المشروع في سياقه الزمني العام.
- يحوي صور Inline من الرسومات (مقتطفات S-curve، Gantt، مقاطع AutoCAD لمناطق حرجة).
- يستخدم لغة بشرية ("لاحظ الفريق هذا الشهر تأخراً في تسليم رسومات التشطيبات الميكانيكية، الأمر الذي انعكس على …") وليس قوالب آلية ("Schedule status: …").
- يُختَم بفقرة "نظرة استشرافية" تذكر ما المتوقَّع في الشهر القادم بناءً على Critical Path.

**العروض متعدّدة الجهات (Multi-stakeholder views):**

| الجهة | المحتوى | الطول | المُولِّد |
|---|---|---|---|
| **Owner / المالك** | نظرة عامة عالية المستوى، الـ S-curve، أبرز 3 مخاطر، الموقف المالي العام، توقّع التسليم. | 3–5 صفحات. | Opus 4.8 (Batch). |
| **PD / مدير المشروع** | كل التفاصيل: تقدّم لكل WBS رئيسي، كل المخاطر، كل الانحرافات، كل قرارات الشهر، حالة كل تنبيه. | 15–25 صفحة. | Opus 4.8 (Batch). |
| **Contractor / المقاول** | شريحة المقاول فقط: أنشطته، تأخيراته، خطاباته، التزاماته القادمة. | 5–10 صفحات. | Sonnet 4.6 (Batch). |

**خط الأنابيب:**
1. اختيار الفترة (شهر تقويمي افتراضياً، قابل للتجاوز).
2. **Snapshot** كامل للحالة + كل Alerts الشهر + كل القرارات + كل المحاضر + Diffs الرسومات.
3. **Drawing Extract Pipeline** — صور قُصاصات بدقة معقولة، كل واحدة بكابشن مهيكَل. **تنبيه هندسي:** Arabic RTL في Puppeteer مع خطوط مُضمَّنة (Tajawal) + قَصاصات DWG = شغل ميداني غير تافه، عُومِل في تقدير C9.
4. ثلاثة استدعاءات Claude بـ Batch API (خصم 50%) — واحد لكل Persona. **ملاحظة اقتصادية:** Caching **لا يُفيد** للتقرير الشهري (TTL ساعة، الاستدعاء التالي بعد شهر). Batch وحده هو مصدر التوفير. لا نخلط الاقتصادين.
5. **PDF Renderer** — Puppeteer + قالب HTML/CSS A4 مع ترويسة سيجما + توقيع رقمي + Hash للوثيقة (يدخل سجل التدقيق).
6. **اعتماد** قبل الإرسال للجهة المعنية (إلا لـ Sigma Admin بإذن صريح Auto-send).

---

### 3.7 جسور بين Layers — Cross-layer information sharing

**ملاحظة صريحة (تم تعديلها بعد المراجعة الهندسية):** هذا القسم placeholder وليس تصميماً نهائياً. الميزات التي تعتمد عليه (FIDIC Letter Generator في C6، Clash Impact Simulator في C5) مُعلَّقة على القرار. لا يُسلَّم C6 قبل حسم سياسة الأولوية.

**الآلية المقترَحة كـ Stage 1 (آمنة، قابلة للتسليم):**
- نموذج Canonical الواحد يبقى مَرجِع الحقيقة (لم يتغيّر).
- نُضيف **حقل `Layer`** على `Alert` و `Decision` و `Evidence` ‏(`L1_ENGINEERING | L2_PLANNING | L3_GOVERNANCE | L4_REPORTING`) **لغرض الفلترة والتقرير فقط** — لا قراره يعتمد عليه بعد.
- **ملاحظة Schema:** قطعة Evidence واحدة (مثل سطر BoQ) قد تكون مرجعاً مشروعاً لـ Engineering (تكلفة اشتباك) و Planning (مدة نشاط) و FIDIC (تقدير مطالبة). الحل: حقل `layers: Layer[]` (multi-valued)، أو jointable `EvidenceLayer`. **لا حقل scalar واحد.**
- **EventBus دائم بدلاً من EventEmitter في الذاكرة:** NestJS EventEmitter يعمل داخل process واحد ولا يجتاز حدود الحاويات (Computer Use sessions في حاويات معزولة). البديل: **Outbox table في MySQL** (append-only) + subscriber بـ polling. هذا الحل بسيط، durable، وقابل للتدقيق. (broker حقيقي مثل NATS مؤجَّل لـ Post-Pilot.)

**الآلية المُعلَّقة (Stage 2 — تنتظر قرار سياسة الأولوية):**
- أداة Claude المخصّصة `get_cross_layer_context(projectId, layer)` **لم تُعرَّف بعد**. يحتاج:
  - schema الرد (size budget، نوع الكائنات).
  - freshness contract (cache-friendly snapshot vs live query).
  - cycle-breaker (idempotency key، max fan-out) لتجنّب حلقة FIDIC↔Planning.
- إلى أن يُحسَم القرار، أي ميزة تحتاج cross-layer info تجمعها صراحة من DB query على Call-site، وتمرّرها للـ Persona كـ context واحد ثابت (يحافظ على cache hit ratio).

**سياسة الأولوية بين الطبقات (Layer Priority Policy) — قرار مُؤجَّل، يحجب C5/C6:**
- مثال: لو Engineering AI قال "هذا الاشتباك يستلزم تأخير 10 أيام" و Planning AI قال "Critical Path ما يقبلش أكتر من 3 أيام" و FIDIC AI قال "أي تأخير فوق 5 أيام يستحق EOT" — مين له الكلمة الأخيرة؟
- نُضيف كيان `CrossLayerPolicy` فارغ مع `priorityOrder: number[]` كـ Placeholder، ونوثّق التأجيل في ADR-0013.
- **مطلوب:** اجتماع مخصّص قبل دخول C5 (ليس C12) لحسم السياسة. — سؤال 1.

---

## 4. ربط Claude API + التكامل — Claude Integration Architecture

### 4.1 طبقات الاشتراك — Anthropic API Account Tier + إجابة على سؤال Pro/Max

**أولاً: ردّ مُباشر على سؤال الأستاذ الأيهم في الاجتماع.**

الأستاذ الأيهم سأل عن اشتراك Claude Pro / Max. هذا اشتراك **Claude.ai** (واجهة المستخدم النهائي) — مختلف عن **Claude API** (الذي تستهلكه المنصة برمجياً). الإجابة العملية:

- **للاستخدام البرمجي من المنصة (إنتاج):** Claude API account — مخطّط الـ Tiers أدناه.
- **لاستخدام خالد الشخصي أثناء التطوير** (للتجربة، كتابة Prompts، اختبار Computer Use يدوياً قبل ربطه بالـ API): **Claude Max (5x) يكفي**. السبب: Max يفتح Computer Use في الـ Desktop app لأغراض الاستكشاف، حصة استخدام عالية لـ Opus 4.8، و quota سخي للتجارب اليدوية. **Pro غير كافٍ** لاستخدام Computer Use بشكل عملي.
- **لـ "AI Assistant" داخل واجهة سيجما لمستخدم محدَّد (Al Ayham يجلس ويسأل المنصة سؤال مفتوح):** هذا يمر عبر API account المنصة، لا يحتاج Pro/Max على المستخدم.

**التوصية للاشتراك البرمجي:** بدء العمل على **Tier 2 API Account** لمدة الـ Pilot، الترقية لـ **Tier 3** فور أول Computer Use Run حقيقي على عميل، و **Tier 4 / Enterprise + ZDR** عند بلوغ 3 مشاريع نشطة.

**لماذا:** Computer Use Loops تُرسِل آلاف الطلبات في الـ Run الواحد (كل Screenshot = طلب). Tier 1 سيخنق العملية. Tier 2 يكفي للتجريب. Tier 3 يفتح Rate Limits المناسبة للإنتاج. Tier 4 + ZDR ضرورة لبيانات العقود الحساسة (FIDIC, BoQ المالي).

**سؤال مفتوح:** من يدفع فاتورة API؟ سيجما؟ خالد ويعيد التحصيل؟ — سؤال 6.

### 4.2 آلية النص الخبير لكل صفحة (Per-page system prompt mechanism)

**المسار المقترح:**

```
backend/src/modules/prompts/
  prompts.module.ts
  prompt-registry.service.ts        ← يُحمِّل ExpertPrompt بـ slug + locale + version
  prompt-resolver.service.ts        ← يأخذ pageSlug + userRole → يُرجع النص الكامل
  entities/
    expert-prompt.entity.ts
    prompt-version.entity.ts
    prompt-binding.entity.ts
  library/                          ← النصوص الفعلية (Markdown مُتحكَّم بإصداره)
    planning.p6.expert.ar-AE.v1.md
    planning.p6.expert.en-AE.v1.md
    fidic.red_book.expert.ar-AE.v1.md
    ...

frontend/lib/claude-prompts/        ← Hook react يستدعي الـ resolver عند فتح الصفحة
  usePagePersona.ts
```

**Flow:**
1. المستخدم يفتح صفحة `/planning/audit`.
2. الـ Frontend يستدعي `GET /prompts/resolve?page=planning.audit&locale=ar-AE&projectId=…`.
3. الـ Backend يحدّد slug = `planning.p6.expert.ar-AE`، يجلب أحدث `PromptVersion.published`، يضيف كتلة Constraints الدور الحالي + Project Snapshot Summary، ويُرجِع النص النهائي + `cache_breakpoint_id`.
4. عند كل استدعاء لـ Claude من تلك الصفحة، النص يُمرَّر في `system` field مع `cache_control: { type: 'ephemeral', ttl: '1h' }`.
5. السياق الخاص بالطلب (clash list / letter text / snapshot) يُمرَّر **بعد** الـ breakpoint ليبقى الـ Persona مُخزَّن مؤقّتاً.

### 4.3 استراتيجية Prompt Caching — صادقة عن الحدود

استناداً لبحث Claude API + مراجعة اقتصادية:

- **كل Persona يُكَش (Cached) بـ TTL = 1 ساعة** **حيث يفيد** — أي حيث يُستخدم في دفعات قصيرة الأمد (مُراجِع واحد يعالج 10 خطابات FIDIC متتالية، جلسة بناء Baseline واحدة، تحليل اشتباكات batch).
- **Caching لا يُفيد** للتقرير الشهري (TTL ساعة، الاستدعاء التالي بعد شهر). Batch API وحده هو مصدر التوفير هناك (خصم 50%). **لا نخلط الاقتصادين** كما كان يحدث في الإصدار السابق من هذه الوثيقة.
- **الحد الأدنى لـ Caching** (تابع لمنشورات Anthropic؛ القيم الحالية ~1,024 tokens للسوننيت والأوبَس) — كل Persona خبيرة عندنا تتجاوز هذا بسهولة (الـ FIDIC Persona مع كتاب مرجعي = 20–30 ألف token).
- **Pre-warm الـ Cache** عند فتح المستخدم الصفحة، لكي لا يكون أول استدعاء بطيئاً.
- **اقتصاديات:** الكتابة الأولى بسعر 2x للـ 1-hour TTL، ثم كل قراءة لاحقة بـ 0.1x من السعر الأساسي — تخفيض ≈ 90% على دفعات الاستخدام **في الحالات المناسبة**.
- **نسبة الإصابة المُستهدَفة (Cache Hit Ratio):** **لن نلتزم برقم قبل القياس.** بعد C3 نقيس لكل Persona ونضبط الـ breakpoint. الافتراض العملي للنمذجة المالية: 70–85% في الحالات المُكَشة، 0% في الحالات غير المُكَشة (التقرير الشهري).

### 4.4 Computer Use Guardrails — ما الذي يقدر/لا يقدر الـ Agent يلمسه

تم تفصيل الـ 12 قاعدة في قسم 3.2 وفي قسم 10 (سجل المخاطر). الخلاصة:

| يقدر | لا يقدر |
|---|---|
| فتح P6 في حاوية معزولة (gVisor/Firecracker، Windows VM) | الوصول للإنترنت العام |
| استيراد PMXML المُولَّد وعرضه بصرياً (Demo Path) | تأليف Baseline حر داخل P6 (لا يدعمه التصميم) |
| إنشاء مشروع جديد، WBS، Activities (Demo Path scripted) | تعديل بيانات مشروع آخر |
| حفظ ملف PMXML في مجلد Output | إرسال خطاب FIDIC بدون موافقة بشرية + step-up auth |
| طلب موافقة بشرية عبر أداة مخصّصة + nonce verification | تعديل الـ Persona الخاص به (Tool Registry يرفض) |
| قراءة جدول الكميات (Read-only mount) | تنفيذ أي أمر مالي/قانوني تلقائياً |
| التشغيل تحت رأس بيتا Computer Use الحالي | تجاوز Allowlist الشبكة (FQDN صريح) |

### 4.5 نموذج التكلفة المتوقَّعة شهرياً لكل مشروع نشط — مع التحفّظات

استناداً لبحث Claude API + مراجعة اقتصادية:

| السيناريو | التكلفة الشهرية المتوقَّعة | الافتراض الجوهري |
|---|---|---|
| **استخدام خفيف** — تدقيق فقط، Sonnet 4.6 + Haiku 4.5، Caching فعّال | $60–$120 | Caching يُفيد (دفعات قصيرة) |
| **استخدام متوسط** — FIDIC + Planning audit + التقرير الشهري + بعض Opus 4.8، **Computer Use للعرض فقط (دقائق لا أيام)** | $150–$300 | Demo Path فقط |
| **استخدام مُكثَّف** — كل ما سبق + Computer Use Demo Path للـ Baseline مرة في الشهر (~ساعة عرض) + Revit Clash | $400–$700 | Demo Path قصير |
| **استخدام مُكثَّف بـ Computer Use Authoring** (لو فُعِّل المسار البحثي يوماً ما — "3-4 أيام × 6-7 ساعات") | **$1,500–$3,000** | **هذا السيناريو غير مُدرَج في الـ envelope الحالي، ويحتاج إقرار منفصل من الأستاذ الأيهم** |

**الافتراضات الجوهرية:**
- Caching فعّال **حيث يُفيد** (FIDIC adjudication، Planning Persona أثناء جلسة build). صفر فائدة للتقرير الشهري.
- Tier-routing: Haiku لتصنيف الخطابات، Sonnet للافتراضي، Opus 4.8 لـ FIDIC adjudication والتقرير الشهري فقط.
- Batch API للتقرير الشهري (خصم 50%).
- Resize للـ Screenshots إلى عرض 1280px قبل الإرسال.
- **Computer Use بقصد العرض، ليس بقصد التأليف الحر.** السطر الأخير في الجدول يوضّح كلفة التأليف الحر لأغراض التخطيط.

**على مقياس PMO 20 مشروع** (استخدام متوسط): $3k–$6k شهرياً = حوالي 10–15% من إيرادات المنصة عند $5,000/سايكل — اقتصاديات قابلة للاستدامة.

**Burn-rate أثناء التطوير (لم يكن مُدرَجاً في الإصدار السابق):** فشل Computer Use runs + تكرار Prompts ≈ 2–3x الإنتاج. تقدير: $1.5k–$3k/شهر لخالد خلال C10–C11. يدخل ميزانية Annex 2.

### 4.6 خطة الـ Fallback عند عدم توفّر Claude

| الحالة | الإجراء |
|---|---|
| Claude API down | Queue للطلب، Retry بـ exponential backoff، تنبيه للمستخدم "خبير الـ AI غير متاح حالياً، جارٍ إعادة المحاولة". |
| Claude يرجع ثقة منخفضة (`confidence < 0.6`) | عدم عرض النتيجة كقرار، عرضها كـ "اقتراح أولي يحتاج مراجعة بشرية"، تسجيل في سجل المراجعة. |
| Rate limit | تأجيل المهمة لساعة هادئة، إخطار المستخدم. |
| Computer Use يفشل/يتعلّق | قتل الـ Session بعد 200 تكرار أو timeout 30 دقيقة بدون تقدّم، لقطة شاشة آخر حالة، تسليم للمسار اليدوي (المخطّط البشري يكمل من حيث وقفت). |
| الـ Output مخالف للـ JSON Schema | Strict tool use يمنع ده أصلاً؛ إن حصل، Retry مع تحذير صريح. |

> **مبدأ:** التدقيق الحتمي الموجود حالياً (القواعد الست + ConfidenceScore + EvidenceChain) يبقى يعمل دائماً مستقلاً عن Claude. لو Claude غاب، المنصة لا تتوقّف — تفقد فقط طبقة "الخبير النشط" مؤقّتاً.

---

## 5. خريطة الـ Layers المعدّلة — Revised Layer Map

### Layer 1 — Engineering / Revit / BIM

| البند | التفصيل |
|---|---|
| **سلسلة المُدخلات الحقيقية** | رسومات AutoCAD 2D من الاستشاري → نموذج Revit 3D **يبنيه البشر اليوم** (نمذجة AutoCAD→Revit آلية = مرحلة بحثية مستقبلية، ليست في النطاق) → Revit يُولِّد قائمة الاشتباكات. |
| **المُدخلات للمنصة** | قائمة الاشتباكات (Clash List من Revit، ~100 نقطة في مشروع متوسط الحجم بحسب الأستاذ الأيهم)، الرسومات (PDF/DWG)، جدول الكميات، الـ Project Snapshot. |
| **المُخرَجات** | لكل اشتباك: 3 SolutionProposal مع time/cost deltas + Coordination requirements. لمَّا يُختار حل → SimulationRun بأثر الجدول والتكلفة. |
| **Prompts المستخدمة** | `revit.clash.analyst.ar-AE` ‏(+ `en-AE`)، `engineering.discipline_coordinator.ar-AE`. |
| **Role Access** | Admin: كامل. Reviewer: قراءة. Client: قراءة + قبول/رفض حل. Consultant: قراءة + اقتراح + محاكاة. Contractor: قراءة شريحته فقط + رفع الـ Clash List. |
| **الحالة اليوم** | غير موجود. يحتاج: ClashItem entity, ClashIngest parser, SolutionProposer service, BoQ entity, SimulationRun service. |

### Layer 2 — Planning / Primavera

| البند | التفصيل |
|---|---|
| **المُدخلات** | (Audit mode) ملف P6 من المقاول. (Author mode) رسومات + BoQ + Project meta. (Sim mode) Snapshot + تغييرات افتراضية. |
| **المُخرَجات** | (Audit) قائمة عيوب الجودة + قائمة الانحرافات (القواعد الست). (Author Path) PMXML واحد بـ Project + Baseline + تقرير منطق. (Demo Path) عرض بصري داخل P6 على Windows VM. (Sim) Snapshot على فرع Scenario. |
| **Prompts المستخدمة** | `planning.p6.expert.ar-AE`، `planning.audit.specialist.ar-AE`، `planning.simulation.analyst.ar-AE`. |
| **Role Access** | Admin: كل الأوضاع. Reviewer: قراءة. Client: قراءة + اعتماد. Consultant: Audit + Sim. Contractor: قراءة شريحته + Sim. |
| **الحالة اليوم** | Audit جزئي (القواعد الست تكشف انحرافات تنفيذ، لا تكشف عيوب جودة baseline). Author Path = صفر. Demo Path = صفر. Sim = صفر. |

### Layer 3 — Governance / FIDIC + PMI

| البند | التفصيل |
|---|---|
| **المُدخلات** | عقد المشروع + نوعه (يحدّد الكتاب)، خطابات المقاول (PDF/Word/Email، يحتمل OCR)، الهيكل التنظيمي للمقاول. |
| **المُخرَجات** | تصنيف بند + رد خطاب مُسوَّد + رياضيات مهلة. تقرير امتثال PMI + خطاب تصحيح. |
| **Prompts المستخدمة** | `fidic.red_book.expert.ar-AE` ‏(+ Yellow/Green/Silver/Gold)، `pmi.org_chart.auditor.ar-AE`، `fidic.letter.drafter.ar-AE`. |
| **Role Access** | Admin: كل العمليات. Reviewer: قراءة. Client: اعتماد الخطابات + قراءة. Consultant: مشاهدة + اقتراح. Contractor: استلام الخطابات الموجَّهة له فقط. |
| **الحالة اليوم** | خريطة FIDIC ثابتة (rule→clause). لا يوجد letter intake، لا توليد رد، لا PMI auditor، لا org chart entity. **يحجبه قرار Layer Priority Policy.** |

### Layer 4 — Reports

| البند | التفصيل |
|---|---|
| **المُدخلات** | Snapshot + Alerts + Decisions + خطابات + مقتطفات رسومات + Persona المُتلقّي. |
| **المُخرَجات** | تقرير يومي / أسبوعي / شهري. الشهري PDF بثلاثة عروض (Owner/PD/Contractor). |
| **Prompts المستخدمة** | `report.daily.author.ar-AE`، `report.weekly.author.ar-AE`، `report.monthly.author.ar-AE` (نسخ منفصلة لكل Persona مُستلِم). |
| **Role Access** | Admin: ينتج كل التقارير. Reviewer: يرى كل التقارير. Client: يرى نسخة Owner. PD-role (سواء Client أو Consultant): يرى نسخة PD. Contractor: يرى نسخة Contractor. |
| **الحالة اليوم** | تقرير تنفيذي أسبوعي حتمي واحد بنقاط، LLM rewrite اختياري للأسلوب. لا PDF، لا يومي، لا شهري، لا مقتطفات رسومات، لا عروض متعدّدة الجهات. |

### Layer 5 — Simulation Sandbox (Cross-cutting capability)

| البند | التفصيل |
|---|---|
| **المُدخلات** | أي Snapshot من Canonical + قائمة تغييرات افتراضية. |
| **المُخرَجات** | Scenario entity منفصل، إعادة تقييم القواعد عليه، عرض Diff مع Canonical. |
| **Prompts المستخدمة** | يستخدم Persona الطبقة الأصلية مع وَسم `mode=simulation` يفرض على Claude إضافة عبارة "This is a what-if". |
| **Role Access** | Client, Consultant, Contractor (شريحته فقط). Sigma Reviewer: غير مُحدَّد بالنص في الاجتماع — Khaled default: غير مُتاح، قابل للتعديل. |
| **الحالة اليوم** | غير موجود. يحتاج: `Scenario` entity, copy-on-write للـ Snapshot, capability `canSimulate`, شارة UI، سياسة Promote-to-canonical. |

---

## 6. خطة السايكلز المعدّلة — Revised Cycle Plan

### الحالة الأصلية

8 سايكلز كما هي في العقد (مرجع: ملف execution-state). حالياً في بداية Layer 1 Cycle 1.

### مبدأ صارم بعد المراجعة التعاقدية: **عدم خلط C1 الأصلي مع إضافات Annex 2.**

C1 الأصلي يُسلَّم على نطاقه الأصلي ويُقبَل ويُحاسَب على سعر العقد الأصلي ($5,000). الإضافات على C1 (BoQ + SolutionProposer + SimulationRun) تنتقل إلى **C1.5** كسايكل منفصل ضمن Annex 2، ولا تُخلَط مع C1 الأصلي في التسليم أو الفوترة. هذا يحفظ نظافة الـ acceptance + payment trail.

### التعديل المقترَح — صادق هندسياً (مُعدَّل بعد المراجعة)

نُبقي على الـ 8 سايكلز الأصلية ونُضيف **8–10 سايكلز جديدة (C1.5, C9–C16/17)** ضمن إعادة تحديد النطاق بموجب الملحق 2. هذا أعلى من 4 في المسودة الأولى، وهو الرقم الصادق بعد تفكيك C1 المُوسَّع و C6 (FIDIC) و C9 (Monthly Narrative) و C10/C11 (Author + Demo) لحجوم قابلة للتسليم.

| Cycle | النطاق | الحجم | يعتمد على | تغيير عن الأصل |
|---|---|---|---|---|
| **C1** (حالي، يُسلَّم بنطاقه الأصلي) | Layer 1 base كما هو في العقد الأصلي. | M | لا يوجد | **بدون تغيير** — يُسلَّم ويُقبَل قبل بدء Annex 2. |
| **C1.5** (جديد) | BoQ entity + ClashItem + ClashIngest parser. | L | C1 | **سايكل جديد** ضمن Annex 2. |
| **C2** | PromptRegistry module: ExpertPrompt + PromptVersion + PromptBinding + admin UI + draft للـ 5 personas الأساسية | M | C1.5 | **سايكل جديد** (لم يكن في النطاق) |
| **C3** | Claude integration overhaul: استبدال LlmService بـ ClaudeService، Caching، Tool Use، per-page persona resolver | M | C2 | **مُعدَّل** (كان "LLM provider abstraction") |
| **C4** | Layer 2 Audit++ : قواعد جودة Baseline (Padding, missing relationships, optimistic durations, open ends, constraint abuse) | M | C1, C3 | **تحسين** للموجود |
| **C5** | SolutionProposer (3 خيارات) + SimulationRun infrastructure + canSimulate capability + Scenario entity + copy-on-write snapshot + UI sandbox + Promote workflow. **يحجبه:** قرار Layer Priority Policy. | L | C1.5, C3, C4 | **سايكل جديد + مُوسَّع** |
| **C6** | Layer 3 FIDIC letter intake + classifier + deadline math + drafter + approval workflow (Red Book first). **يحجبه:** قرار Layer Priority Policy. | L | C2, C3, C5 | **مُوسَّع** كثيراً عن "FIDIC mapping" الأصلي |
| **C6.5** | FIDIC: Yellow + Green + Silver + Gold books + bilingual templates + OCR pipeline. | M | C6 | **سايكل جديد** (تفكيك C6 الكبير) |
| **C7** | Layer 3 PMI: OrgChart entity + PMI compliance checker + Correction letter generator | M | C6 | **سايكل جديد** |
| **C8** | Layer 4 Reports tier: Daily + Weekly enhanced + foundation للـ Monthly | M | C2, C3 | **مُوسَّع** عن "Reports" الأصلي |
| **C9a** | Layer 4 Monthly Narrative: Snapshot pipeline + 3 stakeholder views + Batch API integration. | M | C8 | **سايكل جديد** |
| **C9b** | Drawing extract pipeline + PDF renderer (Arabic RTL + Tajawal embed) + digital signature. | M | C9a | **سايكل جديد** (تفكيك C9 الكبير) |
| **C10** | Layer 2 Author Path: BaselineBuildJob + WBSNode + ActivityDraft + MPXJ PMXML writer + In-platform baseline review UI. **هذا هو مسار التأليف الإنتاجي.** | L | C3, C5 | **سايكل جديد** |
| **C11** | Layer 2 Demo Path: Computer Use integration (Windows VM) + scripted P6 import + sandbox container + approval gates + audit manifest + signed-manifest pipeline. **هذا هو مسار العرض، ليس التأليف الحر.** | L | C10 | **سايكل جديد** |
| **C12** | Cross-layer + pilot hardening: Layer field + multi-valued Evidence.layers + Outbox table + Arabic terminology pass + pilot tenant + feature flags + incident runbook + pen-test gate | L | كل ما سبق | **مُوسَّع** عن "polish & handover" |
| **(اختياري) C13** | Computer Use Authoring R&D (لو الأستاذ الأيهم طلب صراحةً وموَّل منفصلاً): محاولة جعل AI يبني داخل P6 مباشرةً بدون PMXML pre-build. | XL+ | C11 | **R&D، خارج الإنفلوب الأساسي** |

### Dependency chain (مُختصَر، مُعدَّل)

```
C1 (delivered) ── C1.5 ── C2 ── C3 ──┬── C4 ── C5* ──┐
                                     │               ├── C6* ── C6.5 ── C7
                                     │               │
                                     └── C8 ── C9a ── C9b
                                                          │
                                                          ├── C10 ── C11
                                                          │
                                                          └────────────── C12

* C5, C6 محجوبان بـ Layer Priority Policy decision (انظر سؤال 1 + قسم 3.7)
```

### ملاحظة Annex 2 صريحة

> هذه الزيادة في النطاق تنشّط البند المنصوص عليه في **الملحق 2 من اتفاقية الخدمة** الخاص بمشغّل إعادة تحديد النطاق (Re-scope Trigger). **C1 يُسلَّم على نطاقه الأصلي ويُحاسَب على $5,000.** كل ما بعد C1 يدخل ضمن Annex 2. الكلفة والمدة الإضافية تُفصَّل في القسم 11، وتُقَرّ بالاتفاق المُشترَك بين الأستاذ الأيهم والمهندس خالد قبل دخول C1.5 حيز التنفيذ. **قبل بدء أي عمل على C1.5، يجب: (أ) قبول C1 رسمياً، (ب) توقيع memo Annex 2.** هذا يفصل بوضوح بين عمل العقد الأصلي وعمل التوسعة.

---

## 7. الأدوار + Capability Matrix

| الصلاحية | Sigma Admin | Sigma Reviewer | Client | Consultant | Contractor |
|---|---|---|---|---|---|
| `canRead` | True | True | True | True | True (شريحته) |
| `canReadAll` | True | True | True (مشروعه) | True (مشروعه) | False |
| `canIngest` | True | False | False | False | True (تقاريره) |
| `canIngestSchedule` *(جديد)* | True | False | False | False | True |
| `canIngestBoQ` *(جديد)* | True | False | False | False | True |
| `canIngestLetter` *(جديد)* | True | False | True | False | True |
| `canEvaluateRules` | True | True | True | True | True |
| `canEditPolicy` | True | False | True | False | False |
| `canGenerateSummary` | True | True | True | True | True (شريحته) |
| `canSimulate` *(جديد)* | True | **False** † | True | True | True (شريحته) |
| `canEditPrompts` *(جديد)* | True | False | False | False | False |
| `canApproveLetter` *(جديد)* | True | False | True | False | False |
| `canApproveBaseline` *(جديد)* | True | False | True | False | False |
| `canTriggerComputerUse` *(جديد)* | True | False | False | False | False |

**† Sigma Reviewer + canSimulate:** الاجتماع نصّ على "لا يرفع" ولم يذكر المحاكاة. الاختيار الافتراضي مني (Khaled default): قراءة فقط بحكم الميثاق، بدون محاكاة. **يحتاج تأكيد** — سؤال 13.

**التغييرات عن التطبيق الحالي:**
- Consultant: `canEvaluateRules` يتحول من False ← True، `canGenerateSummary` من False ← True، `canIngest` من True ← False. **مُستنبَط** من نصّ الاجتماع ("Consultant مثل Client ناقص تعديل السياسة" + "Client بدون رفع") — تأكيد مُستحسَن في الـ Sizing meeting.
- Contractor: `canEvaluateRules` من False ← True، `canGenerateSummary` من False ← True (محصور بشريحته)، `canIngest` يتم تفكيكها لـ flags فرعية.
- Client: `canIngest` من True ← False كانت حالياً متاحة بشكل عام، نضيّقها لـ `canIngestLetter` فقط (الأستاذ الأيهم نص بوضوح: "Client … NO upload").
- إضافات جديدة بالكامل: `canSimulate`, `canEditPrompts`, `canApproveLetter`, `canApproveBaseline`, `canTriggerComputerUse`.

---

## 8. لغة الواجهة — Domain-Tuned Language

استناداً لملاحظة الأستاذ الأيهم: *"اللغة المستخدمة في المجال نفسه"*.

| السياق | الترجمة الحالية (الحرفية) | المصطلح الصحيح في صناعة الإنشاءات | ملاحظة |
|---|---|---|---|
| Schedule audit | "مراجعة الجدول" | **تدقيق الجدول الزمني** | "مراجعة" أعمّ؛ "تدقيق" هو المصطلح الفني المعتمد. |
| Baseline | "خط الأساس" | **الجدول الأساسي المعتمَد** | "خط الأساس" ترجمة قاموسية، لا تُستخدَم ميدانياً. |
| Critical path | "المسار الحرج" | **المسار الحرج** (سليم) | يبقى كما هو، لكن مع ترميز P6 (Total Float = 0). |
| EOT (Extension of Time) | "تمديد الوقت" | **تمديد المدة** أو **EOT** صراحة | "تمديد الوقت" غير شائع؛ يُستخدَم EOT أو تمديد المدة. |
| RFI (Request for Information) | "طلب معلومات" | **طلب معلومات / RFI** | يُترَك مختصره معروفاً بين المهندسين. |
| BoQ (Bill of Quantities) | "فاتورة الكميات" | **جدول الكميات** | "فاتورة" مالية؛ المستند نفسه "جدول". |
| Clash detection | "كشف التضارب" | **كشف الاشتباكات** | "اشتباك" هو المصطلح المعتمد في BIM العربي. |
| Variation Order | "أمر تغيير" | **أمر تغييري / VO** | "أمر تغيير" أيضاً مقبول؛ الأهم تجنّب "تعديل". |
| Snag list | "قائمة العيوب" | **قائمة الملاحظات النهائية / Snag List** | "العيوب" قانونية؛ "الملاحظات النهائية" تشغيلية. |
| Notice | "إشعار" | **إخطار** (سياق FIDIC) | "إشعار" عام؛ "إخطار" أدق قانونياً في FIDIC العربية. |
| Liquidated Damages | "أضرار سائلة" | **غرامات التأخير / LD** | "أضرار سائلة" ترجمة آلية خاطئة شائعة. |
| Substantial Completion | "إتمام جوهري" | **إنجاز جوهري** أو **تسلُّم ابتدائي** | "إنجاز" أدق من "إتمام" في سياق الإنشاءات. |
| Punch list | "قائمة الثقوب" | **قائمة الأعمال المتبقّية** | "قائمة الثقوب" ترجمة آلية كارثية للأسف شائعة. |

**موضع التطبيق في الكود:**
- `frontend/lib/i18n/ar.ts` — تنقيح المفردات.
- `backend/src/modules/governance/default-policy.ts` — أوصاف بنود FIDIC حالياً إنجليزية فقط، تحتاج نظير عربي.
- `backend/src/modules/summary/summary.service.ts` — `composeGrounded()` تنتج Literal إنجليزي ("Schedule status:", "Reporting:")، يحتاج مسار `locale`-aware.
- **Glossary cached block** يُحقَن في كل Persona كجزء من النص الخبير الدائم، حتى Claude نفسه يستخدم المصطلحات الصحيحة.

---

## 9. أسئلة مفتوحة لمستر إيهم — Open Questions to Confirm

**الأسئلة التجارية والتعاقدية (تحتاج إجابة قبل بدء C1.5):**

1. **سياسة الأولوية بين الطبقات** — لو الـ Engineering AI قال "هذا الاشتباك يستلزم تأخير 10 أيام" والـ Planning AI قال "Critical Path ما يقبلش أكتر من 3 أيام" والـ FIDIC AI قال "أي تأخير فوق 5 أيام يستحق EOT" — مين له الكلمة الأخيرة؟ **يحجب C5 و C6.** نحتاج تاريخ محدَّد لاجتماع هذا القرار (اقتراحي: قبل 2026-06-30).
2. **إقرار envelope Annex 2 من حيث المبدأ** — هل توافق على الزيادة بنسبة 150–220% فوق العقد الأصلي **من حيث المبدأ** قبل أن أبدأ كتابة 3 ADRs وتصميم C1.5؟ تقدير الأرقام النهائية يتم في جلسة Sizing، لكنني أحتاج إشارة قبول أوّلية حتى لا أمتص مخاطر مالية بصمت.
3. **مَن يملك ويدفع API account؟** سيجما؟ أم خالد ويعيد التحصيل؟ من حساب من تكون الفواتير الشهرية ($60–$3,000/مشروع)؟ من يوقّع ZDR Agreement مع Anthropic — سيجما كشركة، أم خالد؟
4. **مسؤولية AI Output Quality و Liability** — لو خطاب FIDIC مُسوَّد بـ Claude (حتى بعد موافقة بشرية) أدّى لخسارة تعاقدية، مَن يتحمّل المسؤولية؟ خالد؟ سيجما؟ الـ PD المُعتمِد؟ يجب الحسم كتابةً **قبل** شحن C6.
5. **معايير القبول لميزات AI** — القواعد الحتمية لها tests واضحة. "جودة baseline AI" و "دقة خطاب FIDIC" ليست لها. ما بوّابة القبول لـ C6 و C9 و C10 و C11؟ نسبة ثقة دنيا؟ مراجعة 10 حالات؟ يحدَّد في جلسة Sizing.
6. **ملكية الـ Personas (IP)** — لو خالد كتب الـ FIDIC Persona MD files، مَن يملكها؟ سيجما؟ خالد؟ ملكية مشتركة؟ هل يقدر خالد إعادة استخدامها على تعاقدات PMO أخرى؟
7. **تراخيص P6** للحاويات (Demo Path) — Oracle لا يهديها مجاناً، per-named-user. مَن يملك ويدفع التراخيص للحاويات؟
8. **معدّل فشل Computer Use المقبول** — لو 4 من 5 محاولات Demo Path تفشل، هل هذا قبول؟ أم خصم؟ نص واضح في عقد Pilot.

**الأسئلة العملية والمنتجية:**

9. **توقيت الوصول لمشروع Pilot** — أي عميل سيجما الحقيقي؟ متى يبدأ الوصول للبيانات؟ ما درجة حساسية البيانات (NDA؟ ZDR؟ تحجيم وصول؟). هل البيانات حية أم منسوخة؟ **هل العميل يعلم أن بياناته ستذهب لمزوّد LLM أمريكي (US-only data residency)؟ هل يُوقِّع موافقة كتابية؟**
10. **نطاق Pilot ونقطة الخروج** — مدة محدَّدة (3 شهور؟)، معايير نجاح، كيف ينتقل لـ Retainer؟ **هل عمل خالد على Pilot مدفوع بسعر السايكل، أم ضمن Retainer مستقبلي، أم مجاني كاستثمار؟** الـ "zero cost trial" تخص العميل، لا تحدّد حالة خالد.
11. **نموذج التقرير الشهري** — هل هناك تقرير شهري حالي من سيجما نستطيع محاكاته؟ ما القالب البصري المُفضَّل؟ ترويسة سيجما الرسمية؟ أم ترويسة عميل المشروع؟
12. **مراجعة دفعة الـ Prompts الأولى** — متى نجدول جلسة معاً (3–4 ساعات) لمراجعة المسوّدات الأولى للـ 5 Personas؟ هل تفضّل عربي أوّلاً أم نطوّر العربي والإنجليزي بالتوازي؟
13. **Sigma Reviewer + canSimulate** — الاجتماع نصّ على "لا يرفع". هل يقدر يحاكي؟ افتراضي الحالي: لا. تأكيد؟
14. **نموذج الـ Retainer ما بعد التسليم** — شهري ثابت ($X/شهر مقابل Y ساعة)؟ أم ساعي ($Y/ساعة)؟ أم لكل حادثة ($Z/incident)؟ ما الأنسب لمحاسبة سيجما الداخلية؟
15. **مشغل "AI Actually Opens P6"** — الأستاذ الأيهم قال بالنص "AI ACTUALLY OPENS P6". الخطة الحالية تَعرِض هذا في Demo Path (C11) فقط، **لا تجعله مسار التأليف الإنتاجي** (C10 يكتب PMXML خارج P6). هل هذا التمييز مقبول؟ أم تطلب صراحةً أن يكون التأليف داخل P6؟ (تكلفة إضافية وزمن إضافي إن نعم — C13 R&D.)
16. **مرجع "3-4 أيام × 6-7 ساعات"** — هل هذا الرقم قياس فعلي من تجربة سابقة، أم تقدير حدسي؟ نحتاج كأساس لتقدير ميزانية Compute.
17. **الكتب الخمسة لـ FIDIC** — أي كتب يملكها العميل/سيجما بنسخ معتمدة (PDF)؟ هل نشتريها لو ناقصة؟ الـ Persona سيستشهد منها فقط.
18. **اللغة الأساسية لاجتماعات Pilot** — هل المراسلات والتقارير للعميل ستكون عربية رسمية، أم Bilingual بكل وثيقة، أم نختار حسب اللغة المُسجَّلة في العقد لكل مشروع؟
19. **نموذج P6 المُستهدَف** — أي إصدار من P6 يستخدمه عميل Pilot؟ (نهدف PMXML للإصدار المُحدَّد، الـ XSD يختلف بين 18.x و 22.x و 24.x).
20. **PMI Org Chart مرجعي** — لم يُحدِّد الاجتماع نسخة (السؤال إضافة مني). أي نسخة PMBOK نستخدمها كمرجع (السابعة / السادسة)؟
21. **مخزن الرسومات** — أين تعيش الرسومات حالياً عند سيجما؟ SharePoint؟ Aconex؟ BIM 360؟ هذا يحدد كيف نسحبها للـ Pipeline.
22. **Khaled نفسه يستخدم Claude Max** — اقتراحي في 4.1 أن يكون خالد على Claude Max (5x) شخصياً لتطوير الـ Personas واختبار Computer Use يدوياً. **هل سيجما تموِّل هذا، أم خالد؟** (≈ $100–$200/شهر شخصياً.)

---

## 10. سجل المخاطر — Risk Register

| # | المخاطرة | الاحتمال | الأثر | التخفيف | المالك |
|---|---|---|---|---|---|
| R1 | **Computer Use موثوقية مُتذبذبة** — حلقات الـ Agent تنكسر على Modal Dialogs ووميض الـ Focus وتغيّر دقّة الشاشة. **P6 على Windows VM أقل نضجاً من Linux** بالإضافة. | High | High | حد أقصى 200 تكرار، نقاط Checkpoint كل 50 تكرار، Approval gate قبل أي حفظ، Fallback يدوي للمخطط البشري. **Demo Path scripted فقط، لا تأليف حر.** ابدأ بـ Computer Use للعرض فقط في C11، أي تأليف حر يدخل C13 R&D بميزانية منفصلة. | خالد |
| R2 | **XER/PMXML schema drift عبر إصدارات P6** | High | Medium | استخدام PMXML (له XSD رسمي) بدلاً من XER كمسار رئيسي. Pin إصدار العميل في الـ Header. CI ضد P6 Pro 22.x و 24.x على الأقل. | خالد |
| R3 | **Claude API rate limits** أثناء Computer Use loops | Medium | Medium | Tier 3 قبل الإنتاج. Backoff. تأجيل لـ Off-peak. Per-project budget cap. | خالد |
| R4 | **انجراف الـ Prompts عبر إصدارات Claude** (Opus 4.7→4.8 غيّرت دفاعات thinking كمثال) | High | Medium | كل Persona مُتَّحَكم بإصدارها، Tests ضد قائمة Golden cases عند كل ترقية نموذج، Khaled على Retainer لإعادة الضبط. | خالد + الأيهم |
| R5 | **هلوسة Claude على بند FIDIC** (يستشهد بند خاطئ) | Medium | **Critical** | كل خطاب FIDIC يدخل بشراً (PD/Client) للاعتماد قبل الإرسال، **مع step-up auth في لحظة الاعتماد**. Persona مُلزَمة بـ Citation صريحة لرقم البند وصفحة الكتاب. لا إرسال آلي تحت أي ظرف. | الأيهم (Approver) |
| R6 | **تجاوز كلفة الـ AI** عن الميزانية | Medium | Medium | Per-project, per-month cap. Dashboard للأيهم. Tier-routing (Haiku للسهل، Sonnet للافتراضي، Opus للصعب فقط). Batch للتقارير. **Burn-rate أثناء التطوير $1.5k–$3k/شهر مُدرَج في Annex 2.** | خالد |
| R7 | **Prompt injection من ملف رفعه المقاول** | Medium | High | Sanitizer + `<untrusted_*>` wrapping + مُصنّف Anthropic مُفعَّل + Persona تُحذَّر من الـ Override في كتلة Constraints + **nonce verification لاستدعاءات `request_human_approval`**. | خالد |
| R8 | **ترخيص MPXJ** (LGPL مقابل تجاري) للنشر السحابي | Medium | Medium | مراجعة قانونية مبكّرة. **تخصيص ميزانية صريحة في Annex 2 لرخصة Jon Iles التجارية** (يُقدَّر بآلاف $). مكان MPXJ خلف Adapter Interface ليسهل الاستبدال. | الأيهم (legal) + خالد (تجريد) |
| R9 | **تأخّر وصول Pilot** أو تغيّر عميل Pilot | Medium | Medium | البدء بـ "Reference Project" داخلي وهمي حتى وصول الـ Pilot. كل وحدة جديدة بـ Seed data كاملة قابلة للعرض. | الأيهم |
| R10 | **اللغة العربية تظل تبدو ركيكة** | High | Medium | مرور تنقيح من مهندس إنشاءات عربي قبل تسليم C12. Glossary cached مدمج في كل Persona. ar.ts review ضد الجدول في قسم 8. | خالد + مراجِع لغوي |
| R11 | **مزج البيانات بين Tenants** أثناء تشغيل Computer Use | Low | **Critical** | **gVisor/Firecracker (لا Docker العاري)، حاوية واحدة لكل مشروع لكل Session، لا مشاركة، تُدمَّر بعد الاستخدام. Pen-test قبل Pilot مُدرَج بميزانية في Annex 2. pcap capture 30 يوم.** | خالد |
| R12 | **Khaled bandwidth — Single point of failure** — السايكلز الجديدة تتوسع لـ 16–18 بدلاً من 8، وكل R1–R11 يتطلب اهتمام خالد. | High | **High** (مُرفَّع من Medium) | إعادة جدولة بشفافية مع الأيهم، إقرار Annex 2 مكتوب، وجود نقاط Demo كل سايكل، **تحديد backup contact (السيد عوض؟) قبل C6 لتغطية انقطاع خالد محتمل، وخاصةً للـ FIDIC حيث الانقطاع = exposure قانوني.** | خالد + الأيهم |
| R13 | **Data residency** — Anthropic US-only، لا توجد منطقة UAE. عميل Pilot الإماراتي قد يرفض. | Medium | High | إفصاح كتابي للعميل في عقد Pilot. موافقة موقَّعة قبل أول رفع بيانات. خطة بديلة (تشغيل on-prem أو منطقة EU) مُؤجَّلة لما تتوفّر. | الأيهم (commercial) |
| R14 | **Container escape from P6 COM/macros** — P6 على Windows يدعم COM، imports قد تنفّذ كود | Low | **Critical** | gVisor/Firecracker + outbound deny-all + audit pcap. لا ملفات import من مصادر غير موثوقة. كل ملف import يمر بـ checksum verification. | خالد |
| R15 | **انجراف الـ envelope بعد C1** — اكتشاف صعوبات تضاعف التقديرات الحالية. | Medium | High | Demo gate كل سايكلين، حق إعادة فتح Annex 2 عند تجاوز ±25% عن التقدير، شفافية مالية شهرية. | خالد + الأيهم |

---

## 11. الإطار الزمني والكلفة — Re-scope Envelope

### تنبيه صريح للقارئ

كل الأرقام في هذا القسم هي **تقدير مهندسي مني (Khaled estimate)، لم تُذكَر في الاجتماع.** الأستاذ الأيهم أقرّ بزيادة النطاق بالكلام، **لم يلتزم بأي رقم.** الأرقام النهائية تُحدَّد في جلسة Sizing مخصّصة. أقدّمها هنا كأساس للنقاش، وقد رفعتها بالقدر الذي يجعلها صادقة هندسياً بعد المراجعة، وأفضّل الصدق المؤلم على المفاجآت اللاحقة.

### النطاق الجديد بأرقام تقديرية صادقة

| البند | الأصلي | تقدير المسودة الأولى (متفائل) | **التقدير الصادق بعد المراجعة** |
|---|---|---|---|
| عدد السايكلز | 8 | 12 (+4) | **16–18 (+8 إلى +10)** |
| المدة التقريبية | 16 أسبوع (8 × أسبوعين) | 24–30 أسبوع | **40–52 أسبوع (+24 إلى +36 أسبوع)** |
| القيمة الإجمالية | $40,000 ‏(8 × $5,000) | تُحدَّد في Sizing Pass | تقدير أوّلي: **+$60k إلى +$90k (150%–220% فوق الأصل)** |

> **لماذا الرقم ارتفع عن المسودة الأولى:**
> - C1 الأصلي + C1.5 يفصلان لـ سايكلين منفصلين (شغل بيز أكثر مما رأينا).
> - C6 (FIDIC) ينقسم إلى C6 + C6.5 لتغطية 5 كتب + OCR + bilingual templates.
> - C9 (Monthly narrative) ينقسم إلى C9a + C9b — Arabic RTL PDF + drawing extracts شغل سبرنت بذاته.
> - C5 يدمج SolutionProposer (3 خيارات) لأنه يعتمد على نفس البنية التحتية لـ Simulation.
> - **Computer Use Authoring (C13)** يخرج من Envelope الأساسي ويصبح R&D اختياري بميزانية منفصلة.

### بنود ميزانية إضافية غير cycle-based (مُضافة بعد المراجعة):

| البند | تقدير | الحالة |
|---|---|---|
| **رخصة MPXJ التجارية** (Jon Iles, cloud deployment) | $3k–$8k one-time | يحتاج مراجعة قانونية + شراء قبل C10 |
| **تراخيص P6 Pro** للحاويات (Demo Path) | $X/seat/year per concurrent session | يحدَّد بحسب عدد المشاريع المتزامنة — سؤال 7 |
| **Pen-test قبل Pilot** | $5k–$10k one-time | مطلوب قبل إطلاق Pilot على بيانات حقيقية |
| **مراجعة قانونية لـ ZDR + Pilot agreement** | $3k–$8k one-time | مطلوب قبل أول session على بيانات عميل |
| **AI Burn-rate أثناء التطوير** (Claude API لخالد خلال C10–C11) | $1.5k–$3k/شهر × ~6 شهور = $9k–$18k | فشل CU runs، تكرار Prompts، tests |
| **Claude Max لخالد شخصياً** (إن مولّت سيجما) | $100–$200/شهر | سؤال 22 |
| **مراجِع لغوي عربي إنشائي** قبل C12 | $1k–$3k one-time | لـ ar.ts polish وقوالب الخطابات |

**إجمالي البنود غير cycle-based: $24k–$50k.** يدخل ضمن Annex 2.

### مرجع البند التعاقدي

تفعيل البند الخاص بمشغّل إعادة تحديد النطاق (Re-scope Trigger) في **الملحق 2 من اتفاقية الخدمة بين سيجما والمهندس خالد**. **القاعدة الصارمة:** C1 الأصلي يُسلَّم ويُقبَل ويُحاسَب على نطاقه الأصلي ($5,000) **قبل** بدء C1.5. لا خلط بين الـ scope الأصلي والإضافات.

الإقرار المُشترَك مكتوب يُرفَق بالعقد قبل دخول C1.5 حيّز التنفيذ. **يجب أن يقتبس memo Annex 2 لغة البند الفعلية بالنص (لا إشارة عامة)** ويُرفِق mapping بين الميزات الجديدة وشروط مشغّل البند، لتفادي أي غموض قانوني لاحق.

**ماذا لو رفض الأستاذ الأيهم Envelope المعدَّل؟** يحدث أحد ثلاثة:
- **(أ) قبول جزئي:** نُسلِّم بعض الإضافات، نُؤجِّل الباقي. نُعِد ترتيب الـ cycle plan على الفور.
- **(ب) العقد الأصلي فقط:** خالد يُكمِل الـ 8 سايكلز الأصلية على نطاقها الأصلي، الإضافات لا تُسلَّم.
- **(ج) إنهاء بالتراضي:** الأخير وغير المتمنّى، لكنه احتمال مفتوح يجب الاعتراف به.

**نموذج الدفع للسايكلز الجديدة:** يتبع نفس صيغة 30/70 split + banking المُتفق عليها في العقد الأصلي (مذكور في memory commercial structure)، ما لم يطلب الأستاذ الأيهم تعديل.

### بدائل لتقليل الـ Envelope

لو الزيادة كبيرة على ميزانية سيجما، يمكن **تأجيل** بعض الإضافات لمرحلة ثانية بعد Pilot:
- **مؤجَّل سهل:** C11 (Computer Use Demo Path) — هو الأعلى تكلفة والأعلى مخاطر. C10 وحده (MPXJ writer) ينتج Baseline حقيقي قابل للاستيراد في P6 بدون Computer Use. **ندفع تنازلاً مقابل "AI Actually Opens P6" — الأستاذ الأيهم يحتاج يقرّ.**
- **مؤجَّل ممكن:** C7 (PMI Auditor) — أقل أولوية من FIDIC.
- **مؤجَّل ممكن:** C6.5 (Yellow/Green/Silver/Gold) — نبدأ بالـ Red Book فقط، البقية مرحلة 2.
- **مؤجَّل ممكن:** C9b (Drawing extracts + PDF render) — نسلّم C9a (نص) فقط، PDF كمرحلة 2.
- **غير قابل للتأجيل:** C1.5 (BoQ + Clash entities)، C2 (PromptRegistry)، C3 (Claude integration)، C5 (Simulation)، C6 (FIDIC letter generator)، C9a (Monthly narrative core) — هذه أساس الـ Vision الجديدة.

---

## 12. الخطوات السبعة التالية — Recommended Next 7 Days (مُعاد ضبطها للواقعية)

> **مراجعة المسودة الأولى أشارت إلى أن الـ 7 أيام الأولى كانت over-packed.** بالأخص: 3 ADRs في 4 ساعات، C1 extension PR في يوم، 5 personas في يوم. هذه ليست تقديرات صادقة لشغل بجودة "خبير مستشار سينيور". أعدت الجدول هنا بشكل أكثر واقعية، مع تخفيف الأحمال وترك مساحة للمراجعة والتفكير. الأهم هو إقرار Annex 2 envelope والميل لاجتماع التأكيد، لا إنتاج كل شيء في الأسبوع الأول.

| اليوم | المهمة | المُخرَج | المدة الواقعية |
|---|---|---|---|
| **الإثنين 2026-06-09** (اليوم) | تسليم هذه الوثيقة للأستاذ الأيهم. حجز اجتماع تأكيد لمدة 90 دقيقة بداية الأسبوع القادم (الإثنين/الثلاثاء)، إعطاء الأستاذ الأيهم وقتاً صادقاً لقراءة وثيقة من 13 قسم. | الوثيقة في يد الأيهم + موعد الاجتماع مُؤكَّد لـ 2026-06-15 أو 2026-06-16. | 1 ساعة |
| **الثلاثاء 2026-06-10 + الأربعاء 2026-06-11** | كتابة **Annex 2 Re-scope Memo رسمي** مع اقتباس نص البند الفعلي + جدول التوقيع + بدائل التقليل (قسم 11) + الإجابات على أسئلة 1–8 المتوقَّعة. مراجعة قانونية ذاتية ضد لغة العقد الأصلي. | ملف PDF/Word رسمي جاهز للتوقيع. | يوم ونصف (8–12 ساعة) |
| **الخميس 2026-06-12 + الجمعة 2026-06-13** | كتابة **ADR-0010** (Claude as canonical AI vendor + Computer Use + Author/Demo path separation + safety guardrails + signing key custody). | ADR واحد في الـ Repo، عميق وكامل. | يوم ونصف |
| **السبت 2026-06-14** | كتابة **ADR-0011** (Prompt Registry as platform asset + IP ownership question flagged) و **ADR-0012** (Simulation as first-class capability) و **ADR-0013** (Layer Priority Policy — deferral documented). | 3 ADRs (الأخير قصير لأنه deferral documentation). | يوم كامل |
| **الأحد 2026-06-15** | اجتماع التأكيد مع الأستاذ الأيهم: مراجعة الوثيقة، تأكيد Annex 2 envelope من حيث المبدأ، تأكيد طبقة الاشتراك، **تحديد تاريخ اجتماع Layer Priority Policy**، جدولة جلسة Sizing الرسمية. | محضر اجتماع + قرارات موقَّعة + تواريخ. | 2 ساعة + تحضير |
| **الإثنين 2026-06-16** | **C1.5 design doc فقط** (entities, interfaces, no code): BoQ schema + ClashItem schema + SolutionProposal skeleton + relations diagram. لا أكواد بعد لأن C1 الأصلي يجب أن يُسلَّم أولاً. | Design doc + ERD + sample data. | يوم كامل |
| **الثلاثاء 2026-06-17** | **مسوّدة أولى ل Persona واحدة فقط: `fidic.red_book.expert.ar-AE`** (الأكثر قيمة + الأكثر صعوبة). كل Persona احترافية تحتاج 4–6 ساعات، خمسة في يوم واحد كان تقديراً غير صادق. | ملف MD واحد عميق مع citation rules + refusal policy + output schema + glossary. | يوم كامل |

**الباقي من الـ Personas (4 شخصيات)** يتوزّع على الأسبوعين التاليين بمعدّل 2 Persona في الأسبوع، مع تنسيق مع الأستاذ الأيهم للمراجعة المُشترَكة.

**جلسة Sizing الرسمية** تُجدوَل لما بعد اجتماع الأحد 2026-06-15، **بعد** أن يكون الأستاذ الأيهم استوعب envelope من حيث المبدأ، وليس قبله. الـ Sizing الرسمية تحتاج 3–4 ساعات + تحضير.

---

## 13. ملحق — English summary for non-Arabic stakeholders

### Sigma PMO — Post-meeting plan, 2026-06-08

**Context.** Following the 2026-06-08 working session between Al Ayham (Sigma) and Khaled (Service Provider), the Sigma PMO platform's product vision was materially expanded. The original engagement framed the platform as a deterministic, governance-first PM Office operating system, with the LLM acting only as a thin prose rewriter. The June 8 meeting replaced that framing with an **active virtual senior team** model: the platform now *creates, proposes, simulates and executes* under human approval, not just *analyzes and reports*. As Al Ayham put it: **"The platform does not replace humans. It compresses the work of a PMO managing 20+ projects."** That sentence is the business case.

**What is already shipped and accepted.**
- Canonical append-only data model (Project, Activity, Resource, Report, Alert, etc.) with versioning.
- SHA-256 fingerprinting of every ingested file, with a full audit trail. Praised explicitly in the meeting.
- Six deterministic deviation rules producing source-traceable alerts.
- A 5-role RBAC matrix (Sigma Admin, Sigma Reviewer, Client, Consultant, Contractor) matching the meeting's structure with minor capability refinements.
- A static FIDIC clause + PMI escalation mapping per rule code.
- Weekly executive summary (deterministic, optionally LLM-rewritten for prose).

**What is being added.**
1. **AI-authored Primavera P6 baselines (two distinct paths).** Given drawings + BoQ only, an AI planner persona builds WBS → activities → relationships → critical path. **Author Path (production):** the schedule is built in Sigma's data model and exported as a single PMXML via MPXJ — importable into P6 Professional with one wizard click. **Demo Path (presentation):** Anthropic Computer Use opens P6 in a Windows VM and visually demonstrates the AI importing and showing the schedule, satisfying Al Ayham's explicit request that "AI ACTUALLY OPENS P6 ON THE DESKTOP." Free-form authoring inside P6 ("3-4 days × 6-7 hours of compute") is reserved for a separately-funded R&D track (optional C13). The "3-4 days × 6-7 hours" figure is **AI compute time, not human time** — and it is Al Ayham's intuitive estimate, not yet measured.
2. **Three-option clash resolution + impact simulation.** Revit clash list (~100 points typical, per Al Ayham — electrical vs mechanical vs architectural vs structural) becomes a first-class ingest type. For each clash the platform proposes 3 solutions: **A (cost↑/time=)**, **B (time↑/cost=)**, **C (redesign — time=/cost=, but requires cross-discipline coordination)**. The Revit model itself is still built by humans today; AutoCAD→Revit automation is a future research item, not in scope.
3. **FIDIC letter generator.** Incoming contractor letters are parsed, classified against the applicable FIDIC book (selected by contract type), and a ready-to-send reply is drafted with deadline math. **Every outgoing letter requires human approval with step-up authentication** — this is non-negotiable. C6 is blocked on the Layer Priority Policy decision (see deferred meeting).
4. **PMI org-chart auditor.** Compares contractor's org chart against PMBOK standard hierarchy and drafts a correction letter when non-compliant.
5. **Simulation mode** as a first-class capability for Client, Consultant and Contractor roles (Sigma Reviewer pending confirmation). Sandbox semantics: copy-on-write Scenario entity, never mutates canonical truth, 30-day default expiry (Khaled default, not meeting-decided).
6. **Persistent expert system prompts** as a named, versioned, editable platform asset (one per page). Five initial personas: P6 planner, BIM clash analyst, FIDIC expert (5 sub-personas, one per book), PMI org auditor, monthly report author. **Claude impersonates each role via a domain-tuned prompt — persona equals session boundary, no context-switching mid-conversation.** Khaled drafts; Al Ayham reviews and approves. IP ownership is an open question.
7. **Monthly narrative report** — PDF, prose (not bullets), with drawing extracts, in three stakeholder views (Owner / PD / Contractor). Generated via Anthropic Batch API at 50% off. **Note: prompt caching does not help here (1h TTL vs monthly cadence) — Batch is the only economic win.**
8. **Claude as the canonical AI provider** — Tier 2 API account at pilot, Tier 3 at production, Tier 4 + ZDR at 3+ projects. **For Khaled's own development use, Claude Max (5x) is recommended** — Pro is insufficient for Computer Use. Prompt caching (1-hour TTL on personas) where it pays off (FIDIC adjudication, P6 build sessions, clash batches). Computer Use under strict guardrails: gVisor/Firecracker isolation (not bare Docker), explicit FQDN allowlist, step-up auth at approval moments, 12-rule safety policy, live operator dashboard with kill switch, full audit trail with cryptographically signed session manifests.

**Re-scope envelope (honest figures).** The new scope adds 8–10 cycles (not 4 as initially estimated) and expands existing cycles. C1 is delivered at its original scope and price before any Annex 2 work begins, to keep acceptance and payment trails clean. Estimated additional cost: **150%–220%** over the original $40,000 — to be finalized in a dedicated Sizing Pass before C1.5 begins. Estimated additional time: **+24 to +36 weeks**. These figures are **Khaled's engineering estimates, not meeting commitments** — Al Ayham acknowledged scope expansion but did not commit to numbers. Annex 2 of the Service Agreement is triggered; the memo will quote the actual clause language verbatim. If Al Ayham rejects the envelope, three paths are open: partial acceptance, original 8-cycle delivery only, or mutual termination.

**Additional non-cycle budget items** ($24k–$50k total): MPXJ commercial license, P6 Pro seats for containers, pre-pilot pen-test, legal review of ZDR + pilot agreement, AI burn-rate during C10–C11 development, Claude Max for Khaled, Arabic construction language reviewer.

**Risk highlights.** Computer Use reliability at scale on **Windows VM** (less mature than Linux reference, mitigated by 200-iteration caps, approval gates, fallback to human planner, Demo Path scripted not free-form). FIDIC hallucination (mitigated by mandatory human approval + step-up auth + citation requirement). Claude version drift (mitigated by versioned personas + golden-case CI). Prompt injection from contractor uploads (mitigated by sanitizer + `<untrusted_*>` wrapping + Anthropic classifier + nonce-verified approval tool calls). **Data residency** — Anthropic API is US-only; UAE-based pilot clients must give written informed consent. **Khaled single-point-of-failure (R12) elevated to High impact**: a backup contact must be identified before C6 (FIDIC), as a Khaled outage during FIDIC drafting equals contractual exposure.

**Post-delivery.** Al Ayham requested Khaled on retainer following acceptance, with a real Sigma client project as the first pilot. The meeting specified the trial is at zero cost **to the client** — whether Khaled's pilot work is paid at cycle rate, included in retainer, or pro-bono is an open question. Retainer model (monthly / hourly / per-issue) to be confirmed.

**Next 7 days (re-paced for honesty).** Annex 2 memo drafted Tue–Wed (1.5 days, not 3 hours), ADR-0010 written Thu–Fri (1.5 days), three smaller ADRs written Sat, confirmation meeting Sun, C1.5 design doc Mon, first persona (FIDIC Red Book) drafted Tue. Other personas spread across the following two weeks. The formal Sizing Pass happens after the confirmation meeting, not before it.

---

*وثيقة من إعداد المهندس خالد أحمد، خدمة سيجما PMO، إصدار 2026-06-09 (نسخة 2 بعد المراجعة الذاتية متعدّدة الزوايا). تُسلَّم للأستاذ الأيهم لمراجعة بنود إعادة تحديد النطاق قبل بدء سايكل C1.5. كل رقم في هذه الوثيقة موسوم بمصدره: "Meeting" أو "Khaled estimate".*
