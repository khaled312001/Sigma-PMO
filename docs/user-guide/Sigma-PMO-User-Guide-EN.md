# Sigma PMO — Complete User Guide (English)

> AI-powered Investment, Delivery & Governance Operating System for construction.
> This guide covers every page in the platform, what each feature and tool does,
> and exactly how to use it — including the Primavera and BIM (Autodesk) features
> and what happens when you connect the Claude API.

---

## 1. About this platform

Sigma PMO is a **governance decision-support system**, not a reporting tool. It ingests
project data (Primavera P6 schedules, Excel/CSV, BIM/IFC models, daily reports), normalises
it into one canonical model, runs deterministic governance engines across a 17-stage
investment-and-delivery lifecycle, and presents a single Green / Yellow / Orange / Red
verdict for every node — always traceable back to the source file it came from.

The platform is organised into four navigation groups, visible in the left sidebar:

1. **Governance Command** — the destinations: the command center, the executive view, the
   Enterprise → Portfolio → Program → Project hierarchy, the agent registry, and the
   investment-and-delivery lifecycle surfaces (Opportunity, Feasibility, Quantity Survey,
   Procurement, Revenue, Funding, Predictive, Bankability, Safety, Fire & Life Safety,
   Authority, Utility, Operational Readiness).
2. **Agent Layers (L0–L8)** — the analysis spine: Knowledge (L0), Data Input (L1),
   Review/Rules (L2), Decisions (L3), Analytics/EVM (L4), Risk (L5), Claims (L6),
   Executive (L7), Sigma Governance (L8).
3. **Tools & Evidence** — baselines, simulation, clashes, drawings, letters, sources,
   reports, repository, evidence, approval, comparison.
4. **Admin** — roles, users, governance config, policy, personas, settings, audit.

### Recurring concepts (read once, applies everywhere)

- **Deterministic-first.** Every number is computed directly from your project data by a
  named formula — never guessed by an AI. The AI only *narrates* the numbers.
- **AI narration with citations.** Where an **AI Analysis** panel appears, it explains the
  computed results in plain language and cites its sources as `[SOURCE: id]`. (Inactive
  until you connect the Claude API — see the Integrations chapter.)
- **Human-approval gate.** AI drafts (letters, decisions) are never auto-sent — a human
  approves first. Critical decisions and baselines need two *different* approvers.
- **Project switcher.** A control at the top of the app scopes most pages to one project.
  If numbers look wrong, check the selected project first.
- **Capability-gated access.** Each of the 15 roles sees a different sidebar. Buttons your
  role cannot use appear disabled or hidden. Access notes in this guide name the capability
  that gates each page.
- **Bilingual + RTL.** Every screen toggles English / Arabic (top-right), with full
  right-to-left layout in Arabic.

### Getting started

1. Open `/auth`, click your role chip (or type your email + password), and sign in.
2. Confirm the **project** in the top switcher.
3. Most governance pages follow one pattern: **add records → press *Run governance* →
   read the gauge + findings → open the *AI Analysis* panel** for the narrative.
4. Set your language and theme from the top-right controls.

---

## 2. Integrations — Claude API, Primavera P6 & Autodesk BIM

All three integrations are configured in one place: **Admin → Platform Settings**
(`/admin/settings`). Each credential is **encrypted at rest (AES-256-GCM)** and never shown
again — the screen displays only a fingerprint and an audit trail. Setting or changing a
credential takes effect **within seconds, with no restart**. None of the three is required
for the platform to run; each one *adds* a capability.

### 2.1 Connecting the Claude API — what happens

**What it is.** Claude is the large-language model that writes narratives, drafts FIDIC
letters, proposes clash solutions, reads drawings/scans, and explains findings in plain
language across the platform.

**How to connect.** `/admin/settings` → **Anthropic API key** → paste your `sk-ant-…` key
from console.anthropic.com → Save. (Optionally set a per-agent model tier in
Admin → Governance Configuration Center.)

**The moment a valid key is saved, the platform "lights up":**

- The settings banner flips from **"Claude is disabled"** (amber) to **"Claude is enabled"**
  (green), showing the key source and the default model/tier.
- Every surface that was running deterministic-only now produces written analysis:
  - **AI Analysis panels** on every governance layer (Safety, Authority, Quantity Survey,
    Funding, Predictive, …) narrate the computed findings.
  - **Monthly / periodic reports** (`/reports/monthly`) gain a fully narrated executive
    story in Arabic and English instead of bare bullet points.
  - **FIDIC letters** (`/letters`) can be drafted bilingually by the `fidic-redbook-expert`
    persona with mandatory citations.
  - **Clash solver** (`/clashes`) proposes three resolution options per clash.
  - **Concept-sketch & OCR intake** (`/feasibility`, `/repository`) extract data from
    drawings and scans via Claude Vision.
  - **Baseline planner**, **org-chart review**, and **AI-vs-human comparison** all activate.
- **What does NOT change (the safety contract):**
  - **Deterministic-first** — the engine still computes every figure; Claude only narrates.
    It never invents a number.
  - **`[SOURCE: id]` citations** — every professional claim must cite a row in the Sources
    registry; an uncited or fabricated citation is rejected and the deterministic fallback
    is kept.
  - **Human-approval gate** — AI drafts are never auto-sent; there is no "send" button.
  - **Auto-reload** — change or remove the key and the platform picks it up within seconds.
    Remove it and every surface gracefully falls back to deterministic-only output.
- **Cost control.** Each agent's model tier (Haiku / Sonnet / Opus / platform default) is
  set per agent in Admin → Governance Configuration Center, so you spend on Opus only where
  judgement matters. Billing is usage-based on console.anthropic.com.

> In short: **without** the key the platform is a fully-working deterministic governance
> engine; **with** the key it gains a narrator and a drafter — the governance maths is
> identical either way.

### 2.2 Primavera P6 — file ingestion + live REST pull

Sigma supports Primavera P6 in two ways.

**A) File upload (always available, no credentials).** On `/input` (or via the P6 webhook),
upload a P6 export — `.xer`, PMXML `.xml`, or a P6 Activity-Table `.pdf`. It is parsed into
the canonical model (projects, activities, resources, assignments), validated, confidence-
scored, and archived immutably.

**B) Live EPPM REST pull (new — needs credentials).** Connect directly to your Primavera P6
EPPM server and pull a project on demand, with no manual export.

1. Configure at `/admin/settings` → **Primavera P6**: EPPM REST URL
   (e.g. `https://host/p6ws/restapi`), Database name, Username, Password (a read-only
   service account is recommended).
2. `GET /integrations/p6/status` confirms connectivity (add `?probe=true` to test the
   credentials live).
3. `GET /integrations/p6/projects` lists the projects your credentials can see.
4. `POST /integrations/p6/sync {projectId}` pulls that project live.

The live pull runs through the **same** validate → normalise → confidence → audit pipeline
as a file upload, so a live sync lands in the canonical model identically to an uploaded
`.xer`. Every downstream layer (Analytics/EVM, Baselines, Risk, Claims, Predictive) then
consumes those activities and dates the same way.

### 2.3 Autodesk BIM (APS) — local IFC + live model translation ("pim")

The BIM integration connects the platform to your 3D building models so quantities and
clashes can be governed. (In Arabic this is sometimes written "pim".)

**A) Local IFC upload (always available, no credentials).** On `/drawings` → **BIM Models**,
upload an `.ifc` STEP file (≤ 50 MB). The platform parses element counts (walls, slabs,
columns, beams, doors, windows, spaces, storeys), validates the model, and stores it as a
`bim-model` record — which the Quantity-Survey pipeline turns into a takeoff → classified
cost → governance findings.

**B) Live Autodesk APS translation (new — needs credentials).** Connect your Autodesk
Platform Services app to translate native Revit / IFC / Navisworks models in the cloud and
read back their element properties.

1. Configure at `/admin/settings` → **Autodesk APS**: Client ID + Client Secret (create a
   free app at aps.autodesk.com/myapps).
2. `GET /integrations/autodesk/status` (add `?probe=true` to test the credentials by
   fetching a token).
3. `POST /integrations/autodesk/import {projectKey, filename, contentBase64}` uploads the
   model to Autodesk, runs a Model Derivative translation, polls until it completes, reads
   the element properties, maps them to the same BIM element counts, and writes a
   `bim-model` record.
4. A `viewables:read` viewer-token endpoint is provided for an in-browser 3D viewer.

So an Autodesk-translated model feeds the **exact same BIM → Quantity → Cost → Governance**
flow as a locally-parsed IFC. The extracted quantities then flow into Quantity Survey
(BIM vs BOQ) and Procurement (BIM vs procured vs installed).

