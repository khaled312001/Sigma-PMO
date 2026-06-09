# ADR-0016 — BoQ as a canonical entity

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 1 (Data Foundation) — Wave 2 BoQ pipeline; carrier
  for Layer 2 (Planning author path) and Layer 3 (FIDIC claim quantification)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0001 (record architecture decisions), ADR-0003 (canonical
  model + append-only traceability + source-file immutability), ADR-0009
  (vision alignment & extensibility — five plug-in shapes), ADR-0010 (Persona
  system; the `planner-p6-25yr` persona is the principal consumer of BoQ
  line-level grounding), ADR-0012 §5 (where BoQ + BoqItem were first reserved
  as canonical entities for Wave 1), ADR-0012 §6 (Outbox event-type
  namespace, `planning.boq.ingested`).

## Context

The 2026-06-08 post-meeting plan put the Bill of Quantities at the centre of
three otherwise unrelated layers:

- **L1 — Engineering / Revit.** A clash on a structural element has a *cost*
  only when it can be mapped to one or more BoQ lines. Without BoQ-level
  evidence, the clash report is a count; with it, the clash report is a
  number.
- **L2 — Planning / Primavera (Author Path).** The planner persona is
  explicitly forbidden from inventing quantities or durations
  (see `planner-p6-25yr` persona rule, ADR-0010). The BoQ is its only
  legitimate quantity source — line `quantity × unit-rate-derived crew
  productivity` is the deterministic anchor under any AI-generated duration.
- **L3 — Governance / FIDIC.** An EOT or variation claim is quantified
  against BoQ lines (Sub-Clause 13 valuation, Sub-Clause 20 notice). The
  letter generator must point at exact BoQ rows in evidence, not at
  paraphrases.

ADR-0012 §5 already **reserved** the names `BoQ` and `BoqItem` as canonical
entities, with the constraint that *the entity ships in Wave 1, the importer
+ pipeline ships in Wave 2 (C2)*. ADR-0012 §6 also reserved the Outbox
event-type prefix `planning.boq.ingested` for cross-layer fan-out.

This ADR closes those Wave-2 commitments by **locking** the canonical shape,
the append-only versioning contract, the Excel ingestion format, the
activity-link semantics, and the currency default. It does not add new
entities beyond what ADR-0012 §5 reserved; it pins the contracts the rest of
the codebase already imports.

The ADR also exists because BoQ has, in practice, become the second-most
reused canonical entity in the system (after `Project`). Three of the five
plug-in shapes in ADR-0009 — Evidence carrier, Persona-grounding source, and
Outbox event payload — depend on it. Pinning its shape in an ADR (rather
than only in code comments) gives every later consumer a single document to
cite.

## Decision

We declare **BoQ a first-class canonical entity** in Layer 1, with the
properties below. Wherever this ADR and the existing code agree, the code is
the source of truth and this ADR documents it; wherever they disagree, the
ADR wins and the code is to be reconciled in a follow-up PR.

### 1. Two-entity canonical shape

The BoQ is a **two-row pattern**, matching the Project → Activity pattern
already used in ADR-0003:

- **`BoQ`** — document header. One row per `(project, version)`. Carries the
  `currency`, the (denormalised) `totalAmount`, the `sourceFileId` link to
  the immutable archived upload, and the optional `authoredBy` consultant
  name parsed from the cover band of the Excel file.
- **`BoqItem`** — one row per usable line in the document. Carries
  `itemNumber`, `description`, `unit`, `quantity`, `unitRate`, `amount`, and
  the optional `activityRef` (see section 4 below).

Both entities extend `UuidEntity` from
`backend/src/common/entities/base.entity.ts`, as is the existing repo
convention. Both rows are produced inside the **same TypeORM transaction**
as the `SourceFile` row and the Outbox event (see section 5); a domain crash
rolls all four back together.

Money columns use `DECIMAL(18,2)` for line amounts and totals (matching
ADR-0003) and `DECIMAL(18,4)` for `quantity` so unit fractions (e.g. `m³`
with three decimals) survive without coercion loss. The TypeORM driver
returns these as strings; consumers must coerce before arithmetic, per the
shared `common/coerce.ts` helpers introduced in ADR-0003.

### 2. Append-only versioning

The BoQ follows the **same append-only contract as every other canonical
entity** (ADR-0003 §2):

- `businessKey` on the BoQ header is the string `boq:<projectBusinessKey>` —
  one BoQ stream per project, regardless of how many revisions the
  consultant issues. The constant `BOQ_BUSINESS_KEY_PREFIX = 'boq:'` lives
  on `BoqIngestionService` as the single source of truth so cross-module
  readers never spell the prefix themselves.
