# Sigma PMO — Final Handover

A complete, self-contained handover for the Sigma PMO platform: what it is, how to run it from
scratch, every service, the API surface, data/migrations, backup/restore, security, and an honest
statement of what is **native** versus what needs an **external credential**.

Companion documents:
- [`RUNBOOK.md`](RUNBOOK.md) — run, build, deploy, migrate, back up, troubleshoot.
- [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md) — every env var.
- [`docs/AUTODESK-APS.md`](docs/AUTODESK-APS.md) — DWG/RVT translation, native-vs-APS boundary.
- [`docs/BACKUP-RESTORE.md`](docs/BACKUP-RESTORE.md) — backup + restore procedure.
- [`docs/roles-permissions.md`](docs/roles-permissions.md) — roles + capability matrix.
- [`docs/adr/`](docs/adr/) — 20 architecture decision records.

> **Release stamp (commit hash, test/build logs) is recorded in section 12 and is refreshed at the
> final tagged build.**

---

## 1. What it is
Sigma PMO is an **AI-assisted construction-governance operating system**. It carries an investment
from idea to delivery across a single, traceable chain:

**Idea → Bankability → BIM/IFC/Revit → Clash → BOQ → Cost → CPM (schedule) → FIDIC (contract/claims)
→ Site Evidence → Reports → Governance decision.**

Design principles:
- **Deterministic-first.** Rules, governance state, quantities, schedule maths and audit are computed
  deterministically. AI (Claude) only writes prose (narrative reports, FIDIC draft text, clash option
  suggestions) and is fully optional — with no key the platform runs deterministic-only.
- **The platform recommends; a human decides.** Nothing is auto-approved. Financial, contractual and
  safety decisions are hard-blocked from any auto-approval and require explicit human sign-off
  (critical/sensitive items require two distinct approvers).
- **Append-only truth + traceability.** Versioned canonical entities (grouped by `businessKey`, never
  by surrogate `id`), a cross-module journey correlation, and an evidence/confidence ledger.
- **Multi-tenant SaaS.** Companies self-register; data is isolated by `companyId`; a super-admin
  governs the platform.

## 2. Architecture
| Layer | Tech |
|---|---|
| Backend | NestJS 11 (TypeScript), TypeORM, MySQL 8.x. API under `/api/v1`, Swagger at `/api/v1/docs`. |
| Frontend | Next.js 16 + React 19 (App Router), Tailwind. Bilingual EN/AR with full RTL. |
| Auth | `x-api-key` (sha-256 hashed; multi-session) → `ApiKeyGuard` → `@RequiresCapability(...)`. Passwords are scrypt-hashed. |
| Tenancy | `companyId` on traceable entities + an AsyncLocalStorage tenant context; super-admin bypass. |
| AI | Anthropic Claude SDK (personas, FIDIC drafts, clash proposals, monthly narrative); optional. |
| Storage | Local disk **or** S3/S3-compatible (R2/MinIO/…); content-addressed. |
| Backups | Nightly in-app AES-256-GCM encrypted dump → S3, plus the file archive on S3. |
| Integrations | Autodesk APS (Model Derivative), Primavera P6 EPPM, Stripe billing. All optional. |
| Deploy | Docker multi-stage images on Coolify; branch-per-environment (`main`=prod). |

## 3. Run from scratch (summary)
```bash
# backend
cd backend && cp .env.example .env   # fill DB_*; see ENVIRONMENT_VARIABLES.md
npm ci && npm run migration:run && npm run start:dev   # :3001, /api/v1
# frontend
cd ../frontend && npm ci && npm run dev                # :3000
```
Full detail incl. first-admin bootstrap: `RUNBOOK.md` §1–2. **Toolchain is npm-only** (RUNBOOK §0).

## 4. Build + test (the proof)
```bash
cd backend && npm ci && npm run build && npm test
```
This single chain installs from the lockfile, compiles with `nest build`, and runs the full Jest
suite. The reference result and full log are in **section 12**. Frontend: `npm ci && npx tsc --noEmit
&& npm run build`.

## 5. Services / modules (API surface)
The backend exposes ~70 controllers under `/api/v1`. The live, exhaustive list (every route, request +
response schema) is the **Swagger UI at `/api/v1/docs`**. Grouped overview:

**Auth & platform admin** — `auth`, `admin/capabilities`, `admin/settings`, `admin/claude`,
`admin/governance-config`.
**Tenancy / SaaS** — `onboarding`, `super-admin`, `billing`, `analytics`.
**Intake & sources** — `ingestion`, `sources`, `input` (universal input), `records`, `knowledge`,
`project-memory`.
**Hierarchy & people** — `projects`, `hierarchy`, `org-charts`, `personas`, `agents`.
**Investment & feasibility** — `opportunity`, `feasibility`, `bankability`, `funding`, `revenue`,
`predictive`, `comparison`.
**Design / BIM / clash** — `drawings`, `bim`, `clashes` (+ clash solution proposer),
`integrations/autodesk`.
**Quantities & cost** — `boq`, `quantity-survey`.
**Schedule & scenarios** — `baselines`, `simulation` (+ project CPM endpoints).
**Contract, claims & comms** — `claims`, `contract-rules`, `letters`, `communications`,
`communication-rules`, `legal-holds`.
**Safety, quality & operations** — `safety`, `fire-safety`, `quality`, `utility`,
`operational-readiness`, `risk`, `authority`, `authority-matrix`.
**Evidence & lifecycle** — `site-evidence`, `evidence`, `journey`.
**Governance & decisions** — `governance`, `governance-command`, `executive` (+ governance dashboard),
`rules`, `policy-addons`, `acceptance`, `audit`.
**Reports** — `reports/monthly`, `summary`.
**Procurement & jobs** — `procurement`, `jobs`, `backup`.
**External integrations** — `integrations/p6` (sync + webhook), `integrations/autodesk`.

## 6. Data model & migrations
- Canonical entities in `backend/src/modules/canonical/entities/` (registered in `entities/index.ts` +
  `CANONICAL_ENTITIES`). Versioned entities are grouped by **`businessKey`** with `version` + `isCurrent`.
- Migrations in `backend/src/migrations/`, **auto-discovered**, additive + idempotent, each with a
  `down()`. Baseline is `InitialSchema`; subsequent migrations layer security hardening, communications,
  evidence rooms, site-evidence (smart-glasses), journey correlation, clash detail, claim/CPM linkage,
  BOQ provenance and governance-decision category. **`DB_SYNCHRONIZE=false` everywhere.**

## 7. Roles & access control
Six application roles (source of truth `backend/src/modules/auth/roles.enum.ts`, mirrored for the UI in
`frontend/lib/capabilities.ts`) plus a platform **super-admin**:
- **Sigma Admin** — full platform control (only role that edits personas/settings/Computer Use).
- **Client** — governance owner; reads all, edits policy, manages hierarchy, approves letters/baselines.
- **Sigma Reviewer** — read-only auditor (`canReadAll`, evaluate, summarize; no writes).
- **Consultant** — reviewer + simulation (sandboxed scenarios).
- **Contractor** — uploads schedule/BoQ/own letters; scoped to own slice; cannot approve.
- **Subcontractor** — most restricted; activity-scoped, fails closed.

Enforcement is on the **backend** (`ApiKeyGuard` + `@RequiresCapability`), so the UI gating cannot be
bypassed by a hand-crafted request. Full matrix: `docs/roles-permissions.md`.

## 8. Security
- Secrets **only** via host environment or the encrypted `/admin/settings` store — never in source,
  migrations, seeds, tests, logs, or screenshots. The backend never logs/returns a secret; status
  endpoints report enabled/disabled only.
- Integration accounts are registered in the **platform owner's** own accounts; the service provider
  needs no visible keys to operate.
- Auth: sha-256 API keys (multi-session, last-N retained), scrypt passwords, capability-guarded writes,
  per-IP rate limits, Helmet, CORS allow-list, optional Sentry.
- Tenant isolation by `companyId`; subcontractor data additionally activity-scoped and fail-closed.
- Backups AES-256-GCM encrypted before upload; `BACKUP_ENCRYPTION_KEY` treated as a production secret.

## 9. Backup / restore
Nightly encrypted DB dump → S3 + file archive on S3 = full files-and-data durability. On-demand
`POST /backup/run`; verify with `POST /backup/restore-verify` (restores into a scratch schema, reports
row counts, **prod untouched**). CLI restore is destructive and requires `--yes`. Procedure +
monthly drill: `docs/BACKUP-RESTORE.md`.

## 10. Native vs external (honest boundary)
| Capability | Native (no credential) | Needs external credential |
|---|---|---|
| Governance, decisions, audit, baselines, FIDIC clause checks | ✅ | — |
| IFC (STEP) parse, **native geometric clash**, BOQ/cost, CPM, claims | ✅ | — |
| AI prose (narratives, FIDIC drafts, clash suggestions) | — | `ANTHROPIC_API_KEY` |
| **DWG/RVT geometry & quantities**, SVF2 viewer | — | `AUTODESK_CLIENT_ID` + `AUTODESK_CLIENT_SECRET` (Model Derivative, 2-legged) |
| Live P6 schedule pull | upload/webhook | `P6_*` |
| Object-storage archive + DB backups | local disk | `S3_*` (+ `BACKUP_ENCRYPTION_KEY`) |
| SaaS billing | trial-only | `STRIPE_*` |

## 11. Known limitations / roadmap
- **DWG/RVT geometry requires Autodesk APS credentials** (free developer account). IFC works natively
  today; the APS connector is wired and surfaced in the UI — set the two credentials to translate real
  DWG/RVT. See `docs/AUTODESK-APS.md`.
- **APS Model Coordination clash** (cloud clash) needs a paid Autodesk Construction Cloud account; the
  platform's own **native IFC clash** does not.
- AI prose features are skipped without `ANTHROPIC_API_KEY` (deterministic-only mode).
- Point-in-time DB recovery (binlog shipping) is a documented future step on top of nightly dumps.

## 12. Release stamp & proof
- **Commit (production):** `7cfcda4` (deployed to `system.sigma-pmo.com` + `system-api.sigma-pmo.com`, 2026-06-29).
- **Toolchain:** Node ≥ 20, npm ≥ 10 (prod image `node:20-alpine`). Reference build host: Node 24 / npm 11.
- **Clean-room proof** (`git archive HEAD` → `npm ci` → `npm run build` → `npm test`):
  - `npm ci` → exit 0 (901 packages, lockfile-only)
  - `npm run build` (`nest build`) → exit 0
  - `npm test` (`jest`) → **75 suites passed · 1034 passed · 1 skipped** → exit 0
- **Deploy verified on prod:** migrations `BoqItemProvenance` + `GovernanceDecisionCategory` applied; every
  endpoint live (Autodesk APS status, clash detail + PDF export, BOQ traceability, governance decision
  envelope, site-evidence capture→alert). Re-runnable via `RUNBOOK.md` §3.
