# خطة التصحيح والاستكمال — بناءً على اجتماع 2026-06-08

> **الهدف:** قراءة سطر-بسطر لتفريغ اجتماع الأستاذ أيهم وتحويله إلى:
> 1. تشخيص دقيق لكل مفهوم تم تنفيذه بشكل خاطئ في الـ SYSTEM الحالي.
> 2. خطة تصحيح + استكمال متكاملة (Wave 6 → Wave 8).
> 3. ملف عقد قابل للتوقيع: ماذا، متى، كيف نقيس النجاح.

- **المصدر:** [`2026-06-08-al-ayham-transcript.md`](2026-06-08-al-ayham-transcript.md) (542 segment · 48.9 دقيقة)
- **التاريخ:** 2026-06-10
- **الكاتب:** Khaled (Service Provider) — راجَع التفريغ سطرًا بسطر مرتين.

---

## القسم 0 — الخلاصة التنفيذية (TL;DR)

بعد مراجعة كاملة، **اكتشفت 12 سوء فهم جوهري** في النظام الحالي، 5 منها يستحق وصفه بـ "تصحيح معماري" لا مجرد إضافة ميزة. أهمها على الإطلاق:

| # | سوء الفهم | الحالة | الاستحقاق |
|---|---|---|---|
| 1 | الـ Baseline يُولَّد من تواريخ المشروع فقط — **ليس من المخططات** | معماري | 🔴 حرج |
| 2 | حل الـ Clash يطرح حلًّا واحدًا — **يلزم 3 خيارات بتأثير الزمن/الكلفة** | معماري | 🔴 حرج |
| 3 | لا يوجد محرك **What-If Simulation** يبيّن الأثر قبل الموافقة | معماري | 🔴 حرج |
| 4 | الموافقة لا تُولِّد جدولاً جديدًا تلقائيًا — **بل تقلب status فقط** | معماري | 🔴 حرج |
| 5 | لا يوجد **Schedule Compression Proposal** ("أقدر أضغطه X يوم") | جوهري | 🔴 حرج |
| 6 | الـ Consultant ينقصه واجهة **Project-level policy authoring** | جوهري | 🟡 مهم |
| 7 | لا يوجد **Drawings Ingestion** (PDF/AutoCAD/Revit/Navisworks) | جوهري | 🟡 مهم |
| 8 | التقارير تُولَّد بالعربية فقط — **يلزم نسختان منفصلتان عربية + إنجليزية** | جوهري | 🟡 مهم |
| 9 | لا يوجد **Subcontractor role** بـ scope ضيق | بسيط | 🟢 سهل |
| 10 | لا يوجد **AI vs Human comparison view** | جوهري | 🟢 ميزة |
| 11 | لا يوجد **Project Understudy memory** (ذاكرة مشروع طويلة الأمد) | جوهري | 🟢 ميزة |
| 12 | الـ persona auto-load يعمل لكن غير ظاهر للمستخدم بصرياً | UX | 🟢 سهل |

---

## القسم 1 — تشخيص سوء الفهم الـ 12 بالتفصيل

### 🔴 1.1 الـ Baseline يجب أن يُولَّد من المخططات لا من تواريخ المشروع

**ما قاله أيهم (00:23:39 → 00:23:48):**

> «الانبوت تبعي هو **مخططات drawings**. أبقى أقول له تفضل **base on this drawing**. بدي منك أول مرة، أول instruction: اعملي baseline program — اعملي critical path.»

**ما ينفّذه النظام حاليًا:**
- `BaselineTemplateService.synthesise({ projectStartIso, projectFinishIso, projectName })` يبني `~90` نشاطًا **بصرف النظر عن المشروع** — قالب جاهز للمباني السكنية.
- لا يقرأ المخططات، لا يستخرج WBS من رسم معماري، لا يستنبط الأنشطة من ما هو مرسوم فعلاً.

**أين الخلل المعماري:**
- الـ INPUT يجب أن يكون **drawings/IFC/Revit/PDF** ⇒ يخرج بـ schedule مفصّل خاص بـ this building.
- بناءً مكوّن من ثلاث بنايات (Building A, B, C) يجب أن يطلع له WBS مختلف عن بناء بناية واحدة.
- مساحة 5,000 m² تختلف عن 50,000 m² — عدد الأنشطة وأوزانها تتغير.

**التصحيح المطلوب:** قسم 2.1 من هذه الوثيقة.

---

### 🔴 1.2 حل الـ Clash بحاجة لـ 3 خيارات وتأثير لكل واحد على الزمن والكلفة

**ما قاله أيهم (00:03:09 → 00:03:48):**

> «بتاخد التضارب، بتقرأه وبتقول أنا بفكر إنه فيه **كذا حلول** عندك يا مهندس:
> - **الحل الأول:** بتمدد، بتزيد الكلفة، بس **الزمن بيظل ثابت**.
> - **الحل التاني:** بتغير، رح **تزيد المدة والكلفة رح تظل ثابتة**.
> - **الحل الثالث:** رح يحافظ على **المدة والكلفة**، لكن بدّو تنسيق ثالث.»

> «بتعطيك تلت حلول — منصة الذكاء الاصطناعي اختار، فيه الحلول اللي مقترحة بس كَنت بناء على ذكاء اصطناعي.»

**ما ينفّذه النظام حاليًا:**
- `ClashSolutionProposer.proposeSolution()` يستدعي LLM ويعيد *حلًا واحدًا* نصياً.
- لا توجد بنية بيانات تحمل ثلاثة بدائل، ولا يقدّر تأثير كل بديل على الـ (duration, cost).