- `version` starts at `1` on first ingest and increments by exactly `1` on
  every re-ingest for the same project. There is no "patch" or "minor"
  numbering — a re-uploaded BoQ is always a new version, even if only one
  cell changed, because the immutable source archive (ADR-0003 §3) holds
  the byte-exact diff already.
- `isCurrent = true` is enforced **at most once per `businessKey`** by the
  ingestion service: the prior current row is flipped to `false` inside the
  same transaction as the new row's insert. Re-ingesting the same bytes
  still produces a new version — idempotency is at the source-file storage
  layer (SHA-256 dedup), not at the canonical layer. This matches the
  ADR-0003 "no silent overwrite" rule: every upload that reaches the
  ingester produces a new row pair.
- `BoqItem` is **not** independently versioned. The line rows are
  rewritten in full on every BoQ version because (a) line-level
  `businessKey` design across heterogeneous consultants is unsolved at
  Pilot scale and (b) the prior version's lines remain queryable via
  `boqId` of the prior (now `isCurrent = false`) header. The
  *append-only* property therefore lives **on the header**, and the lines
  trace through `BoqItem.boqId → BoQ.id` to a header that itself has a
  full version history. Per-line append-only is an explicit Stage-2
  decision deferred to a future ADR.

Empty BoQs are rejected at ingest (`BoqIngestionService.ingest` raises
`UnprocessableEntityException` if the parser finds zero lines) so a stray
cover-only upload cannot replace a real BoQ.

### 3. Excel as the canonical wire format

The supported BoQ wire format is **Excel** — `.xlsx` and `.xlsm`. No other
format is accepted in Layer 1.

The choice is forced by the consultants we deal with: every BoQ delivered to
Sigma in the last twelve months has been an Excel workbook. PDF BoQs are
rejected at the parser boundary; consultants are asked to re-supply Excel.
This is documented as a hard constraint on the BoQ controller rather than as
a soft warning.

The parser (`BoqExcelParser`, single sheet) is shape-agnostic across:

- **Column header language** — Arabic and English headers map to the same
  canonical column names (`item`, `description`, `unit`, `quantity`,
  `rate`, `amount`, `activity`). The mapping table is the parser's only
  source-format coupling and is unit-tested per ADR-0003 §4.
- **Cover band metadata** — `currency` and `authoredBy` are parsed
  best-effort from the cells above the line grid. If neither is present
  the BoQ still ingests; `currency` falls back to the project default
  (see section 6), `authoredBy` falls back to `NULL`.
- **Quantity × rate sanity** — the parser computes
  `quantity × unitRate` and compares to the workbook's `amount` cell. A
  mismatch of more than 1% emits a per-line warning into the parsed
  document; the row still persists. This is a *warning*, not a *rejection*,
  because consultant workbooks legitimately round at intermediate columns,
  and refusing the upload over a rounding artefact would prevent
  governance signal from being captured.

The parser is a pure function over a `Buffer` — no DB access, no
filesystem write. The immutable archive (ADR-0003 §3) is taken by
`StorageService` **before** parsing; if the parser then crashes, the
bytes are already preserved for a re-parse attempt with a fixed parser.

The parser contract (`SourceParser` interface, ADR-0003 §4) is unchanged:
adding a future format (e.g. an alternative `.csv` BoQ) means writing one
new `BoqCsvParser` registered alongside `BoqExcelParser`, with zero
changes to `BoqIngestionService`.

### 4. Activity-link is optional and idempotent

Each `BoqItem` carries an optional **`activityRef: string | null`** — a
weak reference to `Activity.businessKey`. The field is the cross-grounding
hook for the planner persona and (later) the clash-cost mapper.

Three rules apply:

1. **Weak reference, not FK.** `activityRef` is a `varchar(64)` column
   storing an `Activity.businessKey` value. It is **not** a TypeORM
   relation and there is **no** referential-integrity constraint at the
   database level. The justification is that the BoQ and the schedule
   often arrive on different days — a BoQ may point at an
   `Activity.businessKey` that does not exist yet (the planner will create
   it in the next cycle) or at an activity that has since been deleted in
   a later schedule revision. A hard FK would block either of those
   workflows.
2. **Resolution is a join, not an FK lookup.** Consumers that need the
   activity row resolve it by querying
   `Activity where businessKey = boqItem.activityRef and isCurrent = true`
   at read time. The result may be empty; that's a known case and the
   consumer must handle it.
3. **Best-effort population at ingest.** The Excel parser writes
   `activityRef` if the workbook's "activity" column is present and the
   cell is non-empty; otherwise it writes `NULL`. There is **no fuzzy
   matching** — the value goes in verbatim. Cleaning up dirty
   `activityRef` values (typos, trailing whitespace) is a deterministic
   normalisation step inside the parser, never an LLM step.

