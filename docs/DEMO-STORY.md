# Sigma PMO — Demo Story (Presenter Script)

Three scenarios for a live walkthrough: a **new/active project** carried through the full governance
chain, a **stalled project**, and a **disputed project**. Verified against live production
(`system.sigma-pmo.com`) on 2026-07-02.

- **Login:** open `system.sigma-pmo.com` → the sign-in page's **"Sign in as"** picker fills a demo
  account (Sigma Admin / Client / Consultant / Contractor …). Pick **Client** (Al Ayham's governance
  seat) for the owner view, or **Sigma Admin** for everything.
- **Project switcher:** the top bar switches the active project (persists as `sigma_project_key`).
- **One-line pitch:** *"Sigma is a deterministic-first governance OS: it ingests the project's real
  artefacts, runs the rules, and produces recommendations with confidence, evidence and alternatives —
  but it never auto-decides. The platform recommends; a human approves."*

---

## Scenario 1 — NEW / ACTIVE project: **P-1000 "Hospital Tower — Phase 1"**
The flagship. Every stage of the chain has real data (verified: feasibility ×4, BIM ×3, BoQ, schedule,
cost-ledger ×3, claim ×1, site-evidence ×2, reports ×3, **24 governance decisions / 23 awaiting human
approval**, 18 clashes, 7 risks). Walk the chain top to bottom:

| # | Page (route) | What to click / show | Talking point | API behind it |
|---|---|---|---|---|
| 1 | **Project Journey** `/journey` | The 13-stage timeline for P-1000 — every stage green with counts | "One screen shows the whole governance journey; each stage records its inputs, outputs and evidence." | `GET /journey/P-1000` |
| 2 | Opportunity / Feasibility `/opportunity`, `/feasibility` | The investment case + feasibility run | "It starts as an idea and an investment case, not a drawing." | `GET /feasibility/opportunities` |
| 3 | Bankability `/bankability` | Score + proceed/hold/reject | "NPV/IRR/DSCR verdict before money is committed." | `GET /bankability/assessment?projectKey=P-1000` |
| 4 | Drawings / BIM `/drawings` | IFC models (native) + the **Autodesk APS** section | "IFC works natively today; DWG/RVT translation switches on the moment the two APS keys are set." | `GET /bim?projectKey=P-1000`, `GET /integrations/autodesk/status` |
| 5 | Clashes `/clashes` → open **GEOM-0010** | The clash detail (model A/B, GUIDs, X/Y/Z, penetration, discipline, severity) → **Download PDF** | "Every clash is a full, exportable record — the engineering evidence, not a screenshot." | `GET /clashes/:id`, `GET /clashes/:id/pdf` |
| 6 | Quantity Survey `/quantity-survey` → **BOQ Traceability** tab → **Trace** on a line | Quantity source (BIM element GUID) → NRM code → pricing library → clash impact → ledger | "Every quantity and price is traceable back to its BIM element and pricing source." | `GET /quantity-survey/boq/:id/traceability` |
| 7 | Forensic delay / schedule `/forensic-delay` | Critical path / EOT / recovery | "Schedule analysis + recovery, linked to the same activities." | schedule/CPM endpoints |
| 8 | Claims / FIDIC `/claims` → open the claim → **chain** | Claim → alert → decision → source evidence + FIDIC clause | "A claim isn't an assertion — it's an evidence chain with a clause reference." | `GET /claims/:id/chain` |
| 9 | Site Evidence `/site-evidence` | The **Capture → Evidence → Report → Governance Alert → Human Approval** strip; a safety capture that raised a governance alert | "Field capture (incl. smart-glasses) becomes governed evidence and can raise an alert awaiting sign-off." | `GET /site-evidence?projectKey=P-1000` |
| 10 | Reports `/reports/monthly` | Open a report → **📄 PDF** and **✉️ Email** | "Generate the narrative report, download it, or email it straight from the platform (SMTP)." | `GET /reports/monthly/:id/pdf`, `POST /reports/monthly/:id/email` |
| 11 | Governance `/decisions`, `/approval` | A decision's **envelope**: category, confidence, source evidence, reason, **alternatives**, and **"Requires human approval / No auto-approval"** | "This is the heart of it — the platform recommends with confidence + evidence + alternatives; a human decides. Financial/contractual/safety decisions can never be auto-approved." | `GET /governance/decisions/:id/envelope` |
| 12 | Executive `/executive` | KPI headline (governance red, schedule slipping, cost over-budget, 1 critical risk, 1 potential claim) | "The board view rolls it all up." | `GET /executive/overview?projectKey=P-1000` |

