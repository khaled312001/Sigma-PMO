# ADR-0003 — Canonical data model, append-only traceability, deterministic-first engine

- **Status:** Accepted
- **Date:** 2026-05-20
- **Layer / Cycle:** Layer 1 / Cycle 1 (Data Foundation) — load-bearing for all later cycles
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (governance), Syed Moinuddin (architecture)

## Context

The platform's contractual promise is "a governance-first internal system —
not a dashboard," with traceable alerts, decision traceability, and an
accountability chain. Cycle 1 must deliver a canonical schema and ingestion
pipeline that the later layers (rule engine, governance intelligence, RBAC
platform) can build on without rework. Three properties dominate the design:

1. **Provenance** — every value must trace to its source file and the run that
   produced it ("why is this value here?").
2. **No silent overwrite** — re-ingestion must never destroy prior data; history
   is part of the audit surface.
3. **Deterministic-first** — the engine's behaviour for a given input must be
   reproducible; the LLM is reserved for narrative summarisation only.

## Decision

### 1. Canonical schema

Seven entities form the core: `SourceFile`, `IngestionRun`, `Project`,
`Activity`, `Resource`, `Report`, `ResourceAssignment`. Project → Activity →
ResourceAssignment forms the schedule hierarchy; Resource and Report attach at
the project level. Schedule dates are stored as `YYYY-MM-DD` strings to avoid
timezone drift; money values use `DECIMAL(18,2)`; progress values are fractions
in `[0,1]`. The schema is portable to PostgreSQL without entity changes.

### 2. Append-only traceability

Every canonical entity carries five mandatory columns (the
`TraceableEntity` mixin):
`ingestionRunId`, `sourceFileId`, `businessKey`, `version`, `isCurrent`,
plus a `rawSource` JSON snapshot of the originating row.

Re-ingestion algorithm: for each `(entityType, businessKey)`, find the existing
row with `isCurrent = true`. If present, set it to `false` and insert a new row
with `version + 1`. If absent, insert at `version = 1`. **Nothing is ever
overwritten.** The full version history of any entity is queryable with one
predicate.

Verified at acceptance: P-1000 has 6 versions across 6 runs, exactly one of
which is `isCurrent`.

### 3. Source-file immutability

Every ingested file is content-addressed by SHA-256 and archived once under
`data/storage/<aa>/<bb>/<sha>__<name>`. The write uses `flag: 'wx'` so the
archive is genuinely immutable. The SourceFile row points at this archived
copy, so the bytes behind any ingestion run are always retrievable.

### 4. Modular parser contract

A single uniform `RawDataset` shape (see `parser.interface.ts`) is emitted by
every parser (CSV, Excel, P6 XER, P6 XML). Source-specific knowledge —
Primavera field names, Excel sheet routing, XER table layout — is isolated
inside parsers. The normalizer consumes only canonical-raw keys, so adding a
new source format means writing one parser, with zero changes to the rest of
the pipeline.

### 5. Deterministic ingest pipeline

`ingest -> validate -> normalize` is fully deterministic: the same input bytes
yield the same canonical rows. Coercion helpers (`asDate`, `asNumber`,
`asFraction`) accept only unambiguous formats — no locale guessing. The LLM
boundary is not crossed at any point in this layer; LLM use is reserved for
narrative summarisation in Cycle 4.

### 6. Run-scoped foreign keys

Within a single ingestion run, FKs (e.g. `Activity.projectId`) resolve to
records produced by that same run. This guarantees each run yields a coherent,
self-consistent snapshot. Cross-run history is queried via `businessKey` +
`isCurrent`.

## Reason

These choices give Cycle 2 (rule engine) a clean substrate: it consumes the
current snapshot for variance/deviation analytics, while keeping the full
history available for evidence and confidence scoring (Cycle 3). They give
Cycle 3 the source-of-truth link every alert must point to. They give Layer 2
a deterministic baseline the proprietary governance logic can plug into
without ambiguity. They give Layer 3 a versioned datastore that supports audit
queries an enterprise client requires.

## Risk & mitigation

- **Storage growth from versioning** — multiple ingestions multiply rows.
  Mitigation: indexes on `(businessKey, isCurrent)` keep current-view queries
  cheap; a future retention policy (an ADR before Cycle 7) can compress or
  archive old versions.
- **MySQL `json` and `decimal` strings** — driver returns these as strings;
  consumers must coerce. Mitigation: shared coercion helpers in `common/coerce.ts`.
- **Assignment business keys differ between sources** (XML uses
  `activityKey::resourceKey`; XER/Excel use `taskrsrc_id`). Mitigation:
  documented; harmonisation handled in Cycle 2 once cross-source assignment
  matching is needed.

## Replacement path

- **Schema change** — migrations (introduced in production prep, Cycle 7)
  evolve any column or relation without losing history.
- **New source format** — implement `SourceParser`, register it in
  `ParserRegistry`. No changes elsewhere.
- **Different DB** — TypeORM repositories isolate persistence; entities use
  portable column types; switching to PostgreSQL would change only the
  TypeORM dialect + connection settings.

## Consequences

- Cycle 1 acceptance is met: ingest sample P6 + Excel → normalised state
  proven against MariaDB (XAMPP) on 2026-05-27.
- Subsequent cycles inherit a stable, versioned, source-traceable substrate.
- "Why is this value here?" is answerable for every cell in the canonical
  model: a row links to its IngestionRun, the run links to its SourceFile,
  the file holds its immutable byte-for-byte archive, and the row's
  `rawSource` shows the exact parsed payload.
