# Cycle 8 — Architecture Notes for Review

> Cycle 8 scope: **Integrations + Commercial UI + Handover** (Layer 3 closes, engagement closes).
> Acceptance criterion: *integrations exchanging data; load test results; deployment runbook; full handover package.*

## 1. Scope delivered

| Area                              | Delivered                                                       |
| --------------------------------- | --------------------------------------------------------------- |
| Inbound integrations              | Primavera P6 webhook · Primavera P6 PMXML + XER · Excel · CSV · Microsoft Project XML |
| Outbound integrations             | Email (SMTP) · Slack incoming webhook · Teams incoming webhook · log-channel fallback |
| Commercial UI                     | 11 pages: `/`, `/input`, `/review`, `/evidence`, `/approval`, `/admin/policy`, `/admin/users`, `/account`, `/help`, `/auth` + `not-found` + `error` |
| Multi-project switcher            | `ProjectSwitcher.tsx` + `lib/project-context.tsx` — no more hardcoded `PROJECT_KEY` |
| Toast notification system         | `ToastProvider.tsx` + `useToast()` hook — 4 severities                |
| Confirmation modals               | `ConfirmDialog.tsx` — accessible (focus trap, aria-modal, ESC)        |
| A11y baseline                     | aria-labels on icon-only triggers · focus traps on modals · ≥44px touch targets · ≥4.5:1 contrast · axe-core smoke-clean |
| Mobile + tablet + desktop layouts | Sidebar drawer on mobile · responsive top bar · overflow-x on tables |
| Streaming upload                  | Multipart upload replaces base64 in browser memory                    |
| Load test                         | Sample-dataset run captured in `docs/handover/acceptance-evidence-pack.md` |
| Handover pack                     | `docs/handover/` — README · acceptance evidence pack · user guide     |

## 2. Architecture in one picture

```
external system (P6 / MS Project / CRM)              human stakeholder (5 roles)
        │                                                       │
        ▼                                                       ▼
POST /api/v1/integrations/p6/webhook            Next.js console (one unified responsive app)
        │                                                       │
        ▼                                                       ▼
IngestionService.ingest(buffer) ◄───────── 4 standard surfaces (input/review/approval/evidence)
        │                                                       │
        ▼                                                       │
RuleEngine + Governance + Confidence  ─────────────────────────►│
        │                                                       │
        ▼                                                       ▼
ExecutiveSummary  +  Outbound notifications (Email · Slack · Teams)
```

## 3. Key new files

- `backend/src/modules/integrations/email/{email.module,email.service}.ts` — nodemailer SMTP.
- `backend/src/modules/ingestion/parsers/msproject-xml.parser.ts` — MS Project 2013+ XML.
- `frontend/components/{ToastProvider,ConfirmDialog,ProjectSwitcher}.tsx`.
- `frontend/lib/project-context.tsx` — context replacing the hardcoded literal in 5+ files.

## 4. Annex 1 Layer 3 Implementation Depth Clarification — verification

| Contract requirement                                          | Verified                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Single unified web application                                | One Next.js codebase under `frontend/`; one deployment                   |
| Served from one codebase, one deployment                      | systemd unit `sigma-pmo-frontend.service`                                |
| Responsive — desktop · tablet · mobile                        | Sidebar drawer on `<md`; sidebar fixed on `≥md`; table overflow-x        |
| RBAC role views (Contractor · Consultant · Client · Sigma)    | `roles.enum.ts` (+ `sigma_admin` for ops); `CAPABILITIES` matrix          |
| Role views configured through RBAC, not separate applications | Same codebase, same components; `Sidebar.tsx` filters links by capability |
| Four standard surfaces (input/review/approval/evidence)       | `app/{input,review,approval,evidence}/page.tsx`                          |
| Functional operating surfaces, not view-only                  | input = upload + ingest; review = evaluate + decide; approval = approve/reject/acknowledge; evidence = read-only (per contract intent) |
| Re-scope triggers (bespoke role flows, native mobile, …)      | Listed in ADR-0008 and `docs/contract/assumptions/A11-integrations-final-list.md` |

## 5. Modular separation

Frontend reuses `components/ui.tsx` primitives everywhere (Card · Button · Pill · SeverityBadge · ConfidenceBar · ErrorBanner · EmptyState · PageHeader). Adding a new page is one file under `app/`, never a new design system.

## 6. ADRs raised

- ADR-0008 extends in §"Phase 6 frontend hardening" addendum (toast system, confirm dialogs, multi-project switcher).

## 7. Acceptance evidence

| Criterion                          | Evidence                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Integrations exchanging data       | P6 webhook smoke ingestion · MS Project parsing test · Slack/Teams smoke (when webhook URLs set) · Email SMTP (when `EMAIL_SMTP_URL` set) |
| Load test results                  | Captured in `docs/handover/acceptance-evidence-pack.md` § "Load test"   |
| Deployment runbook                 | `docs/runbook/{ops,incident,backup,restore,monitoring}.md` + `deploy/README.md` |
| Full handover package              | `docs/handover/README.md` · `docs/handover/user-guide.md` · `v1.0.0-acceptance` git tag |

## 8. Deferred / known items

- Native mobile apps remain a Re-scope Trigger.
- Bespoke role-specific workflow screens (beyond the four standard surfaces) remain a Re-scope Trigger.

## 9. What this closes

The 8-cycle engagement closes on Cycle 8 written acceptance per Clause 7:
- Full source code ownership transfers to Sigma.
- Sigma proprietary logic remains Sigma's IP (NDA Part B Clause 5 — indefinite survival).
- No retained dependency on the Service Provider.

## 10. What stays alive after handover

- Sigma operates the platform on Hostinger.
- The `governance_policy` table is where Sigma evolves its proprietary content version by version.
- The Service Provider's access is revoked at this cycle close per Clause 8.
