# Changelog

All notable changes to Sigma PMO are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); ADR references point at the
binding decision records under `docs/adr/`.

## 2026-06-09 — Wave 1 of the post-2026-06-08 re-scope

Captures the *"safe to build under any answer Al Ayham gives"* envelope from
the execution plan at `docs/meetings/2026-06-08-post-meeting-plan.md`
(sections 2, 3, 4.4, 5, 7). Every item below is additive, nullable on the
database, and does not touch the contracted Cycle 1-4 acceptance trail.

### Added

- **`Layer` enum** in `backend/src/common/enums.ts`
  (`ENGINEERING / PLANNING / GOVERNANCE / REPORTS / SIMULATION`). Wave 1
  uses it only on `Persona.layer`; reserved for `Alert.layer` /
  `Decision.layer` / `Evidence.layers` once cross-layer wiring lands
  (ADR-0012).
- **Capability flags** `canSimulate` and `canEditPersonas` on
  `ROLE_CAPABILITIES` (`backend/src/modules/auth/roles.enum.ts`), mirrored
  bit-for-bit in `frontend/lib/capabilities.ts`. Matrix:
  - `canSimulate` — every role except `contractor`.
  - `canEditPersonas` — `sigma_admin` only.
- **Six new canonical entities** (all extend `UuidEntity`; the append-only
  ones carry `businessKey` + `version` + `isCurrent` directly so no
  `TraceableEntity` migrations are needed):
  - `Persona` — versioned expert system prompt asset (ADR-0010).
  - `Scenario` — what-if sandbox fork keyed on `projectBusinessKey`.
  - `ClashItem` — Revit/BIM clash row with `proposedOptions` for the
    three-options solver mechanic from the meeting (§3.7).
  - `BoQ` — Bill of Quantities header, append-only.
  - `BoqItem` — BoQ line with optional `activityRef` for grounding.
  - `BaselineBuildJob` — record of one AI-driven P6 baseline build
    (entity-only; the MPXJ writer + Computer Use driver are Wave 2).
- All six entities are registered in `CANONICAL_ENTITIES` so TypeORM picks
  them up at boot.
- **`PersonasModule`** at `backend/src/modules/personas/` — CRUD with
  append-only versioning, disk seeder (`seedFromDisk()`) that reads the
  existing `backend/src/personas/*.md` files once on first boot, and
  `findByLayer` for the per-page resolver. Routes:
  - `GET /personas` — list current personas (any role).
  - `GET /personas/:slug` — fetch one by slug (any role).
  - `GET /personas/by-layer/:layer` — filter by layer (any role).
  - `POST /personas/:slug` — append a new version (`canEditPersonas` only).
- **`SimulationModule`** at `backend/src/modules/simulation/` — sandbox
  stub. Routes:
  - `POST /simulation/scenarios` — fork a scenario (`canSimulate`).
  - `GET /simulation/scenarios?projectKey=…` — list scenarios.
  - `POST /simulation/scenarios/:id/discard` — discard a scenario.
- Both modules wired into `AppModule`.
- **Tests** — `roles.enum.spec.ts` pins the capability matrix verbatim;
  `personas.service.spec.ts` covers `findByLayer` filtering, `upsert`
  version-bump on a prior row, and `upsert` v1 creation when no prior row
  exists.

### Deliberately deferred to Wave 2 (post-Al-Ayham sign-off)

- Any Anthropic SDK / Computer Use code (no client, no tool definitions, no
  `cache_breakpoint_id` wiring).
- Primavera MPXJ writer / P6 desktop driver / PMXML mapper.
- FIDIC letter generator and PMI org-chart auditor pipelines.
- Migrating any existing entity column to `NOT NULL` — all Wave 1
  additions are nullable so the rollout is reversible.
- `/admin/personas` and `/simulation/*` frontend pages (UI is Wave 3+).
- Snapshot population on `Scenario.fork()`, rule re-evaluation on the
  scenario branch, and the "promote to canonical" gate (all C5 work).

### Notes

- Persona seed files under `backend/src/personas/` are illustrative content
  shipped as **named, ruled assets**. Their wording is a first draft by
  Khaled and is expected to be revised by Al Ayham before any production
  use — see ADR-0010 §4.
- Persona IP ownership remains an open question (post-meeting plan
  question 5/6); ADR-0010 stays `Proposed` until it is resolved.