> **Honesty note.** BIM-derived quantities are *indicative* (element counts × documented
> nominal sizes), clearly labelled as derived. They prompt you to confirm the measured BOQ;
> they do not replace it.

### 2.4 LLM Council — multi-member AI adjudication

**What it is.** When the platform *judges* a piece of information (a finding, a claim, an
analysis), it can deliberate through an **LLM Council** instead of a single model pass.
Several independent **members** — each with a distinct reviewing lens (Evidence & Correctness,
Adversarial Skeptic, Governance/Contract & Risk, Pragmatic Decision) — give their opinion in
parallel; then a **Chair** synthesizes one consensus verdict, reports how aligned the members
were (an **agreement %**), an overall **confidence**, and surfaces any **dissent**.

**Why it matters.** A council catches a single model's blind spots and makes disagreement
explicit rather than hidden — higher-reliability judgement for governance decisions.

**How to use it.**
- **Default mode:** set `ANTHROPIC_COUNCIL_ENABLED=true` (and `ANTHROPIC_COUNCIL_SIZE` = 2–4).
  With it on, the **AI Analysis** panels deliberate via the council instead of a single pass.
- **Ad-hoc adjudication:** `POST /admin/claude/council` with `{ question, context,
  bibliography?, language?, members? }` returns `{ verdict, confidence, agreement,
  consensusStance, members[], dissent, citations }`. `GET /admin/claude/council/status`
  reports whether it is enabled.

**Discipline (unchanged).** The council only *judges/narrates* the deterministic figures — it
never recomputes a number; every claim is cited `[SOURCE: id]`; the verdict is advisory behind
the human-approval gate; and with no Claude key it returns a disabled verdict (no fabricated
consensus).

---
## 3. Governance & Command Center

---

### Home Dashboard — `/`

**Access:** Any signed-in user (basic authentication gate).

**What it's for:** The platform's landing screen and daily health check. It gives a one-glance picture of the currently selected project — executive KPIs, how much data has been ingested, how many alerts are open, and the latest AI-written summary.

**Main features & tools:**
- **Executive KPIs strip** — six headline tiles: Project Health (/100), Governance Confidence (/100), Forecast Delay (days), Cost Overrun (%), Forecast Finish (date), Portfolio Health (/100). Tiles change color (green/amber/red) by threshold.
- **Four operational stat cards** — Ingestion Runs, Total Alerts, Critical, Warnings. Each links to a related page (Input, Review, Approval, Evidence).
- **Analytics charts** — confidence gauge for the latest ingestion, alerts-by-severity donut, ingestion-runs line (last 14 days), parser-distribution bar, alerts-by-rule-code bar.
- **Latest ingestion card** and **latest summary card** (with a source pill: LLM vs deterministic, and a confidence percentage).

**How to use:**
1. Sign in; the dashboard opens by default.
2. Confirm the project in the top switcher.
3. Read the Executive KPIs strip for the headline verdict.
4. Click any stat card to jump to the underlying detail page.
5. Scan the charts and read the latest summary at the bottom.

**Feeds / outputs:** Reads ingestion runs, rule alerts, executive KPIs, portfolio KPIs and the latest summary. Read-only — navigation only.

**Tip:** If the numbers look wrong, check the project switcher first — alerts and summaries are project-scoped, while ingestion runs are platform-wide.

---

### Governance Command Center — `/governance-command`

**Access:** Requires `canEvaluateRules`.

**What it's for:** The Layer-8 (L8) governance decision-support center — the final authority. For every node it shows the consolidated 4-tier verdict (Green/Yellow/Orange/Red), which agents produced it, the open risks/claims/actions behind it, and a corrective-action queue. It recomputes status and re-issues actions.

**Main features & tools:**
- **Governance status distribution donut** — node counts by status tier.
- **Portfolio oversight list** — every node as a selectable row with its status badge, agent count, and chips for critical risks, claims and open actions.
- **Consolidated verdict card** — status badge, risk score, the agents that ran (status, confidence, escalation), top risks, and a **Recompute (L8)** button.
- **Corrective actions card** — each action with priority/source/status and **Start / Mark done / Dismiss** buttons.
- **Recommended actions**, **Escalation paths** (L1→L2→L3 stepper), **Executive impact** (value-at-risk, BAC-at-risk bar), **Benefit realization** cards.

**How to use:**
1. Review the status-distribution donut.
2. Click a node in the oversight list.
3. Read its consolidated verdict and the agents behind it.
4. Click **Recompute (L8)** to re-run consolidation.
5. Work the corrective-action queue (Start / Mark done / Dismiss).
6. Review escalation paths and impact/benefit cards.

**Feeds / outputs:** Reads the consolidation overview, actions, escalations, impact analysis. Writes the L8 recompute and corrective-action status changes (consolidation is pull-based and idempotent).

**Tip:** If a node says "No agent runs yet," run the agent pipeline first (Agents page) — L8 has nothing to consolidate until L1–L7 have produced evaluations.

---

### Executive Dashboard — `/executive`

**Access:** Requires `canEvaluateRules`; the enterprise score-card needs read-all rights and hides otherwise.

**What it's for:** The Layer-7 (L7) executive intelligence view. It consolidates strategic indicators from every layer for the selected project — governance status, schedule and cost health, earned-value indices, risk and claims — plus an enterprise-wide governance score-card.

**Main features & tools:**
- **Governance score-card** — a composite score plus six gauges (Enterprise / Investment / Portfolio Governance, Opportunity Pipeline, Bankability, Funding Health), each with sample size and basis note.
- **Governance headline** — a one-line status sentence with the status badge.
- **KPI tiles** — Governance, Schedule health, Cost health, SPI, CPI, Projected overrun %, Risk exposure, Critical risks, Potential claims, Open actions.
- **Strategic section** — Objective Alignment gauge, Portfolio Value Tracking (BAC/EV/AC), Benefits Realization %, Enterprise Governance Score gauge.

**How to use:**
1. Pick the project; the executive pack loads.
2. Read the enterprise score-card and the governance headline.
3. Scan the KPI tiles for schedule/cost/risk/claims signals.
4. Use the strategic cards to judge value delivery.
5. Press **Refresh** after new data or an agent run.

**Feeds / outputs:** Reads the executive overview, strategic KPIs and enterprise scores. Read-only.

**Tip:** Most figures are deterministic heuristics with a stated "basis" — read the small basis note under each gauge before acting.

---

### Governance Hierarchy — `/hierarchy`

**Access:** Viewing needs `canEvaluateRules`; creating nodes / attaching projects / setting phase / recomputing needs `canManageHierarchy` (Admin, Client, Owner, PMO).

**What it's for:** The multi-level governance structure Enterprise → Portfolio → Program → Project. Each node carries its rolled-up 4-tier status (worst-of-children, BAC-weighted), so leadership sees exactly where risk concentrates.

**Main features & tools:**
- **Status legend** and per-node roll-up chips: CPI, SPI, R (open risks), C (open claims), B (benefit realized %).
- **Governance tree** of clickable nodes.
- **Create buttons** (manager only): Enterprise / Portfolio / Program.
- **Node panel** — selected type/key, **Recompute governance status**, and (for a project) a **lifecycle phase bar**.
- **Attach project form** (on a selected program).

**How to use:**
1. Click a node to select it.
2. (Manager) Create structure with the Enterprise/Portfolio/Program buttons.
3. (Manager) Attach a project (e.g. P-1000) to a program.
4. (Manager) Set a project's lifecycle phase on the phase bar.
5. Click **Recompute governance status** after changes.

**Feeds / outputs:** Reads the tree and roll-ups; writes new nodes, attachments, phase changes, and triggers worst-of-children recomputation up the tree.

**Tip:** Identify nodes by their business key (ENTERPRISE-001, P-1000), not display name — forms and rollups key on it.

---

### Agent Registry (L0–L8) — `/agents`

**Access:** Requires `canEvaluateRules`; Run / Run-pipeline buttons appear only for those roles.

**What it's for:** The registry of every governance agent across Layers 0–8. It proves the standardized Agent Contract — each agent shown through a uniform card (objective, inputs, processing, outputs, confidence, escalation, audit) with recent runs and a one-click run against the current project.

**Main features & tools:**
- **Agent health table** — per-agent layer, runs, success rate, average confidence, governance-impact, last status, Healthy/Degraded/Failing badge.
- **Agent contract cards** — one per agent (L0–L8) with an Enabled/Disabled pill, model tier, and the last run's status/confidence.
- **Run `<agent>`** per card and **Run full pipeline** (L1→L8).

