# ADR-0006 — Executive summary + minimal internal UI (Cycle 4)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Layer / Cycle:** Layer 1 / Cycle 4 (Output layer — closes Layer 1)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham, Syed Moinuddin

## Context

Cycle 4 closes Layer 1 with two surfaces: a **Weekly Executive Summary**
generator (LLM-assisted, grounded in data) and a **minimal internal UI** to
exercise the engine end-to-end. The summary must never invent facts — the
LLM boundary must stay narrow (rewriting, not deciding).

## Decision

### 1. Deterministic-first summary, LLM-optional rewrite

`SummaryService.generate()` always composes a **grounded narrative** from
the canonical snapshot, the latest alerts, the reports in the period, and
the average ingestion confidence. That grounded text is **persisted** as
`groundedNarrative`; it is the source of truth.

If `LLM_API_KEY` is configured (Anthropic or OpenAI), the grounded text is
sent to the LLM with a strict system prompt: *"Rewrite the supplied grounded
facts into an executive summary. Do not invent numbers, dates, names, or
claims that are not in the facts."* The rewritten text is stored in
`narrative` and the record marks `source = 'llm'` with provider/model. On
LLM failure, the service falls back to the deterministic narrative
(`source = 'deterministic'`) — there is **no scenario in which a summary
references data the engine did not extract**.

### 2. ExecutiveSummary entity

Persists both versions (`groundedNarrative`, `narrative`), period dates,
LLM provenance, the `ruleEvaluationId` consulted, the average confidence,
and structured `metrics` (counts per code/severity, activity counts). The
record is fully reproducible from its own contents.

### 3. Minimal UI (Next.js 16, App Router)

One client-component page (`app/page.tsx`) with three sections — ingestion
runs with confidence bars, alerts (click to expand evidence), and the
summary generator. The UI calls only the backend's public API; no business
logic in the front-end. CORS is enabled for `http://localhost:3000` by
default, configurable via `CORS_ORIGINS` for other environments.

## Reason

- **Deterministic baseline** keeps governance happy: every fact in any
  narrative is reproducible from the stored grounded text and the run
  record. The LLM is a presentation layer, not an authority.
- **Optional LLM** lets the client (Sigma) plug in a provider at any time
  without code changes, and removes any external dependency from the
  default path. Aligns directly with the client's written instruction
  *"LLM use: summaries only, grounded in platform data."*
- **Minimal UI, full API** matches the Cycle 4 brief (minimal internal UI)
  without pre-committing to a design language; Layer 3's commercial UI work
  consumes the same API surface.

## Risk & mitigation

- **LLM hallucination** — addressed by (i) sending only grounded facts,
  (ii) persisting the grounded text alongside the LLM rewrite, and
  (iii) the prompt itself.
- **API endpoint surface** — CORS restricted; future Layer 3 cycle adds
  RBAC + auth before exposing externally.
- **UI scope creep** — explicitly scoped to "internal MVP." Bespoke
  role-specific screens remain a Re-scope Trigger (Annex 2).

## Replacement path

- **Swap LLM provider** — set `LLM_PROVIDER` to a different value or
  extend `LlmService` with a new `callX()` method. No other code changes.
- **Replace UI** — the API contract (`/ingestion/runs`, `/rules/alerts`,
  `/governance/alerts/:id/evidence`, `/summary/*`) is stable; any UI may
  consume it.

## Consequences

- Layer 1 is functionally complete: ingest → canonical → rule engine →
  evidence → confidence → summary, all running end-to-end.
- The summary record is a clean handover artefact for the Zoom cycle review.
- Layer 2 (FIDIC, PMI, Sigma proprietary logic) plugs additional rules into
  the engine and additional summary sections without UI rework.
