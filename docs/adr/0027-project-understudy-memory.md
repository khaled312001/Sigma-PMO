# ADR-0027 — Project "understudy" memory

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Cross-cutting (AI infrastructure) — Wave 7 (correction-plan §2.11)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0025 (policy addons — same injection plumbing), meeting transcript 2026-06-08 @ 00:22:33

## Context

The meeting names each project an "understudy": the AI should accumulate a
project personality over time — slow approvals, congested MEP zones,
optimistic contractor durations — and use it in later recommendations
instead of resetting every call.

## Decision

1. **`ProjectMemory` entity** — one durable fact per row:
   `factType` (characteristic | risk | preference | history), `content`,
   `source` (user-input | inferred | historical-analysis), `confidence`
   (0..1), soft-delete only.
2. **Harvester** (`POST /project-memory/harvest`) derives facts from the
   alert + decision history with honest confidences:
   - rule code fired ≥ 3× → recurring-pattern risk (0.7)
   - ≥ 2 critical alerts → critical-prone characteristic (0.65)
   - ≥ 3 L1 escalations → escalation-heavy history (0.7)
   Idempotent on (projectKey, content).
3. **Prompt injection** rides the same plumbing as ADR-0025: the Claude
   prompt builder appends `# Known about this project` to the user message
   when `projectKey` is set. **Confidence floor 0.6** — weak inferences
   never reach a prompt (the anti-poisoning guard; the meeting's own
   warning about AI fallibility applies to the platform's inferences too).
   Cap 12 lines so memory never crowds the task context.
4. Direct user-recorded facts carry confidence 1.0; deactivation requires
   `canEvaluateRules` (reviewer/consultant and up).

## Consequences

- Memory grows only through explicit recording or the deterministic
  harvester — the LLM never writes its own memories (no self-reinforcing
  loops).
- A periodic batch harvester (`historical-analysis` source) is future
  work; the manual + on-demand harvest covers Wave 7.
