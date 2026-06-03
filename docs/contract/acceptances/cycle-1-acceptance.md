# Written Acceptance — Cycle 1 (Layer 1, Data Foundation)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1 (Acceptance Gate)
- **Cycle:** 1 of 8 · USD 700 · Days 1–14
- **Linked release:** `docs/contract/cycle-releases/cycle-1-release.md`

## 1. Acceptance criterion (Annex 1)

> *Ingest sample P6 + Excel and verify normalised state.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.** If neither written acceptance nor a written deficiency list is issued within the 5-business-day review window, the cycle remains under review until one of them is issued.

## 3. What is being accepted

The data foundation as released in Cycle 1 release: canonical schema (7 entities), append-only versioning, parsers for Primavera P6 (XER + PMXML), Excel, and CSV, immutable SHA-256 source archive, validation layer, and the orchestration of ingest → validate → normalise as a transactional pipeline persisting an `IngestionRun` audit row.

Demonstrated end-to-end during the Cycle 1 Zoom review against MariaDB on 2026-05-27:
- 3 source files ingested (XML, Excel, XER) → 3 IngestionRun rows persisted.
- Append-only versioning verified: project P-1000 versioned across 6 ingest cycles with exactly one `isCurrent` row at any time.
- Architecture review notes shared 24 h ahead of the Zoom (`docs/reviews/cycle-1-architecture-notes.md`).

## 4. Written acceptance

By countersigning below, the Client confirms that the Cycle 1 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 490 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 5. Cycle release control (Clause 10.2 reminder)

Acceptance of this cycle does **not** automatically authorise Cycle 2. Cycle 2 release must be issued separately in writing per Clause 10.2.
