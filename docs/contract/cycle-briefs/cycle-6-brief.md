# Cycle Brief — Cycle 6 (Layer 2, Sigma Proprietary Logic)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2 + Annex 3 #10
- **Cycle number:** 6 of 8
- **Layer:** 2 — Sigma Governance Intelligence Layer (closes Layer 2)
- **Calendar window:** Days 71 – 84
- **Cycle fee:** USD 700  (30% kickoff USD 210 · 70% completion USD 490)

## 1. Scope (verbatim from Annex 1)

> *Sigma proprietary logic + causality model + fault weighting + accountability balancing + intervention scoring + governance override + commercial behaviour logic + decision causality weighting.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *Full intelligence layer running over the engine, with explainable outputs.*

## 3. Inputs from Sigma (preconditions per Annex 3)

- **Annex 3 #10 — Sigma proprietary logic capture workflow** confirmed in writing (see `docs/contract/assumptions/A10-sigma-proprietary-logic.md`). Sigma enters logic through `/admin/policy` UI; content stays in versioned `GovernancePolicy` DB rows, never in source.
- Written Cycle 6 release.
- USD 210 kickoff deposit.
- Confirmation that Cycle 5 acceptance has been signed.

## 4. Deliverables

- Sigma proprietary rules entered by Al Ayham through `/admin/policy` — each save creates a new `GovernancePolicy` version; Sigma retains exclusive control of the content.
- `backend/src/modules/canonical/entities/decision-review.entity.ts` — append-only audit of stakeholder actions on a decision (approve / reject / acknowledge with actor + timestamp).
- `backend/src/modules/governance/decision-review.service.ts` + API: `POST /api/v1/governance/decisions/:id/review`, `GET /api/v1/governance/decisions/:id/reviews`.
- Verifiable explainability: every `GovernanceDecision` exposes `policyId + policyVersion + rationale + FIDIC + PMI + escalation + interventions` — fully reproducible from the policy version + alert alone, no hidden state.
- `docs/reviews/cycle-6-architecture-notes.md`.

## 5. Sequencing notes

- Per Clause 7 and NDA Part B Clause 5: Sigma proprietary logic stays in DB rows owned by Sigma; source code carries only generic defaults.
- Per Annex 3 #10: the **workflow** is documented in `A10-sigma-proprietary-logic.md`; the **content** stays with Sigma.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      | _Khaled Ahmed (pre-signed)_ |