**How to use:**
1. Confirm the project.
2. Review the agent-health table.
3. Inspect any agent's contract card.
4. Click **Run `<agent>`** or **Run full pipeline**.
5. Press **Refresh** after a run.

**Feeds / outputs:** Reads the agent list, recent executions, and the health report. Writes by triggering runs; disabled agents refuse runs (409) until re-enabled.

**Tip:** A "Disabled" agent has its Run button locked — re-enable it in Admin → Governance Configuration Center.

---

### Projects — `/projects`

**Access:** Any signed-in user.

**What it's for:** The master list of all projects with their deterministic score bundle and operational counts — rank and compare projects by governance, risk, investment and composite score.

**Main features & tools:**
- **Four stat tiles** — Projects, Alerts, Criticals, Runs.
- **Searchable, sortable table** — Name (+ client), Business key, Status, Composite (with project and portfolio rank pills), Governance, Risk, Investment, Alerts, Runs, Confidence bar, Last ingested.
- **Score pills** — color-toned 0–100 chips; Risk is inverted (high risk reads red).

**How to use:**
1. The table loads sorted by composite score.
2. Search by name, key, client or status.
3. Click a column header to re-sort.
4. Read the rank pills and alert/critical counts to triage.

**Feeds / outputs:** Reads scored projects, alerts and ingestion runs, joined by business key (never by id). Read-only.

**Tip:** Trust the Composite ranking but verify with the Risk column — Risk is inverted (100 = worst).

---

## 4. The Analysis Layers (L0–L6)

These seven layers form the intelligence spine. They build on each other: knowledge feeds the rules, the rules read ingested data, decisions cite the rules, and analytics, risk and claims all reason from the same canonical records. **Deterministic** means the numbers are computed directly from your project data, never guessed by an AI model.

---

### Knowledge & Rules Engine — `/knowledge`

**Access:** Any signed-in user can read; "Record lesson" needs policy-editing rights (Admin, Client, Owner).

**What it's for:** Layer 0, the foundation every other layer references. It holds the Sigma Rule Library, the curated standards registry (FIDIC, PMI/PMBOK, ISO, AACE, Primavera), governance frameworks, the Lessons Learned repository, and industry cost/return benchmarks.

**Main features & tools:**
- A unified keyword search across rules, standards, frameworks and lessons.
- Five tabs with count badges: **Sigma Rule Library**, **Standards**, **Frameworks & SOPs**, **Lessons Learned**, **Benchmarks**.
- Rule cards (code, severity, description, referenced standards).
- A Benchmarks tab (cost per m², yield, opex %, hurdle IRR, exit multiple, location factors).
- A **Record lesson** form for editors.

**How to use:**
1. Search a term (e.g. "FIDIC 20.1") to scan the whole base.
2. Or browse a tab — start with **Sigma Rule Library** to see what triggers alerts.
3. Open **Benchmarks** to review the assumptions the feasibility engine uses.
4. Editors: **Record lesson** with title, category, optional standard, content.

**Feeds / outputs:** Reads the knowledge base; outputs new Lessons Learned entries that downstream layers reference.

**Tip:** Search by exact code or a distinctive word for the cleanest hits.

---

### Data Input & Ingestion — `/input`

**Access:** Roles that can ingest schedules (Admin, Contractor, PMO).

**What it's for:** Layer 1, where schedules and reports enter the system. Upload a P6, MS Project, Excel or CSV file; it is archived immutably, parsed into canonical activity rows, and given a confidence score.

**Main features & tools:**
- A drag-and-drop upload zone (`.xer`, `.xml`, `.xlsx`, `.csv`, `.pdf` P6 export, ≤ 24 MB) + **Ingest**.
- An outcome banner (parser, status, row counts, confidence %).
- A **Recent runs** table (append-only audit trail with a confidence bar per run).

**How to use:**
1. Drag your schedule file (or **Browse**); unsupported/oversized files are rejected.
2. Confirm filename/size, then **Ingest**.
3. Check the green outcome banner.
4. Review the new row in **Recent runs**.

**Feeds / outputs:** Raw schedule/report files in; canonical rows + an immutable source record + confidence score out.

**Tip:** Watch the confidence bar — a low score means a sparse/inconsistent source; fix the export and re-ingest. (See also Integrations → Primavera P6 for a live REST pull instead of file upload.)

---

### Rule Evaluation & Alerts (Review) — `/review`

**Access:** Roles that can evaluate rules; scoped to the selected project.

**What it's for:** Layer 2, the rule engine. It checks ingested data against the Sigma Rule Library, surfaces alerts by severity, turns them into governance decisions, and produces a weekly executive summary.

**Main features & tools:**
- Severity filter chips with counts (All / Critical / Warning / Info).
- **Evaluate · {project}**, **Run governance workflow · {project}**, **Run · All projects**.
- **Weekly summary** (7-day narrative with confidence + source tag).
- Decision cards pairing each alert with its first governance decision.

**How to use:**
1. Select your project.
2. **Evaluate** to run the rules.
3. Filter to **Critical** first.
4. Read each decision card.
5. **Weekly summary** when you need a narrative.

**Feeds / outputs:** Reads canonical rows (L1) and rules (L0); outputs alerts and decisions (consumed by `/decisions`) and a summary.

**Tip:** Use **Run governance workflow** to get alerts + decisions in one step, and **Run · All projects** for a portfolio sweep before a steering meeting.

---

### Governance Decisions & FIDIC Mapping — `/decisions`

**Access:** Any signed-in user; scoped to the current project.

**What it's for:** Layer 3, the governance ledger. Every decision is mapped to a decision template and the relevant FIDIC sub-clause, with responsible party, escalation level and review status, plus a full evidence trace.

**Main features & tools:**
- Status filter chips (All / Pending / Critical / Approve / Reject / Acknowledge).
- A searchable, sortable table: When, Severity, Code, Template, Responsible party, FIDIC clause, Escalation (L1/L2/L3), Status, **Trace**.
- **Trace** opens the evidence path: Decision → Alert → Rule evaluation → Ingestion run → Source file (SHA-256, byte size) → Confidence.

**How to use:**
1. Pick your project.
2. Filter (e.g. **Pending** or **Critical**).
3. Search by code, party, clause or summary.
4. Click **Trace** to expand the full evidence chain.

**Feeds / outputs:** Reads decisions/alerts (L2) and the trace to L1 source files; outputs an audit-ready evidence path.

**Tip:** Before escalating, open **Trace** — the source filename, hash and confidence answer "where did this number come from?"

---

### Analytics & Earned Value — `/analytics`

**Access:** Roles that can evaluate rules; has a per-project and a portfolio view.

**What it's for:** Layer 4, the analytics engine. It computes EVM (SPI, CPI, EAC, VAC), Earned Schedule forecasting, productivity KPIs, SPI/CPI trends, and a portfolio roll-up — deterministically from your activity rows.

**Main features & tools:**
- Tabs **This project** / **Portfolio**.
- A forecast banner (schedule health + projected overrun/saving).
- An **Earned Schedule** card (SPI(t) gauge, predicted completion date).
- **SPI** and **CPI** gauges and an **SPI/CPI trends** line.
- EVM money tiles (BAC, PV, EV, AC, EAC, VAC) and a **Productivity & progress** panel.

**How to use:**
1. Read the forecast banner first.
2. Check the SPI/CPI gauges (≥ 1.0 = on/under plan).
3. Open the Earned Schedule card for a completion date.
4. Review the trends line.
5. Switch to **Portfolio** to compare projects.

**Feeds / outputs:** Reads canonical activity rows (with costs); outputs EVM indices, an earned-schedule forecast and portfolio metrics — signals that feed Risk.

**Tip:** The trends chart needs at least two snapshots — re-run analytics weekly so deterioration becomes visible.

---

### Risk Register — `/risk`

**Access:** Roles that can evaluate rules; **Run risk agent** for those roles.

**What it's for:** Layer 5, the risk register. Risks are derived deterministically from L2 alerts and L4 earned value, scored on probability × impact, and matched to mitigation options, with a portfolio-risk roll-up.

**Main features & tools:**
- A **portfolio-risk strip** (by portfolio and program).
- A 5×5 **probability × impact heat-map**.
- A **risk correlation** matrix.
- Scored risk cards (tier, category, priority, probability/impact meters, mitigation, escalation trigger) with expandable **mitigation options**.
- **Run risk agent**.

**How to use:**
1. **Run risk agent** if the register is stale.
2. Read the heat-map (top-right = high probability/impact).
3. Work the cards by priority score.
4. Expand **mitigation options** per risk.

