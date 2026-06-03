# Written Acceptance — Cycle 5 (Layer 2, FIDIC + PMI/PMBOK Mapping)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1
- **Cycle:** 5 of 8 · USD 700 · Days 57–70
- **Linked release:** `docs/contract/cycle-releases/cycle-5-release.md`

## 1. Acceptance criterion (Annex 1)

> *Contractual + governance flow executed on a sample portfolio.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The governance intelligence layer as released in Cycle 5 release: the versioned `GovernancePolicy` entity (project-scoped or global, JSON config, append-only versioning); the `GovernanceDecision` produced per alert with accountability (party) + FIDIC clause + notice + deadline + PMI/PMBOK process group + escalation level (L1/L2/L3) + notify list + intervention library + deterministic rationale; the default FIDIC-2017 Red/Yellow-Book baseline in `default-policy.ts` covering all six Cycle-2 rule codes (clauses 8.4, 8.5, 8.6, 4.21, 13, 14, 20.1).

Demonstrated on sample portfolio P-1000: `POST /api/v1/governance/decide` against the 7 Cycle-2 alerts produced 9 decisions; each decision reproducible from `(alertId, policyId, policyVersion)` alone — no hidden state.

## 4. Written acceptance

By countersigning below, the Client confirms that the Cycle 5 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 490 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 5. Cycle release control (Clause 10.2)

Cycle 6 release must be issued separately in writing and the Annex 3 #10 (Sigma proprietary logic capture) must be confirmed.
