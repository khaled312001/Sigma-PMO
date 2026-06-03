# Cycle Brief — Cycle 3 (Layer 1, Governance Layer)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2
- **Cycle number:** 3 of 8
- **Layer:** 1 — Technical Governance Engine
- **Calendar window:** Days 29 – 42
- **Cycle fee:** USD 400  (30% kickoff USD 120 · 70% completion USD 280)

## 1. Scope (verbatim from Annex 1)

> *Governance layer: evidence linking, decision traceability, basic data confidence scoring (completeness, consistency, source reliability), flagging of suspicious reporting patterns.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *End-to-end evidence trail proven on real sample data.*

## 3. Inputs from Sigma

- Written Cycle 3 release.
- USD 120 kickoff deposit.
- Confirmation that Cycle 2 acceptance has been signed.

## 4. Deliverables

- `backend/src/modules/governance/evidence.service.ts` — assembles full evidence package per alert: triggering canonical row · rawSource snippet · IngestionRun · SourceFile + SHA-256 · ConfidenceScore · deterministic plain-English rationale.
- `backend/src/modules/governance/confidence.service.ts` — pure deterministic scoring: completeness (0.4) + consistency (0.4) + sourceReliability (0.2) → composite.
- `backend/src/modules/canonical/entities/confidence-score.entity.ts` — persisted per-IngestionRun score with full breakdown.
- `backend/src/modules/governance/governance.controller.ts` — `GET /api/v1/governance/alerts/:id/evidence`, `GET /api/v1/governance/confidence`.
- Wired into `IngestionService.ingest()` so scoring happens transactionally with normalisation.
- `docs/adr/0005-evidence-and-confidence.md`.
- `docs/reviews/cycle-3-architecture-notes.md`.

## 5. Sequencing notes

- "Suspicious reporting patterns" detection in this cycle is rule-based (covered by `STALE_REPORTING` + future Cycle 5/6 patterns); statistical anomaly models remain a Re-scope Trigger per Annex 2.
- Source reliability weights (P6 XML 1.0 · P6 XER 0.95 · Excel 0.85 · CSV 0.70) are encoded in `SOURCE_RELIABILITY`; weights persisted in `breakdown` per record so historical scores stay interpretable if weights change.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