**أين الخلل المعماري:**
- العقد بين الواجهة والـ AI يجب أن يكون مصفوفة من 3 عناصر `[option1, option2, option3]`.
- كل عنصر يحتوي:
  ```typescript
  interface ClashSolutionOption {
    title: string;
    rationale: string;
    durationImpactDays: number;    // قد يكون 0 أو سالب أو موجب
    costImpactCurrency: { currency: string; amount: number };
    affectedActivities: string[];  // businessKeys
    fidicClause: string | null;
  }
  ```

**التصحيح المطلوب:** قسم 2.2.

---

### 🔴 1.3 لا يوجد محرك Simulation يبيّن الأثر قبل الموافقة

**ما قاله أيهم (00:07:01 → 00:08:01):**

> «لما انت عملت هذا التغيير اللي بيسموه **ركوست** أو لحتى تحل مشكلة، فيه اللي رفلكت وين؟ اللي رفلكت على **الكوست** و على **الزمن**.»

> «فأجينا هلأ هدول فورا المنصة لازم لما يختار صاحب القرار الأمثل من بين الحلول اللي نعرضه له، **يعمل عليها فورًا simulation** ويقل له: أنت رح يصير عندك زيادة بالوقت 15 يوم مثلا بالمشروع، وعندك زيادة بالتكاليف 100 ألف درهم.»

**ما ينفّذه النظام حاليًا:**
- يوجد `Scenario` entity في DB + `simulation/` module structure ولكن:
  - لا يوجد محرك يحسب **delta** على الـ schedule بعد التغيير.
  - لا يوجد محرك يحسب **delta** على الـ BoQ.
  - لا توجد واجهة تعرض "before / after" بمقارنة بصرية.

**أين الخلل المعماري:**
- ينقص: `SimulationEngine.project(change: PlannedChange): SimulationProjection` يعيد:
  ```typescript
  interface SimulationProjection {
    baselineDurationDays: number;
    projectedDurationDays: number;
    durationDeltaDays: number;
    baselineCost: { currency: string; amount: number };
    projectedCost: { currency: string; amount: number };
    costDelta: { currency: string; amount: number };
    affectedActivities: ActivityImpact[];
    criticalPathChanged: boolean;
  }
  ```

**التصحيح المطلوب:** قسم 2.3.

---

### 🔴 1.4 الموافقة لا تُولِّد جدولًا جديدًا — مجرد flip status

**ما قاله أيهم (00:10:24 → 00:10:45):**

> «فورًا لما أنا باعطيه الموافقة كصاحب قرار على المنصة من الأكسس اللي عندي إنه go ahead بهذا الحل، **رح يعمل reflection مباشرةً على البرنامج الزمني**، ويعدل عليه، ويطلع ببرنامج جديد، يقول هذا مثلاً تعديل رقم واحد، يعطي رفرنس للتعديل، ويعطي الفرق المدى.»

> «فأنا هكذا أكون عملت — بكون جهزت **كليم كاملة واضحة صريحة الكل متفق عليها**.»

**ما ينفّذه النظام حاليًا:**
- `BaselineBuildService.approve(jobId, approvedBy)` يقلب الـ status من `awaiting-approval` → `committed`.
- لا يولّد إصدار جديد من الـ baseline، لا يستبدل الـ .xer، لا يصدر رسالة claim للمقاول.

**أين الخلل المعماري:**
- الموافقة يجب أن تكون **معاملة atomic**:
  1. توليد إصدار جديد للـ Activity (الـ append-only ينشئ صف بنفس businessKey + version+1).
  2. حساب الـ delta.
  3. توليد letter claim بـ FIDIC reference.
  4. push على الـ Outbox لجميع الـ subscribers (الـ contractor، الـ consultant).
  5. حفظ snapshot قابل للـ rollback.

**التصحيح المطلوب:** قسم 2.4.

---

### 🔴 1.5 لا يوجد Schedule Compression Proposal (مفهوم منسي تماماً)

**ما قاله أيهم (00:16:19 → 00:16:42):**

> «جاني اقتراح بجدول زمني — يعني ما أخدته من شركة المقاولة. جاني اقتراح جدول زمني. ليش **ما يكون في اقتراح للـ AI بأنه هذا الجدول الزمني قادر إنه ينضغط**؟ بالـ هالساعة ما بلشنا بالمشروع نحنا، مو أثناء سير المشروع، **بالزمن زيرو**.»

**الترجمة الهندسية:**
- في *day zero* — قبل بداية المشروع، المقاول يسلّم schedule مقترح.
- المنصة تستقبله، تحلّله، وتقول: **"هذا الـ schedule قابل للضغط بـ X يوم لو طُبّقت التحسينات التالية"**.

**ما ينفّذه النظام حاليًا:**
- لا شيء. يستقبل الـ schedule، يحفظه، يطلع الـ alerts عند الـ slippage فقط (بعد بداية التنفيذ).

**أين الخلل:**
- ينقص: `ScheduleOptimizerService.proposeCompression(scheduleId): CompressionProposal` يعيد:
  ```typescript
  interface CompressionProposal {
    originalDurationDays: number;
    compressedDurationDays: number;
    compressionDays: number;
    techniques: Array<{
      type: 'fast-tracking' | 'crashing' | 'parallel-execution' | 'resource-leveling';
      affectedActivities: string[];
      assumptions: string[];
      tradeoffs: string;
    }>;
    risks: string[];
    fidicReference: string;
  }
  ```

**التصحيح المطلوب:** قسم 2.5.

