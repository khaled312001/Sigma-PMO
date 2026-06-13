# On-screen catalog — Sigma meeting 2026-06-12 (frame every 60s)

Each row = what was visible on screen at that timestamp (Google Meet screen-share of the
Sigma PMO platform demo, Khaled presenting to Dr. Ayham). To be merged with the spoken
transcript (transcript-2026-06-12.txt) by timestamp.

| time | on-screen |
|------|-----------|
| 00:00 | Google Meet — call only, **khaled** avatar on black (no screen-share yet) |
| 01:00 | Meet — khaled avatar (no share) |
| 02:00 | Meet — **Dr.Ayham** avatar "D" (green) — Ayham speaking/joined |
| 03:00 | Meet — khaled avatar (no share) |
| 04:00 | `localhost:3000/auth` — **Sign in to Sigma PMO** "From Data to Governance Decisions"; role chips (Sigma Admin/Reviewer/Client/Consultant/Contractor/Subcontractor/Owner/Operator/Investor/Lender/PMO/Governance Board/**Bank**/Government Regulator/Asset Manager); L0–L8 agent tiles; email admin@sigma.local |
| 05:00 | Google Meet — "أنت الآن تشارك العرض" (screen-share starting dialog) |
| 06:00 | `localhost:3000/auth` — sign-in, **Contractor** role selected, contractor@sigma.ae, password SHOW highlighted |
| 07:00 | `localhost:3000` — dashboard, project **P-1000 Nile Tower — Main Construction**; Latest Ingestion Confidence **92%**, Alerts by Severity **300 open** (9 crit/150 warn/141 info), Ingestion Runs chart, Parser Distribution; sidebar new agents (Quantity Survey/Procurement/Revenue/Funding/Predictive — NEW) |
| 08:00 | `localhost:3000` — **Overview "Welcome to Sigma PMO"** (dark theme); Executive KPIs: Project Health 32/100, Gov Confidence 75, Cost Overrun +8.7%, Forecast Finish 2026-12-18, Portfolio Health 39; Ingestion Runs 16, Total Alerts 300, Critical 9, Warnings 150 |
| 09:00 | `localhost:3000/admin/settings` — **Encryption at rest** (AES-256-GCM per-tenant key); **Claude is disabled — No key**; Anthropic API key *Not set* (Critical); Slack webhook *Not set* |
| 10:00 | `localhost:3000/admin/settings` — **Platform Settings**, entering Anthropic API key (NEW VALUE field `sk-ant-…`) — wiring up Claude |
| 11:00 | `localhost:3000/opportunity` (AR/RTL) — feasibility figures (13× exit multiple, 10.5% discount, 12% opex); Sigma Assumption Library `sigma-feasibility-v1`; **AI analysis** section with "تشغيل التحليل" button |
| 12:00 | `localhost:3000/opportunity` (AR) — **AI analysis with real scientific sources**: RICS NRM1/NRM3, RICS Cost-Prediction, AACE 18R-97, Kirkham, PMBOK 7th, RICS DCF, Brealey-Myers, Damodaran, World Bank PPP — `[SOURCE]` citations, "figures are deterministic; AI narration requires a configured key" |
| 13:00 | Chrome new tab — Google search "claude a…" (autocomplete: claude api key / claude.ai) — going to get the API key |
| 14:00 | Antigravity IDE — **Sigma-PMO-User-Guide-AR.pdf p.6/67** — DSCR financier scenario; governance-command/hierarchy/executive + Claim Package examples |
| 15:00 | IDE — guide PDF **p.18/67** — **L8 Command Center** (الهدف / طريقة الاستخدام: Recompute idempotent + Corrective actions) |
| 16:00 | IDE — guide PDF p.18 — same L8 Command Center page (الهدف + طريقة الاستخدام) |
| 17:00 | `localhost:3000/executive` (AR/RTL) — **Marina Plaza P-2000**; gauges صحة التمويل **35**, القابلية للتمويل البنكي **38**, مسار الفرص **50**; verdict "P-2000: governance **yellow**, schedule on-track, cost n/a" |
| 18:00 | `localhost:3000/feasibility` — **Investment opportunities** (EXT.INVESTMENT): Sketch-first warehouse INV-0002 (Score 38, NPV 2.0M, IRR 10.9%, Proceed w/ conditions); Marina Residential Tower INV-0001 (Score 34, NPV 7.8M, IRR 11.4%) |
| 19:00 | `localhost:3000/feasibility/<id>` — opportunity detail: tabs **Concept sketches (1) / Packages / Level 2·Study / Level 1·Assessment**; "Generate the study first" |
| 20:00 | feasibility/<id> — **Level 2 Study (17 sections)**, v1 1/17 approved; **Operational Model** (approved/deterministic): operating cost ratio 25% → EBITDA margin 75%, ramp-up Y1 60%/Y2 85%/then 100%, horizon 7 yrs terminal 13× EBITDA, stabilized P&L revenue AED 3.36M/yr − OPEX 0.84M = EBITDA 2.52M/yr; + Cash Flow / Sensitivity / IRR sections |
| 21:00 | `localhost:3000/quantity-survey` (AR) — **حصر الكميات وحركة التكلفة** (EXT.QUANTITY_SURVEY P-2000); BIM→NRM/UniFormat/MasterFormat/CESMM; new-estimate form: Dubai · NRM · 10,000 m² · residential · مفاهيمي |
| 22:00 | quantity-survey — **Budget cost estimate — retail, AED 5,200/m² = AED 52.00M (NRM)**; element breakdown table (preliminaries / substructure / superstructure …) with نسبة/قيمة/سعر/كمية |
| 23:00 | quantity-survey — same retail cost-estimate table scrolled (5.6 mechanical, 5.8 electrical works) |
| 24:00 | quantity-survey — حصر الكميات form, retail, **تقديرات التكلفة (1)** generated |
| 25:00 | quantity-survey — same (cost-estimates tab, 1 estimate) |
| 26:00 | `localhost:3000/procurement` (AR) — **حزمة مشتريات جديدة**; new-package form (concrete · m3); AI analysis section below |
| 27:00 | procurement — Add-package form (concrete · m3 · planned 2027-01-12 · long-lead); package table **PKG-001 concrete · planned · long-lead**; AI Analysis "Run analysis" |
| 28:00 | `localhost:3000/revenue` (AR) — **حوكمة الإيرادات**; revenue-ledger form (الإيراد الفعلي/التحصيلات/إعادة توقع/الإيراد النهائي); stage الإيراد المتوقع · source business-case · value 100; AI analysis |
| 29:00 | `localhost:3000/funding` (AR) — **حوكمة التمويل**; facility form (النوع: دين أقدم/تمويل وسيط/حقوق ملكية/منحة/متجدد · القيمة AED · المسحوب · DSCR 1.20 · المدة); AI analysis |
| 30:00 | `localhost:3000/predictive` (AR) — **الحوكمة التنبؤية**: expected revenue/cost/schedule/funding/procurement risk cards; funding risk **0/100**, procurement risk **0/100** (no exposure yet) |
| 31:00 | `localhost:3000/knowledge` (AR) — **L0 knowledge base**; keyword retrieval search "fid" → FIDIC suite: Green/Short Form 2nd, Silver/EPC-Turnkey 2nd, Yellow/Plant & Design-Build 2nd, Red/Construction 2nd (each `[source]`) |
| 32:00 | `localhost:3000/knowledge` — dark/signed-out transient (Sign in, blank project) |
| 33:00 | `localhost:3000/review` (AR) — **Sub-Clause 4.21 FIDIC** progress reports; action checklist (issue non-compliance notice 4.21, hold daily check-in); **Weekly executive summary** (confidence 94%, deterministic) 2026-06-06→2026-06-12, Marina Plaza |
| 34:00 | `localhost:3000/reports/monthly` — **Print → Save as PDF** dialog (2 pages); monthly report preview (alerts by severity 5, data confidence 94%, activities/escalations) |
| 35:00 | **web.aacei.org** PDF — "**14R-90: Required Skills and Knowledge of Planning and Scheduling**" p.3/7 (SAMPLE watermark) — TOC: Competency Model / Scope of Knowledge / References / Contributors → showing a *real* cited source |
| 36:00 | **fidic.org** store — "**DBO Contract 1st Ed (2008 Gold Book)**" product page (€40–195) → verifying a real FIDIC source |
| 37:00 | `localhost:3000/sources` (AR) — L0 sources: **AACE 49R-06** (critical path), **AACE Total Cost Management Framework 2nd** (verified), **BIMForum LOD Spec 2023** (verified) with applicable-persona tags |
| 38:00 | `localhost:3000/comparison` — **Register an AI-vs-Human pair** (correction-plan §2.10 — every verdict a labelled training example); form: Title / Task kind=Monthly report / Human+AI output IDs+summaries |
| 39:00 | `localhost:3000/comparison` — same AI-vs-Human pair registration form |
| 40:00 | `localhost:3000/comparison` — **AI vs Human** (INSIGHTS·QUALITY); side-by-side AI-vs-human-planner comparison, "every verdict a labelled training example (correction-plan §2.10)"; field-required tooltip |
| 41:00 | `localhost:3000/comparison` — same AI-vs-Human page |
| 42:00 | `localhost:3000/admin/users` — **Create user**; role dropdown showing all 15 stakeholders (Sigma Admin → Asset Manager, Government Regulator highlighted); existing Asset Manager user row |
| 43:00 | `localhost:3000/admin/roles` — **Role Permissions** matrix (ACCESS CONTROL); columns = every role (Sigma Admin locked); rows canRead/canIngest/canEvaluateRules/canEditPolicy/canGenerateSummary/canReadAll/canSimulate; "Reset all to defaults" |
| 44:00 | `localhost:3000/admin/governance` — **AI Agents (L0–L8)** registry; rows ext.esg / ext.funding / ext.investment / ext.opportunity / ext.predictive / ext.procurement / ext.quantity_survey / ext.revenue_governance — each with Objective, Layer, Enabled toggle, Model Tier=Platform default |
| 45:00 | admin/governance — same AI Agents table |
| 46:00 | admin/governance — same AI Agents table |
| 47:00 | `localhost:3000/baselines` — **Programme Baseline Builder** (PRIMAVERA P6 · ADR-0017); Marina Plaza P-2000 (data date 2026-06-01); **Schedule compression analysis** (crashing + fast-tracking, 25-yr planner) |
| 48:00 | baselines — same Programme Baseline Builder |
| 49:00 | baselines — same Programme Baseline Builder |
| 50:00–59:00 | `localhost:3000/baselines` — **stayed on the Programme Baseline Builder** (Marina Plaza P-2000, PRIMAVERA P6 · ADR-0017) the whole stretch — extended discussion of the schedule-compression / day-zero baseline review (no page change 47→59) |
| 60:00 | `localhost:3000/baselines` — still Programme Baseline Builder (Marina Plaza P-2000) |
| 61:00 | `localhost:3000/repository` — transient/loading; hovering L6 **المطالبات والنزاعات** (→ /claims) in sidebar |
| 62:00 | `localhost:3000/executive` (AR) — **لوحة القيادة التنفيذية** (L7 الذكاء التنفيذي); composite score **43/100**; org-level gauges حوكمة المحفظة **33** · حوكمة الاستثمار **66** · حوكمة المؤسسة **34** |
| 63:00 | `localhost:3000/baselines` — Marina Plaza P-2000 (pending 1 · job 1); "No analysis yet — engine detects compression candidates deterministically; 25-yr planner vets when Claude enabled; saving capped at 30% (over-compression guard)"; **2 issues** |
| 64:00 | `localhost:3000/baselines` — switched to **P-1000 Nile Tower** (data date 2026-05-15); compression RESULT: Deterministic heuristics, **COMPRESSED 348 d → ORIGINAL 348 d (0 d, 0%)**; RISKS (resource congestion, fast-track rework); "Analysis ready"; scenario f58bd719 persisted for audit |
| 65:00 | `localhost:3000/baselines` — P-1000 baseline **signature/audit jobs**: e0b40bcf *Awaiting 2nd signature (1/2)*, be6c40bb *Rejected (audit reject path)*, f9a0867e *Committed (2/2)*, 8091f8b8 *Rejected* — Reject / Sign 2/2 & commit / Schedule PDF / Download .xer |
| 66:00 | `localhost:3000/baselines` — **real "Login to Primavera P6 Professional 24"** dialog (Login admin · Password · Language English US · Database) — opening actual P6 |
| 67:00 | `localhost:3000/simulation` — **سيناريوهات ماذا-لو** (what-if sandbox); P6 "Event intercepted — code ERCCO-3844-E"; **Clash 081d7b8a — option 1** |
| 68:00 | `localhost:3000/simulation` — what-if items: Clash 081d7b8a opt 1 (AI offline → operator must propose), audit-scn, **Compression proposal — 0d** (348d→348d, deterministic) |
| 69:00 | `localhost:3000/input` (L1) — **Upload a file** (drag P6 .xer/.xml/.pdf · MS Project · Excel · CSV; Ingest/Browse); Recent runs append-only audit trail |
| 70:00 | Chrome PDF — **`baseline-cef7ec89.pdf` "Sigma PMO Baseline Schedule — Marina Plaza"** p.3/9; SIGMA PMO PROGRAMME BASELINE (2026-02-02→2027-03-26); activity rows BL-0007 Building Permit / BL-0008 Obtain NOCs / BL-0009 IFC Drawings; WBS 4.1 Submissions, 4.2 Approvals, 5.1 SC Pre-qualification, durations/float/dates → the generated baseline export |
| 71:00 | `localhost:3000` (AR) — Overview dashboard P-1000 Nile Tower; Executive KPIs Portfolio Health 39 · Forecast Finish 2026-12-18 · Cost Overrun +8.7% · Gov Confidence 75 · Project Health 32; تنبيهات 151 · حرجة 9 · إجمالي 300 · إدخالات 16 |
| 72:00 | `localhost:3000` — same Overview dashboard |
| 73:00 | `localhost:3000` — same Overview dashboard |
| 74:00 | **hpanel.hostinger.com/websites** — Hostinger control panel, Websites list (bedayash.com, zaghroutaa.com, dr-husseinpharmacy.com…) — Business plan → showing hosting / other client sites |
| 75:00 | hpanel.hostinger.com — more sites (api.bnbatiment.com, quran./syanatech./hotel.khaledahmed.net, khaledahmed.net, bnbatiment.com); side panel AI agents (Agents/OpenClaw/Hermes), Dev tools (VPS/GPU/API) |
| 76:00 | hpanel.hostinger.com — same websites list |
| 77:00 | hpanel.hostinger.com — same websites list |
| 78:00 | hpanel.hostinger.com — same websites list |
| 79:00 | `localhost:3000` (AR) — back to Sigma Overview dashboard (P-1000) |
| 80:00 | `localhost:3000` (AR) — Sigma Overview dashboard (P-1000) |
| 81:00 | **pos.barmagly.tech** — Barmagly POS product/pricing (CHF 1,990/yr Basic — POS cashier, product/category, inventory & low-stock, invoicing, daily sales) → showing another product |
| 82:00 | pos.barmagly.tech — pricing: **BASIC CHF 1,990** (6% commission) vs **ADVANCED CHF 3,990 "Most Popular"** (5% commission, online store, CRM, multi-device) |
| 83:00 | pos.barmagly.tech — same Barmagly POS pricing |
| 84:00 | pos.barmagly.tech — same |
| 85:00 | pos.barmagly.tech — same |
| 86:00 | pos.barmagly.tech — same |
| 87:00 | pos.barmagly.tech — same |
| 88:00 | pos.barmagly.tech — same Barmagly POS pricing |
| 89:00 | **ogs-academy.com/admin** — editing training program "**أساسيات السلامة المهنية في المواقع الصناعية**" (Industrial Site Safety Fundamentals); learning outcomes cite NEBOSH/OSHA + PPE; publish/feature toggles |
| 90:00 | **ogs-academy.com/admin** — OGS Academy admin dashboard (الرئيسية): partners 4, unread messages, new requests, published programs 6, last-30-days requests chart, most-viewed (Occupational Safety Fundamentals…) |
| 91:00–102:00 | `localhost:3000` (AR) — **back on the Sigma Overview dashboard** (P-1000 Nile Tower) for the wrap-up; KPIs steady (Portfolio Health 39 · Forecast Finish 2026-12-18 · Cost Overrun +8.7% · Gov Confidence 75 · Project Health 32 · alerts 151/9/300 · runs 16) — closing discussion, no further page changes through 01:42 |

## Chapters (screen-share arc)

1. **00:00–05:00** — call setup; Ayham joins; sign-in page tour (15 stakeholder roles, L0–L8 tiles)
2. **05:00–10:00** — screen-share starts; login as Contractor; main dashboard (92% ingestion, 300 alerts); dark-theme overview KPIs; **admin/settings** + wiring the Anthropic API key (AES-256-GCM, deterministic-first)
3. **10:00–20:00** — **Opportunity / Feasibility** (AR): assumption library, AI analysis grounded in real sources (RICS/AACE/PMBOK/Damodaran/World Bank); guide PDF (L8 Command Center); **executive** gauges; Level-2 study (operational model, EBITDA)
4. **20:00–30:00** — **Quantity Survey** (NRM cost estimate AED 52M), **Procurement** package, **Revenue** ledger, **Funding** facility (DSCR), **Predictive** governance — the new EXT agents
5. **30:00–40:00** — **L0 Knowledge** (FIDIC suite), review/monthly report→PDF, opening **real cited sources** (AACE 14R-90, FIDIC DBO Gold Book), L0 sources list, **AI-vs-Human** comparison
6. **40:00–47:00** — admin: **users / roles matrix / AI Agents (L0–L8) registry**
7. **47:00–70:00** — **Programme Baseline Builder** (Primavera P6): schedule-compression analysis (348d, over-compression guard), signature/audit chain, **opening real Primavera P6 Professional 24**, what-if simulation, ingest, baseline PDF export
8. **70:00–90:00** — portfolio detour: Hostinger hosting, **Barmagly POS**, **OGS Academy** (other products/projects)
9. **90:00–102:00** — back to Sigma Overview dashboard; wrap-up

> Participants throughout: **khaled** (presenter) + **Dr.Ayham** (joined ~02:00).
