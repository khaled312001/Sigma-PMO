# Sigma PMO — Handover entry point

> This page is the single index a Sigma operator needs to navigate the
> full delivery. Per Clause 8 of the Service Agreement, the handover
> consists of source code (this repository) plus the documents below.

## Code

| Path                | What                                                          |
| ------------------- | ------------------------------------------------------------- |
| `backend/`          | NestJS API + TypeORM + MySQL connection + all business logic  |
| `frontend/`         | Next.js 16 App Router — single unified responsive web app     |
| `data/samples/`     | Synthetic samples (P6 XER, P6 PMXML, MS Project XML, Excel, CSV) |
| `data/storage/`     | Immutable source-file archive (gitignored)                    |
| `deploy/`           | nginx config, systemd units, provision/deploy/backup scripts  |

## Contract paper trail (Clauses 10.1, 10.2, 10.4, Annex 3)

- [`docs/contract/README.md`](../contract/README.md) — index of briefs · releases · acceptances · assumption locks.

## Architecture decisions (Clause 9)

| ADR  | Topic                                                                   |
| ---- | ----------------------------------------------------------------------- |
| 0001 | ADR process — reason/risk/replacement path for every major decision     |
| 0002 | Unified TypeScript stack — NestJS · Next.js · MySQL on Hostinger         |
| 0003 | Canonical model + append-only traceability + deterministic-first        |
| 0004 | Rule Engine v1                                                           |
| 0005 | Evidence chain + data confidence scoring                                 |
| 0006 | Executive summary (deterministic + LLM-optional) + minimal UI            |
| 0007 | Layer 2 — governance policy as data + decision engine                    |
| 0008 | Layer 3 — RBAC + versioned API + integrations + deployment readiness    |
| 0009 | Vision alignment & extensibility map (post-v1.0)                         |

## Operations runbooks (Clause 8)

| Concern                     | Document                                                      |
| --------------------------- | ------------------------------------------------------------- |
| Daily operations + env      | [`docs/runbook/ops.md`](../runbook/ops.md)                     |
| Incident response           | [`docs/runbook/incident.md`](../runbook/incident.md)           |
| Backup (daily / weekly)     | [`docs/runbook/backup.md`](../runbook/backup.md)               |
| Restore drill               | [`docs/runbook/restore.md`](../runbook/restore.md)             |
| Health probes + monitoring  | [`docs/runbook/monitoring.md`](../runbook/monitoring.md)       |

## Architecture review notes (Clause 10.4 + agreed Syed flow)

- One file per cycle under [`docs/reviews/`](../reviews/): `cycle-{1..8}-architecture-notes.md`.
- Layer-1 architecture checkpoint: [`docs/reviews/layer-1-architecture-checkpoint.md`](../reviews/layer-1-architecture-checkpoint.md).

## Acceptance evidence

- [`acceptance-evidence-pack.md`](acceptance-evidence-pack.md) — per-cycle proof that the contractual acceptance criterion is met.

## User guide (RBAC roles)

- [`user-guide.md`](user-guide.md) — Sigma Admin · Sigma Reviewer · Client · Consultant · Contractor.

## Release tag

The final delivered commit on `main` is tagged **`v1.0.0-acceptance`**. To
deploy that exact build:

```bash
git checkout v1.0.0-acceptance
deploy/scripts/deploy.sh
```

## Where Sigma proprietary IP lives

Per Clause 7 + NDA Part B Clause 5 + Annex 3 #10: Sigma's proprietary
governance logic is **not** in source code. It lives as JSON rows in the
`governance_policy` table, authored by Sigma through `/admin/policy`. Source
ships a generic FIDIC-2017 baseline only.

## Going forward

- Sigma may evolve the governance policy through the UI without touching code.
- New rule codes (Sigma-specific) require an injected `Rule` class — see
  [ADR-0007 §"Extensibility for Sigma proprietary IP (Cycle 6)"](../adr/0007-layer-2-governance-policy.md).
- Anything in [Annex 2 Re-scope Triggers](../reference/Sigma_PMO_Contract_Package.pdf)
  is out of v1.0.0 scope and would be a new engagement.
