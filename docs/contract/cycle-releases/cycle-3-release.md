# Cycle Release — Cycle 3 (Layer 1, Governance Layer)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1
- **Cycle:** 3 of 8 · Layer 1 · Days 29–42 · USD 400

## 1. Scope delivered

Governance layer: evidence linking, decision traceability, basic data confidence scoring (completeness, consistency, source reliability), flagging of suspicious reporting patterns.

## 2. Deliverables manifest

### Commits
- `86e2138` — Cycle 3: evidence chain endpoint + ConfidenceScore (completeness/consistency/source) + rationale.

### Files
- `backend/src/modules/canonical/entities/confidence-score.entity.ts`.
- `backend/src/modules/governance/{confidence.service,evidence.service,governance.controller,governance.module}.ts`.
- `backend/src/modules/ingestion/ingestion.service.ts` (modified) — wires confidence scoring into the transactional pipeline so it commits atomically with normalisation.

### API endpoints
- `GET /api/v1/governance/alerts/:id/evidence` — full evidence package (rationale + project + activity + source file + confidence + rawSource snippets).
- `GET /api/v1/governance/confidence?runId=…` — confidence score per IngestionRun.

### Documentation
- `docs/adr/0005-evidence-and-confidence.md`
- `docs/reviews/cycle-3-architecture-notes.md`

## 3. Acceptance evidence

Acceptance criterion: *End-to-end evidence trail proven on real sample data.*

Single `GET /api/v1/governance/alerts/:id/evidence` call returns:

```json
{
  "alert":             {...code, severity, summary, context},
  "rationale":         "Resource usage (900/4100 = 22.0%) is below threshold 70.0% on an in-progress activity.",
  "project":           {... + rawSource snapshot},
  "activity":          {... + rawSource snapshot},
  "sourceFile":        {"filename": "schedule.xlsx", "contentSha256": "961ddc4d...", "storedPath": "..."},
  "confidence":        {"overall": 0.97, "completeness": 1.0, "consistency": 1.0, "sourceReliability": 0.85},
  "rawSourceSnippets": { project: {...}, activity: {...}, ... }
}
```

Confidence formula reproducible from the stored `breakdown` JSON alone: `overall = 0.4·completeness + 0.4·consistency + 0.2·sourceReliability`. Verified on Excel ingest 2026-05-27: completeness 1.0, consistency 1.0, sourceReliability 0.85 (Excel weight), overall 0.97.

## 4. ADRs included

ADR-0005 (Evidence chain + data confidence scoring).

## 5. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