Close scenario 1 with the **23/23 acceptance program** (`/acceptance` → run) and the **backup
restore-verify** (super-admin console → restore-verify, restores into a scratch schema, prod untouched).

---

## Scenario 2 — STALLED project: **P-2000 "Riverside Mall"**
The early-warning + recovery angle. Switch the project to P-2000.

- **Story:** a project that started (a BIM model was uploaded, an initial report exists) but then
  **stalled** — no schedule progress, no further governance activity. Sigma surfaces the *absence* of
  progress as a signal, not just the presence of problems.
- **Pages:** `/journey` (few stages present — the chain visibly stops early) → `/executive` (schedule
  status) → `/governance-command` (no escalations yet) → the talking point is **"a stalled project is
  itself a governance finding — the journey screen shows exactly where it froze."**

> **Current data state (verified 2026-07-02, after seeding):** P-2000 now carries the **delivery chain
> that then stalled** — BIM models + **10 detected clashes** + a BoQ + a monthly report. The clash-detail,
> PDF export and BOQ-traceability features are all demonstrable on it. The governance **decision** layer
> still needs a behind-plan **schedule** ingested to fire `SCHEDULE_BEHIND_PLAN` (P-2000 has no schedule
> leg yet) — see **Story gaps**.

---

## Scenario 3 — DISPUTED project: **P-3000 "Marina Bridge"**
The claims/dispute-readiness angle. Switch the project to P-3000.

- **Story:** a project **in dispute** — the value is the forensic evidence chain: a claim mapped to a
  FIDIC clause, substantiated by alerts, decisions, letters and site evidence, with a legal hold on the
  record set.
- **Pages:** `/claims` (the claim register + FIDIC clause) → the claim **chain** (claim → alert →
  decision → source) → `/letters` (FIDIC correspondence) → `/legal-holds` (records preserved) →
  `/evidence` (the evidence room). Talking point: **"When it goes to dispute, everything is already
  assembled and traceable — that's the difference between a claim and a defensible claim."**

> **Current data state (verified 2026-07-02, after seeding):** P-3000 now carries BIM + **10 clashes** +
> a BoQ + an **evidence room** + a **legal hold** (the dispute record set is preserved). The **claim**
> chain (claim → alert → decision → source) still needs a schedule/cost-variance ingest to generate the
> alerts the L6 claims agent consumes — see **Story gaps**.

---

## Closing
- **Acceptance:** `GET /acceptance/catalog` (23 tests) + run → **23/23 pass** (schedule/critical-path,
  decision→agent→evidence audit chain, full L1→L8+EXT pipeline).
- **Durability:** nightly encrypted backup to S3/R2 + `POST /backup/restore-verify` (restores a real
  backup into a scratch schema, reports row counts, prod untouched).
- **Keys-only remaining:** Autodesk APS (`AUTODESK_CLIENT_ID`/`SECRET`), Anthropic (`ANTHROPIC_API_KEY`),
  SMTP (`EMAIL_SMTP_URL`, e.g. `info@sigma-pmo.com`), Stripe (optional). All wired; set the keys in
  Coolify env or `/admin/settings` and the corresponding live features (DWG/RVT translation, AI
  narratives, real email send) turn on with no code change.

## Story gaps (to make all three scenarios fully live)
`backend/scripts/seed-journey.mjs` now seeds P-2000 and P-3000 with the delivery chain (BIM + native
clash + BoQ; P-3000 also an evidence room + legal hold). **What remains** to light up the governance
decision/claim layer on the two secondary projects:
1. **P-2000 (stalled)** — ingest a **behind-plan schedule** (→ `SCHEDULE_BEHIND_PLAN` alert → a
   governance decision awaiting approval → recovery-plan recommendation). *Has: BIM + 10 clashes + BoQ +
   report. Needs: schedule.*
2. **P-3000 (disputed)** — ingest a **schedule/cost-variance** so the rule engine raises the alerts the
   L6 claims agent turns into a substantiated claim; optionally a FIDIC letter. *Has: BIM + 10 clashes +
   BoQ + evidence room + legal hold. Needs: schedule/variance for the claim chain.*
3. P-1000 needs nothing — fully populated reference walkthrough (24 governance decisions, 1 claim).

Schedule ingestion is via `POST /ingestion/ingest-path` (server-side sample file) — the same path that
populated P-1000's schedule leg. Re-verify with `GET /journey/P-2000` and `GET /journey/P-3000`.
