# اجتماع 2026-06-08 — ملخص المتطلبات + Gap Analysis

- **المصدر:** `tiw-kbnv-zqv (2026-06-08 21_15 GMT+3).mp4` (48.9 دقيقة)
- **التفريغ الكامل:** [`2026-06-08-al-ayham-transcript.md`](2026-06-08-al-ayham-transcript.md)
- **الحضور:** Al Ayham (Sigma — Client) · Khaled (Service Provider)
- **اللغة الرئيسية:** عربي (سوري)

> هذه الوثيقة مستخرجة آليًا من تفريغ الفيديو ثم مراجعتها بشريًا.
> للأحكام التعاقدية الرجوع للتفريغ الأصلي مع التوقيت.

---

## الفلسفة المركزية

> **«الـ AI لازم يكون خبير منشئ، مش بس قارئ.»**
> «بدك تكون فالـ planner هو قادر يخلق ينشئ، مو بس يستقبل.»  *(00:44:13)*

الـ AI في Sigma PMO ليس مجرد reader أو analyser — هو **خبير عقود سنة** (planner 25-30، Revit 10-20، FIDIC reader للكتب الخمسة، PMI standard). الأهم: **يقدر يقترح، يولّد، يبني من الصفر**.

---

## 1. التدفق الرئيسي للمنصة (10 أقسام)

### 1.1 إدخال البرنامج الزمني (Programme)
- المقاول يقدّم برنامج زمني (.xer / .xml / .pdf).
- المنصة تـ parse + AI engine يقرأ.
- ✅ **مُنفّذ:** P6 XER + PMXML + MS Project + Excel + CSV + **PDF (Wave 5)**.

### 1.2 إدخال المخططات (Drawings)
- الاستشاري يدخل drawings 2D.
- Revit engineer يحوّلها لـ 3D model.
- يطلع **clashes (تضارب)** بين MEP / Architecture / Structure / Plumbing.
- 🟡 **مُنفّذ جزئياً:** `clashes/` module بيستقبل clash report، لكن مفيش Revit ingestion ولا 3D viewer.

### 1.3 الـ AI يحلّل الـ Clashes + يقترح حلول
- **الـ AI يطرح 3 حلول مرتّبة:** *(00:03:09 — 00:03:48)*
  - الحل 1: «تزود المدة 15 يوم · الكلفة 100 ألف درهم»
  - الحل 2: «تزود الكلفة 200 ألف · المدة تظل ثابتة»
  - الحل 3: «المدة + الكلفة ثابتين · بدّو تنسيق تالت»
- الـ project director يختار → الـ AI **يعمل simulation فوري** يبيّن تأثير اختياره.
- ❌ **غير مُنفّذ:** الـ clash-solution-proposer موجود في `clashes/` لكن الـ 3-options matrix + simulation cost/time impact مش موجود بالطريقة دي.

### 1.4 موافقة صاحب القرار → تعديل تلقائي للبرنامج
> «فوراً لما أنا باعطيه الموافقة كصاحب قرار على المنصة من الأكسس اللي عندي انه go ahead بهذا الحل، رح يعمل reflection مباشرةً على البرنامج الزمني ويعدل عليه ويطلع ببرنامج جديد يقول هذا مثلاً تعديل رقم واحد.»  *(00:10:24)*

- الـ AI يعدل الـ Primavera schedule تلقائياً، يطلع versioned baseline جديد، **مع reference للتغيير**.
- 🟡 **مُنفّذ جزئياً:** أعمل append-only versioning + Outbox بس ما فيش auto-regenerate للـ schedule بعد موافقة على clash resolution.

### 1.5 Baseline Generation (Author Path — Wave 4)
> «جيب لي بنائي أرضي وخمس طوابق، تفضل عمل لي عرنامج زمني بيزلاين بروغرام … انت expert planner 25 سنة، do it by using premavera p6.»  *(00:23:24 — 00:26:30)*

- الـ AI ياخد مخططات → يولّد WBS → activities → critical path → .xer ملف.
- "Within minutes" لو deterministic، أو 3-4 أيام لو Computer Use.
- ✅ **مُنفّذ (Wave 4 + Wave 5):** BaselineTemplateService بيولّد ~90 activity + critical path + .xer ملف + PDF schedule report.

### 1.6 FIDIC Letter Drafter (Wave 2)
> «بتجيك رسالة من المقاول … قاللي اللي ناقشتني هاي الرسالة من المقاول، تفضل عطيني رد. شو رايح يجي اللي بناء على FIDIC قانون رقم كذا.»  *(00:35:45 — 00:36:15)*

