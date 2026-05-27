# ADR-0007 — Sigma Governance Intelligence Layer (Layer 2)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Layer / Cycle:** Layer 2 / Cycles 5–6 (Sigma Governance Intelligence)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (governance), Syed Moinuddin (architecture)

## Context

Layer 2 carries the contract's *proprietary Sigma governance logic* — FIDIC
mapping, notice triggers, PMI/PMBOK alignment, escalation, intervention,
accountability balancing, causality. The IP itself belongs to Sigma per the
contract, so the right architecture for the Service Provider is to ship a
**configurable engine + a credible default**, not to encode Sigma's
proprietary rules in source.

## Decision

### 1. Governance policy as data, versioned

A `GovernancePolicy` entity holds the full governance configuration as a JSON
document (see `default-policy.ts` for the shape). It is versioned per
`projectKey` (with `projectKey = null` representing the global default),
mirroring the append-only convention from Cycle 1. Al Ayham / Sigma edit the
policy via the API (`POST /api/governance/policy`); every edit creates a new
version, prior version retired (`isCurrent = false`).

Policy shape:

```
{
  accountability:  { RULE_CODE → 'contractor'|'consultant'|'client'|'sigma'|'shared' },
  fidic:           { RULE_CODE → { clause, notice, deadlineDays } },
  pmi:             { RULE_CODE → 'PMI/PMBOK process group hint' },
  escalation:      { critical|warning|info → { ageDays, level, notify[] } },
  intervention:    { RULE_CODE → string[] of suggested actions }
}
```

### 2. Decision pipeline (rule output → governance decision)

`GovernanceDecisionService.decideForEvaluation(evaluationId)` reads every
`Alert` of the evaluation, resolves the applicable policy (project-specific
beats global), and produces one `GovernanceDecision` per alert containing:

- **responsibleParty** (accountability map)
- **fidicClause / fidicNotice / fidicDeadlineDays** (FIDIC mapping)
- **escalationLevel** (L1/L2/L3 based on severity + alert age vs threshold)
- **notifyParties[]** (recipients per escalation tier)
- **interventions[]** (action library)
- **rationale** (deterministic, human-readable trace of the mapping)

The service is **pure mapping** — no LLM, no I/O beyond the policy and the
alert. This is precisely the deterministic boundary Syed reviews against.

### 3. Default policy (`DEFAULT_GOVERNANCE_POLICY`)

Ships a FIDIC 2017 Red/Yellow-Book-grounded default covering all six Layer 1
rule codes. References include:

- 8.4 (EOT), 8.5 (Delay damages), 8.6 (Rate of progress),
- 4.21 (Progress reports),
- 13 (Variations), 14 (Contract price),
- 20.1 (Contractor's claims).

These defaults are conservative and explicitly intended to be overridden by
Sigma's contractual experts; the cycle gate review with Al Ayham is where
the project-specific overrides land.

### 4. Extensibility for Sigma proprietary IP (Cycle 6)

The proprietary fault-weighting / accountability-balancing / causality logic
plugs in via:

- **Custom rule codes** — Sigma defines new rule codes (`SIGMA_X_*`) in the
  Layer 1 rule pack (one new `Rule` class per code) and supplies their
  policy entries.
- **Custom rule classes** — a Sigma engineer/operator drops in a new
  `Rule` implementation; `RulesModule` providers list registers it. Engine
  unchanged.
- **Policy overrides per project** — accountability weightings, FIDIC
  variant (Silver Book vs Red Book), escalation tiers per client.
- **Reserved JSON keys in the policy** (`proprietary`, `causality`,
  `weighting`) — read by Sigma's custom decision processor (future) when a
  proprietary engine is plugged in. The default processor ignores unknown keys.

## Reason

- **Sigma keeps its IP** — the proprietary logic lives in policy documents
  Sigma authors, not in our source. Contract-aligned.
- **Auditability** — every decision can be reproduced from `(policy version
  + alert)` alone. No hidden state.
- **Reviewability** — Syed reviews the engine; Al Ayham reviews the policy.
  Clean separation matching the agreed cycle-gate flow.

## Risk & mitigation

- **Policy authoring errors** — mitigated by JSON schema validation
  (planned in Cycle 7 alongside RBAC).
- **Backward compatibility when policy shape evolves** — mitigated by
  append-only versioning; decisions store the `policyVersion` they were
  produced under, so historical decisions remain interpretable.
- **Default policy ages out of FIDIC editions** — mitigated by leaving the
  default to Sigma to maintain; defaults are a starting point, not a claim
  of perpetual accuracy.

## Replacement path

- **Different contract family** (e.g. NEC, JCT) — replace `fidic` with the
  target family; rest of the engine unchanged.
- **External decision engine** (e.g. Drools, OPA) — implement a
  `GovernanceDecisionService.decideOne()` strategy that defers to the
  external engine; persistence shape unchanged.

## Consequences

- Layer 2 acceptance criteria — *contractual + governance flow executed on
  a sample portfolio* — are met using the default policy. Project-specific
  Sigma rules are a configuration exercise, not a code release.
- Layer 3 plugs admin/workflow controls onto this configuration surface
  (policy editor with RBAC).
- The Executive Summary (Cycle 4) can include governance decisions in a
  future iteration without engine changes.
