# Cycle Brief — Cycle 5 (Layer 2, FIDIC + PMI/PMBOK Mapping)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2 (cycle release) + 10.4 (architecture review checkpoint after Layer 1 closed)
- **Cycle number:** 5 of 8
- **Layer:** 2 — Sigma Governance Intelligence Layer
- **Calendar window:** Days 57 – 70
- **Cycle fee:** USD 700  (30% kickoff USD 210 · 70% completion USD 490)

## 1. Scope (verbatim from Annex 1)

> *FIDIC-linked logic + notice triggers + entitlement / claim baseline + contractual causality mapping + PMI / PMBOK governance mapping + stage-gate, approval routing, escalation, intervention pathways, risk governance flow.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *Contractual + governance flow executed on a sample portfolio.*

## 3. Inputs from Sigma (preconditions per Annex 3)

- **Annex 3 #9 — FIDIC reference editions** confirmed in writing (see `docs/contract/assumptions/A09-fidic-editions.md`).
- Written Cycle 5 release.
- USD 210 kickoff deposit.
- Layer 1 architecture review checkpoint closed in writing (per Clause 10.4) — see `docs/reviews/layer-1-architecture-checkpoint.md`.

## 4. Deliverables

- `backend/src/modules/canonical/entities/governance-policy.entity.ts` — versioned JSON policy (project-scoped or global), append-only versioning.
- `backend/src/modules/canonical/entities/governance-decision.entity.ts` — one decision per alert: responsible party · FIDIC clause + notice + deadline · PMI/PMBOK process group · escalation level · notify list · interventions · rationale.
- `backend/src/modules/governance/default-policy.ts` — FIDIC-2017 Red/Yellow-Book baseline mapping (8.4, 8.5, 8.6, 4.21, 13, 14, 20.1) — all six Cycle-2 rule codes covered.
- `backend/src/modules/governance/{governance-policy.service,governance-decision.service}.ts`.
- API surface: `GET/POST /api/v1/governance/policy`, `GET /api/v1/governance/policies`, `POST /api/v1/governance/decide`, `GET /api/v1/governance/decisions`.
- `docs/adr/0007-layer-2-governance-policy.md`.
- `docs/reviews/cycle-5-architecture-notes.md`.

## 5. Sequencing notes

- Default policy in `default-policy.ts` is a **generic** FIDIC/PMI mapping. Sigma proprietary content is added per project via `/admin/policy` (Cycle 6).
- Decision engine is pure mapping (no LLM, no opaque ML) — directly Syed-reviewable.

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      | _Khaled Ahmed (pre-signed)_ |
