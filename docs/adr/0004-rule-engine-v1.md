# ADR-0004 — Rule Engine v1 (Cycle 2)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Layer / Cycle:** Layer 1 / Cycle 2 (Core Rule Engine v1)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (governance), Syed Moinuddin (architecture)

## Context

Cycle 2 must deliver "planned-vs-actual comparison, deviation calculations,
resource-based signals, threshold-based alert generation," with the
contractual acceptance test: *"a deviation is detected with full traceback to
source rows."*

The engine has to be deterministic (no LLM in the decision path), testable in
isolation, and produce alerts that are linkable through the evidence chain
already established in Cycle 1 (ADR-0003).

## Decision

A rule-engine module (`modules/rules/`) with three clean layers:

1. **`SnapshotService`** — loads the *current* canonical snapshot for one
   project (only rows where `isCurrent = true`). No business logic.
2. **`Rule`** (pure interface) — `evaluate(snapshot, config): AlertDraft[]`.
   Rules are stateless `@Injectable()` classes with no DB access. Six rules
   ship in v1: `SCHEDULE_FINISH_SLIPPED`, `SCHEDULE_BEHIND_PLAN`,
   `DURATION_OVERRUN`, `COST_OVERRUN`, `RESOURCE_UNDERUSE`, `STALE_REPORTING`.
3. **`RuleEngineService`** — orchestrates: opens a `RuleEvaluation` row,
   iterates snapshots × rules, persists each `Alert` row-pinned to the
   triggering canonical row, finalises the evaluation summary.

## Alert traceability (acceptance evidence)

Each `Alert` carries:

- `projectId`, optional `activityId` / `resourceId` / `assignmentId` /
  `reportId` — the **specific row UUIDs** (version-pinned) that triggered it.
- `ingestionRunId`, `sourceFileId` — copied from the triggering row, so the
  evidence chain (run → file → archived bytes → `rawSource` JSON) is one join
  away from any alert.
- `ruleEvaluationId` — groups all alerts produced by a single evaluation.
- `context` JSON — the numeric values compared (planned, actual, ratio,
  threshold), so the reason for the alert is self-explanatory.

Result: for any alert, "why this alert?" answers in three SQL hops, ending at
the immutable source-file bytes that started it.

## Threshold configuration

A single `RuleConfig` object (defaults in `DEFAULT_RULE_CONFIG`) holds the
thresholds (`scheduleBehindThreshold`, `costOverrunThreshold`, etc.). The
`POST /api/rules/evaluate` endpoint accepts per-call overrides. Cycle 3 will
externalise these to a configurable governance policy entity.

## Reason

- **Pure rules** are trivially testable (no DB), match the deterministic-first
  boundary, and are extensible (add a class, register it in the module).
- **Row-pinned alerts** preserve the exact triggering data even after
  re-ingestion retires the row (the version row still exists, append-only).
- **Snapshot at the project level** keeps queries simple and matches how
  governance reviews actually happen (project-by-project).

## Risk & mitigation

- **Alert noise** if many evaluations stack up. Mitigation: each alert is
  grouped by `ruleEvaluationId`, so the UI/API can scope to the latest
  evaluation. A dedupe-by-signature pass is an explicit Cycle 4 enhancement.
- **Threshold tuning is project-specific.** Mitigation: defaults are
  documented and per-call overridable today; Cycle 3 moves them to a typed
  policy entity that Al Ayham/the client can edit via the admin surface in
  Layer 3.
- **Rules execute serially in-process.** Mitigation: sufficient for project
  sizes in the construction/EPC domain in scope; an async/queued mode is a
  Layer 3 enhancement (with an ADR) if scale requires it.

## Replacement path

- **Different rule set / proprietary Sigma rules (Layer 2):** plug new
  `Rule` implementations into `RulesModule` providers. No engine change.
- **Replace the engine entirely:** the `Alert` contract is independent of how
  it was produced; downstream code reads alerts via the repository.
- **External rule DSL** (e.g. JSON rules from Al Ayham's governance policy):
  becomes a single rule that interprets the DSL and emits `AlertDraft`s — the
  rest of the pipeline is unchanged.

## Consequences

- The Cycle 2 acceptance test is met: deviations are detected, each carrying
  full traceback (`activityId → activity row → ingestionRunId → sourceFileId
  → archived file + rawSource`).
- Cycle 3 gets a stable Alert contract to attach evidence-strength scoring
  and decision-traceability to.
- Layer 2 (FIDIC, PMI/PMBOK, Sigma proprietary logic) plugs into the same
  rule interface without touching the engine.
