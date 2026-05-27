# Cycle 1 — Architecture Notes for Review

> Shared 24 hours before the cycle review Zoom, per the agreed flow.
> Audience: **Al Ayham** (product / governance / business-logic) and
> **Syed Moinuddin** (architecture / logic / AI boundary).
> Author: Khaled Ahmed (Service Provider).
> Cycle 1 scope: Data Foundation — Layer 1.
> Acceptance criterion (Annex 1): *"ingest sample P6 + Excel and verify
> normalised state."*

---

## 1. Scope delivered

| Area                       | Delivered                                                                       |
| -------------------------- | ------------------------------------------------------------------------------- |
| Ingestion pipelines        | Primavera P6 **XER** + **PMXML**, Excel (.xlsx), CSV                            |
| Canonical schema           | 7 entities (see §3), portable across MySQL / PostgreSQL                         |
| Version-controlled storage | Append-only versioning (no overwrite) + SHA-256 archived source files          |
| Initial validation         | Format + structural checks; severity-classified report blocks normalisation     |
| Orchestration              | NestJS modules; transactional canonical writes; persistent audit run records    |
| Acceptance                 | Proven against XER + XML + Excel samples on local MariaDB (XAMPP), 2026-05-27   |

## 2. Architecture in one picture

```
File (XER | XML | Excel | CSV)
        │
        ▼
StorageService ── SHA-256 archive ──► immutable byte copy on disk
        │
        ▼
ParserRegistry ──► SourceParser ──► RawDataset (canonical-raw, parser-agnostic)
        │
        ▼
ValidationService ── ValidationReport (errors block; warnings recorded)
        │   (passed?)
        ▼
NormalizerService (DB transaction)
   ├─ for each entity row: find isCurrent prior → retire (isCurrent=false)
   ├─ insert new row: version=prior.version+1, ingestionRunId, sourceFileId,
   │                 businessKey, rawSource, canonical fields
   └─ resolve intra-run FKs (project → activity → assignment)
        │
        ▼
IngestionRun finalised (status, rowCounts, summary)
```

## 3. Canonical schema

`SourceFile`, `IngestionRun`, `Project`, `Activity`, `Resource`,
`Report`, `ResourceAssignment`. Every entity except SourceFile/IngestionRun
extends `TraceableEntity`, which contributes six columns:

| Column            | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `ingestionRunId`  | which run produced this row                                            |
| `sourceFileId`    | which file the row came from                                           |
| `businessKey`     | natural identifier from the source (project id, activity code, …)      |
| `version`         | monotonic per businessKey                                              |
| `isCurrent`       | exactly one true row per businessKey at any time                       |
| `rawSource` JSON  | original parsed payload, preserved verbatim                            |

Schedule dates use `DATE` stored as `YYYY-MM-DD`; monetary values use
`DECIMAL(18,2)`; progress is a fraction in `[0,1]`.

## 4. Deterministic vs AI boundary

**No LLM use in Cycle 1.** The full pipeline is deterministic: for given input
bytes, the parser, validator, and normalizer always produce the same canonical
state. Coercion helpers (`asDate`, `asNumber`, `asFraction`) accept only
unambiguous formats — no locale guessing. This is the engine substrate every
later cycle plugs into; AI use is reserved for narrative summarisation in
Cycle 4, and any extension of this boundary will be raised as an ADR before
implementation.

## 5. Evidence chain — how "why is this value here?" is answered

For any canonical row, in three SQL hops:

```
row.ingestionRunId  → ingestion_run.id  (when, parser, status, validation report)
row.sourceFileId    → source_file.id    (filename, sha256, byte-immutable archive path)
row.rawSource       → original parsed payload preserved verbatim
```

The full version chain for the same business entity is one query:

```sql
SELECT version, isCurrent, ingestionRunId, ...
FROM activity WHERE businessKey = ? ORDER BY version;
```

## 6. Modular separation (for review)

- `common/`              — pure helpers (`coerce`), enums, shared base entities.
- `config/`, `database/` — environment configuration + TypeORM wiring.
- `modules/canonical/`   — entity definitions only; no behaviour.
- `modules/ingestion/`   — parsers, storage, normalizer, orchestration service, controller.
- `modules/validation/`  — pure functions over `RawDataset`.
- `health/`              — DB round-trip probe.

Source-specific knowledge lives only inside parsers. The normalizer never
imports parser-specific code. Adding a new format = one new file under
`parsers/` + one registry entry.

## 7. ADRs raised this cycle

- **ADR-0001** — Record architecture decisions (process).
- **ADR-0002** — Unified TypeScript stack: NestJS · Next.js · MySQL on Hostinger
  (supersedes the chat-stage Python/FastAPI proposal; reason: native Hostinger
  deployment; replacement path documented).
- **ADR-0003** — Canonical model + append-only traceability + deterministic-first.

## 8. Acceptance evidence (run on 2026-05-27)

```
INGEST p6_schedule.xml  → run [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:0}
INGEST schedule.xlsx    → run [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:3}
INGEST p6_schedule.xer  → run [normalized] counts={project:1, activity:8, resource:4, assignment:6, report:0}

DB state after re-ingestion of the same business keys:
  project   : 1 current / 6 versions
  activity  : 8 current / 48 versions
  resource  : 4 current / 24 versions
  All runs validationPassed = 1.
```

The append-only versioning behaviour is verified end-to-end: re-ingesting the
same business entities never overwrites prior data; the current view is
always exactly one row per `businessKey`.

## 9. Known items, intentionally deferred

- **Assignment business-key harmonisation across sources.** XML emits
  `activityKey::resourceKey`; XER/Excel emit `taskrsrc_id`. Both are faithful
  to their source but don't collide. To be unified in Cycle 2 when
  cross-source matching becomes meaningful.
- **Migrations.** Dev uses `synchronize=true`. Production cutover to
  TypeORM migrations is scheduled with Cycle 7 (deployment readiness).
- **Real client data sample.** Pipeline proven on synthetic data; one real
  P6/Excel from Sigma will be run before Cycle 2 begins.
- **CSV multi-file ingest.** A single CSV per entity ingests cleanly with
  parent-resolution deferred (warnings, not errors). Combined CSV-set ingest
  is a small enhancement, not required for Cycle 1 acceptance.

## 10. What this enables for Cycles 2 → 4 (Layer 1)

- **Cycle 2 (Rule Engine v1):** consumes `isCurrent` snapshot →
  planned-vs-actual variance, deviation calculations, threshold alerts. Each
  alert carries `ingestionRunId` + `sourceFileId` for upstream traceability.
- **Cycle 3 (Governance / Evidence):** every alert links back through the
  evidence chain already in place; data confidence scoring reads
  completeness / consistency / source reliability directly from the schema.
- **Cycle 4 (Output Layer):** the LLM summariser receives only canonical,
  grounded data — no free-form web context, no hidden state.

---

*Requested review focus per the agreed flow:*

> *architecture integrity · logic discipline · deterministic vs AI boundaries
> · evidence-chain behavior · escalation flow · release readiness.*