- الـ AI خبير 5 كتب FIDIC (Red, Yellow, Green, Silver, Gold).
- يستقبل letter → يقترح رد + يستشهد بـ clause رقم.
- ✅ **مُنفّذ:** `letters/` module + `fidic-redbook-expert` persona + Source Registry.

### 1.7 PMI Org-Chart Compliance (Wave 3)
> «بيجي بقدم لك مقاول بهيراركي أو organization chart مش مطابقة للـ PMI standard. فوراً لما انت بتحطها بالـ input documents، الـ AI تبعك بيقلك this is not as per PMI standard the PMI standard say one, two, three.»  *(00:38:52 — 00:39:21)*

- ✅ **مُنفّذ:** `org-charts/` module + PMI rule engine + LetterDrafter للنون كومپلاينس.

### 1.8 Source Tracking + Document Fingerprint
> «اي حدا بدو يدخل documents على اللي قال هذا، بقى لازم يكون له fingerprint معروفة من اي مصدر اجت، بالتحديد، وباي وقت، وباي ساعة.»  *(00:39:56)*

- ✅ **مُنفّذ:** SHA-256 fingerprint + immutable SourceFile archive + audit trail.

### 1.9 التقارير (Daily / Weekly / Monthly)
> «تقرير اليومي مهم — تقرير اسبوعي أهم — تقرير الشهري الأكثر أهمية. طبعا تقرير اليومي لازم هو يقترح report، كأنه بني آدم اللي عامله.»  *(00:40:07 — 00:40:46)*

- الـ AI يقترح content، مش بس observations.
- يحلل، يقترح، يبيّن نظره.
- ✅ **مُنفّذ (Wave 4):** PeriodicReportService بـ cadence picker (day/week/month) + 12-section senior-planner PDF.

### 1.10 الـ Output العربي + الإنجليزي
> «الإخراج العربي مطلوب، ولكن الإنجليزي شو ده؟ هو الإنجليزي أساسي. في نسخة عربي + نسخة انجليزي.»  *(00:42:17 — 00:42:30)*

> «اللي بيستخدمين … ناس نسخة ممتنة للمقاول، أو شخص نسخة … المصطلحات نعدل عليها لأنه دائماً الـ AI ما بعرف المصطلحات العربية الصحيحة.»  *(00:42:42)*

- ❌ **غير مُنفّذ كامل:** المحتوى منشأ عربي فقط في معظم الـ surfaces. الـ UI فيها i18n (Arabic + English) لكن الـ generated content (تقارير، رسائل، توصيات) عربي فقط.

---

## 2. نموذج الأدوار (Roles) — تفصيل من الاجتماع

| الدور | الاسم في الكود | الصلاحيات حسب الاجتماع | الحالة |
|---|---|---|---|
| **Sigma Admin** | `sigma_admin` | Read + Write + Edit DB + Edit policies + Edit summaries | ✅ |
| **Reviewer / Khaled شخصياً** | `sigma_reviewer` | Read all + Edit policies + Edit summaries (بدون رفع مشروع) | ✅ |
| **Client (المطور/المالك)** | `client` | Read + Edit policies + Run simulation (بدون رفع المشروع) | ✅ |
| **Consultant (الاستشاري)** | `consultant` | Read + Run simulation + Edit policies | ✅ |
| **Contractor (المقاول)** | `contractor` | Read own slice + Run simulation + Upload progress reports | ✅ |
| **Subcontractor (مقاول الباطن)** | TBD | نفس contractor لكن أصغر slice | ❌ غير مُنفّذ |

> ملاحظة من الاجتماع: «أي رول من الأخير الكل يقدر يعمل simulation دون التغيير الفعلي للبيانات.»  *(00:14:40 — 00:15:25)*

✅ **مُنفّذ:** خمس روال في `lib/capabilities.ts` + canSimulate field.

---

## 3. AI Persona System — التفاصيل الكاملة

### 3.1 Per-page Persona Auto-loading
> «أنا بدي عرف منك دائماً معي على أنه خبير، ما بحتاج مني أني انا ارجع كل مرة اني انا عطي البرومت كل مرة. مباشرة لما أنا بكون فاتح على صفحة الـ planning أو الجدول الزمني، وأي سؤال بسأله، هو بدوه أقل أنو انت expert 25 سنة، وهذا الحكي انا أنت بأعلم مني فيه.»  *(00:30:50 — 00:31:38)*

- ✅ **مُنفّذ:** Persona system في `personas/` module + لكل صفحة persona خاصة بها مرتبطة بـ surface.

### 3.2 Persona Tier Mapping (من الاجتماع)
- **Planning surfaces** → `planner-p6-25yr` (25-30 years experience)
- **Revit / 3D / Clash surfaces** → revit-expert-10-20 سنة
- **FIDIC / Letters** → fidic-redbook-expert (5 books memorized)
- **PMI / Org charts** → pmi-standard-expert
- **Reports** → report-narrator (Arabic + English)

