# ADR-0020 — Source Registry (authoritative scientific + professional references)

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Cross-cutting (consumed by every persona-mediated
  surface). Wave 2 deliverable.
- **Decision owner:** Khaled Ahmed (Service Provider).
- **Reviewers:** Al Ayham (product — the citation policy is what makes the
  AI letters and reports defensible in front of a contractor or owner).
- **Related:** ADR-0001 (ADR contract), ADR-0006 (deterministic-first
  boundary — LLM stays a rewriter), ADR-0010 (Persona system — every
  persona must reference Sources), ADR-0018 (FIDIC Letter Drafter — citation
  enforcement gate), ADR-0019 (Monthly Narrative Report — citation
  enforcement gate).

## Context

The 2026-06-08 meeting raised a non-negotiable bar:

> *"بنستخدم … الأدلة والمخططات والكلام ده كله باستخدام الـ AI model … بناء على
> الواقع الحالي، يعني هي بتدرس مباشرة. لازم يكون عنده مراجعه بتاعته، عند الكتب،
> وعند المواد العلميه."*  
> *— Al Ayham, 2026-06-08 transcript, ≈ 22:08*

Every persona-mediated artefact the platform produces (FIDIC reply letter,
monthly narrative report, clash solution proposal, scheduling
recommendation, PMI org-chart compliance letter) MUST cite the
authoritative document it relies on. Without that, the system is a
generic-LLM wrapper that hallucinates clause numbers and PMBOK
references — exactly the failure mode Al Ayham flagged twice during the
meeting (≈ 5:00 and ≈ 22:12).

We need (a) a canonical, versioned catalogue of those authoritative
references, (b) a runtime enforcement mechanism that rejects any
persona response that fails to cite at least one of them, and (c) a
user-facing surface so the reviewer can drill from any citation back to
the source — same pattern as the existing evidence chain (ADR-0005).

## Decision

We introduce a **Source Registry** as a first-class platform asset.

### 1. The registry is data, not code

A `Source` canonical entity in `backend/src/modules/canonical/entities/`
captures every authoritative document the platform may cite. Schema:

