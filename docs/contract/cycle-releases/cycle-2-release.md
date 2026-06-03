# Cycle Release — Cycle 2 (Layer 1, Rule Engine v1)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1
- **Cycle:** 2 of 8 · Layer 1 · Days 15–28 · USD 600

## 1. Scope delivered (against Annex 1)

Core rule engine v1: planned-vs-actual comparison, deviation calculations, resource-based signals, threshold-based alert generation.

## 2. Deliverables manifest

### Commits
- `80c7854` — Cycle 2: Rule Engine v1 — 6 rules, snapshot-by-businessKey, alerts with full source traceback.

### Files
- `backend/src/modules/canonical/entities/{alert,rule-evaluation}.entity.ts`.
- `backend/src/modules/rules/{types,snapshot.service,rule-engine.service,rules.controller,rules.module}.ts`.
- `backend/src/modules/rules/rules/{schedule-finish-slipped,schedule-behind-plan,duration-overrun,cost-overrun,resource-underuse,stale-reporting}.rule.ts` — 6 deterministic rule classes.
- `backend/src/modules/rules/dto/evaluate.dto.ts`.

### API endpoints
- `GET /api/v1/rules` — registered rules
- `POST /api/v1/rules/evaluate` — run engine on a project (by id or businessKey)
- `GET /api/v1/rules/alerts` — list alerts
- `GET /api/v1/rules/evaluations` — list evaluations

### Documentation
- `docs/adr/0004-rule-engine-v1.md`
- `docs/reviews/cycle-2-architecture-notes.md`

## 3. Acceptance evidence

Acceptance criterion: *A deviation is detected with full traceback to source rows.*

Example alert (`RESOURCE_UNDERUSE` on Bulk Excavation activity) carries:

```
projectId        : UUID of canonical Project row produced by ingest run X
activityId       : UUID of canonical Activity row
ingestionRunId   : UUID of the run that produced these rows
sourceFileId     : UUID of the SHA-256 archived source file
context          : {plannedUnits: 4100, actualUnits: 900, ratio: 0.219, threshold: 0.70}
```

End-to-end traceback: `alert.activityId → activity row → activity.ingestionRunId + activity.sourceFileId → run + file (with SHA-256) → archived bytes on disk`. Confirmed end-to-end on synthetic sample dataset.

7-alert evaluation result on sample portfolio P-1000:
- 2 × SCHEDULE_FINISH_SLIPPED (critical)
- 2 × DURATION_OVERRUN (1 critical + 1 warning)
- 2 × RESOURCE_UNDERUSE (warning)
- 1 × COST_OVERRUN (warning)

## 4. ADRs included

ADR-0004 (Rule Engine v1).

## 5. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
