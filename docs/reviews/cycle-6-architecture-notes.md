# Cycle 6 — Architecture Notes for Review

> Cycle 6 scope: **Sigma proprietary logic capture + DecisionReview audit** (Layer 2 closes).
> Acceptance criterion: *full intelligence layer running over the engine, with explainable outputs.*

## 1. Scope delivered

| Area                          | Delivered                                                       |
| ----------------------------- | --------------------------------------------------------------- |
| Sigma IP capture workflow     | Al Ayham enters logic through `/admin/policy`; content stays in DB |
| DecisionReview entity         | Append-only audit of stakeholder actions (`approve`/`reject`/`acknowledge`) per decision |
| API surface                   | `POST /governance/decisions/:id/review`, `GET /governance/{decisions,alerts}/:id/reviews` |
| Explainability                | Every decision: `policyVersion + rationale + FIDIC + PMI + escalation + interventions` reproducible from `(alert, policy)` |

## 2. Architecture in one picture

```
Sigma operates production
        │
        ▼
/admin/policy  ── POST /api/v1/governance/policy {projectKey, config}
        │
        ▼
governance_policy table (version bump + isCurrent flip; prior rows preserved)
        │
        ▼
GovernanceDecisionService consumes the CURRENT policy on evaluate
        │
        ▼
GovernanceDecision rows pin {policyId, policyVersion}
        │
        ▼ (stakeholder action via /admin or /approval UI)
POST /governance/decisions/:id/review {action, comment}
        │
        ▼
decision_review row (append-only; latest action = current state)
```

## 3. IP segregation (operational view)

```
Source code (Git, public to Service Provider):
  - Generic rule classes
  - Generic FIDIC + PMI mappings (default-policy.ts)
  - The GovernancePolicyConfig interface (shape only)

Database (Sigma-owned):
  - governance_policy rows authored by Sigma
  - Sigma proprietary clauses, weights, intervention catalogues
```

The Service Provider has no access to the production `governance_policy` table once Sigma operates the platform. Even if Source-code is leaked, Sigma's IP is not in it.

## 4. DecisionReview model

`DecisionReview`: `(decisionId, alertId, action, performedByUserId, performedByDisplay, comment, createdAt)`.

- Append-only: every action is a new row.
- "Current state" of a decision = newest review's action.
- Audit query: `SELECT … WHERE decisionId = ? ORDER BY createdAt DESC`.

## 5. Deterministic vs AI boundary

**No LLM in Cycle 6.** Sigma's proprietary content is data; the engine remains the pure mapping from Cycle 5. Sigma logic is not opaque ML — Sigma authors a clause map, the engine applies it.

## 6. Modular separation

- `decision-review.service.ts` is the only new service in this cycle.
- `governance.controller.ts` extended with three new endpoints.
- No changes to rules, ingestion, validation, or summary modules.

## 7. ADRs raised

- ADR-0007 extends with the Sigma-IP segregation workflow; no new ADR file needed (covered in `A10-sigma-proprietary-logic.md`).

## 8. Acceptance evidence

Sample action trail for one decision (`uuid-d`):

```
POST /governance/decisions/uuid-d/review {action: "approve",  comment: "Plan attached"}
POST /governance/decisions/uuid-d/review {action: "acknowledge"}

GET /governance/decisions/uuid-d/reviews
[
  {action: "acknowledge", performedByDisplay: "Site Engineer", createdAt: ...},
  {action: "approve",     performedByDisplay: "Project Manager", createdAt: ...}
]
```

Latest action ("acknowledge") is the current decision state.

## 9. Deferred / known items

- Policy diff view between two versions (`v1 vs v3`) is convenient but not delivered — deferred to a Layer-3.x iteration if Sigma needs it.
- Multi-project policy inheritance (e.g., region-level defaults) deferred — current model: project-scoped row overrides global default row.

## 10. What this enables

- Layer 2 is contractually complete. Layer 3 (Cycle 7) adds RBAC + versioned API + ops infrastructure on top — no Layer-2 schema change required.
- Sigma can iterate proprietary content live, in production, with every change versioned.
- The Service Provider can demonstrate explainability without ever reading Sigma's content.
