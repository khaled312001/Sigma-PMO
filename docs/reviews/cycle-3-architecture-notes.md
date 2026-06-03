# Cycle 3 — Architecture Notes for Review

> Cycle 3 scope: **Governance Layer — evidence + confidence** (Layer 1).
> Acceptance criterion: *end-to-end evidence trail proven on real sample data.*

## 1. Scope delivered

| Area                       | Delivered                                                                  |
| -------------------------- | -------------------------------------------------------------------------- |
| Evidence chain endpoint    | `GET /api/v1/governance/alerts/:id/evidence` returns one full package      |
| Confidence scoring         | `ConfidenceScore` persisted per `IngestionRun`; transactional with normalise |
| Rationale                  | Deterministic plain-English derivation from `(rule code, context)`         |
| Raw source preservation    | `rawSourceSnippets` returns the original parsed payload per entity         |

## 2. Architecture in one picture

```
GET /api/v1/governance/alerts/:id/evidence
        │
        ▼
EvidenceService.forAlert(id)
        │
        ├─► alert row
        ├─► project, activity, resource, assignment, report  (whichever FKs are set)
        ├─► ingestionRun (when, parser, validation report)
        ├─► sourceFile (filename, SHA-256, immutable path)
        ├─► confidenceScore (overall, completeness, consistency, sourceReliability)
        └─► rawSourceSnippets { project, activity, resource, ... } (the JSON parsed from the source file)
```

Confidence pipeline:
```
ParserMeta + RawDataset + ValidationReport
        │
        ▼
ConfidenceService.compute() ─► { completeness, consistency, sourceReliability, overall, breakdown }
        │
        ▼ (within same DB transaction as Normalizer)
INSERT confidence_score row pinned to ingestion_run.id
```

## 3. Key entities + services

- `backend/src/modules/canonical/entities/confidence-score.entity.ts` — unique on `ingestionRunId`; persists every weight + breakdown.
- `backend/src/modules/governance/confidence.service.ts` — pure deterministic scoring (no LLM).
- `backend/src/modules/governance/evidence.service.ts` — assembles the package in a single round of parallel reads.

## 4. Deterministic vs AI boundary

**No LLM use in Cycle 3.** The rationale is a switch statement over `alert.code` formatting the persisted `context`; confidence is a fixed-weights formula (0.4 / 0.4 / 0.2). Both are bit-identical reproducible from the persisted record.

## 5. Decision traceability (single-call answer)

For any Alert id, one HTTP call answers:

| Question                              | Field in response                              |
| ------------------------------------- | ---------------------------------------------- |
| Which canonical row triggered this?   | `activity` / `resource` / `assignment` / `report` |
| Why this severity / threshold?        | `rationale` + `alert.context`                  |
| When was that data ingested?          | `ingestionRun.startedAt`                       |
| What file produced it?                | `sourceFile.filename` + `sourceFile.contentSha256` |
| How much should I trust it?           | `confidence.overall` + breakdown               |
| What did the source actually say?     | `rawSourceSnippets.<entity>`                   |

## 6. Modular separation

- `modules/governance/` owns the scoring + assembly logic; depends only on `modules/canonical/` and on the parser interface (for `RawDataset` shape).
- `IngestionService` (Cycle 1) wires `ConfidenceService.record(...)` inside the normalise transaction — confidence write rolls back with normalise on failure.

## 7. ADRs raised

- **ADR-0005** — Evidence chain + data confidence scoring (composite formula, source weights, IP-segregation note).

## 8. Acceptance evidence

Excel ingestion on 2026-05-27 → confidence overall 0.97 (completeness 1.0 · consistency 1.0 · source 0.85).

`GET /api/v1/governance/alerts/<id>/evidence` returns a single ~1.5 KB JSON containing every field above. Frontend renders it on `/evidence`.

## 9. Deferred / known items

- Pattern-based anomaly detection (statistical) remains a Re-scope Trigger per Annex 2 — Cycle 3 implements **rule-based** suspicious-pattern flagging only (via `STALE_REPORTING` + the future Layer-2 rule codes).
- Confidence weights are persisted per record in `breakdown`; if Sigma later tunes them via an ADR, historical scores stay interpretable.

## 10. What this enables

- **Cycle 4's** executive summary embeds the average confidence across the project's data and surfaces critical findings with their rationales.
- **Cycle 5+'s** `GovernanceDecision.rationale` field follows the same deterministic-derivation pattern.
- **Cycle 6** lets Sigma plug in proprietary rules whose alerts inherit this whole evidence machinery for free.
