# Cycle 5 — Architecture Notes for Review

> Cycle 5 scope: **FIDIC + PMI/PMBOK governance mapping** (Layer 2 begins).
> Acceptance criterion: *contractual + governance flow executed on a sample portfolio.*

## 1. Scope delivered

| Area                       | Delivered                                                                  |
| -------------------------- | -------------------------------------------------------------------------- |
| Governance policy entity   | `GovernancePolicy` — versioned JSON; project-scoped or global              |
| Decision entity            | `GovernanceDecision` — one row per Alert with FIDIC + PMI + escalation + interventions + rationale |
| Default policy             | FIDIC-2017 Red/Yellow-Book baseline embedded in `default-policy.ts` covering all six Cycle-2 rule codes |
| Decision engine            | Pure mapping (no LLM); deterministic rationale string                      |
| API surface                | `GET/POST /governance/policy`, `POST /governance/decide`, `GET /governance/decisions` |

## 2. Architecture in one picture

```
ALERT (Cycle 2)
        │
        ▼
GovernanceDecisionService.decideForEvaluation(evaluationId, projectKey?)
        ├─ resolve policy (project-scoped > global default)
        ├─ for each alert:
        │      ▼
        │   decideOne(alert, policy, asOf)
        │      ├─ accountability[alert.code]      → responsibleParty
        │      ├─ fidic[alert.code]               → clause + notice + deadline
        │      ├─ pmi[alert.code]                 → process group
        │      ├─ escalation[alert.severity]      → L1/L2/L3 (age-gated) + notify list
        │      ├─ intervention[alert.code]        → suggested actions
        │      └─ compose rationale
        │      ▼
        └─ INSERT governance_decision rows (with policyId + policyVersion pinned)
```

## 3. Key entities + services

- `backend/src/modules/canonical/entities/governance-policy.entity.ts` — `(projectKey, version, isCurrent, authoredBy, config JSON)`.
- `backend/src/modules/canonical/entities/governance-decision.entity.ts` — `(alertId, policyId, policyVersion, responsibleParty, fidicClause, fidicNotice, fidicDeadlineDays, escalationLevel, notifyParties[], interventions[], rationale)`.
- `backend/src/modules/governance/default-policy.ts` — generic FIDIC-2017 mapping. **No Sigma proprietary content.**
- `backend/src/modules/governance/governance-policy.service.ts` — append-only versioned upsert, project-scoped resolution.
- `backend/src/modules/governance/governance-decision.service.ts` — pure mapping; idempotent per `(policyId, alertId)`.

## 4. Deterministic vs AI boundary

**No LLM in Cycle 5.** The engine is a switch over the policy JSON; no probabilistic logic. Every decision is reproducible from `(alert, policyId, policyVersion)` alone — Syed can verify by replaying any past evaluation against the persisted policy row.

## 5. Decision traceability

Single SQL chain answers "why this decision":
```
governance_decision → policyId (which policy row) → policyVersion (which iteration) → config JSON (the mapping in effect)
governance_decision → alertId → alert (which deviation) → activity → ingestion_run → source_file
```

## 6. Modular separation

- `modules/governance/` owns Layer 2 logic. Depends only on `modules/canonical/` (entities) and `modules/auth/` (capabilities for the policy editor).
- The decision engine **never imports** Sigma-specific code — it only reads `policy.config`, which is data.

## 7. IP segregation (Clause 7 + NDA Part B Clause 5)

The default policy is conservative and **public** (committed to source). Any Sigma proprietary deltas are entered through `/admin/policy` and live as `governance_policy.config` JSON rows in the DB Sigma operates. The Service Provider never reads those rows in production.

## 8. ADRs raised

- **ADR-0007** — Sigma Governance Intelligence Layer (policy as versioned data; pure mapping engine; default policy as conservative baseline; extensibility model for Cycle 6).

## 9. Acceptance evidence

Sample decision on Nile Tower P-1000 for `RESOURCE_UNDERUSE` (Basement RC):
```json
{
  "responsibleParty": "contractor",
  "fidicClause": "Sub-Clause 8.6",
  "fidicNotice": "Rate of progress …",
  "fidicDeadlineDays": 14,
  "escalationLevel": "L1",
  "notifyParties": ["contractor"],
  "interventions": ["Request labour/equipment ramp-up plan from Contractor", "Verify subcontractor commitments and mobilisation dates"],
  "rationale": "Rule RESOURCE_UNDERUSE of severity warning; party: contractor. FIDIC mapping: Sub-Clause 8.6 — …; PMI/PMBOK: Executing — Acquire / Manage Resources (9.3, 9.5); Escalation: L1 (alert age 0d, threshold 3d)."
}
```

9 decisions produced from 7 alerts on the synthetic portfolio.

## 10. What this enables

- **Cycle 6** plugs Sigma's proprietary content as additional policy rows; no source-code change.
- **Cycle 8's** notifications service consumes `notifyParties` to route Slack/Teams/email messages.
- The four standard Layer-3 surfaces (Cycle 8) display `responsibleParty` + `fidicClause` + `interventions` per role.
