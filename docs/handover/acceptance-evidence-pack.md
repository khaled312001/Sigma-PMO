# Sigma PMO — Acceptance evidence pack

> Per-cycle proof that each contractual acceptance criterion in Annex 1 is met.
> Each row links to the cycle's Brief / Release / Acceptance documents and
> to the technical evidence (ADRs, architecture notes, test reports, key
> commits).

## Layer 1 — Technical Governance Engine

### Cycle 1 — Data Foundation (USD 700, days 1–14)

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Ingest sample P6 + Excel and verify normalised state.*       |
| Cycle Brief                  | [`docs/contract/cycle-briefs/cycle-1-brief.md`](../contract/cycle-briefs/cycle-1-brief.md) |
| Cycle Release                | [`docs/contract/cycle-releases/cycle-1-release.md`](../contract/cycle-releases/cycle-1-release.md) |
| Written Acceptance           | [`docs/contract/acceptances/cycle-1-acceptance.md`](../contract/acceptances/cycle-1-acceptance.md) |
| Architecture notes for Syed  | [`docs/reviews/cycle-1-architecture-notes.md`](../reviews/cycle-1-architecture-notes.md) |
| ADRs                         | 0001, 0002, 0003                                               |
| Key commits                  | `547d1c2`, `837db3c`                                           |
| Proven on                    | MariaDB at 127.0.0.1:3306 on 2026-05-27. 3 source files ingested (XML + Excel + XER) producing 8 activities each with append-only versioning verified across 6 successive ingests. |
| Tests                        | `coerce.spec.ts` · `validation.service.spec.ts` · `parsers.spec.ts` · E2E `ingestion.e2e-spec.ts` |

### Cycle 2 — Rule Engine v1 (USD 600, days 15–28)

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *A deviation is detected with full traceback to source rows.* |
| Cycle Brief / Release / Acceptance | Cycle-2 trio under `docs/contract/`                       |
| Architecture notes           | [`docs/reviews/cycle-2-architecture-notes.md`](../reviews/cycle-2-architecture-notes.md) |
| ADR                          | 0004                                                           |
| Key commit                   | `80c7854`                                                      |
| Proven on                    | Synthetic Nile Tower P-1000 — 7 alerts emitted (3 critical, 4 warning). Each alert resolves to `activityId → ingestionRunId → sourceFileId → SHA-256-archived bytes` in three SQL hops or one HTTP call to `/api/v1/governance/alerts/:id/evidence`. |
| Tests                        | E2E test asserts `ingestionRunId` and `sourceFileId` non-empty on every alert. |

### Cycle 3 — Governance Layer (USD 400, days 29–42)

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *End-to-end evidence trail proven on real sample data.*       |
| Cycle Brief / Release / Acceptance | Cycle-3 trio under `docs/contract/`                       |
| Architecture notes           | [`docs/reviews/cycle-3-architecture-notes.md`](../reviews/cycle-3-architecture-notes.md) |
| ADR                          | 0005                                                           |
| Key commit                   | `86e2138`                                                      |
| Proven on                    | Excel ingestion on 2026-05-27 → confidence 0.97 (completeness 1.0 · consistency 1.0 · source 0.85). Single `GET /api/v1/governance/alerts/:id/evidence` returns the full chain. |
| Tests                        | `confidence.service.spec.ts` covers the deterministic formula; E2E confirms SHA-256 + confidence on a triggered alert. |

### Cycle 4 — Output Layer (USD 300, days 43–56) — closes Layer 1

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Usable internal MVP and full handover.*                      |
| Cycle Brief / Release / Acceptance | Cycle-4 trio                                               |
| Architecture notes           | [`docs/reviews/cycle-4-architecture-notes.md`](../reviews/cycle-4-architecture-notes.md) |
| Layer 1 architecture review checkpoint | [`docs/reviews/layer-1-architecture-checkpoint.md`](../reviews/layer-1-architecture-checkpoint.md) (Clause 10.4) |
| ADR                          | 0006                                                           |
| Key commits                  | `4811b01`, `be9b000`, `55469c2`                                |
| Proven on                    | Deterministic weekly summary for 2026-05-09 → 2026-05-15 generated; minimal internal console live at `http://localhost:3000`. |
| Tests                        | E2E inkages the summary; 56 tests in total green. |

## Layer 2 — Sigma Governance Intelligence

### Cycle 5 — FIDIC + PMI/PMBOK (USD 700, days 57–70)

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Contractual + governance flow executed on a sample portfolio.* |
| Cycle Brief / Release / Acceptance | Cycle-5 trio                                               |
| Architecture notes           | [`docs/reviews/cycle-5-architecture-notes.md`](../reviews/cycle-5-architecture-notes.md) |
| ADR                          | 0007                                                           |
| Key commit                   | `4e2a5ce`                                                      |
| Proven on                    | Default policy ships FIDIC-2017 baseline; `POST /api/v1/governance/decide` produces 9 decisions from the 7 sample alerts with FIDIC clause + notice + deadline + escalation + interventions for every one. |
| Tests                        | `governance-policy.service.spec.ts` (versioning) · `governance-decision.service.spec.ts` (FIDIC mapping for known + unknown rule codes). |

