# ADR-0010 — Per-page Expert Persona System

- **Status:** Proposed (pending Al Ayham sign-off on Persona IP ownership — open question 5 in the 2026-06-08 post-meeting plan)
- **Date:** 2026-06-09
- **Layer / Cycle:** Cross-cutting; introduced in the post-2026-06-08 re-scope wave (Wave 1 of execution, sits ahead of C2 in the revised cycle plan)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product + IP), TBD architect

## Context

On **2026-06-08** Al Ayham re-framed Sigma PMO from a "deterministic auditor with an
optional LLM rewriter" (the ADR-0006 boundary) into a **virtual senior engineering
and contracts team**. In his words from the meeting: *"the platform is not a tool —
it is a virtual senior team that creates, analyses, proposes, simulates and executes
under human approval."* The mechanic he described concretely is that Claude
**impersonates** a domain expert based on where the user is sitting in the product:
a 25-year Primavera planner on the planning page, a BIM clash analyst on the clash
page, a FIDIC expert with all five books memorised on a contracts page, a PMI org-
chart auditor on the compliance page, and a PMO report author on the monthly
report page.

This is captured verbatim in the post-meeting plan:

- **Section 3.3 — "Prompts الخبيرة الدائمة — Persistent expert system prompts per
  layer"** establishes the naming convention `<layer>.<sub-domain>.<role>.<locale>`
  (for example `planning.p6.expert.ar-AE`, `fidic.red_book.expert.en-AE`,
  `revit.clash.analyst.ar-AE`), the five required rules every prompt must follow
  (citation-only knowledge, constraints block, refusal policy, output schema,
  append-only versioning), where the personas live in the codebase
  (`backend/src/modules/prompts/library/` with the runtime registry in
  `backend/src/modules/prompts/`), the ownership model (*"خالد يصمم، أنا أراجع
  ونتكرر سوياً"*), and the four canonical families (Planner / Clash analyst /
  FIDIC expert / PMI auditor + a fifth Monthly Report Author).
- **Section 4.2 — "آلية النص الخبير لكل صفحة (Per-page system prompt
  mechanism)"** specifies the runtime resolution flow: page opens → frontend
  calls `GET /prompts/resolve?page=…&locale=…&projectId=…` → backend resolves the
  current `PromptVersion` for the persona slug, layers the role's constraints
  and the project snapshot summary on top, and returns the assembled system
  prompt plus a `cache_breakpoint_id` to drive Anthropic prompt caching.

The Sigma codebase today has none of this. `LlmService` carries a single
hard-coded one-liner; there is no registry, no versioning, no per-page binding,
no role-aware constraint injection. This ADR formalises the mechanism so it
becomes a first-class platform asset rather than a string in a service file —
without committing to vendor specifics that are still being negotiated
(Wave 1 of the execution plan ships **only what is safe under any answer
Al Ayham gives**).

This ADR is the architectural counterpart of ADR-0007 for personas: ADR-0007 made
governance policy first-class data; this ADR does the same for the platform's
voice. It is also an explicit named exception to the ADR-0006 boundary
("LLM stays a thin rewriter, never the source of governance state") for the
**advisory** surfaces of Layers 1, 3 and 4 — deterministic surfaces (the six
rules in `modules/rules/*`, the FIDIC mapping in `default-policy.ts`) remain
untouched.

## Decision

Introduce a **`Persona`** as a first-class canonical asset of the platform,
stored in the database, versioned append-only, edited via an admin surface, and
seeded from Markdown files living in source control. A persona is the
single, named, reviewable instance of "a Claude system prompt that gives the
platform a specific senior-expert voice on a specific page."

### 1. Canonical entity