**Feeds / outputs:** Reads alerts (L2) and EVM (L4); outputs a scored, mitigated register plus portfolio/correlation views.

**Tip:** A risk's escalation trigger tells you the exact condition that should bump it up the chain — report around those triggers.

---

### Claims Register — `/claims`

**Access:** Roles that can evaluate rules; **Run claims agent** for those roles.

**What it's for:** Layer 6, the claims and disputes register. Potential claims (EOT, cost, variation, disruption) are identified deterministically from delay events and decisions, each carrying its FIDIC clause, entitlement screening, a readiness score, and a printable, evidence-linked claim package.

**Main features & tools:**
- Claim cards (type, status, FIDIC clause, entitlement likelihood, basis).
- A **claim readiness** bar (0–100) split into evidence / entitlement / quantum / narrative.
- Expandable **entitlement criteria**.
- **View claim package** → assembled package with **Print / PDF**, plus **Draft a FIDIC letter for this claim**.

**How to use:**
1. **Run claims agent** to derive claims.
2. Prioritise by type, clause and entitlement likelihood.
3. Read the readiness bar to see what's missing.
4. Expand **entitlement criteria**.
5. **View claim package** → **Print / PDF**, or draft the FIDIC letter.

**Feeds / outputs:** Reads delay events and decisions (L2–L3); outputs scored, screened claims and a printable package; hands off to Letters.

**Tip:** Don't submit a claim until its readiness bar is green — the breakdown tells you which leg to strengthen first.

---
## 5. Investment, Quantity & Commercial

These eight surfaces take an idea from a one-line concept all the way to a lender-ready financing package. Each is scoped to the selected project, runs deterministically, and usually carries an **AI Analysis** panel that narrates the numbers.

---

### Opportunity Intelligence — `/opportunity`

**Access:** `canRunOpportunity`.

**What it's for:** The first gate of the investment lifecycle. An idea is scored 0–100 across market attractiveness, competition, funding and regulatory complexity, ending in a *proceed / watchlist / reject* recommendation — before any feasibility effort is spent.

**Main features & tools:**
- **New opportunity screening** form (title, type, investment, city, country, funding, objective); the `ext.opportunity` agent runs on submit.
- **Scored opportunities list** — code, status badge, headline score, recommendation pill, and four sub-score tiles (Market, Competition, Funding, Regulatory).
- **Market Intelligence card** — demand/supply/competition gauges + industry benchmarks.

**How to use:**
1. Fill the screening form (only title is mandatory) → **Score opportunity**.
2. Read the instant code + score + recommendation.
3. Inspect the four pillar tiles to see *why*.
4. Use Market Intelligence to sanity-check the benchmarks.
5. Move a "proceed" idea to Feasibility.

**Feeds / outputs:** A few high-level fields in; a persisted, auditable screening record out (the entry point to feasibility).

**Tip:** Set the Market Intelligence selectors first — they pre-fill the screening form's type/city/country.

---

### Investment & Feasibility — `/feasibility` and `/feasibility/[id]`

**Access:** `canRunFeasibility`.

**What it's for:** Turns a raw idea (or a concept sketch) into a rapid investment assessment (Level 1) and a full bankable study (Level 2): NPV, IRR, payback, DSCR, risk rating and a governance recommendation.

**Main features & tools (detail page, four tabs):**
- **Level 1 · Assessment** — recommendation banner, five KPI tiles (NPV, Project IRR vs hurdle, Equity IRR, Payback, Min DSCR), CAPEX donut, funding/operating profile, year-by-year cash-flow table. **Run rapid assessment** recomputes it.
- **Level 2 · Study** — **Generate professional study** produces a 17-section feasibility & bankability study; each section is expandable, tagged deterministic/AI, with an **Approve section** gate.
- **Packages** — composes approved sections into Investor / Partner / Bank packages with **Print / save PDF**.
- **Concept sketches** — upload a sketch/PDF (≤ 15 MB); OCR + vision proposes inputs; you **review & confirm** before they apply.

**How to use:**
1. **New opportunity** → fill Level-1 inputs → **Create**.
2. Open the card → **Run rapid assessment**.
3. (Optional) Upload a sketch → **AI extract** → **Confirm & apply** → re-run.
4. **Generate professional study** → **Approve** each of the 17 sections.
5. **Packages** → compose → **Print / save PDF**.

**Feeds / outputs:** Opportunity inputs (and optional sketch fields) in; the assessment model, 17-section study and financing packages out. Debt/DSCR/CAPEX outputs feed Funding and Bankability.

**Tip:** Approval is the human gate — packages compose the *approved* sections, so approve before exporting for an investor or bank.

---

### Quantity Survey & Cost Governance — `/quantity-survey` (the BIM feature, in depth)

**Access:** `canRunQuantitySurvey`.

**What it's for:** Concept-to-final-account cost and quantity governance, classified to four international standards (NRM / UniFormat / MasterFormat / CESMM). This is where the platform turns a 3D model into money you can govern: **BIM → Quantity → Cost → Governance**. It is Sigma's own classification engine — no commercial priced cost database behind it; every figure is deterministic maths over the Sigma feasibility benchmark.

**The BIM → Quantity → Cost → Governance flow (what actually happens):**
1. **BIM (model in).** When an IFC model is uploaded (Drawings → BIM Models, or via the Autodesk APS connector), the parser stores element *counts* — walls, slabs, columns, beams, doors, windows, spaces, storeys — on the project's `bim-model` record. Honest by design: it gives instance counts, not measured areas.
2. **Quantity (takeoff).** `deriveQuantitiesFromBim` converts counts into an order-of-magnitude takeoff using documented per-instance nominal sizes (≈ 12 m² per wall, ≈ 120 m² per slab, doors/windows as counts). Each derived quantity is classified and clearly labelled as *derived from counts*, never presented as measured.
3. **Cost (pricing).** The all-in build rate per m² (the Sigma feasibility benchmark for that project type, adjusted by a location factor) is distributed across the classification elements by each element's cost-share; or, on the BIM path, each derived quantity is priced at its elemental rate. Every line carries its standard code, an amount, a share %, and a stage-driven confidence. The top three cost-share elements are auto-flagged as value-engineering targets.
4. **BOQ (tender stage).** Generate a classified BOQ straight from the BIM model (review-before-save), validate an existing BOQ (amount = qty × rate, non-zero qty/rate, classification coverage, total reconciliation), and run a tender bid comparison that flags abnormally low/high rates vs the median.
5. **Governance (cross-check).** The QS Governance Layer continuously compares sources and raises deterministic findings: *quantity-variance* (BOQ qty vs BIM-derived), *cost-variance* (cost-plan vs BOQ total), *over-measurement*, *duplicate-quantity*, and *quantity-cost-mismatch*. Findings are deduplicated.

**Main features & tools (four tabs + page action):**
- **Run QS governance** (header) — runs the cross-source checks.
- **Cost Estimates tab** — *New classified cost estimate* form (stage, type, area m², standard, city); each estimate expands to an element breakdown table (code, element, qty, rate, amount, share %).
- **Classification Framework tab** — a reference matrix mapping every Sigma element to its NRM/UniFormat/MasterFormat/CESMM code and cost share.
- **Traceability tab** — pick dimension (quantity/cost) + subject to view the lifecycle chain (BIM → BOQ → … → Budget → … → Final), each stage's value, variance, origin and approver.
- **Governance tab** — severity donut + findings with monetary *quantum* and **Mark reviewed / Dismiss**.

**How to use:**
1. Upload an IFC/BIM model for the project (Drawings → BIM Models) if you want the BIM path.
2. On **Cost Estimates**, create a classified estimate (or generate one from the BIM model) and expand it.
3. Check **Classification Framework** for the standard codes used.
4. **Run QS governance**, then triage findings on **Governance**.
5. Use **Traceability** to answer "where did this quantity/cost come from, how did it change, who approved it?"

**Feeds / outputs:** Consumes BIM counts and any BOQ/cost-plan data; outputs classified estimates, generated/validated BOQs, governance findings (with quantum), and full traceability. Quantities flow on to Procurement and feed cost into Revenue and Predictive.

**Tip:** BIM-derived quantities are deliberately *indicative* — treat a quantity-variance finding as a prompt to confirm the measured BOQ, not as proof the BOQ is wrong.

---

### Procurement & Supply-Chain Governance — `/procurement`

**Access:** `canRunProcurement`.

**What it's for:** Plans procurement packages, scores vendors, and governs the supply chain by cross-checking quantities and dates across sources — BIM vs procured vs installed, planned vs actual delivery — flagging long-lead exposure and vendor risk.

