# ADR-0025 — Project Policy Addons (inline AI instructions)

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Cross-cutting (AI infrastructure) — Wave 6 Cycle 4 (correction-plan §2.6)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0007 (governance policy), ADR-0010 (Persona system), meeting transcript 2026-06-08 @ 00:18:43–00:20:14

## Context

The meeting requires the Consultant to author project-specific notes for the
AI from the SAME page they are working on: «انت بتكتب للـ AI، طبعاً كله ده في
dashboard — مش تكتب بتروح للمكان تاني». The Wave-2 GovernancePolicy is global
and lives behind /admin/policy — wrong scope and wrong place.

## Decision

1. **`ProjectPolicyAddon` entity** — one Markdown bullet per row, scoped to
   `(projectBusinessKey, surface)` where surface ∈
   {planning, engineering, governance, reports, *}. Soft-delete only
   (`isActive=false`); the who-instructed-the-AI-what audit survives forever.
2. **Standalone `PolicyAddonsModule`** (not GovernanceModule) so
   `ClaudeModule` imports it without a cycle.
3. **Prompt composition:** `ClaudeService` accepts `projectKey` + `surface`
   in `PersonaCallContext`; when both are present the addon block is
   appended to the **user message** (after the cacheable persona system
   block — the persona body stays cacheable across projects). Addon-lookup
   failures degrade to an empty block with a warning — a broken read never
   blocks a persona call.
4. **Authorisation:** writes require `canEvaluateRules` (the Consultant's
   gate; `canEditPolicy` would lock the Consultant out, contradicting the
   meeting). Contractor stays read-only.
5. **UI:** `PolicyAddonInline` widget mounted on every AI surface
   (/baselines, /clashes, /reports/monthly), collapsed by default, with
   the add form + per-bullet deactivate.

## Consequences

- Exemplar callers wired: clash proposer (`surface: engineering`) and the
  periodic report narrator (`surface: reports`). New AI callers must pass
  their project + surface to participate — an unset context simply skips
  addons, never fails.
- `PersonaActiveBadge` ships alongside (same correction item @ 00:20:25):
  every AI surface now visibly states which expert persona is primed, with
  a details popover.