### Cycle 6 — Sigma proprietary logic (USD 700, days 71–84) — closes Layer 2

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Full intelligence layer running over the engine, with explainable outputs.* |
| Cycle Brief / Release / Acceptance | Cycle-6 trio                                               |
| Architecture notes           | [`docs/reviews/cycle-6-architecture-notes.md`](../reviews/cycle-6-architecture-notes.md) |
| Sigma IP capture workflow    | [`docs/contract/assumptions/A10-sigma-proprietary-logic.md`](../contract/assumptions/A10-sigma-proprietary-logic.md) |
| Key commit                   | `55469c2`                                                      |
| Proven on                    | `DecisionReview` audit trail captures approve/reject/acknowledge with actor + timestamp; combined with Cycle 3 evidence and Cycle 5 policy versioning, every decision is reproducible from `(alertId, policyId, policyVersion)`. |
| IP segregation               | Source code carries only generic FIDIC defaults; Sigma proprietary content lives in `governance_policy.config` JSON rows owned by Sigma. |

## Layer 3 — Commercial platform

### Cycle 7 — Platform core + RBAC (USD 800, days 85–98)

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Dev/staging/production stack live; backup and restore proven; roles enforced end-to-end; API consumed externally.* |
| Cycle Brief / Release / Acceptance | Cycle-7 trio                                               |
| Architecture notes           | [`docs/reviews/cycle-7-architecture-notes.md`](../reviews/cycle-7-architecture-notes.md) |
| ADR                          | 0008                                                           |
| Key commits                  | `6a8ede5`, `2e1bb4c`, `8d7074b`, `3f0e74d`                     |
| RBAC enforcement             | `@RequiresCapability` decorator on every write route; `ApiKeyGuard.spec.ts` verifies bootstrap, valid, invalid, and denied scenarios. |
| Migrations                   | `1700000000000-Init.ts` + `1700000000100-AddIndexes.ts`; verified drill on a fresh `sigma_pmo_test` DB produces 16 tables. |
| `synchronize=false` in prod  | `database.module.ts` overrides the env var when `NODE_ENV === 'production'`. |
| Backup + restore drill       | Documented in `docs/runbook/backup.md` + `restore.md`; scripts in `deploy/scripts/`. **Live drill awaits Hostinger credentials per Cycle-7 brief inputs.** |

### Cycle 8 — Integrations + UI + Handover (USD 800, days 99–112) — closes the engagement

| Item                         | Evidence                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Acceptance criterion         | *Integrations exchanging data; load test results; deployment runbook; full handover package.* |
| Cycle Brief / Release / Acceptance | Cycle-8 trio                                               |
| Architecture notes           | [`docs/reviews/cycle-8-architecture-notes.md`](../reviews/cycle-8-architecture-notes.md) |
| Integrations                 | P6 webhook · P6 PMXML/XER · MS Project XML · Excel · CSV · Slack/Teams outbound · Email SMTP. Final list locked in [`A11-integrations-final-list.md`](../contract/assumptions/A11-integrations-final-list.md). |
| Commercial UI                | 11 pages · ToastProvider + ConfirmDialog + ProjectSwitcher · a11y baseline (aria-labels, focus traps, focus-visible, 4.5:1 contrast) · responsive (mobile drawer + tablet + desktop) · overflow-x on all tables. |
| Deployment runbook            | `docs/runbook/{ops,incident,backup,restore,monitoring}.md` (this pack). |
| Load test                    | (Placeholder — to be run live once Hostinger creds arrive; results captured in this section.) |
| Handover package              | This file + handover/README.md + handover/user-guide.md + the contract pack + the runbook split + ADRs + architecture notes. |
| Tests                        | 53 unit + 3 E2E = 56 green. Coverage targets ≥85% on key modules. |

## Live deployment proof

(Placeholder for when Hostinger credentials arrive. The deploy/ artefacts
are reviewed and `shellcheck`-clean; execution is a ~60-minute sequence per
`deploy/README.md`.)

| Item                                    | URL / file                              |
| --------------------------------------- | --------------------------------------- |
| Production API URL                      | TBD                                     |
| Production console URL                  | TBD                                     |
| `/api/v1/ready` capture                 | TBD                                     |
| `restore-drill.sh` output               | TBD                                     |
| Backup directory listing                | TBD                                     |
| First admin creation log                | TBD                                     |
