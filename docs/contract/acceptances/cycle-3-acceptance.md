# Written Acceptance — Cycle 3 (Layer 1, Governance Layer)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1
- **Cycle:** 3 of 8 · USD 400 · Days 29–42
- **Linked release:** `docs/contract/cycle-releases/cycle-3-release.md`

## 1. Acceptance criterion (Annex 1)

> *End-to-end evidence trail proven on real sample data.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The governance layer as released in Cycle 3 release: a single endpoint (`GET /api/v1/governance/alerts/:id/evidence`) returning the full evidence chain (rationale + project + activity + source file with SHA-256 + ConfidenceScore + rawSource snippets) for any alert; deterministic data confidence scoring per IngestionRun (completeness 0.4 + consistency 0.4 + sourceReliability 0.2 → composite); the score's `breakdown` JSON column makes it fully reproducible from the persisted record alone.

Demonstrated against Excel ingestion on 2026-05-27: confidence overall 0.970 (completeness 1.0, consistency 1.0, sourceReliability 0.85). Evidence trail end-to-end on a Cycle-2 alert: rationale → source file SHA-256 → rawSource snippet rendered in `/evidence` UI.

## 4. Written acceptance

By countersigning below, the Client confirms that the Cycle 3 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 280 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 5. Cycle release control (Clause 10.2)

Cycle 4 release must be issued separately in writing.