`Persona` is a new canonical entity in `backend/src/modules/canonical/entities/`,
extending `TraceableEntity` from `common/entities/base.entity.ts` (so it inherits
the `businessKey` + `version` + `isCurrent` append-only invariants the rest of
the canonical model uses — see ADR-0003). Its shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | from `UuidEntity` |
| `businessKey` | varchar | persona slug, e.g. `planning.p6.expert.ar-AE` — stable across versions |
| `version` | int | append-only; edit produces a new row + flip prior `isCurrent = false` |
| `isCurrent` | boolean | exactly one row per `businessKey` may be `true` at any time |
| `name` | varchar | the slug as a human field (mirrors `businessKey`, kept for query ergonomics) |
| `title` | varchar | display title, e.g. *"خبير تخطيط Primavera P6 — خبرة 25 سنة"* |
| `layer` | enum `Layer` | one of `ENGINEERING / PLANNING / GOVERNANCE / REPORTS / SIMULATION` — see section 3 below |
| `description` | text | one-paragraph English description of what this persona is for |
| `systemPrompt` | longtext | the full prompt body, loaded from the seed `.md` file on first boot |
| `rules` | json (string array) | the persona's named constraint rules — citation-only, refusal policy, output schema, glossary lock, etc. |
| `modelTier` | varchar | `claude-opus` / `claude-sonnet` / `claude-haiku` — a tier label, not a model ID (so swapping the underlying model is a config change, not a schema change) |
| `temperature` | decimal | optional, defaults to `0.2` |
| `ownedByRole` | varchar | the role allowed to edit this persona (defaults to `sigma_admin`) |
| `seedSourcePath` | varchar, nullable | relative path of the Markdown file that seeded version 1; null for personas edited online with no seed equivalent |

`Persona` is **not** an ingested entity — it has no `ingestionRunId` or
`sourceFileId` in the conventional sense. To remain compatible with the
`TraceableEntity` contract without inventing a parallel base class, the
loader stamps both fields with sentinel values (`ingestionRunId =` the boot
loader's run id, `sourceFileId =` the seed `.md` file's SHA-256-derived id),
and `rawSource` holds the parsed Markdown front-matter plus body. Wave 1
keeps both columns **nullable on the database** (per the "no NOT NULL
migrations in Wave 1" rule from the execution plan); the loader populates
them in practice but the schema stays additive-only.

### 2. Append-only versioning

Edits never overwrite. The flow is identical to the canonical pattern from
ADR-0003: edit submits a new row with the same `businessKey`, the previous
current row flips to `isCurrent = false`, the new row is `isCurrent = true`.
Rollback is a flip, not a delete. Every Claude call records the exact
`(businessKey, version)` it ran under, so an answer the platform gave six
months ago can be reproduced bit-for-bit from `(persona version + project
snapshot)` alone — same audit guarantee Al Ayham praised in the meeting for
ingestion fingerprinting.

### 3. The `Layer` enum

Wave 1 introduces a single shared enum in `backend/src/common/enums.ts`:

```ts
export enum Layer {
  ENGINEERING = 'ENGINEERING',
  PLANNING    = 'PLANNING',
  GOVERNANCE  = 'GOVERNANCE',
  REPORTS     = 'REPORTS',
  SIMULATION  = 'SIMULATION',
}
```

These five values map to the revised layer map in section 5 of the post-meeting
plan. The same enum is used by `Persona.layer` today, and will later be used
by the multi-valued `Evidence.layers`, `Alert.layer`, and `Decision.layer`
fields once cross-layer wiring is unlocked (those entity changes are out of
scope for Wave 1). The enum is declared once, in `common/`, so when those
additions land they reuse it rather than duplicate it.

### 4. Seed files in `src/personas/`

The actual prompt text for the **five default personas** Wave 1 ships ships
as Markdown files under `backend/src/personas/` (one file per persona, name =
`<slug>.v1.md`):

- `planning.p6.expert.ar-AE.v1.md`
- `revit.clash.analyst.ar-AE.v1.md`
- `fidic.red_book.expert.ar-AE.v1.md`
- `pmi.org_chart.auditor.ar-AE.v1.md`
- `report.monthly.author.ar-AE.v1.md`

These files are the **seed content** — runtime always reads from the database.
On first boot the `PersonasModule` loader checks whether the `persona` table is
empty; if so, it parses each seed file's YAML front-matter into entity columns,
inserts the row, and never touches it again. Subsequent boots do nothing. Edits
made via `/admin/personas` (Wave 3) are persisted only to the database; the
Markdown files are reference history and the audit-by-PR surface for the **first**
version of each persona. This matches the request in the prompt that the persona
files be *"named, ruled, NAMED assets (the platform mechanic — content is
illustrative and Al Ayham reviews later)"*. All Arabic text inside the seed
files uses construction / PM-domain terminology per section 8 of the post-meeting
plan, not literal dictionary translation.

### 5. Modules

Two thin module skeletons are added now:

- **`PersonasModule`** at `backend/src/modules/personas/`, with:
  - `PersonasModule` (the NestJS module file, structured like
    `modules/ingestion/ingestion.module.ts`)
  - `personas.controller.ts` — `GET /personas`, `GET /personas/:slug`,
    `POST /personas/:slug` (edit = new version, admin only),
    `GET /personas/resolve` (returns the assembled current prompt body for a
    page slug + locale).
  - `personas.service.ts` — CRUD with the append-only flip, plus the loader
    that seeds from `src/personas/` on first boot.
  - `entities/persona.entity.ts` — the canonical entity (also exported via the
    canonical barrel so it shows up alongside the other canonical entities).