✅ **مُنفّذ:** الـ personas موجودة في DB seed.

### 3.3 Project-Specific Prompt Addons (Consultant Policy Injection)
> «الاستشاري يكتب: «في بعض المواد لها يعني — في بعض المشروع بيكون فيها اختلافات. انت تكتب للـ AI طبعاً كله ده في dashboard، يعني انت مش تكتب بتروح لمكان تاني، لا، حكوم في تكامل في المنصة كاملة في كل شيء، في كل صفحة فإنت بتكتبه أنه فيه بند واحد، بند اثنين، بند ثلاثة.»  *(00:19:40 — 00:20:14)*

- الاستشاري يضيف policy خاصة بالمشروع → الـ AI يستخدمها مع الـ default policy.
- 🟡 **مُنفّذ جزئياً:** GovernancePolicyService موجود + policy versioning، لكن الـ project-specific addons (مش global) محتاج توضيح.

---

## 4. الـ AI Provider: Claude

> «حالين هو افضلهم، حالين هو كلود. كلود تمام، ضمن كلود بناخد هذا التوافق معه. بنعمل الاشتراك معه، بحيث انه لما بصير هذا التضارب بنسأل كلود، بنقول له تفضل عطينا اقتراحاتك.»  *(00:06:00 — 00:06:24)*

- ✅ **مُنفّذ:** Wave 2 (Anthropic SDK) + Wave 5 (admin/settings UI لإدخال API key) + Wave 5+ (auto-loaded من DB).

---

## 5. Computer Use vs Author Path

> «هل حاب يكون فيه يعني، معنا انه هو كـ AI، كـ system بتاعه، يفتح ويتحكم بالـ computer بتاعه، ويفتح البرنامج، يدخل عليه ينفس؟ ... هذا في الـ coding عندنا اسمه automation، يبدا بضغط الزر واحدة، يبدا ياخد الـ plan اللي يعمل لها approve.»  *(00:27:00 — 00:31:38)*

- ✅ **مُنفّذ:** Wave 4 (XerWriterService = Author Path deterministic، Computer Use guardrails في ADR-0011 مع 12 rule).
- Author Path delivered as default · Computer Use Demo Path gated خلف ADR-0011.

---

## 6. **متطلبات جديدة لم تُنفّذ بعد**

### 🔴 6.1 Clash Resolution 3-Options + Simulation Cost/Time Impact
**Priority: HIGH**

**المتطلب:**
- لما يطلع clash، الـ AI لازم يطرح 3 حلول بالضبط، مع كل حل:
  - تأثير على المدة (X يوم)
  - تأثير على التكلفة (Y درهم)
- المستخدم يختار → simulation فوري يبيّن الـ projection
- بعد الموافقة → auto-regenerate الـ schedule

**التنفيذ المقترح:**
- توسيع `clashes/clash-solution-proposer.service.ts` ليرجع 3 حلول structured
- إضافة `SimulationService.projectImpact(scenarioId)` للـ what-if
- ربط بـ BaselineBuildService.authorBaselineFromProject() لـ auto-regen

### 🔴 6.2 Revit Ingestion + 3D Clash Viewer
**Priority: MEDIUM**

**المتطلب:**
- استقبال Revit / Navisworks NWD/NWC ملفات
- عرض الـ clashes بصرياً (3D viewer)
- ربط كل clash بـ activity في الـ schedule

**التنفيذ المقترح:**
- إضافة NavisworksParser إلى ParserRegistry
- استخدام مكتبة Forge / Autodesk Platform Services أو IFC.js للعرض
- خارج الـ scope الحالي للـ cycles المتفق عليها — تأجيل لـ Wave 6+

### 🟡 6.3 Bilingual Report Generation (عربي + إنجليزي)
**Priority: HIGH**

**المتطلب:**
- كل تقرير شهري/أسبوعي/يومي يطلع في نسختين منفصلتين:
  - نسخة عربية (للمقاول، المطور المحلي)
  - نسخة إنجليزية (للمتعاقدين الدوليين)
- المصطلحات العربية مراجعة من خبير (مش ترجمة آلية AI)

**التنفيذ المقترح:**
- إضافة `language: 'ar' | 'en'` parameter لـ `MonthlyReportService.generatePeriodic()`
- إنشاء personas منفصلة: `report-narrator-arabic` + `report-narrator-english`
- ترجمة المصطلحات في glossary مرجعي تحت `personas/glossary-ar-en.json`

### 🟡 6.4 Subcontractor Role
**Priority: MEDIUM**

