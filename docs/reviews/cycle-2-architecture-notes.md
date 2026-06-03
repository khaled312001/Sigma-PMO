# Cycle 2 — Architecture Notes for Review

> Shared 24 hours before the cycle review Zoom, per the agreed flow.
> Author: Khaled Ahmed. Cycle 2 scope: **Rule Engine v1** (Layer 1).
> Acceptance criterion (Annex 1): *a deviation is detected with full
> traceback to source rows.*

## 1. Scope delivered

| Area                          | Delivered                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| Rule classes                  | 6 deterministic rules (`SCHEDULE_FINISH_SLIPPED`, `SCHEDULE_BEHIND_PLAN`, `DURATION_OVERRUN`, `COST_OVERRUN`, `RESOURCE_UNDERUSE`, `STALE_REPORTING`) |
| Snapshot loader               | `SnapshotService.load(projectId)` resolves all current children across project versions via `businessKey` (Cycle 2 bug-fix from initial projectId-scoped read) |
| Alert persistence             | `Alert` entity pinned to row + ingestion run + source file        |
| Run boundary                  | `RuleEvaluation` rows: one per `evaluateProject` / `evaluateAll`   |
| API surface                   | `POST /api/v1/rules/evaluate`, `GET /api/v1/rules/alerts`, `GET /api/v1/rules/evaluations`, `GET /api/v1/rules` |
| Acceptance                    | Proven against the synthetic Nile Tower P-1000 sample on 2026-05-27 — 7 alerts (3 critical, 4 warning); each alert's `activityId / ingestionRunId / sourceFileId` resolves to its source bytes |

## 2. Architecture in one picture

```
GET projects + isCurrent=true                                  ┌────────────────┐
        │                                                       │ Rule[]         │
        ▼                                                       │ (6 classes)    │
SnapshotService.load(projectId)                                 └──────┬─────────┘
   ├─ project versions (by businessKey)                                │
   ├─ activities WHERE projectId IN (versions) AND isCurrent           │
   ├─ resources, reports same scoping                                  │
   └─ assignments WHERE activityId IN (activities) AND isCurrent       │
        │                                                               │
        ▼                                                               │
RuleEngineService.runFor([snapshot])                                    │
        │  ── for each rule.evaluate(snapshot, config) ─────────────────┘
        │
        ▼
AlertDraft[]   (per-row source provenance baked in)
        │
        ▼
INSERT alert rows (transactional)        ──►    UPDATE rule_evaluation status
```

## 3. Key entities + services

- `backend/src/modules/canonical/entities/alert.entity.ts` — `code`, `severity`, `summary`, `context (JSON)`, FK columns: `projectId`, `activityId?`, `resourceId?`, `assignmentId?`, `reportId?`, `ingestionRunId`, `sourceFileId`, `ruleEvaluationId`.
- `backend/src/modules/canonical/entities/rule-evaluation.entity.ts` — orchestration audit row.
- `backend/src/modules/rules/types.ts` — `ProjectSnapshot`, `AlertDraft`, `Rule`, `RuleConfig`, `DEFAULT_RULE_CONFIG`.
- `backend/src/modules/rules/snapshot.service.ts` — businessKey-scoped current-state loader.
- `backend/src/modules/rules/rule-engine.service.ts` — pure orchestration; per-rule execution; alert persistence.

## 4. Deterministic vs AI boundary

**No LLM use in Cycle 2.** Every rule is a pure function over the snapshot; thresholds come from `DEFAULT_RULE_CONFIG`; AlertDraft outputs are deterministic given the same snapshot. The rule engine is therefore reproducible end-to-end.

## 5. Evidence chain (Cycle 3 prerequisite)

Every Alert carries:
- `activityId` (or alternate FK) → exact canonical row.
- `ingestionRunId` → the run that produced that row.
- `sourceFileId` → the SHA-256 archived source file.
- `context` JSON → the numeric values compared (planned, actual, ratio, threshold).

This is the prerequisite for Cycle 3's evidence chain endpoint.

## 6. Modular separation

- `modules/rules/` consumes only `modules/canonical/`. No dependency on `modules/ingestion/`.
- Rule classes live under `modules/rules/rules/`. Each is `@Injectable()` and registered as a provider — adding a new rule code is one file + one provider entry.

## 7. ADRs raised

- **ADR-0004** — Rule Engine v1 (rules as pure functions, config-driven thresholds, severity escalation logic).

## 8. Acceptance evidence

Sample evaluation result on synthetic Nile Tower P-1000 (2026-05-27):

```
{"evaluationId":"...", "alertCount":7,
 "byCode":{"SCHEDULE_FINISH_SLIPPED":2, "DURATION_OVERRUN":2, "RESOURCE_UNDERUSE":2, "COST_OVERRUN":1},
 "bySeverity":{"critical":3, "warning":4}}
```

Sample alert (RESOURCE_UNDERUSE on Basement RC):
```
{"context":{"plannedUnits":4100,"actualUnits":900,"ratio":0.219,"threshold":0.7},
 "activityId":"…","ingestionRunId":"…","sourceFileId":"…"}
```

End-to-end traceback verified: activity row → ingest run → archived bytes by SHA-256.

## 9. Deferred / known items

- **SCHEDULE_BEHIND_PLAN** requires `plannedPctComplete`, which the XER parser does not surface (XER carries `phys_complete_pct` only); rule silently skips activities lacking the field. Workaround: re-ingest from Excel before evaluating.
- **Assignment business-key harmonisation** across XML vs XER/Excel — XML uses `activityKey::resourceKey`; XER/Excel use `taskrsrc_id`. To be normalised in a later cycle if cross-source assignment matching becomes needed.

## 10. What this enables

- **Cycle 3** maps each Alert to a full evidence package (rationale + source + raw payload + confidence).
- **Cycle 4** consumes alert counts in the executive summary's structured metrics.
- **Cycle 5** attaches a `GovernanceDecision` (FIDIC + escalation + interventions) to each Alert.
- **Cycle 6** layers Sigma proprietary rules onto the same pipeline through new rule classes + policy entries.
