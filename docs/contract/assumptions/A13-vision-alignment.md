# Annex 3 (extension) — A13 — Long-term vision lock

- **Status:** `DRAFT — pending Sigma confirmation`
- **Contract reference:** Al Ayham written message dated 2026-06-04 (subject: *Sigma Platform – Updated Product Vision*); extends Annex 3 of the Service Agreement.
- **Lock window:** before the next cycle gate after `v1.0.0-acceptance`.

## 1. The vision (verbatim from Al Ayham, 2026-06-04)

> *"The long-term objective is to build a platform that connects:*
> *— BIM-based planning*
> *— Primavera schedules*
> *— Daily operational reporting*
> *— Contractual obligations (FIDIC)*
> *— PMBOK governance processes*
> *— AI-assisted analysis*
> *into a single governance workflow.*
>
> *The platform should progressively answer:*
> *— What deviated?*
> *— Why did it deviate?*
> *— Who owns the deviation?*
> *— What evidence supports the conclusion?*
> *— What contractual exposure exists?*
> *— What corrective action should be considered?*
>
> *The vision is evolving toward an AI-enabled Governance & Transformation
> Platform rather than a traditional project management application.*
>
> *For now, this does not change the Phase 1 objective."*

## 2. What this lock covers

- **Direction is acknowledged and recorded.** Future architectural choices
  must be defensible against this destination.
- **Scope is unchanged.** Phase 1 (the 8-cycle / 16-week / USD 5,000
  Service Agreement) closes at `v1.0.0-acceptance` with the deliverables
  listed in Annex 1. Nothing in this lock expands or accelerates Phase 1.
- **Extensibility is a contractual property.** The modular seams documented
  in ADR-0009 — Parser, Rule, Integration adapter, Decision, Summary — are
  the agreed plug-in shapes. New capabilities for the broader vision MUST
  enter through one of these or raise a fresh ADR. This is the architectural
  guarantee that "future expansion does not create constraints that would
  require rework later."

## 3. What this lock does NOT cover

| Item                                                | Treatment                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| BIM ingestion (IFC, Synchro, model linkage)         | Re-scope trigger per Annex 2. New cycle / new SoW.                          |
| Daily operational reporting feed                    | Re-scope trigger. Stub `stale-reporting.rule.ts` covers the gap rule only.  |
| Additional contract frameworks beyond FIDIC 2017/1999 (Red/Yellow) | Re-scope trigger; A09 lock stays authoritative for Phase 1.  |
| Root-cause classification + auto-routing            | Re-scope trigger.                                                           |
| Closed-loop corrective action tracking              | Re-scope trigger; audit trail in `decision_review` is the substrate.        |
| Multi-tenant / portfolio analytics                  | Re-scope trigger.                                                           |
| Custom dashboards beyond Cycle 4 + Cycle 8 surfaces | Re-scope trigger.                                                           |
| Specific vendor lock-ins (BIM platform, etc.)       | Each gets its own ADR when scoped.                                          |

## 4. Linkage

- **Architectural map:** [`docs/adr/0009-vision-alignment-and-extensibility.md`](../../adr/0009-vision-alignment-and-extensibility.md) — the per-module mapping of the six-question model to live code, the five plug-in shapes, and the scalability levers.
- **IP segregation (still in force):** [`A10-sigma-proprietary-logic.md`](A10-sigma-proprietary-logic.md) — Sigma's domain content stays in versioned `governance_policy.config` rows, never in source.
- **Integrations:** [`A11-integrations-final-list.md`](A11-integrations-final-list.md) — Phase 1 integration list is the locked baseline.

## 5. Confirmation signature

| Party                | Name         | Date | Signature |
| -------------------- | ------------ | ---- | --------- |
| Client (Sigma)       | Al Ayham     |      |           |
| Service Provider     | Khaled Ahmed |      |           |