**المتطلب:** دور خامس للـ مقاول الباطن — نفس contractor لكن slice أضيق.

**التنفيذ المقترح:**
- إضافة `subcontractor` للـ `roles.enum.ts`
- `projectScopes` يضيق على الـ activities المرتبطة بـ مقاول الباطن بالتحديد

### 🟡 6.5 Rank Co. Pilot
**Priority: HIGH (تكتيكي)**

**المتطلب:**
> «أنا اخدت موافقة من احدى أكبر شركات اللي أنا بشتغل بها، إنو نقدر نطبق المنصة على مشروع عندهم. بس نخلص نعمل عليها على واحد من المشاريع. الرانك — تمام.»  *(00:45:35 — 00:46:14)*

- بعد ما تخلص كل الـ layers (Cycle 1-8 جاهزة) → الاتفاق على شروط الـ pilot مع Rank Co.
- المنصة تطبق على مشروع حقيقي.
- Free trial مقابل full data access.

**التنفيذ المقترح:**
- خارج الـ build scope — يندرج تحت **handover phase**.

### 🟡 6.6 Layer Priority Decision Meeting
**Priority: MEDIUM**

**المتطلب:**
> «كيف الـ layers بدها تخاطب — من قبل من؟ هل بتأثر الـ legal اللي هو FIDIC على الـ planning ولا العكس؟ من اللي لازم يكون رأيه الأخير هو القاسي بغض النظر عن تدخل بني آدمين؟»  *(00:47:33 — 00:48:12)*

- ✅ **مُنفّذ في Wave 4:** ADR-0013 (Cross-Layer Priority Chain) — flipped to Accepted بالـ default:
  `GOVERNANCE > PLANNING > ENGINEERING > REPORTS > SIMULATION`

---

## 7. Quality Standards من الاجتماع

> «لما بيكون عندو 25 مشروع، وبيجهز عليهم الـ AI، وبيخلصهم، وبيتابعهم … غير لما يختلعون من الصفر. صح، حتى لو فيها مشكلة، مش معالم بس يا أحدا بسيطة.»  *(00:29:14)*

> «لا، بالعكس، يعني خلينا ناخد شوي وقت فيها، ونعطي نتيجة محترمة.»  *(00:33:00)*

> «احنا فهمنا بحاجة احنا نوقعها على واحد من المشاريع … سواء من الكيف بتطلع نتائج من الـ human being، وكيف تطلع نتائج من AI.»  *(00:46:14)*

**Translation للقواعد الهندسية:**
1. **الجودة قبل السرعة** — لا بأس باجتماع 3-4 ساعات لتقرير، طالما النتيجة احترافية.
2. **مقارنة AI vs Human** — كل output من الـ AI لازم يقارن بـ human-produced equivalent.
3. **مش معالم بسيطة** — لو فيه issue، حل جذري (مش patch).

---

## 8. Backlog مقترح بعد الاجتماع

### الحالي (Wave 5+)
- ✅ Wave 4 baseline author path + Schedule PDF + ADRs flipped
- ✅ Wave 5 PDF ingestion + Charts + Admin Settings + light-mode polish
- ✅ Claude DB-key wiring + status banner

### المقترح (Wave 6+)
1. **Clash Resolution 3-Options + Simulation** (HIGH — متطلب 6.1)
2. **Bilingual report variants** (HIGH — متطلب 6.3)
3. **Subcontractor role + projectScopes narrowing** (MED — متطلب 6.4)
4. **Auto-regenerate schedule after clash approval** (HIGH — متطلب 1.4)
5. **Per-project policy addons via Consultant dashboard** (MED — متطلب 3.3)

### مرحلة الـ Handover
- Rank Co. pilot deployment + comparison study (متطلب 6.5)
- Layer priority validation meeting (متطلب 6.6 — confirm default)

---

## 9. Quotes الجاهزة للـ Stakeholder Comms

- **مشروع Sigma PMO:** *«المنصة بتدرس مباشرة كيف ممكن تغير مكان الـ duct»* — يلتقط حقيقة أن المنصة **deterministic-first** مع AI augmentation.
- **عن جودة المخرجات:** *«خلينا ناخد شوي وقت فيها ونعطي نتيجة محترمة»* — قيمة احترافية الإخراج فوق سرعة الـ delivery.
- **عن الـ AI:** *«ما بحتاج مني أني انا ارجع كل مرة، أعطي البرومت كل مرة … هو بدوه أقول أنو انت expert 25 سنة»* — Per-surface persona auto-loading is mandatory UX.

---

*وثيقة منشأة آليًا من تفريغ الفيديو · بحاجة لمراجعة بشرية قبل أي استخدام تعاقدي.*
