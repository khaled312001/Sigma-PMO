# ADR-0005 — Evidence chain and data confidence scoring (Cycle 3)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Layer / Cycle:** Layer 1 / Cycle 3 (Governance / Evidence / Confidence)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham, Syed Moinuddin

## Context

Cycle 3 delivers what the contract calls the *trust layer enabling
accountability and auditability*: every alert links to its source data through
a verifiable evidence chain, and every ingested dataset has a quantified
**data confidence score** so consumers know how much weight to give an alert.

Cycles 1 and 2 already produced the building blocks (Alert pinned to row +
ingestionRun + sourceFile, plus immutable archive). Cycle 3 reifies them as a
**single queryable evidence package** and adds a confidence score per run.

## Decision

### 1. Evidence package (decision traceability)

`GET /api/governance/alerts/:id/evidence` returns one package containing:

| Field             | Source                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `alert`           | rule output (code, severity, summary, context)                         |
| `rationale`       | deterministic plain-English explanation derived from `code + context`  |
| `project`         | the current canonical Project row                                      |
| `activity`        | the version-pinned Activity row the alert references (if any)          |
| `resource`        | …Resource (if any)                                                     |
| `assignment`      | …ResourceAssignment (if any)                                           |
| `report`          | …Report (if any)                                                       |
| `ingestionRun`    | which run produced the triggering data                                 |
| `sourceFile`      | filename, SHA-256, immutable archive path                              |
| `confidence`      | the ConfidenceScore of that ingestion run (Cycle 3)                    |
| `rawSourceSnippets` | the original parsed payloads (`rawSource`) of every entity above     |

Result: one HTTP call answers the governance question *"why this alert, what
data is it based on, where did that data come from, and how much do we trust
it?"*

### 2. Confidence score (`confidence_score` table, 1:1 with `ingestion_run`)

Three sub-scores (each ∈ [0,1]) and a composite, all deterministic:

- **completeness** = populated required canonical-raw fields ÷ total required,
  across every row of every entity type in the dataset.
- **consistency** = `1 − (0.1·errors + 0.02·warnings)` from the
  ValidationReport; clamped to [0, 1].
- **sourceReliability** = fixed weight by source type (P6 XML 1.00, P6 XER
  0.95, Excel 0.85, CSV 0.70). System exports rank above manual entry.
- **overall** = `0.4·completeness + 0.4·consistency + 0.2·sourceReliability`.

The full `breakdown` (per-entity populated counts, validation tally, weights,
source type) is persisted alongside the score so it is reproducible from the
record alone (no recomputation required).

The pure `compute()` function takes (`RawDataset`, `ValidationReport`) →
score; the `record()` method persists per IngestionRun (idempotent, in the
same transaction as normalisation, so failure rolls back together).

## Reason

- **One endpoint per alert** is what reviewers (Al Ayham, Syed) actually need
  at the cycle gate — no multi-hop digging.
- **Deterministic confidence formula** keeps the trust layer auditable: the
  score is a stable function of the inputs, not a learned model.
- **Source weighting** captures the real-world truth that a Primavera-system
  export is more trustworthy than a hand-typed Excel sheet.

## Risk & mitigation

- **Required-fields list is judgement-based.** Mitigation: kept in one place
  (`REQUIRED_FIELDS`); easy to revise as governance policy evolves; changes
  raised as ADR addenda so the score history stays interpretable.
- **Score weights are opinions.** Mitigation: weights persisted in
  `breakdown` per record, so historical scores remain interpretable even if
  weights are tuned later (an ADR change accompanies any weight change).
- **rawSource snippets can grow large.** Mitigation: returned only on
  per-alert request, not in list endpoints; can be paginated/sized if needed
  in Layer 3.

## Replacement path

- **Different scoring model** (e.g. domain-specific weights for FIDIC,
  introduced in Layer 2): swap `compute()` implementation; score table
  unchanged. New scores produced going forward; historical scores remain valid.
- **External evidence-store** (e.g. document management system): replace
  `rawSourceSnippets` with a pointer; rest of the package unchanged.

## Consequences

- Cycle 3 acceptance is met: every alert has an end-to-end evidence trail
  proved on real sample data, with a quantified trust score on the underlying
  ingestion.
- Cycle 4 (Output) consumes the score in the executive summary (e.g.
  "schedule slip warning, supported by data of confidence 0.94").
- Layer 2 (FIDIC and Sigma proprietary logic) attaches its own decision
  traces using the same evidence model — no schema change needed.