---

### 🟡 1.6 الـ Consultant لا يقدر يكتب policies خاصة بالمشروع من dashboard

**ما قاله أيهم (00:18:43 → 00:20:14):**

> «كاستشاري دي كان يمكنها إن تضيف **السياسات**. يعني إيه السياسات؟ يعني إنك انت عندك مثلاً بُنود معينة أو ملاحظات معينة، **بتضيفها لدي ايجنت إن هو يقدر إن هو يكون** — أنا مثلاً ماشي، أنت عندك الحرين، أنت تديني الاقتراحات اللي صح.»

> «**في كل مشروع** ممكن في مشروع بيكون فيه ملاحظات. ملاحظات دي انت تكتب — كل مشروع مثلاً، في بعض البنود لتكون OK طبعاً، مش كل المشروع. واحدة في بعض المشروع بيكون فيها اختلافات. انت بتكتب للـ AI، طبعاً كله ده في dashboard، يعني انت **مش تكتب بتروح للمكان تاني، لا — حكوم في تكامل في المنصة كاملة في كل صفحة**. فإنت بتكتبه مثلاً إن فيه بند واحد، بند اثنين، بند ثلاثة.»

**ما ينفّذه النظام حاليًا:**
- يوجد `GovernancePolicy` versioned لكنه global (نفس policy لكل مشروع).
- الـ Consultant يقدر يعدّل policy عبر `/admin/policy` لكن:
  - **التعديل عام** لا project-specific.
  - **ليس inline** مع الصفحة — يجب الذهاب لصفحة admin مختلفة.

**أين الخلل المعماري:**
- ينقص: `ProjectPolicyAddon` entity:
  ```typescript
  @Entity('project_policy_addon')
  export class ProjectPolicyAddon extends UuidEntity {
    projectBusinessKey: string;
    authoredByRole: 'consultant' | 'client' | 'project_director';
    surface: 'planning' | 'engineering' | 'governance' | 'reports' | '*';
    content: string;  // markdown bullet points
    appliesWhen: 'always' | 'conflict' | 'baseline-generation' | 'letter-drafting';
    isActive: boolean;
    version: number;
  }
  ```
- الـ AI prompt builder يقرأ:
  - الـ global GovernancePolicy
  - الـ ProjectPolicyAddons للمشروع الحالي وللـ surface الحالي
  - يدمجهم في الـ system message بـ priority للـ project-specific (override).
- الـ UI يضع زر "Add note for the AI" inline في كل surface (planning, letters, reports).

**التصحيح المطلوب:** قسم 2.6.

---

### 🟡 1.7 لا يوجد Drawings Ingestion (Revit / AutoCAD / IFC)

**ما قاله أيهم (00:00:46 → 00:02:18):**

> «في مرحلة تانية انك انت بدأت جيب **المخططات اللي موجودة من طرف الاستشاري**، رح تحطها بمنصة. المنصة … تحتوي على **Revit** — الـ Revit هو عبارة عن عدة برامج، الـ Revit واحد منهم. الـ Revit هو **بيبني المشروع بشكل متكامل بشكل تخيلي ثلاثي الأبعاد**.»

> «أوكاد يعني drawings، لما بتدخل مخططات الـ AutoCAD drawings، **وبتتحلل وبتوصل لمرحلة Revit**. هاي فيه أشخاص بيشتغلوها يعني، بياخد المخططات وببليش يشتغل Revit عليه. فعادةً هذا الـ Revit اللي انشغل بيعمل فيه، بيوصل لمراحل من **تضارب بين المخططات** بين مخطط الكهرباء، مخطط المكانيك، مخطط المعماري، مخطط المياه، الستراكتشر.»

> «بيطلع تضارب — بيقلك مثلاً Revit اللي موجود حالًا بيقلك في عندك تضارب حسب المخططات اللي عطيتنا ياها، بيطلع عندك تضارب بحوالي **100 نقطة في المشروع**.»

**ما ينفّذه النظام حاليًا:**
- `clashes/` module يستقبل clash report (Excel من Navisworks) ويعالجها.
- لا يستقبل الملف الأصلي للـ Revit (.rvt) ولا الـ Navisworks (.nwd).
- لا يستقبل DWG/DXF.
- يستقبل PDF لكن يفسره كـ Activity Table (Wave 5) لا كـ drawing.

**التصحيح المطلوب:** قسم 2.7.

---

### 🟡 1.8 التقارير عربية فقط — يلزم نسختان منفصلتان

**ما قاله أيهم (00:42:17 → 00:42:56):**

> «بالنسبة للإخراج العربي — حلو، الإخراج العربي مطلوب، **ولكن الإنجليزي شو ده؟ هو الإنجليزي أساسي**. هو في **نسخة عربي + نسخة انجليزي**، ممتاز.»

> «يعني اللي بيستخدمين، في ناس نسخة ممتنة للمقاول، أو شخص نسخة ما يكون عنده … بالعكس … طيب يكون عندي إخراج بالعربي لأنه حتى **المطورين أحيانًا أصحاب ما عندن**، ولكن احنا خلين شوي **المصطلحات نعدل عليها** لأنه دائمًا الـ AI ما بعرف منين عم يجي بالمصطلحات.»

**ما ينفّذه النظام حاليًا:**
- `report-narrator-arabic` persona فقط.
- الـ `MonthlyReport.narrative` حقل واحد عربي.
- لا يوجد glossary للمصطلحات (نقل من term عربي لـ term إنجليزي).

