# Written Acceptance — Cycle 6 (Layer 2, Sigma Proprietary Logic · closes Layer 2)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1 + Annex 3 #10
- **Cycle:** 6 of 8 · USD 700 · Days 71–84
- **Linked release:** `docs/contract/cycle-releases/cycle-6-release.md`

## 1. Acceptance criterion (Annex 1)

> *Full intelligence layer running over the engine, with explainable outputs.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The Sigma proprietary logic capture workflow per `docs/contract/assumptions/A10-sigma-proprietary-logic.md`: Al Ayham enters Sigma's proprietary rules through `/admin/policy`; each save creates a new versioned `GovernancePolicy` row owned by Sigma. The source code carries only generic FIDIC/PMI defaults — Sigma proprietary content stays in the DB rows that Sigma operates.

The `DecisionReview` audit (`approve | reject | acknowledge` with actor + timestamp) makes every stakeholder action append-only. Combined with Cycle 3 evidence + Cycle 5 governance decisions, the system answers "why this alert · why this decision under what policy version · who acted on it · when" in three API calls — fully explainable.

## 4. Layer 2 closure

This acceptance closes Layer 2. Layer 3 Cycle 7 release follows separately per Clause 10.2.

## 5. Written acceptance

By countersigning below, the Client confirms that the Cycle 6 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 490 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |
