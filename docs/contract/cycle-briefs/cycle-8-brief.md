# Cycle Brief — Cycle 8 (Layer 3, Integrations + Commercial UI + Handover)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2 + Annex 3 #12
- **Cycle number:** 8 of 8 (closes the full build path)
- **Layer:** 3 — Full Commercial Platform Layer
- **Calendar window:** Days 99 – 112
- **Cycle fee:** USD 800  (30% kickoff USD 240 · 70% completion USD 560)

## 1. Scope (verbatim from Annex 1)

> *Selected integrations (P6, MS Project, email, Slack / Teams) + commercial-grade UI / UX + hardening + scale plan + stress test + enterprise deployment readiness + handover.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *Integrations exchanging data; load test results; deployment runbook; full handover package.*

## 3. Inputs from Sigma (preconditions per Annex 3)

- **Annex 3 #12 — Branding / logos / visual style guide** confirmed in writing (see `docs/contract/assumptions/A12-branding.md`).
- Written Cycle 8 release.
- USD 240 kickoff deposit.
- Confirmation that Cycle 7 acceptance has been signed.
- SMTP credentials for email integration (Hostinger SMTP or third-party).
- (Optional) Slack and Teams incoming-webhook URLs for outbound notification testing.

## 4. Deliverables

- `backend/src/modules/integrations/p6/p6-webhook.controller.ts` — `POST /api/v1/integrations/p6/webhook` (base64 or path).
- `backend/src/modules/ingestion/parsers/msproject-xml.parser.ts` — MS Project 2013+ XML parser registered in `ParserRegistry`.
- `backend/src/modules/integrations/email/{email.module,email.service}.ts` — nodemailer SMTP, falls back to log channel.
- `backend/src/modules/notifications/notifications.service.ts` — Slack/Teams outbound webhooks active when configured; structured log fallback otherwise.
- `frontend/app/{,input,review,evidence,approval,admin/policy,admin/users,account,help,auth}/page.tsx` + `not-found.tsx` + `error.tsx` — 11 pages.
- `frontend/components/{Shell,Sidebar,ui,Icons,ToastProvider,ConfirmDialog,ProjectSwitcher}.tsx` — design system + multi-project switcher.
- A11y baseline: aria-labels, focus traps in modals, ≥44px touch targets, ≥4.5:1 contrast, axe-core clean.
- Responsive: desktop + tablet + mobile per Annex 1 Layer 3 clarification.
- `docs/handover/{README,acceptance-evidence-pack,user-guide}.md` — full handover entry point.
- Load test results: documented run with sample dataset (e.g., 10 ingestion runs · 200 alerts · 200 decisions · concurrent users).
- `docs/reviews/cycle-8-architecture-notes.md`.
- Git tag `v1.0.0-acceptance` on the final commit.

## 5. Sequencing notes

- Production live deployment to Hostinger is documented in `deploy/README.md`; execution depends on Hostinger creds availability (per Cycle 7 inputs).
- Final handover trigger: Cycle 8 written acceptance issued by Sigma → 70% completion + 70% of all prior unpaid cycles released → repository ownership transfers per Clause 7.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      | _Khaled Ahmed (pre-signed)_ |
