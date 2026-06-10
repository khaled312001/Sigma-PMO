# ADR-0024 — Day-zero Schedule Compression Proposal

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Layer 2 (Planning) — Wave 6 Cycle 3 (correction-plan §2.5)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0006 (deterministic-first boundary), ADR-0010 (Persona system), ADR-0023 (Scenario audit anchor), meeting transcript 2026-06-08 @ 00:16:19–00:16:42

## Context

The meeting asked for a capability the platform did not have at all: when the
contractor submits a proposed programme at day zero — before execution starts —
the AI should answer «هاد الجدول الزمني قادر انه ينضغط؟» with a concrete
compression claim, the techniques behind it, and the risks.

## Decision

`ScheduleCompressionService.proposeCompression()` runs a two-stage,
deterministic-first pipeline:

1. **Heuristic candidates (always):**
   - *Crashing*: critical-band activities (float ≤ 2 d) with duration ≥ 10 d →
     ~20% duration recovery via resource intensification (≥ 2 d to count).
   - *Fast-tracking*: consecutive critical-band activities in the same WBS
     branch → overlap 25% of the shorter activity.
   - **30% over-compression guard:** the total claim is capped at 30% of the
     original duration regardless of the arithmetic — beyond that the
     schedule-quality risk (AACE 25R-03 territory) outweighs the promise.

2. **Persona vetting (when Claude is enabled):** the candidates go to the
   25-year planner persona, which may revise savings *downward*, drop unsafe
   pairs, and attach risk narrative. **The persona may never raise the
   deterministic ceiling.** Parse failures fall back to the deterministic
   result.

Every proposal persists as a Scenario (kind `compression-proposal`) for audit
and re-render. The endpoint (`POST /baselines/compression/propose`) requires
`canSimulate`; the analysis NEVER mutates the canonical schedule — applying
techniques is a separate planner-review cycle.

## Consequences

- The /baselines card shows original → compressed durations, per-technique
  savings, assumptions, and tradeoffs — the "AI proposes, human disposes"
  posture the meeting demanded.
- The 30% cap and the never-raise-ceiling rule are the platform's defence
  against the meeting's own warning: «الـ AI أحيانًا بيدي معلومات مش بتكون
  صحيحة 100%».