- **`SimulationModule`** at `backend/src/modules/simulation/`, **stub only** in
  Wave 1: the `Scenario` entity is added, a `SimulationController` with a
  `POST /simulation/scenarios` placeholder returns `501 Not Implemented` for
  any role lacking `canSimulate`, and `200` with an empty body otherwise. No
  copy-on-write yet, no rule re-evaluation, no UI. The module exists so the
  capability flag has somewhere to land and the entity exists for tests; the
  real sandbox lands in C5.

### 6. New canonical entities (Wave 1, all nullable, no NOT NULL migrations)

| Entity | Purpose | Base class |
| --- | --- | --- |
| `Persona` | this ADR's subject | `TraceableEntity` |
| `Scenario` | what-if branch from a snapshot (stub in Wave 1) | `TraceableEntity` |
| `ClashItem` | a single Revit clash row | `TraceableEntity` |
| `BoQ` | a Bill of Quantities document header | `TraceableEntity` |
| `BoqItem` | a single BoQ line | `TraceableEntity` |
| `BaselineBuildJob` | a record of an AI-driven Primavera baseline build | `TraceableEntity` |

All six are append-only by the same `businessKey` + `version` + `isCurrent`
pattern the rest of the canonical model uses, and all six follow the **never
group versioned entities by `project.id`** feedback rule — they group by
`businessKey`. Wave 1 ships the entities and a barrel export only; service
logic for `ClashItem` / `BoQ` / `BoqItem` / `BaselineBuildJob` arrives in
later cycles (C1.5 / C5 / C10 per the revised cycle plan).

### 7. Capability flags

`roles.enum.ts` gains two new capabilities, mirrored in
`frontend/lib/capabilities.ts`:

| Capability | Sigma Admin | Sigma Reviewer | Client | Consultant | Contractor |
| --- | --- | --- | --- | --- | --- |
| `canSimulate` | ✓ | ✗ (Khaled default — open question 13) | ✓ | ✓ | ✓ (own slice only) |
| `canEditPersonas` | ✓ | ✗ | ✗ | ✗ | ✗ |