**أين الخلل المعماري:**
- يلزم:
  - `report-narrator-arabic` + `report-narrator-english` personas منفصلين.
  - حقل جديد على `MonthlyReport`: `narrativeAr: text` و `narrativeEn: text`.
  - PDF يطلع في نسختين: `monthly-{id}-ar.pdf` و `monthly-{id}-en.pdf`.
  - Glossary `personas/glossary/construction-terms-ar-en.json`:
    ```json
    {
      "schedule_data_date": { "ar": "تاريخ البيانات", "en": "Data Date" },
      "critical_path": { "ar": "المسار الحرج", "en": "Critical Path" },
      "schedule_compression": { "ar": "ضغط الجدول", "en": "Schedule Compression" }
    }
    ```

**التصحيح المطلوب:** قسم 2.8.

---

### 🟢 1.9 لا يوجد Subcontractor role

**ما قاله أيهم (00:15:13 → 00:15:16):**

> «وبالأخير ونفس الشيء الـ Developer ونفس الشيء **مقاول الباطن**.»

> «بيعمل اجتماع البروجك داركتر مع الـ Developer ومع المقاول ومع الاستشاري **ومع مقاول الباطن** ومع مقاول اللي مختص بالأشياء اللي صار عليها التغيير.»

**ما ينفّذه النظام حاليًا:**
- خمس أدوار في `roles.enum.ts` — لا يوجد `subcontractor`.

**التصحيح المطلوب:** قسم 2.9.

---

### 🟢 1.10 لا يوجد AI vs Human comparison view

**ما قاله أيهم (00:46:14 → 00:46:25):**

> «رح نشوف منه نتائج، **سواء من الكيف بتطلع نتائج من الـ human being وكيف تطلع نتائج من AI**، وكيف من الأقرب للصحة. وبالتالي إذا هاي المنصة اشتغلت صح، يعني صدقني نحنا رح نعمل شي جدًا محترم.»

**ما ينفّذه النظام حاليًا:** لا يوجد.

**التصحيح المطلوب:** قسم 2.10.

---

### 🟢 1.11 لا يوجد Project Understudy memory

**ما قاله أيهم (00:22:33 → 00:22:35):**

> «إذا صار فيني أنا عالج، أول ما دخله اليوم، أنا عطيته اسم مشروع للستاتو بسموه **understudy**. أنا بدي يوصله إنه هو يقدر علي البرنامج — صعب ولا سهل؟»

**ترجمة:**
- المشروع له **شخصية مستقلة** يحفظها الـ AI بمرور الوقت.
- الـ AI يتعرف على هذا المشروع: "البناية A معقدة، الـ MEP فيها صعب، البلاد بطيئة في الـ approvals، الفريق محدود الخبرة".
- يستخدم هذه الذاكرة لـ تحسين اقتراحاته في المستقبل.

**ما ينفّذه النظام حاليًا:** لا توجد ذاكرة طويلة الأمد للـ AI لكل project.

**التصحيح المطلوب:** قسم 2.11.

---

### 🟢 1.12 الـ persona auto-load يعمل لكن غير ظاهر للمستخدم

**ما قاله أيهم (00:20:25 → 00:21:45):**

> «ما فيك تظل مخلي **برومت معين على كل المنصة** بإنه التعامل في الـ planning مثلاً لازم يكون دائمًا موجود اللي هو مثلاً 25-30 years and planning؟ لما بيدخل بالـ Revit بتقولوا انت 10-20 بالـ Revit. تمام، هل احنا منقدر نخلي دائمًا المنصة تبعنا برومتس هذه فيها دائم؟»

**ما ينفّذه النظام حاليًا:**
- ✅ الـ Personas module موجود بـ persona لكل surface (planner-p6-25yr, fidic-redbook-expert, …).
- ❌ المستخدم لا يرى أن الـ AI متلبس persona خبير في الصفحة الحالية. لا يوجد badge / chip / indicator.

**التصحيح المطلوب:** قسم 2.12.

---

## القسم 2 — الخطة التفصيلية للتصحيح

تنقسم على ثلاث waves: **Wave 6** (تصحيحات معمارية)، **Wave 7** (استكمالات جوهرية)، **Wave 8** (handover).

### 🔴 2.1 Drawing-driven Baseline Generation (Wave 6 Cycle 1)

**Epic:** المخططات → AI خبير 25 سنة → baseline schedule مفصل خاص بهذا البناء.

**الـ flow الجديد:**
```
1. User uploads drawing bundle to /input (PDF / DWG / IFC / Revit / Navisworks)
2. DrawingsIngestionService:
   - extracts metadata (building count, floors, area, MEP zones)
   - persists DrawingPackage entity with SHA-256
3. /baselines page now shows: "Generate baseline FROM drawings: [bundle picker]"
4. User picks bundle + clicks "Generate"
5. New flow in BaselineBuildService.authorBaselineFromDrawings():
   - reads DrawingPackage.summary (extracted features)
   - calls planner-p6-25yr persona with the drawing summary
   - persona returns WBS + activities + dependencies + durations
   - persists Activity rows like today
   - emits BaselineGeneratedEvent on Outbox
```

**ملفات جديدة:**
- `backend/src/modules/drawings/drawings-ingestion.service.ts`
- `backend/src/modules/drawings/drawing-package.entity.ts`
- `backend/src/modules/drawings/parsers/pdf-drawings.parser.ts` (read titleblock + scale + room counts)
- `backend/src/modules/drawings/parsers/ifc.parser.ts` (using `web-ifc` package)
- `backend/src/modules/drawings/parsers/dwg.parser.ts` (using `libredwg` or `kabeja`)
- `backend/src/modules/baselines/baseline-from-drawings.service.ts`
- `frontend/app/drawings/page.tsx`

**ملفات للتعديل:**
- `BaselineTemplateService` → يصبح fallback فقط (لو ما فيش drawings)
- `BaselineBuildService.authorBaselineFromProject()` → يدعو الـ template service لو ما فيش drawing package

**Acceptance criteria:**
- [ ] رفع IFC ملف لبناية بسيطة (3 طوابق) يطلع baseline بـ 60+ نشاطًا مفصلًا بأسماء فعلية ("Concrete pour - Slab Floor 2" لا "Generic activity 23").
- [ ] الـ MEP activities تظهر فقط لو الـ IFC يحتوي MEP elements.
- [ ] الـ schedule مدته تختلف بناءً على عدد الطوابق والمساحة الكلية.

---

### 🔴 2.2 3-Options Clash Resolution Matrix (Wave 6 Cycle 1)

**Epic:** كل clash له بطاقة بـ 3 options، كل option يبيّن تأثيره على الزمن والكلفة.

**التحديثات:**

**في DB:**
```sql
-- New entity
CREATE TABLE clash_solution_option (
  id CHAR(36) PRIMARY KEY,
  clashItemId CHAR(36),
  optionIndex INT,           -- 1, 2, or 3
  title VARCHAR(255),
  rationale TEXT,
  durationImpactDays INT,
  costImpactCurrency VARCHAR(8),
  costImpactAmount DECIMAL(18,2),
  affectedActivityKeys JSON,
  fidicClause VARCHAR(64) NULL,
  techniqueType VARCHAR(32),  -- 'rerouting' | 'redesign' | 'cost-trade' | etc.
  isSelected BOOLEAN DEFAULT FALSE,
  selectedBy VARCHAR(64) NULL,
  selectedAt DATETIME NULL,
  createdAt DATETIME
);
```

**في Service:**
```typescript
// backend/src/modules/clashes/clash-solution-proposer.service.ts
async proposeSolutions(clashItemId: string): Promise<ClashSolutionOption[]> {
  const clash = await this.clashes.findOne({ where: { id: clashItemId } });
  const result = await this.claude.callPersona('clash-solver-engineer', userMessage, {
    context: this.buildClashContext(clash),
  });
  // structured output: parse 3 options from the LLM response
  const options = this.parseThreeOptions(result.content);
  // persist each option as ClashSolutionOption row
  return Promise.all(options.map((o) => this.options.save(o)));
}
```

**في UI:**
- `/clashes/[id]` page تعرض الـ clash + 3 cards (one per option) في grid.
- كل card: title, rationale, two stats (duration impact, cost impact), Affected activities list.
- زر "Choose this option" يستدعي `POST /clashes/:id/options/:optionIndex/select`.
- بعد الاختيار → تلقائيًا fall into 2.3 (Simulation).

**Acceptance criteria:**
- [ ] كل clash جديد يطلع له 3 options.
- [ ] كل option له (duration impact in days) و (cost impact with currency).
- [ ] واحد على الأقل من الـ 3 يكون "no schedule impact" (cost trade-off فقط).
- [ ] واحد على الأقل من الـ 3 يكون "no cost impact" (schedule trade-off فقط).

---

### 🔴 2.3 Simulation Engine للـ what-if (Wave 6 Cycle 2)

**Epic:** قبل الموافقة، المنصة تعرض simulation: "هذه نتيجة الاختيار".

**Service جديد:**
```typescript
// backend/src/modules/simulation/simulation-engine.service.ts
@Injectable()
export class SimulationEngineService {
  async project(input: {
    projectKey: string;
    change: PlannedChange;  // اختيار option من clash
  }): Promise<SimulationProjection> {
    // 1. Load current baseline snapshot
    // 2. Clone activities into a Scenario row
    // 3. Apply the change (duration/cost mutation)
    // 4. Run forward+backward pass on the cloned graph
    // 5. Compute delta vs baseline
    // 6. Return projection
  }
}
```

**في UI:**
- بعد اختيار option في صفحة الـ clash، modal صغير يفتح:
  ```
  ┌────────────────────────────────────────────┐
  │ Simulation result                          │
  ├────────────────────────────────────────────┤
  │ Original duration:  260 days               │
  │ With this change:   275 days (+15 days)    │
  │ ────────────────────────────────────────── │
  │ Original cost:      AED 8,200,000          │
  │ With this change:   AED 8,300,000 (+100K)  │
  │ ────────────────────────────────────────── │
  │ Critical path changed: YES                 │
  │ ────────────────────────────────────────── │
  │ [Reject]          [Approve & Apply]        │
  └────────────────────────────────────────────┘
  ```

**Acceptance criteria:**
- [ ] الـ simulation يحسب delta حقيقي بناءً على CPM.
- [ ] الـ modal يبيّن الـ before / after side-by-side.
- [ ] رفض الـ simulation يحذف الـ Scenario.
- [ ] الموافقة تنتقل لقسم 2.4.

---

### 🔴 2.4 Auto-regenerate Schedule on Approval (Wave 6 Cycle 2)

**Epic:** الموافقة atomic تولّد إصدار جديد للـ schedule + claim letter + Outbox push.