**Main features & tools:**
- **Run procurement governance** (header).
- **Packages tab** — *New package* form (title, category, unit, BIM qty, planned delivery, long-lead) + a table with status pill and the three quantity columns BIM / Procured / Installed.
- **Vendors tab** — *New vendor* form; deterministically computed Qualification, Performance and Risk scores.
- **Governance tab** — findings (delivery delay, BIM-vs-procured, procured-vs-installed, consumption, vendor risk, long-lead) with recommendations.

**How to use:**
1. Add packages with BIM quantity + planned delivery (tick *Long-lead* for critical items).
2. Add vendors; scores compute automatically.
3. **Run procurement governance**.
4. Triage findings on **Governance**.

**Feeds / outputs:** BIM/procured/installed quantities + dates in; vendor scores and supply-chain findings out. Discrepancies tie back to Quantity Survey.

**Tip:** Always fill *planned delivery* and *long-lead* — they drive the earliest schedule-hit warnings.

---

### Revenue & Cash-Flow Governance — `/revenue`

**Access:** `canRunRevenueGovernance`.

**What it's for:** Governs what the project *earns*. It tracks the revenue lifecycle from forecast to final and shows how variances move NPV, IRR and Payback.

**Main features & tools:**
- **Run revenue governance** (header).
- **Investment impact card** — revenue as % of forecast + before→after tiles for NPV, IRR, Payback with an AI recommendation.
- **Revenue governance chain** — the full traceability ledger (forecast → … → final) with a **+ Record a chain stage** form (value, origin, approver, change reason).

**How to use:**
1. **+ Record a chain stage** (dimension, stage, value, origin, approver, reason) → **Record**.
2. Repeat for actuals/reforecasts.
3. Read the **Investment impact** card.
4. **Run revenue governance** to surface findings.

**Feeds / outputs:** Recorded revenue/cashflow stages + the feasibility model in; impact analysis, the ledger chain and findings out. Connects to Funding and Predictive.

**Tip:** Fill *origin*, *approved by* and *change reason* — they make the chain auditable.

---

### Funding Governance — `/funding`

**Access:** `canRunFunding`.

**What it's for:** Governs *how* the project is financed — facilities, drawdown, DSCR and covenant monitoring, debt service and refinancing risk.

**Main features & tools:**
- **Run funding governance** (header).
- **Funding Health card** — a 0–100 gauge + DSCR headroom / covenant compliance / refi runway tiles.
- **Funding position card** — committed, drawn, undrawn, repaid, outstanding, utilization.
- **Facilities table** — type pill, amount, drawn %, a DSCR cell (current / covenant with a *breach* flag), status. **+ Add facility** form.
- **Findings** (DSCR breach, covenant breach, drawdown exposure, refinancing risk).

**How to use:**
1. **+ Add facility** (amounts, DSCR covenant, current DSCR, maturity).
2. Repeat for each facility.
3. **Run funding governance**.
4. Resolve any *breach* flags via the findings.

**Feeds / outputs:** Facilities (and revenue for debt service) in; funding-health score, position totals and findings out. DSCR and committed funding feed Bankability.

**Tip:** Enter the *DSCR covenant* alongside the *current DSCR* — without it the table can't show a breach.

---

### Predictive Governance — `/predictive`

**Access:** `canRunPredictive`.

**What it's for:** A deterministic early-warning system. Five forward forecasts — cost overrun, schedule delay, revenue gap, procurement risk, funding risk — consolidated into one predictive status (worst-of-five). Every number derives from a named formula.

**Main features & tools:**
- **Run forecasts** (header).
- **Predictive governance status card** — overall badge, as-of date, headline.
- **Five forecast cards** — metric, severity pill, headline value, *Basis* (the formula), *Recommended action*.

**How to use:**
1. **Run forecasts**.
2. Read the consolidated status, then each card.
3. For each elevated forecast, read the *Basis* and follow the *Recommended action*.

**Feeds / outputs:** Cost/schedule/revenue/procurement/funding state in; five forecasts + a consolidated status out.

**Tip:** A "no data" pill means the source metric isn't recorded yet — populate the underlying surface and re-run.

---

### Bankability Intelligence — `/bankability`

**Access:** `canRunBankability`.

**What it's for:** Transforms feasibility and funding data into a lender-ready package: DSCR vs covenant, a debt amortization schedule, funding requirements (CAPEX vs committed), a bankability verdict, and investor/lender package readiness. It reads existing data rather than re-asking.

**Main features & tools:**
- **Run bankability governance** (header).
- **Bankability card** — 0–100 gauge, verdict pill (bankable / with-conditions / not-bankable), DSCR coverage / funding coverage / leverage headroom tiles.
- **Funding requirements & DSCR card** — CAPEX, committed, gap, model debt/equity, coverage, four DSCR stats.
- **Investor / Lender package** readiness checklists.
- **Debt schedule table** (annuity amortization).

**How to use:**
1. Ensure a Level-2 study and funding facilities exist.
2. **Run bankability governance**.
3. Read the verdict, funding gap and DSCR stats.
4. Work the package checklists until each shows *ready*.

**Feeds / outputs:** Feasibility model + facilities in; bankability score/verdict, debt schedule, funding-gap analysis and package readiness out — the final commercial deliverable.

**Tip:** If the verdict is weak, look at the *funding gap* and *effective DSCR* first.

---
## 6. Delivery & Site Governance

Six governance surfaces that run during construction and the move into operation. Each works the same way: add records, press **Run governance**, read the deterministic findings, and open the **AI analysis** panel. Status shows as a colour gauge (green / yellow / orange / red).

---

### Safety / HSE Governance — `/safety`

**Access:** `canRunSafety`.

**What it's for:** Governs how the approved HSE plan is actually followed on site — incidents, near-misses, inspections, permits, corrective actions and stop-work orders. Its signature feature: every stop-work order is traced through a chain (Safety Event → Stop Work → Delay → Critical Path → EOT → Claim readiness), so a genuine safety stoppage can become a defensible extension-of-time claim.

**Main features & tools:**
- **Run safety governance** button.
- **Safety Scores** card — Compliance gauge (0–100), status badge, HSE index, Trend pill.
- **Safety position** card — Open / In progress / Closed / Open incidents / Active stop-work / Near-misses.
- **Stop-work claim chains** card — each row shows a **claim ready / not ready** pill and the six chain steps, plus affected and critical activities.
- **Safety records** table and **+ Add safety record** form (Type, Severity, Status, Date, EOT days, Affected activities, **Stop-work order** checkbox).
- **Safety risk register** + **AI analysis** panel.

**How to use:**
1. **+ Add safety record** — start with the approved HSE plan, then add inspections/permits/incidents.
2. For a stoppage: tick **Stop-work order**, list **Affected activities**, enter **EOT (days)**.
3. **Run safety governance**.
4. Read the **Stop-work claim chains** — a hit on a critical activity flags critical-path impact + EOT and turns the pill to **claim ready**.
5. Work the risk-register findings.

**Feeds / outputs:** HSE plan + schedule critical/affected activity keys in; compliance score, HSE index, the stop-work → delay → critical-path → EOT → claim chain, and a safety risk register out.

**Tip:** Always enter affected WBS keys on a stop-work record — without them the system can't test critical-path impact, and the claim-ready flag stays grey.

---

### Fire & Life Safety Governance — `/fire-safety`

**Access:** `canRunFireLifeSafety`.

**What it's for:** Governs fire-strategy compliance and Civil Defence approvals — strategy, drawings, civil-defence reviews, testing & commissioning, inspections. Tracks outstanding comments, approval-forecast risk and a Fire Readiness score.

**Main features & tools:**
- **Run fire & life safety governance** button.
- **Fire Readiness** card (gauge + Approval rate / Comments cleared / Rejection-free tiles).
- **Position** card and **Records** table (type, authority, comments, forecast date, status).
- **+ Add record** form; an **Outstanding comments** roll-up; **Findings** + **AI analysis**.

**How to use:**
1. **+ Add record** (Type, Authority, Status, Open comments, Submitted + Approval-forecast dates).
2. Update **Open comments** and **Status** as Civil Defence responds.
3. **Run fire & life safety governance**.
4. Watch the **Outstanding comments** roll-up (10+ flags red) and the **Nearest approval** tile.

**Feeds / outputs:** Fire submittals + Civil Defence comment/approval data in; Fire Readiness score, outstanding-comments roll-up and forecast-risk flags out — a key input to operational readiness and occupancy.