`canSimulate` follows the matrix in section 7 of the post-meeting plan (all
roles except Sigma Reviewer; the Reviewer default is restrictive pending
Al Ayham's answer). `canEditPersonas` is admin-only — personas are platform
voice, not a per-tenant configuration surface.

### 8. Runtime resolution flow (per section 4.2 of the plan)

```
Frontend opens page  ──►  GET /personas/resolve?page=<slug>&locale=<l>&projectId=<id>
                          │
                          ▼
                 PersonaResolver
                          │  (1) look up current Persona by slug + locale
                          │  (2) inject role constraints block for caller's role
                          │  (3) inject project-snapshot summary block
                          │  (4) emit cache_breakpoint_id (Anthropic prompt caching boundary)
                          ▼
                 → { systemPrompt, cacheBreakpointId, personaBusinessKey, personaVersion }
                          │
                          ▼
Frontend calls Claude with system=<above> and the per-turn user payload AFTER the
breakpoint, so the persona stays cached for the 1-hour TTL where caching pays off.
```

Wave 1 ships the resolver returning a structured object; it does **not** wire
the actual Anthropic SDK call. That wiring lands in C3 alongside the Claude
provider work.

## Reason · Risk · Replacement (per the ADR-0001 contract)

### Reason

The 2026-06-08 meeting explicitly elevated per-page expert impersonation from
"a string in a service file" to a core product feature. Section 2.5 of the
post-meeting plan captures the exact gap: *"Prompt واحد Hard-coded في
`llm.service.ts`. لا يوجد سجل، لا نسخ، لا ربط بصفحة"* → *"كل صفحة لها Prompt
خبير دائم مسمّى وقابل للتحرير … كأصل من أصول المنصة بنُسَخ وحوكمة."*
Sections 3.3 and 4.2 then specify the asset shape and resolution mechanism
respectively. Without first-class persona storage, every later cycle in the
revised plan (C2, C3, C5, C6, C9a, C10, C11) is blocked on string editing in
a service file — that is not acceptable as a platform foundation.

### Risk

The two material risks are **prompt drift** and **vendor lock-in via prompts**.

*Prompt drift* — Al Ayham edits a persona on a Tuesday, the FIDIC adjudication
quality silently changes on Wednesday, nobody can answer "what changed." This
is exactly R4 in the post-meeting plan's risk register. Mitigation: the
append-only `version` + `isCurrent` columns are not optional; every Claude
call logs the exact `(businessKey, version)` it executed under; the admin
edit endpoint refuses an in-place update. Per-version metrics (output quality,
cache hit ratio, refusal rate) are kept on the call log so a regression after
an edit is detectable.

*Vendor lock-in via prompts* — the personas as currently scoped are tuned for
Claude's tool-use and prompt-caching semantics. Mitigation: the entity stores
`modelTier` as a **label** (`claude-opus` / `claude-sonnet` / `claude-haiku`),
not as a specific model ID; the resolver returns the assembled prompt as a
generic string; the actual SDK binding lives in `LlmService` (today)
/ `ClaudeService` (C3). Swapping a different provider is a `LlmService`
replacement and a one-time persona-content review, not a schema migration.

A third, smaller risk: **persona IP ownership is unresolved** (open question
5 / 6 in the meeting plan). This ADR ships the mechanism but does not assert
who owns the persona content. Status stays `Proposed` until Al Ayham signs
off on whether Sigma owns the personas outright, Khaled retains rights to
reuse them on other engagements, or ownership is joint.

### Replacement path

Because personas live in the database — not in source — replacing the
underlying LLM provider is a **configuration change**:

1. Add the new provider behind the existing `LlmService` interface.
2. Re-tune each persona's `systemPrompt` for the new provider's quirks via a
   normal admin edit (which produces `version = N+1` of each persona, append-
   only).
3. Flip `LlmService` to the new provider.

No schema migration, no rebuild, no loss of audit trail (the old persona
versions remain `isCurrent = false` and are still queryable for any past
Claude call's reproducibility).

Replacing the **mechanism itself** (for example, dropping per-page personas
in favour of a single platform-wide prompt — which would be a strategic
reversal of the 2026-06-08 decision) is a new ADR superseding this one,
and `Persona.isCurrent` flips to false on every row at once. The data
stays auditable in either direction.

## Consequences

- New canonical entity `Persona` exported from the canonical barrel
  alongside `Project`, `Activity`, `Alert`, etc.
- New canonical entities `Scenario`, `ClashItem`, `BoQ`, `BoqItem`,
  `BaselineBuildJob` added to the barrel; only `Persona` and `Scenario`
  have service logic in Wave 1, the rest are entity-only placeholders for
  later cycles.
- New `PersonasModule` with CRUD: read for any authenticated role, write
  (= new version) gated on `canEditPersonas` (sigma_admin only).
- New `SimulationModule` skeleton gated on `canSimulate`.
- New `Layer` enum in `common/enums.ts`, used by `Persona.layer` today and
  reserved for `Alert.layer` / `Decision.layer` / `Evidence.layers` later.
- New capability flags `canSimulate` and `canEditPersonas` on
  `roles.enum.ts`, mirrored in `frontend/lib/capabilities.ts`.
- Five seed persona Markdown files under `backend/src/personas/`,
  reviewable-by-PR for v1; later edits live in the database and are
  reviewable-by-version-diff in the admin UI (Wave 3).
- Unit tests cover: persona append-only invariants (edit produces a new
  row, prior current flipped to false, exactly one current per
  business key), capability matrix (only `sigma_admin` can edit personas;
  every role except contractor (and Sigma Reviewer per the open question
  default) can simulate), `Layer` enum closedness, seed loader idempotency
  (running it twice does not double-insert).
- `CHANGELOG.md` records the entity additions, the enum, the two new
  capability flags, and the seed file presence under a Wave 1 heading.
- **Wave 1 ships the mechanism + 5 seed personas + 1 capability flag pair
  + the two module skeletons.** Wave 2 wires the actual Claude SDK call,
  Anthropic prompt caching, and `cache_breakpoint_id` plumbing. Wave 3 ships
  the `/admin/personas` UI. None of Wave 2 / Wave 3 is in scope here.
- This ADR is a named, scoped exception to the ADR-0006 deterministic-first
  boundary on **advisory** surfaces only. The six deterministic rules,
  the FIDIC mapping, the rule engine, and the executive summary's
  deterministic `composeGrounded()` path remain governed by ADR-0006:
  facts come from the rules, personas only shape voice and proposals.
