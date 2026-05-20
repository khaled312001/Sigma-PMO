# Sigma PMO

A governance-first PM Office operating system. It ingests project schedule and
report data, builds a traceable canonical system of record, compares planned vs
actual, detects deviations, and produces evidence-linked alerts and executive
summaries — an internal decision-support system, not a dashboard.

Delivery is in 8 × 14-day cycles across three layers. **This repository is at
Layer 1 / Cycle 1 — Data Foundation.**

## Stack

Unified TypeScript (see [ADR-0002](docs/adr/0002-unified-typescript-stack.md)):

| Concern  | Choice                         |
| -------- | ------------------------------ |
| Backend  | Node.js · NestJS               |
| Frontend | Next.js (React)                |
| Database | MySQL (TypeORM)                |
| Hosting  | Hostinger-compatible           |
| AI       | LLM for narrative summaries only — never decision logic (deterministic-first) |

## Repository layout

```
backend/      NestJS API + ingestion/validation/normalisation engine
  src/
    common/         shared helpers (coerce), base entities, enums
    config/         env-driven configuration
    database/       TypeORM/MySQL wiring
    health/         health/readiness endpoint
    modules/
      canonical/    canonical schema (7 entities)
      ingestion/    parsers (P6 XER/XML, Excel, CSV), normalizer, storage, service
      validation/   format + structural validation
  scripts/    sample generation, no-DB verification, DB ingest CLI
frontend/     Next.js app (minimal internal UI; expands in later cycles)
docs/
  adr/        Architecture Decision Records (governance gate for Syed's review)
  reference/  contract package, scope docs, chat history
data/
  samples/    generated synthetic sample files
  storage/    immutable archive of ingested source files (git-ignored)
```

## Cycle 1 scope (Data Foundation)

- **Ingestion pipelines:** Primavera P6 (`.xer`, PMXML `.xml`), Excel (`.xlsx`), CSV.
- **Canonical schema:** Project → Activity, Resource, Report, ResourceAssignment,
  plus SourceFile / IngestionRun provenance.
- **Version-controlled storage:** append-only, no overwrite, full traceability
  (see [ADR-0003](docs/adr/0003-canonical-model-and-traceability.md)).
- **Initial validation layer:** deterministic format + structural checks.

**Acceptance:** ingest a sample P6 + Excel and verify the normalised state.

## Getting started

```bash
cd backend
npm install
cp .env.example .env          # set MySQL credentials

npm run gen:samples           # write synthetic samples to data/samples/
npm run verify:samples        # parse + validate samples (NO database needed)

# With a MySQL database configured:
npm run start:dev             # API at http://localhost:3001/api  (GET /api/health)
npm run ingest -- ../data/samples/p6_schedule.xml   # ingest into the DB
```

`verify:samples` proves the ingestion + validation pipeline end-to-end without a
database. The persisted write (`ingest`, and `POST /api/ingestion/ingest-path`)
runs once MySQL is connected (local or Hostinger).

## Architecture governance

Every major architecture decision is recorded in [`docs/adr/`](docs/adr/) with its
reason, risk, and replacement path, and is available for architecture review
before adoption — no hidden dependencies, no lock-in.