**Tip:** Keep the **Approval forecast date** current — the overdue/at-risk flags are driven entirely by it versus today.

---

### Authority Governance — `/authority`

**Access:** `canRunAuthority`.

**What it's for:** A single register for every authority submission and approval (municipality, civil defence, electricity, water, telecom, environmental, RTA, health, other). It auto-calculates delay exposure and critical-path impact when a forecast approval slips past its required-by date — so authority-caused delay can feed EOT claims.

**Main features & tools:**
- **Run authority governance** button.
- **Authority Readiness** card (gauge + Approved / Pending / Rejected).
- **Approvals & delay exposure** card — Submissions / Open comments / Delay exposure (days) / Critical-path impacts, plus an embedded **delay table** (critical-path rows in red).
- **Submissions** table (affected activities shown as `→ keys`) and **+ Add submission** form (Authority, type, Status, comments, Submitted/Forecast/Required-by dates, Affected activities).

**How to use:**
1. **+ Add submission** (pick Authority, name it, set Status).
2. Enter **Forecast approval** and **Required-by** dates + **Affected activities**.
3. **Run authority governance**.
4. Read the **Approvals & delay exposure** card — a forecast later than required-by appears in the delay table with the day count.

**Feeds / outputs:** Submissions + forecast/required dates + schedule keys in; readiness score, per-submission delay exposure and critical-path impact out — a direct feeder for EOT/delay claims.

**Tip:** The delay table only shows rows where forecast is past required-by — fill both dates and at least one affected activity.

---

### Utility Governance — `/utility`

**Access:** `canRunUtility`.

**What it's for:** Governs utility readiness and connection status — power, water, telecom, gas, sewerage, district cooling — with forecast connection dates and delay exposure vs required-by. It tells you whether the building can be energised and serviced in time.

**Main features & tools:**
- **Run utility governance** button.
- **Utility Readiness** card (gauge + status).
- **Position** card (Connected n/total, In flight, Not started, At risk, Max delay, Total delay).
- **Connections** table (status pill, forecast, required-by, Delay days in red) and **+ Add connection** form.

**How to use:**
1. **+ Add connection** (Type, Status, Application / Forecast / Required-by dates).
2. Update **Status** as it progresses (applied → in progress → testing → energized → connected).
3. **Run utility governance**.
4. Scan the **Delay** column and the **At risk / Max delay** tiles.

**Feeds / outputs:** Application/forecast/required dates in; readiness score, per-utility delay exposure and findings out — a prerequisite for operational go-live.

**Tip:** A utility left at **Not started** with no forecast date surfaces as "stuck"/"forecast missing" — add a realistic forecast as soon as you apply.

---

### Operational Readiness Governance — `/operational-readiness`

**Access:** `canRunOperationalReadiness`.

**What it's for:** Governs the transition from construction-complete to operational go-live — O&M manuals, asset registers, training, testing & commissioning, handover, staffing, spares, warranties — rolled into one readiness score with go-live / handover / commissioning sub-scores.

**Main features & tools:**
- **Run readiness governance** button.
- **Operational Readiness Score** card (gauge + the three sub-scores).
- **Position** card (Items, Complete, In progress, Not started, Overdue, Avg complete %).
- **Items** table (category, status, completion %, due date) and **+ Add readiness item** form.

**How to use:**
1. **+ Add readiness item** (Category, Status, Completion %, Due date) — one per deliverable, across all categories.
2. Update Status and Completion % as work proceeds.
3. **Run readiness governance**.
4. Read findings — a *go-live blocker* means do not hand over yet.

**Feeds / outputs:** All handover/commissioning/O&M items in; the readiness score with sub-scores and blocker findings out — the gate to declaring the asset operational.

**Tip:** A category with no items shows as a *category gap* — make sure every category has at least one tracked item before go-live.

---

### Acceptance Program — `/acceptance`

**Access:** `canEvaluateRules`.

**What it's for:** The formal 23-test acceptance program that declares Sigma itself production-ready. Each test runs against the live platform services and returns pass / fail / skipped with machine-readable evidence. This is a platform validation runner, not a project record book.

**Main features & tools:**
- **Run all tests** button.
- **Run summary** ribbon (Total / Passed / Failed / Skipped + timestamp + project key).
- **23-test matrix** (ID, title, lifecycle Stage, Agent, Status badge).
- **Expandable row detail** — Success criteria, Inputs, Expected outputs, Status, Reason (if failed/skipped), and the raw **Evidence** JSON.

**How to use:**
1. The 23-test catalog loads automatically (every row starts "not run").
2. Click a row to read its criteria/inputs/outputs.
3. **Run all tests**.
4. Read the summary ribbon; expand any failed/skipped test for the Reason + Evidence.

**Feeds / outputs:** The live state of the platform's governance services in; a pass/fail/skipped report with per-test evidence out — the formal platform-acceptance sign-off.

**Tip:** A "skipped" result usually means a prerequisite input is missing for the project, not that the platform is broken — set up that data, then re-run.

---
## 7. Tools, Evidence & Reporting

The working tools where you turn project data into governed artefacts. Across these pages the rule is constant: the AI proposes, a human approves, and every figure is traced to a source.

---

### Programme Baseline Builder — `/baselines`

**Access:** Authoring needs `canSimulate`; approving/committing needs `canApproveBaseline` (Admin, Client, Owner, Governance Board).

**What it's for:** An AI planner persona ("planner-p6-25yr") builds a real Primavera-style baseline from your project's contract window — WBS, ~90 activities, dependencies, total float, critical path. The output is held for a two-signature human review, then can be downloaded as a Primavera `.xer` file and a schedule PDF.

**Main features & tools:**
- **Project hero card** (commencement, completion, contract duration, data date) with live job counters.
- **Schedule compression analysis** — "Analyse schedule" runs a what-if (crashing / fast-tracking with day-savings, capped at 30%). Read-only.
- **Generate a new baseline** form (*Authored by* required, *Baseline name* optional).
- **Jobs list** — expandable rows with a status pill (Pending / Running % / Awaiting approval 0/2 / Awaiting 2nd signature 1/2 / Committed / Rejected) and an inline schedule preview.
- **Per-job actions:** **Download .xer**, **Schedule PDF**, **Sign 1/2** → **Sign 2/2 & commit**, **Reject** (needs a reason).

**How to use:**
1. Confirm the project; check the hero-card dates.
2. (Optional) **Analyse schedule**.
3. Enter your name → **Generate baseline** (~6–10 s).
4. Expand the new job to preview the schedule.
5. A first approver **Sign 1/2**; a *different* approver **Sign 2/2 & commit**.
6. **Download .xer** (opens in Primavera) or **Schedule PDF** to hand off.

**Feeds / outputs:** Reads contract dates (or a drawing package from `/drawings`); produces a committed baseline, an importable `.xer`, and a schedule PDF.

**Tip:** The two signatures must come from two *different* people — plan who signs second before you start.

---

### Scenario Simulation — `/simulation`

**Access:** `canSimulate`; promoting a scenario to canonical needs `canEditPolicy`.

**What it's for:** A safe sandbox to fork the current project into named what-if scenarios without touching the approved truth. Review the snapshot, discard it, or (with rights) promote it. A portfolio panel also prices an injected delay across all projects.

**Main features & tools:**
- **Fork** → *Scenario name* + *Summary*.
- **Scenario cards** (status pill, expiry, **View diff** showing frozen snapshot vs current). **Promote** / **Discard**.
- **Portfolio scenario planning** table.
- **Delay what-if** mini-form (pick a project + days → **Run what-if** projects a shifted finish and cost-of-delay; persists nothing).

**How to use:**
1. **Fork**, name it, add a summary.
2. **View diff** to compare frozen vs live.
3. Price a delay via **Delay what-if**.
4. **Promote** (with rights) or **Discard**.

**Feeds / outputs:** Forks the project summary into a snapshot; promotion emits `simulation.scenario.promoted`. Clash-impact scenarios are applied from `/clashes`, not here.

**Tip:** What-if and diff are informational — use **Promote** only when you want it to become the new canonical state.

---

### Clash Register — `/clashes` (+ detail `/clashes/[id]`)

**Access:** View = any user; upload = `canIngest`; propose/simulate = `canEvaluateRules`; approve = `canEditPolicy`.

**What it's for:** Reviews Navisworks / Revit interference clashes. The "revit-clash-analyst" persona proposes three resolution options per clash (time / cost / scope trade-offs); a PM picks one, simulates the impact, and approval issues an append-only schedule revision plus a FIDIC claim letter.

**Main features & tools:**
- **Upload clash report** drop zone — **.xlsx / .xlsm** (Navisworks/Revit Interference Check export), ≤ 24 MB, **Browse** + **Ingest**.
- Filter chips (All / Pending / Proposed / Decided / Critical only).
- **Clash cards** with **Open detail page →**.
- **Propose options** → three radio-select option cards (Time / Cost / Scope).
- **Simulate impact** → before/after modal → **Approve** (applies the resolution).

**How to use:**
1. **Browse** the .xlsx/.xlsm export → **Ingest**.
2. Filter (e.g. Critical only), open a clash.
3. **Propose options** → select one → **Simulate impact**.
4. **Approve** (with rights) — writes a schedule revision + drafts the claim letter.

**Feeds / outputs:** Ingests BIM clash exports; outputs proposed options, a schedule revision, a scenario record, and a FIDIC claim letter (on `/letters`).

**Tip:** "Propose" is separate from "Upload" on purpose — review the list first so you spend AI effort only on clashes that matter.

---

### Drawing Packages — `/drawings`

**Access:** View = any user; upload = `canIngest`; "Generate baseline from this package" = `canSimulate`.

**What it's for:** Intake for PDF drawing sets and IFC BIM models. Archives every byte immutably (SHA-256), extracts floor/discipline hints from PDFs, and can hand a package to the drawing-driven baseline author.

**Main features & tools:**
- **Upload a PDF drawing set** — **.pdf** only, ≤ 24 MB; reports page count, floor hints, discipline hints.
- **Package cards** with **Generate baseline from this package**.
- **BIM Models (IFC)** section — **Upload an IFC model** (**.ifc** STEP, ≤ 50 MB); model cards show element counts, a storey/elevation table, and validation/governance checks. (See Integrations → Autodesk BIM for live cloud translation.)

**How to use:**
1. **Browse**/drag a drawing set → **Ingest**.
2. Confirm detected floor count and disciplines.
3. **Generate baseline from this package** (opens `/baselines`).
4. For a model, upload a `.ifc` → **Ingest IFC** → review counts + checks.

**Feeds / outputs:** Drawing PDFs and IFC models in; floor/discipline hints feed the baseline author; model clashes are reviewed on `/clashes`; model counts feed Quantity Survey.

**Tip:** Ensure your PDF has a readable text layer — the Phase-1 extractor reads text, not images.

---

### FIDIC Letters — `/letters`

**Access:** View = any user; drafting = `canEvaluateRules`; approving = `canApproveLetter`. There is deliberately **no send** action.

**What it's for:** Drafts bilingual (Arabic + English) FIDIC letters via the "fidic-redbook-expert" persona. Every draft carries a mandatory citation footer pointing at the Sources registry; the workflow stops at "approved" + PDF download.

**Main features & tools:**
- **Draft from incoming** (reply by source-file UUID) and **Draft compliance** (turn a non-compliance narrative into a notice).
- A **FIDIC template picker**, a **"must respond by"** urgency banner, status filter chips.
- A two-pane layout with an **Arabic/English body toggle**, citation chips (deep-linking to `/sources`), **Approve**, and **Download PDF**.

**How to use:**
1. **Draft from incoming** (paste the UUID) or **Draft compliance** (optionally pick a template).
2. Submit; the persona returns a citation-backed bilingual draft.
3. Toggle Arabic/English, verify citations.
4. **Approve** → **Download PDF**.

**Feeds / outputs:** An incoming letter or compliance narrative in; an approved bilingual letter + on-demand PDF out. Clash approvals also create claim letters here.

**Tip:** Download PDF stays disabled while a letter is a draft — approve first. To correct a body, draft a new letter (the old row stays for audit).

---

### Sources (Reference Catalogue) — `/sources`

**Access:** Any user (read-only).

**What it's for:** The authoritative catalogue of standards the AI personas are allowed to cite (FIDIC, PMI, ISO, AACE, BIM, Primavera, Other). Every persona claim without a `[SOURCE: externalId]` marker pointing here is flagged as an unverified assumption. This is where the app's citation chips link.

**Main features & tools:**
- **Family filter chips** + **search box** (title, externalId, publisher, scope, persona).
- **Source cards** (family chip, external id, verified badge, publisher/edition/year, applicable personas, scope prose, **Open** link).

**How to use:**
1. Filter by family or search a term.
2. Read a card's scope.
3. **Open** the publisher document.

**Feeds / outputs:** Read-only; citation chips on Letters and Reports resolve to these rows.

**Tip:** When verifying a letter or report, click its citation chip — it lands you on the exact source.

---

### Monthly / Periodic Report — `/reports/monthly`

**Access:** View = any user; the **Generate** form needs `canGenerateSummary`.

**What it's for:** Generates a narrated executive report for a period via the "report-narrator" persona — connected prose with the verdict first and every professional claim cited. Readable on-screen and downloadable as Arabic and English PDFs.

**Main features & tools:**
- **Generate form** — Cadence (Daily/Weekly/Monthly), period picker, Audience (Owner/PD/Contractor), and for monthly a Narrative type (Executive/Governance/Investment/Portfolio).
- **Reports list** (period, audience, type, source, citation count, persona/version, excerpt, quick PDF).
- **Detail view** — charts strip + metrics strip + narrative + citations block; **Print** and **Download PDF** (Arabic / English).

**How to use:**
1. Choose cadence, period, audience and (monthly) narrative type.
2. **Generate**.
3. Open the row to read narrative/charts/metrics.
4. **PDF** (Arabic or English) or **Print**.

**Feeds / outputs:** Schedule, alerts and decisions for the period in; a narrated report row and Arabic/English PDFs out.

**Tip:** Pick the *Audience* deliberately — the same period reads differently for an Owner vs a Contractor. Check the data-confidence gauge before circulating.

---

### Document Repository — `/repository`

**Access:** View = any user; registering / classifying / OCR upload = `canIngest`.

**What it's for:** The Layer-1 record store for every collected project document — RFIs, Submittals, NCRs, Change Requests, Procurement/Resource/Cost logs, Site Photos, Email, and OCR-scanned documents. Append-only, auto-tagged, searchable.

**Main features & tools:**
- **Search box** + **type filter chips** (live inventory counts).
- **Register record** form with three modes: **Standard record**, **Email correspondence**, **OCR document** (upload an image/PDF ≤ 20 MB; AI Vision extracts text, or it archives "manual-pending" if AI is offline).
- **Records table** with a per-row **Classify** action.

**How to use:**
1. Search or pick a type chip.
2. **Register record** → choose mode → fill → save.
3. For scanned paper: **OCR document** → **Browse** → **Upload & OCR** → review the extracted text.
4. **Classify** any row to refresh tags.

**Feeds / outputs:** Captures L1 records + OCR text; auto-tags feed search and governance.

**Tip:** "manual-pending" means AI Vision was offline — the scan is still archived (SHA-256); re-upload once a Claude key is configured to auto-extract.

---

### Evidence Chain — `/evidence`

**Access:** Any user (read-only).

**What it's for:** Shows the full evidence package behind an alert — the rationale, the trace from source file (SHA) to the alert, the confidence breakdown, and the raw source data the rule fired on. It answers "why did the system raise this, and how much should I trust it?"

**Main features & tools:**
- **Alert list** (left), **Rationale hero**, **Trace chain** (source filename → SHA-256), **Confidence hero** (Overall + Completeness/Consistency/Source-reliability sub-bars), **Raw source snippets**.

**How to use:**
1. Pick an alert (the first opens automatically).
2. Read the rationale, follow the trace.
3. Check the confidence breakdown.
4. Scroll the raw snippets.

**Feeds / outputs:** Reads alerts + their evidence/trace; no writes.

**Tip:** A high Overall with low Completeness means the rule is confident but on a partial dataset — confirm before acting.

---

### Approval Queue — `/approval`

**Access:** `canEvaluateRules`.

**What it's for:** The human-approval gate for governance decisions. Reviewers approve, reject (with confirmation) or acknowledge each decision; critical decisions need a second, distinct approver (2-of-2), and overdue items are flagged escalated.

**Main features & tools:**
- **Decision cards** (alert + decision + latest review), a **chain status bar** (state pill, "N/2 approvals", approver names, a red **ESCALATED · Nd** pill), and three actions: **Approve / Reject / Acknowledge**.

**How to use:**
1. Review each decision card.
2. **Approve / Reject / Acknowledge**.
3. For a critical decision, a *different* reviewer must approve the second signature.

**Feeds / outputs:** In-flight alert/decision pairs in; your review action written onto the approval chain.

**Tip:** You can't supply both signatures on a critical decision — line up the second reviewer in advance.