**في BaselineBuildService:**
```typescript
async approveWithChange(input: {
  jobId: string;
  scenarioId: string;
  approvedBy: string;
}): Promise<{
  newBaseline: BaselineBuildJob;
  claimLetter: Letter;
  scheduleVersion: number;
}> {
  return this.dataSource.transaction(async (tx) => {
    // 1. Read scenario snapshot
    // 2. For each affected activity:
    //    - mark current row isCurrent=false
    //    - create new row version+1 with mutated dates
    // 3. Create new BaselineBuildJob entry: status='committed', referencesScenarioId
    // 4. Generate FIDIC claim letter via LetterDrafter
    // 5. Push 'planning.schedule.updated' event to Outbox
    // 6. Return the bundle
  });
}
```

**في UI:**
- بعد "Approve & Apply" في الـ Simulation modal:
  - نجاح → toast: "Schedule v3 created · Letter L-2026-006 drafted"
  - الـ /baselines page تظهر الـ version الجديد على رأس القائمة
  - الـ /letters page تظهر الـ draft letter في "awaiting-approval"

**Acceptance criteria:**
- [ ] الموافقة تنشئ Activity rows جديدة بـ version+1 (append-only).
- [ ] الـ rollback ممكن: المستخدم يقدر يـ rollback لـ version السابق.
- [ ] رسالة claim تطلع تلقائيًا بـ FIDIC reference صحيحة.
- [ ] الـ Outbox event يـ trigger التحديث في الـ /summary page.

---

### 🔴 2.5 Schedule Compression Proposal (Wave 6 Cycle 3)

**Epic:** المقاول يرفع schedule مقترح في day-zero → AI يقول "أقدر أضغطه X يوم".

**في BaselineBuildService:**
```typescript
async proposeCompression(
  projectKey: string
): Promise<CompressionProposal> {
  // 1. Load current activities
  // 2. Call planner-p6-25yr persona with:
  //    - the activities
  //    - critical path
  //    - durations
  //    - prompt: "review this schedule. propose compression options."
  // 3. Parse structured output (4-5 techniques)
  // 4. Return proposal
}
```

**في UI:**
- `/baselines` page يضاف لها card جديد فوق الـ jobs list:
  ```
  ┌──────────────────────────────────────────────┐
  │ 🔍 Schedule analysis ready                   │
  │ Original duration: 260 days                  │
  │ AI proposes: 218 days (-42 days, 16%)        │
  │                                              │
  │ Techniques used:                             │
  │ ◉ Fast-tracking for foundation+columns       │
  │ ◉ Crashing for MEP first fix                 │
  │ ◉ Parallel finishing for floors 3-5          │
  │                                              │
  │ [View details] [Apply] [Dismiss]             │
  └──────────────────────────────────────────────┘
  ```

**Acceptance criteria:**
- [ ] الـ proposal يأتي بـ 3+ techniques.
- [ ] كل technique مذكور فيها (which activities, what assumption, what risk).
- [ ] الـ "Apply" يطلق المسار 2.4 (auto-regenerate + claim).

---

### 🟡 2.6 Project Policy Addons (Wave 6 Cycle 4)

**Epic:** الـ Consultant يكتب "في هذا المشروع: راعِ X و Y و Z" inline في كل صفحة.

**ملفات جديدة:**
- `backend/src/modules/governance/project-policy-addon.entity.ts`
- `backend/src/modules/governance/project-policy-addon.service.ts`
- `backend/src/modules/governance/project-policy-addon.controller.ts`
- `frontend/components/PolicyAddonInline.tsx`

**في كل صفحة AI-using:**
```tsx
<PolicyAddonInline
  projectKey={projectKey}
  surface="planning"
  visibleTo={['consultant', 'client', 'sigma_admin']}
/>
```

**في Claude prompt builder:**
```typescript
async buildSystemPrompt(persona, projectKey, surface): string {
  const base = persona.systemPrompt;
  const addons = await this.addonsService.findFor(projectKey, surface);
  if (addons.length === 0) return base;
  return base + `\n\n# Project-specific instructions for ${projectKey}\n` +
    addons.map((a, i) => `${i+1}. ${a.content}`).join('\n');
}
```

**Acceptance criteria:**
- [ ] Consultant يقدر يضيف note inline في صفحة planning.
- [ ] الـ note تنعكس في prompt الـ AI مباشرة (test by ingest + read result).
- [ ] الـ Consultant يقدر يـ disable / edit / delete الـ note.
- [ ] الـ audit log يحفظ كل تعديل.

---

### 🟡 2.7 Drawings Ingestion Module (Wave 6 Cycle 4)

**Epic:** يدعم رفع PDF + DWG + IFC + RVT + NWD.

**Phased approach:**
- **Phase 1 (Wave 6):** PDF + IFC (using `web-ifc` package — pure JS).
- **Phase 2 (Wave 7):** DWG (using `kabeja` or `dwg.js`).
- **Phase 3 (Wave 8):** RVT (يلزم Autodesk Forge API — billing).

**في UI:**
- `/drawings` page جديد:
  - Upload zone
  - List of uploaded packages (with thumbnails for IFC)
  - "Generate baseline from this package" button

**Acceptance criteria (Phase 1):**
- [ ] رفع IFC لبناية بسيطة (3 floors, 100 spaces) يستخرج: floor count, total area, MEP zone count.
- [ ] رفع PDF (architectural plan) يستخرج: title block, scale, page count.
- [ ] الـ extraction يتمّ في < 30 seconds.

---

### 🟡 2.8 Bilingual Report Generation (Wave 7 Cycle 1)

**Epic:** كل تقرير شهري/أسبوعي/يومي يطلع بنسختين منفصلتين.

**التحديثات:**

**في DB:**
```sql
ALTER TABLE monthly_report
  ADD COLUMN narrative_ar LONGTEXT,
  ADD COLUMN narrative_en LONGTEXT;
