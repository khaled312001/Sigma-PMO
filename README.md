# Sigma PMO

A governance-first PM Office operating system for Sigma. Ingests project
schedule + report data (Primavera P6, Excel, CSV), normalises it into a
canonical model with append-only versioning, runs a deterministic rule engine
to detect deviations, attaches evidence + a confidence score to every
finding, maps each deviation to a governance decision (FIDIC clause,
escalation, intervention), and produces a weekly executive summary.

> Engagement: paid build for client Al Ayham Alhamach (Sigma).
> Contract: see [`docs/reference/Sigma_PMO_Contract_Package.pdf`](docs/reference/Sigma_PMO_Contract_Package.pdf).
> Status: Layer 1 (Cycles 1–4) functionally complete and DB-acceptance-proven;
> Layer 2 (Cycles 5–6) and Layer 3 (Cycles 7–8) framework + stubs in place,
> awaiting per-cycle written release and acceptance per Sub-Clauses 6 / 10.2.

## Long-term vision (locked 2026-06-04)

Per Al Ayham's written direction (2026-06-04), Sigma PMO is evolving toward
an **AI-enabled Governance & Transformation Platform** that connects
BIM-based planning, Primavera schedules, daily operational reporting,
FIDIC obligations, PMBOK governance, and AI-assisted analysis into a single
workflow. The platform progressively answers six questions:

1. **What** deviated?
2. **Why** did it deviate?
3. **Who** owns the deviation?
4. What **evidence** supports the conclusion?
5. What **contractual exposure** exists?
6. What **corrective action** should be considered?

Phase 1 already answers all six through the existing modules; future cycles
extend along the five plug-in shapes (Parser · Rule · Integration adapter ·
Decision · Summary) without rework.

- Architectural map: [`docs/adr/0009-vision-alignment-and-extensibility.md`](docs/adr/0009-vision-alignment-and-extensibility.md)
- Contractual lock: [`docs/contract/assumptions/A13-vision-alignment.md`](docs/contract/assumptions/A13-vision-alignment.md)

Phase 1 scope is unchanged; the destination is just explicit on paper.

## Project layout

```
sigma-pmo/
├── backend/                     NestJS API (Node 22+, TypeScript)
│   ├── src/
│   │   ├── common/              shared helpers + base entities + enums
│   │   ├── config/              env-driven typed configuration
│   │   ├── database/            TypeORM/MySQL wiring
│   │   ├── health/              /api/v1/health probe
│   │   └── modules/
│   │       ├── auth/            RBAC (Role enum + ApiKeyGuard) — Layer 3
│   │       ├── canonical/       Project / Activity / Resource / Report / …
│   │       ├── governance/      evidence chain, confidence, policy, decisions
│   │       ├── ingestion/       parsers (P6 XER/XML, Excel, CSV) + normalizer
│   │       ├── integrations/    P6 webhook (Layer 3 stub)
│   │       ├── notifications/   Slack/Teams/Email outbound (Layer 3 stub)
│   │       ├── rules/           Rule engine v1 + 6 built-in rules
│   │       ├── summary/         deterministic + LLM-optional executive summary
│   │       └── validation/      pre-normalize validation report
│   ├── scripts/                 sample data generator, ingest CLI, user CLI
│   └── data-source.ts           TypeORM data source for migrations
├── frontend/                    Next.js 16 internal console (Layer 1 UI)
├── docs/
│   ├── adr/                     architecture decision records (0001–0008)
│   ├── deployment.md            deployment + ops runbook
│   ├── reference/               contract, chat exports, screening pack
│   └── reviews/
│       └── cycle-1-architecture-notes.md
└── data/
    ├── samples/                 generated sample inputs
    └── storage/                 immutable source-file archive (gitignored)
```

## Quick start

Prereqs: Node 22+, MySQL 8 / MariaDB 10.6+.

```bash
# Backend
cd backend
cp .env.example .env            # set DB_* values
npm ci
npm run build
npm run gen:samples             # produce data/samples/*.{xer,xml,xlsx,csv}
npm run start                   # API on http://localhost:3001/api/v1

# Frontend (separate terminal)
cd frontend
npm ci
npm run dev                     # UI on http://localhost:3000
```

End-to-end smoke test:

```bash
cd backend
npm run ingest -- ../data/samples/schedule.xlsx
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"projectKey":"P-1000"}' \
  http://localhost:3001/api/v1/rules/evaluate
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"projectKey":"P-1000","periodDays":7}' \
  http://localhost:3001/api/v1/summary/generate
```

## What runs where

| Path                                          | What                              | Cycle |
| --------------------------------------------- | --------------------------------- | ----- |
| `POST /api/v1/ingestion/ingest-path`          | ingest a server-readable file     | 1     |
| `GET  /api/v1/ingestion/runs`                 | ingestion audit trail             | 1     |
| `POST /api/v1/rules/evaluate`                 | run rule engine on a project      | 2     |
| `GET  /api/v1/rules/alerts`                   | list alerts                       | 2     |
| `GET  /api/v1/governance/alerts/:id/evidence` | full evidence chain for an alert  | 3     |
| `GET  /api/v1/governance/confidence?runId=…`  | data confidence for one run       | 3     |
| `GET  /api/v1/governance/policy`              | resolve current governance policy | 5     |
| `POST /api/v1/governance/policy`              | upsert governance policy (admin)  | 5     |
| `POST /api/v1/governance/decide`              | produce decisions for evaluation  | 5     |
| `POST /api/v1/summary/generate`               | weekly executive summary          | 4     |
| `GET  /api/v1/summary`                        | list summaries                    | 4     |
| `POST /api/v1/integrations/p6/webhook`        | inbound P6 push                   | 8     |

## Layer ↔ Cycle map

| Layer                                  | Cycles | What it adds                                                              |
| -------------------------------------- | ------ | ------------------------------------------------------------------------- |
| **1 — Technical Governance Engine**    | 1–4    | canonical schema · ingestion · rule engine · evidence + confidence · UI    |
| **2 — Sigma Governance Intelligence**  | 5–6    | versioned governance policy · FIDIC/PMI mapping · escalation · decisions   |
| **3 — Commercial Platform**            | 7–8    | RBAC · versioned `/api/v1` · notifications + P6 webhook · migrations · runbook |

## Architecture decisions

| ADR  | Topic                                                                  |
| ---- | ---------------------------------------------------------------------- |
| 0001 | ADR process (reason / risk / replacement path)                         |
| 0002 | Unified TypeScript stack (NestJS · Next.js · MySQL on Hostinger)       |
| 0003 | Canonical model + append-only traceability + deterministic-first       |
| 0004 | Rule Engine v1                                                         |
| 0005 | Evidence chain + data confidence scoring                               |
| 0006 | Executive summary (deterministic + LLM-optional) + minimal UI          |
| 0007 | Layer 2 governance policy + decision engine                            |
| 0008 | Layer 3 commercial platform (RBAC + versioned API + integrations)      |

## Cycle gate

Each cycle closes through the agreed flow: short Zoom review → Khaled walks
through what was built and the logic behind it → Al Ayham reviews from
product/governance, Syed reviews from architecture/AI boundary → Syed's
written architecture sign-off triggers cycle close and next-cycle release.
Architecture notes for each cycle live under [`docs/reviews/`](docs/reviews/)
and are shared 24 hours before the Zoom.
