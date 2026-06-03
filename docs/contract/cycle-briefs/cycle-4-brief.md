# Cycle Brief — Cycle 4 (Layer 1, Output Layer)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2
- **Cycle number:** 4 of 8
- **Layer:** 1 — Technical Governance Engine (closes Layer 1)
- **Calendar window:** Days 43 – 56
- **Cycle fee:** USD 300  (30% kickoff USD 90 · 70% completion USD 210)

## 1. Scope (verbatim from Annex 1)

> *Output layer: alert dashboard (minimal internal UI), weekly executive summary (LLM-assisted, grounded in data), end-to-end integration, hardening, handover pack.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *Usable internal MVP and full handover.*

## 3. Inputs from Sigma

- Written Cycle 4 release.
- USD 90 kickoff deposit.
- Confirmation that Cycle 3 acceptance has been signed.
- (Optional) Anthropic / OpenAI API key for LLM-rewritten summaries — pipeline works deterministically without it.

## 4. Deliverables

- `backend/src/modules/summary/{summary.service,llm.service}.ts` — deterministic-first grounded narrative; optional LLM rewrite that never invents facts.
- `backend/src/modules/canonical/entities/executive-summary.entity.ts` — both `groundedNarrative` and `narrative` persisted; `source = deterministic | llm`.
- `backend/src/modules/summary/summary.controller.ts` — `POST /api/v1/summary/generate`, `GET /api/v1/summary`, `GET /api/v1/summary/llm-status`.
- `frontend/app/page.tsx` — minimal internal console: runs table with confidence bars · alerts list · summary card.
- CORS enabled for `http://localhost:3000` by default; configurable via `CORS_ORIGINS`.
- `docs/adr/0006-summary-and-ui.md`.
- `docs/reviews/cycle-4-architecture-notes.md` + `docs/reviews/layer-1-architecture-checkpoint.md` (Clause 10.4 closure of Layer 1 before Layer 2 begins).

## 5. Sequencing notes

- LLM use is summary-only, grounded in already-extracted data (per client written confirmation 2026-05-20).
- Layer 3 commercial role-specific UI is **not** in scope for Cycle 4 — that work happens in Cycle 8.
- Cycle 4 closure triggers the formal architecture review checkpoint per Clause 10.4.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
