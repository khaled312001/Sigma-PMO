# Cycle Release — Cycle 4 (Layer 1, Output Layer · closes Layer 1)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1 + triggers Clause 10.4 architecture checkpoint
- **Cycle:** 4 of 8 · Layer 1 · Days 43–56 · USD 300

## 1. Scope delivered

Output layer: alert dashboard (minimal internal UI), weekly executive summary (LLM-assisted, grounded in data), end-to-end integration, hardening, handover pack.

## 2. Deliverables manifest

### Commits
- `4811b01` — Cycle 4: Executive Summary (deterministic + LLM-optional) + minimal Next.js console + CORS.
- `be9b000` — Cycle 4: switch Next dev/build to --webpack.

### Files (backend)
- `backend/src/modules/canonical/entities/executive-summary.entity.ts` — persists both `groundedNarrative` and `narrative`, `source = deterministic | llm`.
- `backend/src/modules/summary/{summary.service,llm.service,summary.controller,summary.module}.ts`.
- `backend/src/modules/summary/dto/generate-summary.dto.ts`.

### Files (frontend)
- `frontend/app/page.tsx` — minimal internal console (runs table with confidence bars, alerts list with click-through, summary card).
- `frontend/app/layout.tsx` + `frontend/lib/api.ts` + `frontend/app/globals.css`.

### API endpoints
- `POST /api/v1/summary/generate` — weekly executive summary
- `GET /api/v1/summary` — list summaries
- `GET /api/v1/summary/llm-status` — provider status

### Documentation
- `docs/adr/0006-summary-and-ui.md`
- `docs/reviews/cycle-4-architecture-notes.md`
- `docs/reviews/layer-1-architecture-checkpoint.md` (Clause 10.4 — closes Layer 1 architecture review)

## 3. Acceptance evidence

Acceptance criterion: *Usable internal MVP and full handover.*

Generated executive summary on 2026-05-27 (deterministic):

```
Project: Nile Tower — Main Construction
Reporting period: 2026-05-09 → 2026-05-15.
Schedule data date: 2026-05-15. Planned duration: 2026-01-05 → 2026-12-18 (347 days).

Schedule status:
  - Activities: 8 (completed 2, in progress 2, not started 4).
  - Avg planned 43.1% vs actual 37.8% (delta -5.4pp).

Alerts: Total 7; critical 3; warning 4.
  - SCHEDULE_FINISH_SLIPPED:2, DURATION_OVERRUN:2, RESOURCE_UNDERUSE:2, COST_OVERRUN:1.

Critical findings:
  - [DURATION_OVERRUN] Activity "Bulk Excavation" took 30 day(s) vs 20 planned (150%).
  - [SCHEDULE_FINISH_SLIPPED] Activity "Bulk Excavation" finished 7 day(s) late.
  - [SCHEDULE_FINISH_SLIPPED] Activity "Site Mobilisation" finished 3 day(s) late.

Reporting:
  - Reports in window: 1.
  - Latest report 2026-05-15 by Project Manager: Schedule pressure on basement RC; recovery plan requested for cores start.

Data confidence (avg across this project's data): 98.5%.
```

LLM rewrite is gated by `LLM_API_KEY` env; deterministic narrative is the source of truth and always persisted.

Internal console live at `http://localhost:3000`: ingestion runs visible with confidence bars; alerts click through to evidence package; weekly summary renderable on demand.

## 4. ADRs included

ADR-0006 (Executive summary + minimal UI).

## 5. Layer-1 architecture checkpoint

This release triggers the Clause 10.4 architecture review. Closure is recorded in `docs/reviews/layer-1-architecture-checkpoint.md`. Layer 2 Cycle 5 does not begin until both Layer 1 acceptance is signed **and** the checkpoint is closed in writing.

## 6. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-27 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |
