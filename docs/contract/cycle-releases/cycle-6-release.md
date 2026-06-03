# Cycle Release — Cycle 6 (Layer 2, Sigma Proprietary Logic · closes Layer 2)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1 + Annex 3 #10
- **Cycle:** 6 of 8 · Layer 2 · Days 71–84 · USD 700
- **Precondition met:** Sigma proprietary logic capture workflow confirmed (see `docs/contract/assumptions/A10-sigma-proprietary-logic.md`)

## 1. Scope delivered

Sigma proprietary logic + causality model + fault weighting + accountability balancing + intervention scoring + governance override + commercial behaviour logic + decision causality weighting.

## 2. Deliverables manifest

### Commits
- `55469c2` — Layer 3 commercial UI: sidebar + 4 standard surfaces + admin (policy/users) + auth flow + DecisionReview audit + /upload.

### Files (Sigma IP entry points + audit)
- `backend/src/modules/canonical/entities/decision-review.entity.ts` — append-only audit of stakeholder actions on each governance decision.
- `backend/src/modules/governance/decision-review.service.ts`.
- `frontend/app/admin/policy/page.tsx` — full JSON editor for the governance policy; every save creates a new `GovernancePolicy` version. **All Sigma proprietary logic is entered here by Sigma and stays in the DB row owned by Sigma.**
- `backend/src/modules/governance/governance-decision.service.ts` — produces `GovernanceDecision` rows whose `rationale` field is a fully deterministic explanation of the mapping for that alert under the policy version in effect.

### API endpoints
- `POST /api/v1/governance/policy` — upsert (admin; capability `canEditPolicy`)
- `POST /api/v1/governance/decisions/:id/review` — `approve | reject | acknowledge`
- `GET  /api/v1/governance/decisions/:id/reviews` — audit trail per decision
- `GET  /api/v1/governance/alerts/:id/reviews`   — audit trail per alert

### IP segregation evidence (Clause 7 + NDA Part B Clause 5)

The source code carries only generic FIDIC/PMI defaults. Sigma proprietary content lives in the `governance_policy.config` JSON column for project-scoped or global rows authored by Sigma. The Service Provider has no read or write access to those rows in production once Sigma operates the platform.

## 3. Acceptance evidence

Acceptance criterion: *Full intelligence layer running over the engine, with explainable outputs.*

For any alert id, two API calls reconstruct the full causal chain:
1. `GET /api/v1/governance/alerts/:id/evidence` → triggering canonical row, source file, confidence.
2. `GET /api/v1/governance/decisions?alertId=:id` → policy id + version + responsibleParty + FIDIC + escalation + interventions + rationale.

`GET /api/v1/governance/decisions/:id/reviews` then returns the human action trail. Together, these answer "why this alert · why this decision · who approved/rejected · when" with zero hidden state.

## 4. ADRs included

ADR-0007 + the policy-editor workflow documented in `A10-sigma-proprietary-logic.md`.

## 5. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-28 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
