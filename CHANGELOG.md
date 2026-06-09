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

## 2026-06-09 — Wave 2 of the post-2026-06-08 re-scope

Builds the AI infrastructure foundation on top of Wave 1's Layer enum,
capability flags, six canonical entities, and five seed personas. Every
non-deterministic surface is gated: the system continues to run
deterministic-only when `ANTHROPIC_API_KEY` is unset, every AI output
requires a human approval gate, and ADR-0011 (Computer Use safety) stays
`Proposed` until Al Ayham flips the answer on open question 6 — the
`BaselineBuildWorker` parks every job in `awaiting-enablement` until then.
No existing Cycle 1-4 acceptance trail is touched.

### Added

- **`ClaudeModule`** at `backend/src/modules/claude/` — thin wrapper over
  `@anthropic-ai/sdk` 0.102.0. Reads `ANTHROPIC_API_KEY` strictly from
  `process.env`; when missing, `isEnabled()` returns `false` and every
  call throws a helpful "deterministic-only mode" error rather than
  silently returning bogus content. Persona system blocks are passed with
  `cache_control: { type: 'ephemeral', ttl: 3600 }` per the post-meeting
  plan §4.3.
- **`SourcesModule`** at `backend/src/modules/sources/` — curated catalogue
  of authoritative scientific + professional references (FIDIC Red / Yellow
  / Silver books, PMBOK editions, ISO 21500 / 21502, AACE recommended
  practices, BIM ISO 19650 standards). Seeded from `sources.seed.json`.
  `Source` entity re-exported via the canonical barrel. Every persona
  system call must cite at least one `Source` — claims without sources
  are flagged downstream. Route: `GET /sources`.
- **`OutboxModule`** at `backend/src/modules/outbox/` — durable cross-layer
  bus (ADR-0012, Stage 1). `OutboxEvent` is an append-only MySQL row;
  producers inject `OutboxService` and push from inside their own
  transaction, consumer polls. No priority chain yet — ADR-0013 (layer
  priority policy) stays `Proposed` pending Al Ayham. `OutboxEvent`
  re-exported via the canonical barrel.
- **`ClashesModule`** at `backend/src/modules/clashes/` — Navisworks / Revit
  Excel parser writing `ClashItem` rows and pushing one
  `engineering.clash.ingested` event per row onto the cross-layer Outbox.
  Includes `ClashSolutionProposer` (AI-driven, advisory output only — never
  writes canonical state). Routes: `POST /clashes/ingest`,
  `GET /clashes`, `POST /clashes/:id/propose`.
- **`BoqModule`** at `backend/src/modules/boq/` — Excel parser populating
  `BoQ` + `BoqItem` entities (append-only via `businessKey` + `version`).
  Pushes `planning.boq.ingested` on every successful run. Routes:
  `POST /boq/ingest`, `GET /boq?projectKey=…`.
- **`BaselinesModule`** at `backend/src/modules/baselines/` — stub worker
  that accepts a `BaselineBuildJob` and parks it in `awaiting-enablement`
  until ADR-0011 status flips on Al Ayham's open question 6. No Computer
  Use surface, no MPXJ XER writer, no P6 desktop driver — all gated. Route:
  `POST /baselines/jobs`, `GET /baselines/jobs/:id`.
- **`LettersModule`** at `backend/src/modules/letters/` — FIDIC `Letter`
  drafter (post-meeting plan §3.5, ADR-0010 §6, ADR-0011 §3). Persists
  draft replies + compliance letters via the `fidic-redbook-expert`
  persona, enforces the mandatory citation footer against the
  `SourceRegistry`, and gates status flips behind a human-approval click.
  No `send` route — auto-send stays frozen until ADR-0011 flips on Q6.
  Includes `LetterPdfService` (pdf-lib renderer). `Letter` re-exported via
  the canonical barrel. Routes: `POST /letters/draft`,
  `POST /letters/:id/approve`, `GET /letters/:id/pdf`.
- **`MonthlyReport` entity** in the canonical barrel + Monthly Narrative
  Report pipeline — deterministic facts (Snapshot + Alerts + Decisions +
  BoQ + ClashItems) composed by the `report.monthly.author` persona into
  PDF via pdf-lib. Owner / PD / Contractor views per §3.6.
- **`@anthropic-ai/sdk` 0.102.0** added as a direct dependency.
- **`.env.example`** documents `ANTHROPIC_API_KEY` (empty by default) with
  an explicit "deterministic-only mode when unset" comment, plus the
  `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_DEFAULT_TIER`,
  `ANTHROPIC_MAX_TOKENS`, `ANTHROPIC_CACHE_TTL` knobs.
- **Three new ADRs:**
  - `0010-persona-system.md` — Persona as canonical, named, versioned
    asset. `Proposed` until IP ownership question is resolved.
  - `0011-computer-use-safety.md` — 12 guardrails required BEFORE any
    Computer Use code lands. `Proposed` until Al Ayham flips Q6.
  - `0012-cross-layer-bus-stage-1.md` — Layer enum + Outbox + append-only
    cross-layer event log. `Accepted` for Stage 1; priority chain deferred.
- **Tests** — `ClaudeService` mocked end-to-end (no live API calls in CI);
  `SourceRegistry` seed integrity test; `BoqIngestionService`,
  `ClashIngestionService`, `ClashSolutionProposer`, `BaselineBuildService`,
  and `LetterDrafterService` unit tests with mocked Anthropic client.
  Integration tests skip when `ANTHROPIC_API_KEY` is unset.

### Fixed

- `boq-excel.parser.ts` — cast ExcelJS `CellValue` union via `unknown`
  before probing as `Record<string, unknown>`. `CellSharedFormulaValue`
  lacks the string index signature and TS 5.x flagged the direct cast.

### Forbidden in Wave 2 (kept gated)

- Any Anthropic Computer Use surface — waits for ADR-0011 status flip on
  Q6. `BaselineBuildWorker` parks every job in `awaiting-enablement`.
- Any Primavera MPXJ XER writer — waits for license decision.
- Auto-send of any letter or monthly report — every AI output goes
  through a human approval gate.
- `NOT NULL` migrations on any existing column — all Wave 2 additions are
  nullable so the rollout stays reversible.

### Notes

- `ANTHROPIC_API_KEY` is read strictly from `process.env`; it is never
  hard-coded. With the variable unset, the platform runs the full Wave 1
  deterministic feature set and every Wave 2 AI surface returns a typed
  "deterministic-only mode" response.
- Every persona system call cites at least one `Source` from the
  `SourceRegistry`. Claims without a source are flagged in the response
  metadata for the human reviewer.
- All Arabic strings on Wave 2 surfaces use construction-industry domain
  terminology (FIDIC clause language, P6 vocabulary, Revit clash terms),
  not literal translation, per the post-meeting plan §2.12.