| Column                | Notes                                                           |
| --------------------- | --------------------------------------------------------------- |
| `id` (UUID)           | primary key from `UuidEntity`                                   |
| `externalId`          | unique, human-readable slug (e.g. `fidic-red-2017`, `pmbok-7`)  |
| `family`              | enum: `FIDIC` / `PMI` / `ISO` / `AACE` / `BIM` / `PRIMAVERA` / `OTHER` |
| `title`               | full document title                                             |
| `latestEdition`       | edition + year string                                           |
| `publisher`           | issuing body                                                    |
| `year`                | publication year (integer)                                      |
| `url`                 | canonical link to the document (publisher's bookshop)           |
| `scope`               | one-paragraph description of what questions it answers + most-cited Sub-Clauses / Process Groups |
| `applicablePersonas`  | JSON array of persona slugs that may cite this source           |
| `verification`        | enum: `confirmed` / `verify` / `speculative`                    |
| `createdAt`           | from `UuidEntity`                                               |

Append-only at the row level — historical edition rows stay so a citation
made under PMBOK 6 still resolves after PMBOK 7 lands. Editing an
existing row is forbidden; new edition = new row with a related
`externalId` (`pmbok-7` supersedes `pmbok-6`; both stay queryable).

### 2. Seed file ships with the codebase

`backend/src/modules/sources/sources.seed.json` ships the curated
catalogue researched during the Wave 2 sourcing phase. The Wave 2 cut
covers:

- **FIDIC** (7 entries) — Red 2017, Red 1999, Yellow 2017, Yellow 1999,
  Silver 2017, Green 2021, Gold 2008. Each entry lists the most-cited
  Sub-Clauses so the persona can pin its reference precisely.
- **PMI** (2 entries) — PMBOK 7 (2021, principles-based) + PMBOK 6
  (2017, process-based; still widely used in MENA contracts).
- **ISO** (3 entries) — ISO 21502:2020 (replaced 21500), ISO 9001:2015,
  ISO 31000:2018.
- **AACE** (2 entries) — Recommended Practices 14R-90 (forensic schedule
  analysis) and 29R-03 (forensic delay analysis).
- **BIM** (2 entries) — BS EN ISO 19650 series, BuildingSMART IFC.
- **PRIMAVERA** (1 entry) — Oracle P6 EPPM Project Management User's
  Guide.

`SourcesService.seedFromCatalogue()` runs once at boot, upserts by
`externalId`. Idempotent. Adding a source = open a PR with a new entry
in the seed file; the seeder picks it up at next boot.

### 3. Personas reference the registry by `externalId`

Every persona Markdown file under `backend/src/personas/` includes a
`## Sources` block listing the `externalId` of each source it must be
prepared to cite. Examples:

```yaml
# planner-p6-25yr.md
Sources:
  - pmbok-7
  - aace-29r-03
  - oracle-p6-ppm-guide
```

The persona's `systemPrompt` instructs Claude to wrap any factual claim
with a `[SOURCE: <externalId>]` marker referencing one of those ids.
Claude does not invent ids — `ClaudeService.callPersona()` returns the
extracted list of citation ids alongside the response.

### 4. Runtime citation enforcement (the safety gate)

Two services consume Claude through the persona-mediated path and
**reject** responses that fail the citation gate:

- `LetterDrafterService` (ADR-0018) — every persisted `Letter.citations`
  array must contain at least one `externalId` resolving to a Source row.
  Drafts with empty `citations` throw `BadRequestException` before any
  DB write.
- `MonthlyReportService` (ADR-0019) — same contract on
  `MonthlyReport.citations`.

When `ClaudeService.isEnabled()` is `false` (no `ANTHROPIC_API_KEY`),
both services fall back to deterministic templates that cite a
deterministic, fixed Source id (`pmbok-7` for the monthly report,
`fidic-red-2017` for FIDIC letters). The citation gate is never
bypassed — even the deterministic fallback carries an `externalId`.

The `ClashSolutionProposer` (ADR-0015) does NOT enforce the gate at
write time because each clash option is advisory and may legitimately
fall back to "AI offline — operator must propose"; the PM/PD is the
human gate. Letters and reports go out under Sigma's name, so they get
the hard gate.

### 5. The `/sources` page surfaces the catalogue

A new frontend route `frontend/app/sources/page.tsx` lets any
authenticated user browse the catalogue, filter by family chip, and
follow the `url` to the publisher's bookshop. Every citation in
`/letters`, `/reports/monthly`, and `/clashes` deep-links to this page
filtered by `externalId`.

### 6. Read-only at the API for now

`SourcesController` exposes:

- `GET /sources` (canRead) — list, paginated
- `GET /sources/:externalId` (canRead) — single
- `GET /sources/by-family/:family` (canRead) — filter

No `POST`. Mutation = edit `sources.seed.json` + ship a release. This
matches the spirit of ADR-0007 (governance policy as data) but keeps
the source catalogue distinct from per-tenant policy — Sources are
**platform voice**, not tenant configuration.

## Consequences

- Every AI letter and report is anchored to a citable document; the
  reviewer is one click away from the publisher reference.
- Hallucinated clause numbers and PMBOK references can't survive the
  citation gate in `LetterDrafterService` and `MonthlyReportService`.
- Adding a new authoritative document = PR against `sources.seed.json` +
  a one-line addition to the relevant persona's `## Sources` block.
  No code change.
- The `/sources` page becomes the canonical landing target for any
  external auditor reviewing how the platform reaches its conclusions.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason** — Al Ayham's 2026-06-08 meeting raised the citation bar
  explicitly. The registry is the architectural answer.
- **Risk** — A persona references an `externalId` that isn't in the
  seed; the citation gate throws and the user sees a confusing error.
  Mitigated by:
  1. `SourcesService.seedFromCatalogue()` runs every boot — adding the
     id to the seed file fixes the next deployment.
  2. The Wave 2 seed already covers the FIDIC / PMI / ISO / AACE / BIM /
     Primavera surface that the 5 Wave 1 personas need.
  3. CI lint check (future): assert every persona's `## Sources` list
     resolves against the seed before merge.
- **Replacement path** — If we later move to a real reference manager
  (Zotero, Mendeley, custom CMS), the `externalId` slug carries forward
  unchanged; the entity gains an external system pointer and the seed
  becomes a mirror. The citation contract (every persona-mediated
  artefact carries at least one Source id) is preserved.

## What this ADR does NOT do

- It does NOT define a *legal* obligation for Sigma to follow the cited
  references — they are anchors for the AI's claims, not contracts.
- It does NOT cover non-textual references (raw drawings, photos,
  point-cloud scans). Those continue to flow through the existing
  evidence chain (ADR-0005).
- It does NOT replace the FIDIC mapping inside the governance policy
  (ADR-0007) — policy maps rule code → contractual clause; Sources is
  the registry of *which contractual document defines that clause.*
- It does NOT introduce a Source mutation API. PR-driven seed updates
  only, for now.