---

### AI vs Human Comparison — `/comparison`

**Access:** View = any user; registering a pair = `canEvaluateRules`; recording a verdict = `canEditPolicy`. No AI runs on this page.

**What it's for:** Side-by-side comparison of an AI output and a human output for the same task (baseline, clash, letter, report). A director reads both and records which was closer — each verdict is a labelled training example for the personas.

**Main features & tools:**
- **Register comparison** form, a **pair list** with a verdict pill, side-by-side **AI vs Human** detail, **reconciliation notes**, and three verdict buttons (**AI correct / Human correct / Both have merit**).

**How to use:**
1. **Register comparison** (task kind, title, AI + human output ids/summaries).
2. Open the pair to read both side by side.
3. Write reconciliation notes.
4. Click the verdict that reflects reality.

**Feeds / outputs:** AI/human output pairs in; the verdict feeds persona refinement.

**Tip:** Write the reconciliation notes before the verdict — they are the real value to the persona-improvement loop.

---
## 8. Administration & Access

The surfaces that control who gets into Sigma, what each role may do, and the system-wide governance and AI settings.

---

### Sign In — `/auth`

**Access:** Open to everyone (the entry door).

**What it's for:** The single sign-in screen. It doubles as the bootstrap landing page when the platform is brand-new and no admin account exists yet.

**Main features & tools:**
- A "Sign in as" row of 15 role chips (Sigma Admin, Sigma Reviewer, Client, Consultant, Contractor, Subcontractor, Owner, Operator, Investor, Lender, PMO, Governance Board, Bank, Government Regulator, Asset Manager) — clicking a chip pre-fills the matching demo credentials.
- Email + password fields (Show/Hide, Caps-Lock warning), language (EN/AR) and theme toggles.
- A bootstrap banner (amber) printing the `npm run user:create` command when no users exist.

**How to use:**
1. Open `/auth` (you're redirected home if already signed in).
2. Click your role chip or type email + password.
3. **Sign in**.
4. If you see the bootstrap banner, run the printed CLI command on the backend host first.

**Feeds / outputs:** Takes email + password, stores the returned API key for the session.

**Tip:** The role chips are for quickly switching "hats" in a demo — but typing into the email field clears the selected chip.

---

### My Account — `/account`

**Access:** Any signed-in user.

**What it's for:** A read-only snapshot of your session — name, role, project scopes, and an API-key preview — and where you sign out.

**Main features & tools:** A "Signed in" card (Display name, Email, Role pill, Project scopes), a key-preview hint, **Sign out**, and a **View usage guide** link.

**How to use:**
1. Open `/account`.
2. Confirm your role and project scopes.
3. **Sign out** to end the session.

**Tip:** If a colleague "can't see project X," check their Project scopes here — a scoped account (`P-1000` only) won't see other projects even if the role allows it.

---

### Help — `/help`

**Access:** Any user.

**What it's for:** A short orientation tour of the five core surfaces (Input → Review → Evidence → Approval → Policy) and an explanation of bootstrap mode and role-based access.

**How to use:** Open `/help`, read the five-step PMO loop, click any step to jump there.

**Tip:** Send new stakeholders here first — the five-step loop is the fastest way to explain the platform.

---

### Role Permissions — `/admin/roles`

**Access:** `canManageRoles` (Sigma Admin only).

**What it's for:** The runtime capability matrix where an admin turns individual capabilities on/off for any of the 15 roles. Changes are enforced immediately by the backend guard.

**Main features & tools:**
- A matrix table (one row per capability, one column per role, a toggle in each cell).
- The Sigma Admin column is locked; `canRead` and `canManageRoles` rows are locked everywhere (lockout protection).
- An amber ring marks overridden cells; per-role "reset" links + "Reset all to defaults".

**How to use:**
1. Find the capability row + role column.
2. Click the toggle (a toast confirms; navigation re-syncs).
3. Undo via the toggle, a "reset" link, or "Reset all".

**Tip:** A capability change takes effect on the user's *next* page load — tell them to refresh.

---

### User Management — `/admin/users`

**Access:** View = `canReadAll`; create/edit/delete/key = `canManageRoles`.

**What it's for:** The stakeholder account directory — add users, change roles and project scopes, reset passwords, rotate API keys, remove accounts.

**Main features & tools:**
- A users table (Email, Name, Role, Scopes, Active, Created, Actions).
- **New user** form (Email, Display name, Role, Password ≥ 8, Project scopes `*` or a comma list).
- Per-row: **Edit**, **Password**, **Rotate key** (shown once), **Delete**.

**How to use:**
1. **New user** → fill → **Create user**. Copy the API key from the toast immediately (shown once).
2. **Edit** to change role/scope.
3. **Password** / **Rotate key** as needed.
4. **Delete** with confirmation.

**Tip:** The sole active admin can't be deleted, demoted, or deactivated — create a second admin before reorganizing the first.

---

### Governance Configuration Center — `/admin/governance`

**Access:** Page = `canEditPolicy`; the AI Agents table is editable only with `canManageRoles`.

**What it's for:** The single screen that tunes both the deterministic governance engine and the AI agent fleet. Changes apply on the next run, no restart.

**Main features & tools:**
- **Governance engine card** — "Escalate after (days)", "Auto-evaluate rules on ingest", "Dual approval for critical decisions", and three **Status roll-up weights** (Alerts, Escalations, Confidence) that must sum to 1 (±0.01).
- **AI Agents table** — every L0–L8 agent with an **Enabled** toggle and a **Model-tier** dropdown (Platform default / Claude Haiku / Sonnet / Opus) + per-row Save.

**How to use:**
1. Set the escalation window and toggle auto-evaluate / dual-approval.
2. Adjust the three weights so the sum pill reads 1.00 → **Save governance config**.
3. In the Agents table, disable an agent or pin a model tier → **Save** that row.

**Tip:** Pin Claude Opus only on the agents whose judgement matters most; leave the rest on "Platform default" to control cost. (This is the cost-control lever for the Claude integration.)

---

### Governance Policy Editor — `/admin/policy`

**Access:** `canEditPolicy`.

**What it's for:** Where the governance policy itself is viewed and edited — FIDIC mapping, accountability, escalation tiers, intervention library. Every save creates a new immutable version.

**Main features & tools:** A version pill, a **Structured** vs **Editor** tab switch, a JSON textarea with live validation, a **Format** button, and a Save that becomes "Fix JSON first" when invalid.

**How to use:**
1. Read on the **Structured** tab.
2. Switch to **Editor**, edit the JSON.
3. **Format** to tidy + validate.
4. **Save** — a new version is issued.

**Tip:** Always **Format** before saving — it's also a final parse check, so you never push malformed JSON.

---

### AI Expert Personas — `/admin/personas`

**Access:** View = any role; editing = `canEditPersonas` (Sigma Admin only).

**What it's for:** The registry of the AI "expert voices" behind each layer — their system prompts, rules, model tier, temperature. Every edit creates a new append-only version.

**Main features & tools:** A personas table (Slug, Title, Layer, Version, Model tier, Authored by), a layer filter, and a modal showing the full system prompt + rules with an **Edit** (admins) → Save (new version).

**How to use:**
1. Filter by layer.
2. Click a persona to inspect its prompt/rules.
3. (Admin) **Edit** → adjust → **Save** (new version).

**Tip:** Saves are version bumps — the earlier version is preserved and can be reinstated; compare versions before editing.

---

### Audit Trail — `/audit`

**Access:** `canReadAll`.

**What it's for:** A searchable, timestamped log of every decision action — who approved, rejected or acknowledged which alert, under which FIDIC clause and escalation level. The accountability record.

**Main features & tools:** A table of up to 300 recent review actions (When, Actor + comment, Action, Severity, Alert code, Responsible party, FIDIC clause), a search box, and sortable columns.

**How to use:**
1. Search by actor, alert code, party, clause or comment.
2. Sort by severity or time.
3. Read the Actor sub-line for the attached comment.

**Tip:** Search by a FIDIC clause number to pull every decision tied to that provision — useful for a claim or board pack.

---

### Platform Settings — `/admin/settings`

**Access:** `canEditPolicy`.

This is where the **Claude API**, **Autodesk APS** and **Primavera P6** credentials are entered (each encrypted at rest). See **Chapter 2 — Integrations** for exactly what each one does and how to configure it.

---

*End of guide. For the integration credentials and what happens when you connect the Claude API, see Chapter 2. For the Primavera and BIM features, see Chapters 2, 5 (Quantity Survey) and 7 (Baselines / Drawings).*

