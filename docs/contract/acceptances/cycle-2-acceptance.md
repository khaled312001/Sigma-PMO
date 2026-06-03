# Written Acceptance — Cycle 2 (Layer 1, Rule Engine v1)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1
- **Cycle:** 2 of 8 · USD 600 · Days 15–28
- **Linked release:** `docs/contract/cycle-releases/cycle-2-release.md`

## 1. Acceptance criterion (Annex 1)

> *A deviation is detected with full traceback to source rows.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The Rule Engine v1 as released in Cycle 2 release: six deterministic rules covering schedule slip, behind-plan, duration overrun, cost overrun, resource underuse, stale reporting; alerts pinned to their triggering canonical rows (project, activity, resource, assignment, report); each alert carrying full source provenance (`ingestionRunId` + `sourceFileId`) for end-to-end traceback to the SHA-256 archived original file.

Demonstrated during the Cycle 2 review: evaluating P-1000 yielded 7 alerts (3 critical, 4 warning); selecting any alert in the `/evidence` UI surfaces its rationale + source file + canonical rows + raw source snippet.

## 4. Written acceptance

By countersigning below, the Client confirms that the Cycle 2 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 420 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 5. Cycle release control (Clause 10.2)

Cycle 3 release must be issued separately in writing.
