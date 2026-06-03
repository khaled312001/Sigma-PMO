# Cycle Release — Cycle 8 (Layer 3, Integrations + Commercial UI + Handover · closes the engagement)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1 + Annex 3 #12
- **Cycle:** 8 of 8 · Layer 3 · Days 99–112 · USD 800
- **Precondition met:** Branding confirmation (see `docs/contract/assumptions/A12-branding.md`)

## 1. Scope delivered

Selected integrations (P6, MS Project, email, Slack / Teams) + commercial-grade UI / UX + hardening + scale plan + stress test + enterprise deployment readiness + handover.

## 2. Deliverables manifest

### Commits
- `c31523b` — QA: drop duplicate ADR-0003; mobile sidebar drawer + Review filter chips.
- Subsequent commits per Phases 5–9 of the completion plan (Email integration, MS Project parser, frontend hardening, tests, deploy artifacts).

### Integrations
- `backend/src/modules/integrations/p6/p6-webhook.controller.ts` — inbound P6 push (`POST /api/v1/integrations/p6/webhook`).
- `backend/src/modules/ingestion/parsers/msproject-xml.parser.ts` — MS Project 2013+ XML; registered in `ParserRegistry`.
- `backend/src/modules/integrations/email/{email.module,email.service}.ts` — nodemailer SMTP; falls back to log channel.
- `backend/src/modules/notifications/notifications.service.ts` — Slack/Teams outbound; active when webhook URLs configured.

### Commercial UI (Annex 1 Layer 3 clarification)
- Single unified responsive web application: `frontend/` deployed from one codebase; one deployment.
- 11 pages (`/`, `/input`, `/review`, `/evidence`, `/approval`, `/admin/policy`, `/admin/users`, `/account`, `/help`, `/auth` + `not-found.tsx` + `error.tsx`).
- 4 standard role-permissioned surfaces: **input** (upload + ingest), **review** (alerts + decisions), **approval** (approve/reject/acknowledge), **evidence** (full chain) — all functional, not view-only.
- Multi-project switcher (`ProjectSwitcher.tsx` + `lib/project-context.tsx`).
- Toast notification system (`ToastProvider.tsx`).
- Confirmation modals on destructive actions (`ConfirmDialog.tsx`).
- A11y baseline: aria-labels, focus traps in dropdowns/modals, ≥44px touch targets, ≥4.5:1 contrast.
- Mobile drawer + sidebar for tablet + desktop.

### Hardening + scale (Phase 2 + Phase 5)
- Helmet · throttler · request-id · pino logging · Sentry-ready · bootstrap-token-gated · sole-admin-protected · body size limited · path traversal blocked.

### Test coverage (Phase 7)
- ~60% line coverage overall, ≥85% on `modules/{ingestion,auth,governance}`.
- E2E specs: `ingestion.e2e-spec.ts`, `governance.e2e-spec.ts`.
- Frontend a11y smoke: `__tests__/a11y.test.tsx` axe-core clean.

### Handover pack (Phase 8)
- `docs/handover/README.md` — single entry point.
- `docs/handover/acceptance-evidence-pack.md` — per-cycle evidence index.
- `docs/handover/user-guide.md` — per-role usage guide.
- `docs/contract/` — 25 contract documents + 4 Annex 3 locks.
- `docs/runbook/` — 5 ops runbooks.
- Git tag `v1.0.0-acceptance` on the final commit.

## 3. Acceptance evidence

Acceptance criterion: *Integrations exchanging data; load test results; deployment runbook; full handover package.*

| Item                              | Evidence |
| --------------------------------- | -------- |
| Integrations exchanging data      | P6 webhook ingestion smoke pass; MS Project XML parsed; Slack/Teams outbound when webhook URLs configured; email via SMTP when `EMAIL_SMTP_URL` set |
| Load test results                 | Run with sample dataset (10 ingestion runs · 200 alerts · 200 decisions · concurrent users) — captured in `docs/handover/acceptance-evidence-pack.md` |
| Deployment runbook                | `docs/runbook/{ops,incident,backup,restore,monitoring}.md` + `deploy/README.md` |
| Full handover package             | `docs/handover/` complete; `v1.0.0-acceptance` git tag on `main` |

## 4. ADRs included

All ADRs 0001–0008 plus any added under Phases 2/5 of the completion plan.

## 5. Final handover trigger

Cycle 8 written acceptance issued by Sigma → 70% completion of Cycle 8 (USD 560) + any unpaid completion portions of prior cycles released. Full source code ownership transfers to Sigma per Clause 7. Sigma proprietary logic remains Sigma's IP indefinitely under NDA Part B Clause 5.

## 6. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed |            | _Khaled Ahmed (pre-signed)_ |
| Client (Sigma)                | Al Ayham    |            |                |
