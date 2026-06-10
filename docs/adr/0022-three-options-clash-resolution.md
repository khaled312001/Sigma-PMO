# ADR-0022 — Three-Options Clash Resolution contract

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Layer 1 (Engineering) + Layer 2 (Planning) — Wave 6 Cycle 1 (correction-plan §2.2)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0010 (Persona system), ADR-0012 (Outbox), ADR-0023 (What-If Simulation), meeting transcript 2026-06-08 @ 00:03:09–00:03:48

## Context

The 2026-06-08 meeting specified the clash-resolution mechanic verbatim: for
every clash the AI proposes **exactly three options**, each carrying its
impact on the schedule and the cost —

> «الحل الأول: بتمدد، بتزيد الكلفة، بس الزمن بيظل ثابت. الحل التاني: رح تزيد
> المدة والكلفة رح تظل ثابتة. الحل الثالث: رح يحافظ على المدة والكلفة، لكن
> بدّو تنسيق ثالث.»

Wave 2 shipped the persona + the `proposedOptions` JSON column, but the
schedule slice the persona grounds duration numbers in was a stub — every
`timeImpactDays` came back 0-and-flagged.

## Decision

1. **The persisted contract stays `ClashItem.proposedOptions`** — an array of
   `{ label, timeImpactDays, costImpactAED | null, scopeImpact }`. No new
   table: the JSON column is already append-only-versioned through the clash
   row and the decision audit (`chosenOptionIndex`, `decidedBy`, `decidedAt`)
   lives beside it.
2. **The proposer now feeds the persona the real baseline slice** — the
   current Activity rows with a pre-computed `floatDays` per activity
   (days between the activity finish and the project finish), so the persona
   grounds every `timeImpactDays` in the approved schedule instead of
   refusing with zeros.
3. **Cost numbers remain BoQ-only** (`costImpactAED: null` when the line is
   not priced) — unchanged from the Wave-2 persona rule.
4. **Selection is not a bare status flip.** Choosing an option flows through
   the What-If simulation (ADR-0023) and the apply gate
   (`POST /clashes/:id/options/:idx/apply`), which records the decision AND
   issues the schedule revision in one transaction.

## Consequences

- The Wave-2 `/clashes/:id/decide` UI affordance is replaced by
  Simulate → Approve & Apply. A decision can no longer be recorded without
  the impact projection having been displayed.
- A clash that was already decided refuses re-application — revising a
  decision requires a new clash row (append-only discipline).
