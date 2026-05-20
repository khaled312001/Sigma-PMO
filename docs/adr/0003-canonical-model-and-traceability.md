# ADR-0003 — Canonical data model, append-only traceability, deterministic-first ingestion

- **Status:** Accepted
- **Date:** 2026-05-20
- **Layer / Cycle:** Layer 1 / Cycle 1 (Data Foundation)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance), Syed Moinuddin (architecture)

## Context

Cycle 1 must deliver a reliable system of record: ingestion pipelines (P6, Excel,
CSV), a canonical schema, version-controlled storage with full traceability, and
an initial validation layer. The governance brief requires that every output be
traceable to its source ("why is this value here?") and that the engine be
deterministic-first, with the LLM reserved for summarisation only.

## Decision

1. **Canonical schema** — seven entities: `SourceFile`, `IngestionRun`, `Project`,
   `Activity`, `Resource`, `Report`, `ResourceAssignment`. Schedule entities model
   the Project → Activity hierarchy with resources and assignments.

2. **Two-stage pipeline, modular by source.** Source-specific *parsers* translate
   each format (P6 XER, P6 PMXML, Excel, CSV) into one uniform *canonical-raw*
   shape; a single format-agnostic *normalizer* maps canonical-raw to persisted
   entities. New formats are added by writing a parser only.

3. **Append-only versioning (no overwrite).** Each canonical row is produced by
   exactly one `IngestionRun` and carries its `sourceFileId`, `businessKey`,
   `version`, `isCurrent` flag, and the verbatim `rawSource`. Re-ingesting a
   business entity inserts a new version and retires the previous one
   (`isCurrent=false`); history is never destroyed.

4. **Immutable source archive.** Every ingested file is content-addressed by
   SHA-256 and stored once, so the exact bytes behind any run are recoverable.

5. **Deterministic coercion.** All type/date/number coercion is pure and
   locale-free (`common/coerce.ts`): identical input always yields identical
   canonical output. No AI is involved in ingestion or normalisation.

6. **Validation gate.** A dataset is validated (format + structural integrity)
   before normalisation; error-severity issues block the write, warnings are
   recorded on the run.

## Reason

- Traceability and audit are first-class governance requirements, not add-ons.
- Append-only history enables rollback, dispute evidence, and "as-reported-then"
  reconstruction — essential for the later FIDIC/claims intelligence layer.
- The parser/normalizer split keeps source quirks isolated and the core stable.

## Risk & mitigation

- **Table growth from versioning.** Mitigation: `isCurrent` is indexed for fast
  "current state" queries; historical rows are partitionable later if needed.
- **MySQL JSON for `rawSource`.** Mitigation: payloads are small per row; used for
  evidence, not hot query paths.
- **Cross-file CSV references.** A single-table CSV cannot resolve its parents in
  isolation; validation downgrades these to warnings and resolution is deferred.

## Replacement path

- Schema changes flow through TypeORM migrations (production); entities are plain
  classes, portable to PostgreSQL with no application rewrite (see ADR-0002).
- The canonical-raw contract (`CANONICAL_RAW_KEYS`) decouples parsers from storage,
  so either side can evolve independently.

## Consequences

- Cycle 1 acceptance ("ingest sample P6 + Excel → normalised state") is met: the
  parse → validate stage is proven against generated samples via `verify:samples`;
  the persisted write runs via `ingest` once MySQL is connected.
- Cycle 2 (rule engine) reads a clean, versioned, evidence-linked system of record.
