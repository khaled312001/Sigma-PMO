# Cycle 4 — Architecture Notes for Review

> Cycle 4 scope: **Output Layer — executive summary + minimal internal UI** (Layer 1 closes).
> Acceptance criterion: *usable internal MVP and full handover.*

## 1. Scope delivered

| Area                          | Delivered                                                       |
| ----------------------------- | --------------------------------------------------------------- |
| Executive summary entity      | `ExecutiveSummary` persists `groundedNarrative` + `narrative`   |
| Deterministic narrative       | Composed from `Project + Activities + Alerts + Reports + ConfidenceScore`  |
| LLM rewrite (optional)        | Anthropic or OpenAI; gated by `LLM_API_KEY`; receives only grounded facts |
| Internal Next.js console      | One unified page with runs / alerts / evidence / summary        |
| CORS                          | Configurable origins; defaults to `http://localhost:3000`        |

## 2. Architecture in one picture

```
POST /api/v1/summary/generate {projectKey, periodDays}
        │
        ▼
SummaryService.generate
        ├─ SnapshotService.load(projectId)               ← Cycle 2 utility
        ├─ alerts for project (recent)
        ├─ averageConfidenceFor(snapshot)
        ├─ composeGrounded(...)                          ← deterministic plain text
        ├─ LlmService.rewrite(grounded, projectName)?    ← optional, no-op when key unset
        └─ INSERT executive_summary row (both versions persisted)
```

## 3. Key services

- `backend/src/modules/summary/summary.service.ts` — orchestrator + grounded composer.
- `backend/src/modules/summary/llm.service.ts` — provider-agnostic LLM rewrite; strict system prompt forbids invention.

## 4. Deterministic-vs-AI boundary (critical)

- The deterministic `groundedNarrative` is **always** produced and persisted.
- LLM, when configured, is asked to **rewrite** that text. It never receives the canonical DB; only the assembled grounded facts. Per system prompt: *"Do not invent numbers, dates, names, or claims that are not in the facts."*
- On LLM failure: caller falls back to deterministic narrative. There is **no scenario in which a stored summary contains facts the engine did not extract.**

This boundary directly satisfies the client's written instruction (2026-05-20): *"LLM use: summaries only, grounded in platform data."*

## 5. Evidence chain integration

The summary's `metrics` JSON includes the count buckets by rule code + severity. The Overview page in the UI surfaces "critical findings" with their rule codes; users can drill into Evidence (Cycle 3 endpoint) for any of them.

## 6. Modular separation

- Frontend at `frontend/` is a separate Next.js 16 codebase (App Router) reading from `lib/api.ts` which targets `/api/v1`.
- One `frontend/app/page.tsx` consumes runs (Cycle 1), alerts (Cycle 2), evidence (Cycle 3), summary (Cycle 4) — proving end-to-end integration.
- Webpack used instead of Turbopack (Next 16 SWC native binary not available on this Win/Node combo); documented in ADR-0006.

## 7. ADRs raised

- **ADR-0006** — Executive summary (deterministic-first, LLM-optional) + minimal UI.

## 8. Acceptance evidence

Generated 2026-05-27 (deterministic) for P-1000 covering 2026-05-09 → 2026-05-15:
- 8 activities (2 completed, 2 in progress, 4 not started).
- 7 alerts (3 critical, 4 warning).
- Reports in window: 1 (Project Manager).
- Data confidence average: 98.5%.

UI live at `http://localhost:3000` shows all four standard surfaces in their Layer-1 minimal form.

## 9. Deferred / known items

- LLM rewrite tested in dry-run mode only; live verification deferred until Sigma supplies API key.
- The Next.js 16 `--webpack` fallback is a Hostinger-deploy-time concern only; document in Cycle 7 runbook.

## 10. What this enables

- Layer 1 is functionally complete and consumable by humans through a browser.
- Layer 2 (Cycle 5) adds the governance dimension on top of these surfaces without UI rework.
- Layer 3 (Cycle 7) hardens the same code path for production deploy.
