# Cycle Release — Cycle 1 (Layer 1, Data Foundation)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed (Service Provider) on hand-over of Cycle 1
- **Contract clause:** 10.2 (Cycle Release Control) + 10.1 (precedes Acceptance)
- **Cycle:** 1 of 8 · Layer 1 · Days 1–14 · USD 700

## 1. Scope delivered (against Annex 1)

Data foundation: ingestion pipelines (P6, Excel, CSV), canonical schema (projects, activities, reports, resources), version-controlled storage, initial validation layer.

## 2. Deliverables manifest

### Source code (commits on `main`)
- `547d1c2` — Cycle 1 (Data Foundation): canonical schema + ingestion pipeline scaffold.
- `837db3c` — Cycle 1: ADR-0003 + architecture notes + jest tests; DB acceptance proven.

### Files
- `backend/src/common/{coerce,dates,enums}.ts` + `entities/base.entity.ts` (UuidEntity + TraceableEntity mixins).
- `backend/src/modules/canonical/entities/` — 7 canonical entities (SourceFile, IngestionRun, Project, Activity, Resource, Report, ResourceAssignment).
- `backend/src/modules/ingestion/parsers/{csv,excel,p6-xer,p6-xml,parser.interface,parser.registry}.ts`.
- `backend/src/modules/ingestion/normalizer/normalizer.service.ts`.
- `backend/src/modules/ingestion/storage/storage.service.ts`.
- `backend/src/modules/validation/{validation.service,validation.types,validation.module}.ts`.
- `backend/src/modules/ingestion/{ingestion.service,ingestion.controller,ingestion.module}.ts`.
- `backend/scripts/{generate-samples,sample-data,verify-samples,ingest}.ts`.
- `backend/src/config/configuration.ts` + `backend/src/database/database.module.ts` + `backend/src/main.ts`.

### Documentation
- `docs/adr/0001-record-architecture-decisions.md`
- `docs/adr/0002-unified-typescript-stack.md`
- `docs/adr/0003-canonical-model-and-append-only-traceability.md`
- `docs/reviews/cycle-1-architecture-notes.md` (shared 24 h before Zoom per agreed flow)

### Tests
- 5 jest suites covering coerce, parsers, validation, rules, confidence (27 tests passing).

## 3. Acceptance evidence

Acceptance criterion (Annex 1): *Ingest sample P6 + Excel and verify normalised state.*

Evidence captured 2026-05-27 against MariaDB on `127.0.0.1:3306` / db `sigma_pmo`:

```
INGEST p6_schedule.xml  → run e801ec02 [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:0}
INGEST schedule.xlsx    → run 2db75eda [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:3}
INGEST p6_schedule.xer  → run 58e9dff6 [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:0}

DB state after re-ingestion:
  project   : 1 current / 6 versions
  activity  : 8 current / 48 versions
  resource  : 4 current / 24 versions
  All runs: validationPassed = 1.
```

Append-only versioning verified: project P-1000 has exactly one `isCurrent` row at any time across 6 ingest cycles.

## 4. ADRs included in this release

ADR-0001 (process), ADR-0002 (stack), ADR-0003 (canonical model + append-only traceability).

## 5. Release signature (Sub-Clause 10.2)

Cycle 1 is hereby released by the Service Provider. Countersignature by Sigma authorises this release for the contractual record.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
