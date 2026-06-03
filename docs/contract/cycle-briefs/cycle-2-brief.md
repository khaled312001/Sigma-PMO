# Cycle Brief — Cycle 2 (Layer 1, Rule Engine v1)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2
- **Cycle number:** 2 of 8
- **Layer:** 1 — Technical Governance Engine
- **Calendar window:** Days 15 – 28
- **Cycle fee:** USD 600  (30% kickoff USD 180 · 70% completion USD 420)

## 1. Scope (verbatim from Annex 1)

> *Core rule engine v1: planned-vs-actual comparison, deviation calculations, resource-based signals, threshold-based alert generation.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *A deviation is detected with full traceback to source rows.*

## 3. Inputs from Sigma

- Written Cycle 2 release (per Clause 10.2 — separate from Cycle 1 acceptance).
- USD 180 kickoff deposit.
- Confirmation that Cycle 1 acceptance has been signed (per Clause 10.1).

## 4. Deliverables

- `backend/src/modules/rules/` — `RuleEngineService`, `SnapshotService` (businessKey-scoped), six deterministic `Rule` classes:
  - `SCHEDULE_FINISH_SLIPPED`, `SCHEDULE_BEHIND_PLAN`, `DURATION_OVERRUN`, `COST_OVERRUN`, `RESOURCE_UNDERUSE`, `STALE_REPORTING`.
- `backend/src/modules/canonical/entities/{alert,rule-evaluation}.entity.ts` — alert with full source traceback (`projectId`, `activityId`, `ingestionRunId`, `sourceFileId`, `context`).
- `backend/src/modules/rules/rules.controller.ts` — `POST /api/v1/rules/evaluate`, `GET /api/v1/rules/alerts`.
- `docs/adr/0004-rule-engine-v1.md`.
- `docs/reviews/cycle-2-architecture-notes.md`.

## 5. Sequencing notes

- Rule thresholds configurable via `DEFAULT_RULE_CONFIG` constants (per-project overrides land in Cycle 5 with the policy).
- LLM is **not** used in Cycle 2; engine is purely deterministic.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
