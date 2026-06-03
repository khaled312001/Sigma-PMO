# Cycle Release — Cycle 5 (Layer 2, FIDIC + PMI/PMBOK Mapping)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1 + Annex 3 #9
- **Cycle:** 5 of 8 · Layer 2 · Days 57–70 · USD 700
- **Precondition met:** Layer 1 architecture checkpoint closed (see `docs/reviews/layer-1-architecture-checkpoint.md`)

## 1. Scope delivered

FIDIC-linked logic + notice triggers + entitlement/claim baseline + contractual causality mapping + PMI/PMBOK governance mapping + stage-gate, approval routing, escalation, intervention pathways, risk governance flow.

## 2. Deliverables manifest

### Commits
- `4e2a5ce` — Layer 2: GovernancePolicy (versioned JSON) + GovernanceDecision (FIDIC/PMI mapping, escalation, interventions) + default policy.

### Files
- `backend/src/modules/canonical/entities/{governance-policy,governance-decision}.entity.ts` — versioned policy + per-alert decision.
- `backend/src/modules/governance/default-policy.ts` — FIDIC-2017 Red/Yellow-Book baseline (8.4, 8.5, 8.6, 4.21, 13, 14, 20.1) for all six Cycle-2 rule codes + PMI/PMBOK process group hints + escalation tiers + intervention library.
- `backend/src/modules/governance/{governance-policy.service,governance-decision.service}.ts`.
- `backend/src/modules/governance/dto/{upsert-policy,decide}.dto.ts`.

### API endpoints
- `GET /api/v1/governance/policy` — resolve current policy for project (or global default)
- `POST /api/v1/governance/policy` — upsert (admin)
- `GET /api/v1/governance/policies` — version history
- `POST /api/v1/governance/decide` — produce decisions for a rule evaluation
- `GET /api/v1/governance/decisions` — list decisions

### Documentation
- `docs/adr/0007-layer-2-governance-policy.md`
- `docs/reviews/cycle-5-architecture-notes.md`

## 3. Acceptance evidence

Acceptance criterion: *Contractual + governance flow executed on a sample portfolio.*

Sample decision for `RESOURCE_UNDERUSE` on Basement RC Structure:

```json
{
  "code":             "RESOURCE_UNDERUSE",
  "responsibleParty": "contractor",
  "fidicClause":      "Sub-Clause 8.6",
  "fidicNotice":      "Rate of progress — Engineer may notify Contractor to submit a revised programme and recovery measures.",
  "fidicDeadlineDays": 14,
  "escalationLevel":  "L1",
  "notifyParties":    ["contractor"],
  "interventions": [
    "Request labour/equipment ramp-up plan from Contractor",
    "Verify subcontractor commitments and mobilisation dates"
  ],
  "rationale":        "Rule RESOURCE_UNDERUSE of severity warning; party: contractor. FIDIC mapping: Sub-Clause 8.6 — …; PMI/PMBOK: Executing — Acquire / Manage Resources (9.3, 9.5); Escalation: L1 (alert age 0d, threshold 3d)."
}
```

9 decisions produced from the 7 sample alerts (a few rules generate multiple decisions per alert when escalation tiers apply). Decisions stored with `policyId + policyVersion` so they remain reproducible from policy version + alert alone.

## 4. ADRs included

ADR-0007 (Sigma Governance Intelligence Layer).

## 5. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