This pattern is the third instance in the codebase of a "weak reference by
`businessKey`" (after `Decision.evidenceBusinessKey` and
`Alert.activityBusinessKey`), and it is now an established codebase
convention: every cross-entity reference that may legitimately dangle is a
`varchar(64)` of the target's `businessKey`, never a hard FK.

### 5. Outbox event on every ingest

Every successful BoQ ingest pushes exactly one row onto the cross-layer
Outbox (ADR-0012 §3), inside the same TypeORM transaction as the entity
writes. The event:

- **Event type:** `planning.boq.ingested` — reserved in ADR-0012 §6 under
  the `planning.` prefix because the BoQ is owned by the L2 (Planning)
  pipeline even though L1 and L3 are consumers. The constant
  `BOQ_INGESTED_EVENT_TYPE` lives on `BoqIngestionService` so no consumer
  has to spell the string.
- **`sourceLayer`:** `Layer.PLANNING` — same reason.
- **`payload`:** `{ boqId, projectBusinessKey, businessKey, version,
  itemCount, currency, totalAmount, sourceFileId, warnings }`. Opaque
  JSON, per the ADR-0012 §3 "no payload schema enforcement yet" rule. The
  shape is locked by `BoqIngestionService`'s unit tests, which any
  consumer is expected to read before subscribing.
- **`correlationId`:** the new `BoQ.id` so a downstream handler that
  later fails can be traced back to one specific BoQ version.

Consumers of this event in the current codebase: the
`PlannerBaselineBuilder` (Author Path), the future clash-cost mapper, and
the L3 letter-generator's evidence pre-fetcher. Each is a separate handler
inside the Outbox subscriber's dispatch table; per-handler isolation
(ADR-0012 §3 property 5) prevents one consumer's failure from blocking
another's progress.

### 6. Currency default is `AED`

The default currency on the BoQ header column is **`AED`**, declared at
the entity level (`@Column({ type: 'varchar', length: 8, default: 'AED' })`).
The default is taken when **neither** the workbook's cover band nor the
project's metadata supplies a currency.

Three reasons:

1. **Engagement scope.** Every active Sigma client today bills in AED;
   the commercial structure ($USD payments) is a separate concern that
   does not appear in BoQ ledgers.
2. **Single-currency BoQ.** A BoQ is a single-currency document. We do
   not support a per-line currency column, and we do not plan to — a
   multi-currency project models that as multiple BoQ headers under
   different project businessKeys, not as a mixed-currency single BoQ.
3. **Explicit override path.** The parser **does** read a currency code
   from the Excel cover band when present (USD, EUR, SAR, GBP), and the
   header row stores whatever the parser found. The default only fires
   when the parser found nothing; it is the floor, not the ceiling.

Cross-currency comparison (e.g. an AED BoQ against a USD claim letter) is
**not** handled at the canonical layer. Any consumer that needs to compare
BoQ amounts across currencies must do its own conversion at read time,
with its own FX-rate source. The canonical layer stores the amount and the
currency code and refuses to interpret further. This is consistent with
ADR-0003's deterministic-first rule — there is no canonical FX-rate
source, so there is no canonical conversion.

### 7. What this ADR deliberately does NOT do

- **No line-level append-only.** Per section 2, only the header is
  versioned; lines are rewritten per version. A future ADR may introduce a
  per-line `businessKey` and append-only line history, once cross-revision
  line tracking is required by a real consumer.
- **No PDF ingestion.** Per section 3.
- **No multi-currency lines.** Per section 6.
- **No fuzzy `activityRef` matching.** Per section 4 rule 3.
- **No referential integrity on `activityRef`.** Per section 4 rule 1.
- **No automatic LLM-driven cleanup of dirty BoQ rows.** The LLM
  boundary is not crossed inside the BoQ ingest path. LLM use against BoQ
  rows happens at the **persona** layer (planner, FIDIC expert) consuming
  already-canonical data, never at the ingest layer.

## Reason

Pinning BoQ as a canonical entity at the ADR layer (not only in code
comments) is load-bearing for three Layer-2/3 consumers — planner persona
grounding, clash-cost mapping, and FIDIC claim quantification — all of
which depend on a stable cross-module contract. The choices in this ADR
align BoQ with the existing canonical pattern (ADR-0003) and the existing
cross-layer plumbing (ADR-0012) without inventing a new mechanism: the
two-row header/line shape mirrors Project/Activity, the append-only
versioning reuses `businessKey + version + isCurrent`, the immutable
source-file archive reuses `StorageService`, the cross-layer notification
reuses the Outbox, and the activity link reuses the `varchar(64)
businessKey` weak-reference convention. Every choice is one the codebase
already makes elsewhere; the value of the ADR is that it lifts those
choices out of comments into a citable decision.