-- Migrate existing 'narrative' → 'narrative_ar' (assume Arabic)
UPDATE monthly_report SET narrative_ar = narrative WHERE narrative_ar IS NULL;
```

**Services:**
- `report-narrator-arabic` persona (موجود)
- `report-narrator-english` persona (جديد)
- `MonthlyReportService.generatePeriodic()` يستدعي الاثنين بالـ parallel
- `PdfRendererService.render()` يقبل `language: 'ar' | 'en'` ويرجع ملفين

**Glossary:**
- `backend/seed/construction-glossary-ar-en.json` (200+ term)
- Used by personas to maintain consistency

**في UI:**
- زر "Download PDF" في الـ Report page يصبح dropdown:
  - 📄 العربية (PDF)
  - 📄 English (PDF)

**Acceptance criteria:**
- [ ] التقرير الواحد يطلع بـ 2 PDFs.
- [ ] المصطلحات المتسقة (تاريخ البيانات = Data Date in english).
- [ ] الـ Arabic font (Tajawal) embedded في PDF — لا tofu chars.

---

### 🟢 2.9 Subcontractor Role (Wave 7 Cycle 1)

**Epic:** دور سادس بـ scope ضيق على activities محددة.

**التحديثات:**
- `backend/src/modules/auth/roles.enum.ts`: add `SUBCONTRACTOR = 'subcontractor'`
- `lib/capabilities.ts`: 
  ```typescript
  subcontractor: { canRead: true, canIngest: false, canEvaluateRules: false, ... }
  ```
- New field on User: `subcontractorActivityScope: string[]` — list of Activity businessKeys this user can see.
- All queries filtered by `WHERE activityKey IN (subcontractorActivityScope)` for this role.

**Acceptance criteria:**
- [ ] دور Subcontractor يرى فقط الـ activities المعيّن لها.
- [ ] لا يرى الـ BoQ الكامل ولا الـ critical path الكامل.
- [ ] يقدر يرفع progress updates على activities scope فقط.

---

### 🟢 2.10 AI vs Human Comparison View (Wave 7 Cycle 2)

**Epic:** صفحة تعرض output الـ AI مقابل output الـ human planner لنفس الـ task.

**التحديثات:**
- New entity: `OutputComparison` يحفظ:
  - taskKind: 'baseline' | 'clash-resolution' | 'letter-draft' | 'monthly-report'
  - aiOutputId: ref to the AI-generated artefact
  - humanOutputId: ref to the human-generated equivalent
  - reconciliation: notes from project director

**في UI:**
- `/comparison` page تعرض pairs بـ side-by-side diff
- زر "Mark AI as correct" / "Mark human as correct" / "Both have merit"
- يساهم في training data للـ persona refinement

---

### 🟢 2.11 Project Understudy Memory (Wave 7 Cycle 3)

**Epic:** الـ AI يتعلم خصائص كل مشروع ويستخدمها.

**التحديثات:**
- New entity: `ProjectMemory`:
  - projectBusinessKey
  - factType: 'characteristic' | 'risk' | 'preference' | 'history'
  - content: text
  - source: 'user-input' | 'inferred' | 'historical-analysis'
  - confidence: 0-1
- الـ `MemoryHarvesterService` يستخرج خصائص من:
  - الـ alerts history
  - الـ decisions history
  - الـ user feedback على الـ AI suggestions
- Claude prompt builder يضيف:
  - "Known about this project: [memory items > confidence 0.6]"

**Acceptance criteria:**
- [ ] بعد 3 cycles على مشروع، الـ AI يستوحي خصائصه في الـ suggestions.

---

### 🟢 2.12 Persona Active Indicator (Wave 6 Cycle 4)

**Epic:** المستخدم يشوف "أنت تتحدث مع expert planner 25 سنة".

**في UI:**
- Pill صغير في الـ top-right من كل صفحة AI-using:
  ```
  🧠 planner-p6-25yr · v3  [details]
  ```
- يفتح modal على click:
  ```
  This surface is mediated by:
  - Persona: planner-p6-25yr (v3)
  - Tier: claude-opus
  - Specialization: Primavera P6, AACE practice, 25 years experience
  - System prompt: [view in /admin/personas]
  - Project policy addons applied: 2
  ```

---

## القسم 3 — Wave Roadmap الكامل

### Wave 6 — التصحيحات المعمارية (4 cycles · ~8 weeks)

| Cycle | Epic | Estimated effort |
|---|---|---|
| 6.1 | Drawing-driven Baseline + 3-Options Clash | 2 weeks |
| 6.2 | Simulation Engine + Auto-regenerate on Approval | 2 weeks |
| 6.3 | Schedule Compression Proposal | 1 week |
| 6.4 | Project Policy Addons + Persona Indicator + Drawings Ingestion Phase 1 | 3 weeks |

### Wave 7 — استكمالات جوهرية (3 cycles · ~6 weeks)

| Cycle | Epic | Estimated effort |
|---|---|---|
| 7.1 | Bilingual Report Generation + Subcontractor Role | 2 weeks |
| 7.2 | AI vs Human Comparison View | 2 weeks |
| 7.3 | Project Understudy Memory + Drawings Phase 2 (DWG) | 2 weeks |

### Wave 8 — Handover Phase (4 weeks)

- Rank Co. Pilot deployment + on-site adjustments
- Comparison study: AI baseline vs human baseline on same project
- Layer-priority confirmation meeting (validate ADR-0013 default)
- Drawings Phase 3 (RVT support via Forge — costed separately)
- Documentation + training videos

---

## القسم 4 — Migration & Re-architecture Concerns

### 4.1 الـ Baseline approach كله بحاجة لإعادة تصميم

الـ `BaselineTemplateService` الحالي **يبقى** كـ fallback، لكنه يصبح **secondary path**. المسار الأساسي يكون drawing-driven. هذا يعني:
- إعادة كتابة الـ flow على صفحة `/baselines` ليكون 2-step:
  1. Choose drawing package
  2. Generate baseline from drawings
- لو ما فيش drawing package → fall back للـ template (مع banner واضح "Generic template — not drawing-driven").

### 4.2 الـ ClashSolutionProposer كله يحتاج reshape

العقد الحالي (single string output) → عقد جديد (structured 3 options). تحديث الـ persona system prompt + الـ database schema.

### 4.3 الـ Scenario entity needs activation

الـ Scenario entity موجود في DB لكن مش مستخدم بشكل كامل. الـ SimulationEngine الجديد يستخدمه كـ container للـ what-if states.

### 4.4 الـ Report generator لازم يدعم multi-language

- لا migration لمحتوى قديم — نسيب الـ existing reports عربي فقط.
- الـ reports الجديدة فقط تطلع bilingual.
- DB schema يضيف الحقلين بـ NULL على الـ rows القديمة.

---

## القسم 5 — Critical Files to Modify

### New files (~25)
- `backend/src/modules/drawings/` (8 files)
- `backend/src/modules/baselines/baseline-from-drawings.service.ts`
- `backend/src/modules/clashes/clash-solution-option.entity.ts`
- `backend/src/modules/simulation/simulation-engine.service.ts`
- `backend/src/modules/governance/project-policy-addon.{entity,service,controller}.ts`
- `backend/src/modules/baselines/schedule-compression.service.ts`
- `backend/src/modules/projects/project-memory.{entity,service}.ts`
- `backend/seed/construction-glossary-ar-en.json`
- `frontend/app/drawings/page.tsx`
- `frontend/app/comparison/page.tsx`
- `frontend/components/PolicyAddonInline.tsx`
- `frontend/components/PersonaActiveBadge.tsx`
- `frontend/components/SimulationModal.tsx`

### Modified files (~15)
- `backend/src/modules/baselines/baseline-build.service.ts` — add `authorBaselineFromDrawings()`, `approveWithChange()`
- `backend/src/modules/baselines/baseline-template.service.ts` — demote to fallback
- `backend/src/modules/clashes/clash-solution-proposer.service.ts` — return 3 options
- `backend/src/modules/summary/monthly-report.service.ts` — bilingual generation
- `backend/src/modules/summary/pdf-renderer.service.ts` — accept language parameter + embed Tajawal font
- `backend/src/modules/auth/roles.enum.ts` — add SUBCONTRACTOR
- `frontend/lib/capabilities.ts` — define subcontractor
- `frontend/app/clashes/[id]/page.tsx` — show 3 options matrix
- `frontend/app/baselines/page.tsx` — drawing picker + compression proposal card
- `frontend/components/Sidebar.tsx` — add Drawings + Comparison entries

### New ADRs (~7)
- ADR-0021: Drawing-driven baseline generation
- ADR-0022: 3-Options Clash Resolution contract
- ADR-0023: What-If Simulation Engine
- ADR-0024: Schedule Compression Proposal
- ADR-0025: Project Policy Addons (inline authoring)
- ADR-0026: Bilingual Report Strategy
- ADR-0027: Project Understudy Memory

---

## القسم 6 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| الـ AI لا يولد baseline دقيق من PDF drawings — التفسير يضيع | HIGH | HIGH | Phase 1: IFC فقط (structured). PDF/DWG في Wave 7+ |
| Tajawal font في PDF يطلع غلط في الـ shaping | MED | HIGH | Use `pdfkit` + `arabic-reshaper` package. Test مبكرًا. |
| simulation engine بطيء (CPM لـ 1000+ activity) | MED | MED | كاش CPM results. Background job لو > 200ms. |
| Subcontractor role يكشف بيانات حساسة بالخطأ | LOW | HIGH | Capability gate في EVERY query. Spec test لكل role. |
| Project Memory بيصير prompt poisoning vector | LOW | HIGH | Memory items review-gated. Confidence threshold. |
| الـ Rank Co. pilot كشف bugs مش مكتشفة | HIGH | HIGH | UAT environment قبل الـ pilot. Smoke test suite. |

---

## القسم 7 — Acceptance Sign-off

> توقيع هذه الوثيقة من الأستاذ أيهم يعني الاتفاق على الـ Wave 6/7/8 plan وعلى الـ 12 misconception المحددة.

| Section | Reviewed | Approved | Notes |
|---|---|---|---|
| القسم 0 (TL;DR) | ☐ | ☐ | |
| القسم 1 (12 misconceptions) | ☐ | ☐ | |
| القسم 2 (تفاصيل التصحيح) | ☐ | ☐ | |
| القسم 3 (Wave roadmap) | ☐ | ☐ | |
| القسم 6 (Risk register) | ☐ | ☐ | |

**التوقيعات:**

| الدور | الاسم | التوقيع | التاريخ |
|---|---|---|---|
| Service Provider | Khaled Ahmed | __________________ | 2026-06-10 |
| Client | Al Ayham Alhamach | __________________ | __________ |

---

*Document version: 1.0 · Last updated: 2026-06-10 · Based on meeting transcript 2026-06-08-al-ayham-transcript.md*