## Risk & mitigation

- **`activityRef` drift.** A BoQ revision may point at activity keys that
  later get deleted in a new schedule revision. *Mitigation:* the
  consumer-side resolver returns "unresolved" rather than throwing, and a
  weekly health query (introduced with the planner persona's audit
  pipeline) surfaces orphaned `activityRef` counts as a governance
  signal — orphans are *information*, not corruption.
- **Per-version line rewrite cost.** A 5,000-line BoQ re-ingested ten
  times stores 50,000 line rows. *Mitigation:* the per-line storage cost
  is negligible at Pilot scale, and the `(boqId)` index keeps current-
  version reads cheap; a Stage-2 ADR can introduce line-level history
  compression if portfolio scale demands it.
- **Excel parser fragility on hand-crafted workbooks.** Consultants vary
  in how they merge header cells, where they place totals, and whether
  they include a units-of-measure footer. *Mitigation:* per-line
  warnings (rather than rejections) on amount mismatch, plus a fixture
  suite under `BoqExcelParser` unit tests that grows as new workbook
  shapes appear in the wild.
- **Currency-default surprise.** A consultant who omits the currency
  cell on a non-AED workbook produces a BoQ silently tagged AED.
  *Mitigation:* the parser emits an explicit warning when it falls
  through to the default; the warning surfaces in the ingestion outcome
  and on the BoQ viewer.

## Replacement path

- **New wire format (CSV, etc.).** Write a new `SourceParser`
  implementation under `backend/src/modules/boq/parsers/` and register it
  alongside `BoqExcelParser`. No changes elsewhere.
- **Multi-currency BoQ.** A future ADR introducing per-line currency
  would add a `currency` column to `BoqItem` and turn the header
  `currency` into "BoQ default for lines that don't override". The
  append-only contract is unaffected.
- **Per-line append-only.** A future ADR may introduce a `BoqItem.
  businessKey` (e.g. `boq:<project>:<itemNumber>`) and migrate `BoqItem`
  to a `TraceableEntity`. Historical line rows from before the migration
  remain queryable via `boqId`; the new contract applies forward only.
- **Switch to a real broker.** The BoQ ingest service publishes to the
  Outbox, not to a broker directly. The broker swap planned in ADR-0012
  §"Replacement path" affects no code in this module.

## Consequences

- `BoQ` and `BoqItem` are now a **stable, citable** part of the canonical
  contract. Cycles C3–C7 may rely on the column set, the businessKey
  format, the activity-link semantics, and the currency default without
  re-deriving them from the implementation.
- The `planner-p6-25yr` persona's "do not invent quantities or durations"
  rule (ADR-0010) has a concrete enforcement surface: it must cite a
  `BoqItem` row by `(boqId, itemNumber)` or fail evidence validation.
- The clash-cost mapping work in C5 has a deterministic grounding source
  — clash → activity → BoQ line — that does not require any LLM
  intermediation.
- The FIDIC letter generator's claim-quantification step (C6) has a
  per-line evidence target, not just an aggregate `totalAmount`.
- The cross-layer Outbox event `planning.boq.ingested` is now a
  **published contract** — its payload shape is locked by this ADR + the
  service tests, and consumers across L1, L2, L3 may subscribe without
  coordinating with the producer.
- Wave-1's ADR-0012 §5 reservation of BoQ + BoqItem is now superseded by
  this ADR. ADR-0012 remains the source of truth for the Outbox shape
  and the cross-layer bus; ADR-0016 is the source of truth for the BoQ
  entity itself.

## Cite

- 2026-06-08 post-meeting plan, **section 3.7** ("جسور بين Layers") — BoQ
  as multi-layer evidence carrier.
- Same plan, **section 3.1** (Author Path) — planner grounding on BoQ.
- ADR-0003 — canonical model + append-only contract + immutable source-file
  archive reused verbatim here.
- ADR-0010 — planner persona rule against inventing quantities; BoQ is
  the only legitimate quantity source.
- ADR-0012 §5 — original reservation of `BoQ` + `BoqItem` as canonical
  entities; this ADR closes that reservation.
- ADR-0012 §6 — Outbox event-type prefix `planning.` claimed for BoQ
  events.
- `backend/src/modules/boq/boq-ingestion.service.ts` — the implementation
  this ADR pins.
- `backend/src/modules/canonical/entities/boq.entity.ts` and
  `boq-item.entity.ts` — the entity columns this ADR pins.
