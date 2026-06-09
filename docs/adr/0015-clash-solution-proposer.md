# ADR-0015 — Clash Solution Proposer (advisory output + mandatory human pick + cited evidence)

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 1 (Engineering / Revit / BIM) — Cycle C5
  (SolutionProposer + Simulation infrastructure)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0003 (canonical model & append-only traceability),
  ADR-0005 (evidence chain & confidence), ADR-0010 (Persona system —
  `revit.clash.analyst.ar-AE`), ADR-0011 (Computer Use safety),
  ADR-0012 (Cross-Layer Information Bus Stage 1 — `engineering.clash.*`
  event prefix and `ClashItem` / `BoQ` / `BoqItem` canonical entities),
  ADR-0013 (Layer Priority Policy — forthcoming, deferred), ADR-0014
  (Simulation sandbox semantics — forthcoming)

## Context

The 2026-06-08 working session with Al Ayham elevated Revit clash handling
from a future R&D bullet to the first concrete deliverable of Layer 1's
**advisory** surface. Plan section 3.3 names the persona
(`revit.clash.analyst.ar-AE`) and pegs Al Ayham's project-volume estimate
at **~100 clash points per medium-sized project** across the four
disciplines (electrical, mechanical, architectural, structural) — this is
the sizing anchor for queue depth and Opus budget. Plan section 5
(Layer 1 row) then specifies the contract:

> **المُخرَجات** — لكل اشتباك: 3 SolutionProposal مع time/cost deltas +
> Coordination requirements. لمَّا يُختار حل → SimulationRun بأثر الجدول
> والتكلفة.

This ADR locks **what a SolutionProposal is**, **what it is allowed to
do on its own**, and **what evidence it must cite**. It does **not**
specify the Simulation sandbox copy-on-write semantics (those land in
ADR-0014), nor the Layer Priority resolution for cross-layer effects
(those land in ADR-0013 and continue to block the act of *committing* a
proposal — see Consequences below).

The three forces this ADR resolves:

1. **Advisory vs. authoritative.** Claude is being asked to read a clash
   list, look across BoQ, schedule, and discipline rules, and produce
   ranked engineering interventions. The persona's competence is bounded
   by the document corpus on the day of the call; the canonical truth
   (BoQ revision, baseline) is owned by humans and contracts. A
   SolutionProposal that auto-commits would let a single Claude call
   move dates in Layer 2 and cost in BoQ — which crosses the bright line
   ADR-0011 drew around Computer Use, and pre-empts ADR-0013. This ADR
   locks the proposer as **advisory-only**.
2. **Pick-before-commit.** Plan section 3.4 ("وضع المحاكاة") says
   choosing a clash solution is the canonical trigger for a
   `SimulationRun` on a `Scenario` branch — not a canonical write. The
   only path from "Claude proposed 3 options" to "BoQ/schedule changes"
   is: a human with role-appropriate capability picks one option, the
   pick creates a Scenario, the Scenario runs through the simulation
   pipeline, and **only** the existing Promote-to-canonical gate (Admin
   + signature) can ever land it on canonical truth. This ADR makes
   the human pick a precondition encoded in the entity state machine
   itself.
3. **Citation as a first-class field.** Plan section 3.3 lists the
   persona's required attachments as *"قائمة الاشتباكات، BoQ،
   الرسومات."* If the proposer says "cost delta = +AED 240,000 and
   schedule delta = +6 working days," the consumer must be able to
   click through to the exact BoQ line(s) the cost came from and the
   exact schedule activity(ies) the duration came from. ADR-0005
   already established Evidence as the universal traceability primitive;
   this ADR makes BoQ and Schedule citations **mandatory** fields on
   every proposal — not optional, not "Claude SHOULD cite", but a
   write-time validation that rejects a proposal lacking either.

## Decision

The Clash Solution Proposer is locked as an **advisory** service that
produces exactly 3 ranked `SolutionProposal` rows per `ClashItem`, never
writes to canonical truth on its own, requires a human pick before any
downstream `SimulationRun` may start, and refuses to persist a proposal
that does not cite at least one `BoqItem` (cost basis) and at least one
`Activity` businessKey (schedule basis) as Evidence.

### 1. Advisory-only output — what the proposer is, and is not

The proposer is a NestJS service `ClashSolutionProposerService` living at
`backend/src/modules/engineering/clash-solution-proposer.service.ts`. It
exposes one entry point:

```
proposeSolutionsFor(clashItemId: string, opts: { runId: string })
  → Promise<SolutionProposalSet>
```

Hard constraints enforced by the service contract:

| Constraint | Mechanism |
| --- | --- |
| **Output cardinality is exactly 3.** Not 2, not 4. Claude is prompted for 3; if it returns a different count the service rejects the response with `ClashProposerOutputContractError` and the call is retried once. Persistent contract violation surfaces as a Confidence-low warning per ADR-0005 §confidence handling, and **no** `SolutionProposal` rows are persisted. | Strict tool-use schema (per plan section 4.3) + service-side count assertion before transaction commit. |
| **No canonical write.** The service has **zero** write access to `Activity`, `BoQ`, `BoqItem`, `Resource`, `ResourceAssignment`, `Report`. The DI graph wires it with a *read-only* repository handle for those entities; attempting a write at runtime throws `CanonicalWriteFromAdvisoryServiceError`. | TypeORM repository wrapping + module-level provider override that rejects `save` / `update` / `remove` on canonical repositories when the call stack originates from `engineering` advisory services. |
| **No Layer 2 / Layer 3 side effect.** The service publishes exactly one Outbox event — `engineering.clash.proposal.created` per ADR-0012 §6 — and no other event type. It does not call Persona resolvers for other layers, does not enqueue planning jobs, does not draft FIDIC letters. Cross-layer effects are downstream of the human pick (section 3 below), not of the proposal itself. | Outbox event type allowlist on the producing module's tests. |
| **No `SIMULATION` write.** The proposer runs on the canonical `ENGINEERING` slice — it reads from the live `ClashItem`, the live `BoQ`/`BoqItem`, and the live `Activity` set. It does **not** create a `Scenario`. Scenario creation is the human pick's job, per section 3. | `Scenario` repository is not in the proposer's DI graph at all. |

The output shape of `SolutionProposalSet`:

```ts
interface SolutionProposalSet {
  clashItemId: string;            // FK to ClashItem (ENGINEERING layer)
  runId: string;                  // the IngestionRun / advisory run that produced this set
  proposedAt: Date;
  personaBusinessKey: string;     // e.g. 'revit.clash.analyst.ar-AE'
  personaVersion: number;         // pinned per ADR-0010 — drift-detectable
  proposals: [SolutionProposal, SolutionProposal, SolutionProposal];
  status: 'AWAITING_HUMAN_PICK';  // initial state, see section 3
}

interface SolutionProposal {
  rank: 1 | 2 | 3;                // Claude's own ranking; UI may resort but
                                  // rank is persisted as Claude returned it
  summary: string;                // one-paragraph human-readable description
  coordinationRequirements: string[]; // which disciplines must coordinate
  timeDeltaDays: number;          // signed; positive = adds duration
  costDeltaAed: number;           // signed; positive = adds cost
  confidence: number;             // ∈ [0,1], per ADR-0005 conventions

  // Mandatory citations — see section 4 below.
  boqCitations: EvidenceCitation[];      // ≥ 1 required
  scheduleCitations: EvidenceCitation[]; // ≥ 1 required
  drawingCitations: EvidenceCitation[];  // ≥ 0 — encouraged, not required
}
```

`SolutionProposal` is persisted as a row in `clash_solution_proposal`
keyed by `(clashItemId, runId, rank)`. The set is append-only by run:
re-running the proposer for the same `ClashItem` creates a **new**
`runId` with three new rows; existing rows are never updated. The
"current" set for a clash is `MAX(runId)`, exposed through the canonical
read API.

### 2. The Persona contract (Claude side)

The proposer uses `revit.clash.analyst.ar-AE` (and the `en-AE` variant)
per ADR-0010. The system prompt body — owned by Al Ayham, edited as
versioned rows in `Persona` — declares the persona's three hard rules
in the persona text itself:

1. *"You produce exactly 3 ranked options. Never 2, never 4."*
2. *"You cite the BoQ line numbers and schedule activity codes you
   reasoned from. A claim without a citation is forbidden."*
3. *"You are advisory. You never claim authority over the BoQ or
   schedule. Your output is a recommendation for a human reviewer."*

These three sentences are duplicated in the persona prompt and in the
service-side validation. Belt-and-braces is deliberate: prompt drift
(ADR-0010 §Risk) means we cannot rely on prompt-only enforcement;
service-side validation is the load-bearing guarantee.

The Claude call uses strict tool-use with a JSON schema matching
`SolutionProposalSet` so that malformed responses fail fast per plan
section 4.3 and per the existing ADR-0005 confidence-low handling.

### 3. Mandatory human pick before commit

A `SolutionProposalSet` starts in state `AWAITING_HUMAN_PICK`. The only
state transitions allowed are:

```
AWAITING_HUMAN_PICK ── pickProposal(rank, userId) ──► PICKED
AWAITING_HUMAN_PICK ── dismiss(userId, reason)    ──► DISMISSED
PICKED              ── (terminal — Scenario lifecycle takes over)
DISMISSED           ── (terminal — no downstream effect)
```

`pickProposal` is the single, narrow door through which a proposal can
ever cause downstream work. It is implemented on
`ClashSolutionProposalsController` as
`POST /engineering/clashes/:clashId/proposals/:runId/pick` with body
`{ rank: 1 | 2 | 3 }`. Its server-side preconditions:

1. **Capability check.** The caller's role must hold one of the
   capabilities permitted to pick clash solutions per plan section 5
   Layer 1 row: `Admin`, `Client`, or `Consultant`. `Contractor` may
   propose but not pick. `Sigma Reviewer` is read-only by definition
   (per the same row); pick attempts return `403`.
2. **Set must be current.** If a newer `runId` exists for the same
   `clashItemId`, the older set is implicitly stale; pick returns `409
   Conflict` with the new `runId` in the body. This forecloses the race
   where a reviewer picks an option that the persona has already
   superseded.
3. **No prior pick.** A `SolutionProposalSet` admits exactly one pick
   in its lifetime; a second pick returns `409` with the original
   `PICKED` row.
4. **Atomic side effect: Scenario creation.** Inside the **same TypeORM
   transaction** as the state flip to `PICKED`, the service creates a
   new `Scenario` row (`layer = SIMULATION`, `parentSnapshotId = ` the
   current canonical snapshot id, `createdBy = ` the picker, default
   30-day expiry per ADR-0010 §Scenario default and plan section 3.4
   point 6). The pick's response body returns the new `scenarioId`.
5. **Outbox publish.** In the same transaction, an Outbox event of type
   `engineering.clash.proposal.picked` is inserted with payload
   `{ clashItemId, runId, rank, scenarioId, pickedBy }`. Downstream
   subscribers — the simulation runner first, the planning Persona
   second — react from the Outbox, not from in-process calls. This is
   the Stage 1 Bus contract from ADR-0012 §3.

What this ADR explicitly does **not** authorise:

- **No path from `PICKED` to canonical truth that bypasses the existing
  Promote-to-canonical gate.** A picked proposal lives on a `Scenario`
  branch and is governed by ADR-0014 simulation semantics. Promoting
  back to canonical remains an Admin + signed action, unchanged by this
  ADR.
- **No cross-layer commit.** Even after pick, the schedule delta does
  not write into Layer 2 canonical, and the cost delta does not write
  into BoQ canonical. Both effects are simulated on the Scenario branch
  only. Real cross-layer effects require ADR-0013 (Layer Priority
  Policy), which remains the blocker per plan section 6 and per
  ADR-0012's Stage 2 deferral. **C5 ships the proposer + the pick +
  the scenario creation; it does not ship cross-layer commit.**

### 4. Citation policy — BoQ and Schedule are mandatory

This is the load-bearing trust property of the whole feature, so it is
codified at three layers: persona, validation, and storage.

#### 4.1. The persona text requires citations

The `revit.clash.analyst.ar-AE` Persona's system prompt — version
controlled per ADR-0010 — contains the explicit sentence: *"Every
cost figure you produce must be tied to a `boqItem.businessKey`. Every
schedule figure you produce must be tied to an `activity.businessKey`.
A figure without a citation is invalid and you must refuse to emit
it."*

#### 4.2. The service refuses uncited proposals

`ClashSolutionProposerService.persist()` runs the following validation
before opening the transaction. Failure of any check throws
`ClashProposalCitationError` and the entire set is rejected (Claude is
retried once per plan section 4.3 retry policy):

| Check | Rule |
| --- | --- |
| BoQ citation count | `proposal.boqCitations.length >= 1` for **each** of the 3 proposals. |
| BoQ citation resolution | Every `boqCitations[*].businessKey` must resolve to a current `BoqItem` row on this project (FK-style check, but via `businessKey` per the Feedback memory rule — never via numeric `id`). |
| Schedule citation count | `proposal.scheduleCitations.length >= 1` for **each** of the 3 proposals. |
| Schedule citation resolution | Every `scheduleCitations[*].businessKey` must resolve to a current `Activity` row on this project, again via `businessKey`. |
| Cost-without-citation | If `proposal.costDeltaAed !== 0`, at least one `boqCitations[*]` row is required (already covered by the count rule, but the error message points to the cost line for diagnostics). |
| Time-without-citation | If `proposal.timeDeltaDays !== 0`, at least one `scheduleCitations[*]` row is required. |
| Drawing citations | Encouraged. Not enforced. Drawings are evidence that aids review but is not contractually load-bearing the way BoQ and schedule are. |

#### 4.3. Citations land in the Evidence table

Each citation row is also written as an `Evidence` row per ADR-0005,
with the multi-valued `Evidence ↔ Layer` join from ADR-0012 §2 tagging
the BoQ citation with **both** `ENGINEERING` (the clash reasoner used
it) **and** the layer the evidence object inherently belongs to — for
BoQ this is typically also Engineering, but for a schedule activity
citation the evidence will be tagged `ENGINEERING` and `PLANNING`
simultaneously, since the planning reasoner will need the same row when
the Scenario runs through C5's simulation. This is the exact case plan
section 3.7 named ("a single BoQ line legitimately serves Engineering,
Planning, and FIDIC at once") and ADR-0012 §2 designed for.

The `Evidence` rows produced by a proposal carry:

- `sourceType = 'CLASH_PROPOSAL'`
- `runId =` the advisory run id that produced the proposal set
- `personaBusinessKey = 'revit.clash.analyst.ar-AE'`
- `personaVersion =` the pinned version that ran
- `confidence =` Claude's reported per-proposal confidence
- `layers = [ENGINEERING, ...]` per the join-table rule above

Result: ADR-0005's existing one-call evidence package
(`GET /api/governance/alerts/:id/evidence` and the parallel proposal
endpoint `GET /engineering/clashes/:clashId/proposals/:runId/evidence`)
returns the full chain — proposal → BoQ line(s) → Schedule activity(ies)
→ ingestion run → source file SHA-256 → confidence score — without any
follow-up query. This is the property that makes the proposer's output
auditable, and it is the property that makes "advisory" honest: a
reviewer never has to take Claude's word for a number.

### 5. Outbox event reservations

Per ADR-0012 §6, the `engineering.` prefix gains two event types from
this ADR:

| Event type | When | Payload |
| --- | --- | --- |
| `engineering.clash.proposal.created` | A `SolutionProposalSet` was persisted in `AWAITING_HUMAN_PICK`. | `{ clashItemId, runId, proposalSetId, personaBusinessKey, personaVersion }` |
| `engineering.clash.proposal.picked` | A human picked a rank; `Scenario` was created in the same transaction. | `{ clashItemId, runId, rank, scenarioId, pickedBy, pickedAt }` |

No other Outbox event type is reserved for the proposer in C5. A
`dismissed` event is **not** reserved in this ADR: dismissal is a
local action with no downstream subscriber and so it does not need
to be on the bus.

### 6. What this ADR deliberately does NOT do

- **No simulation pipeline.** The pick creates a `Scenario`. What
  happens next — the actual rule re-evaluation on the Scenario branch,
  the planning Persona's reaction to the schedule delta, the Diff vs
  Canonical view — is owned by ADR-0014 (Simulation sandbox semantics).
  C5 ships both this ADR and ADR-0014 together, but the boundary
  between them is clean: this ADR ends at "Scenario row exists, Outbox
  event fired."
- **No cross-layer commit logic.** Picking option 2 does **not**
  update Layer 2's baseline. The simulated effect lives on the
  Scenario branch until the Promote gate is invoked, and the
  cross-layer commit (a clash pick moving a Primavera activity date on
  canonical) remains blocked on ADR-0013 (Layer Priority Policy). This
  is the same block plan section 6 already records for C5 and C6.
- **No new role.** Pick capability is not a new capability flag; it
  reuses the role rules from plan section 5 Layer 1 row directly. If
  Al Ayham later asks for a separate `canPickClashSolution` capability
  (e.g. to forbid Consultant pick without Client co-sign), that is an
  additive change at the capability layer, not a change to this ADR.
- **No bulk pick.** The pick endpoint is per-clash. A "pick option 1
  for all 100 clashes at once" affordance is explicitly out of scope —
  it would defeat the human-review property of the gate.

## Consequences

- C5 is unblocked **for the proposer + pick + scenario-creation
  slice**, and ships sitting on the ADR-0012 foundation cleanly. C5's
  *cross-layer commit* sub-slice remains blocked on ADR-0013, as plan
  section 6 already records.
- The advisory-only property of the proposer makes it safe to ship
  before ADR-0013 lands: a misbehaving proposer can produce nonsense
  options, but it cannot move a date or a cost on its own; the worst
  outcome of a bad proposal is wasted reviewer attention, never
  silent corruption.
- The mandatory-citation property gives Al Ayham (and any third-party
  auditor reviewing a clash pick months later) a complete reasoning
  chain in one click. This is the same trust property ADR-0005
  established for Layer 2 alerts, now extended to Layer 1 advisory.
- The Persona drift risk from ADR-0010 §Risk applies here in
  amplified form: a Persona edit that loosens the citation rule would
  silently change proposer behaviour. Mitigation: the citation
  validation is enforced **service-side** (section 4.2) not only in
  the prompt, and the per-Persona-version output-quality metrics from
  ADR-0010 §Risk include "% of proposals rejected at citation
  validation" as a regression indicator.
- The 30-day Scenario expiry from ADR-0010 §Scenario default applies
  to scenarios created by `pickProposal`. Picked-but-never-promoted
  proposals auto-expire and their scenarios are pruned per the
  standard simulation hygiene rule. The proposal row itself is
  append-only canonical evidence and is **not** pruned — only the
  Scenario branch is.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** The 2026-06-08 meeting put clash handling on Layer 1's
  critical advisory path (plan section 5 Layer 1 row), with the
  persona contract already nailed down by plan section 3.3 and the
  Simulation gating already nailed down by plan section 3.4. The
  remaining question — "what stops Claude from quietly moving a date
  in P6 because a Revit clash got resolved?" — is answered by three
  hard rules: advisory-only output (no canonical write capability in
  the DI graph), mandatory human pick (state machine refuses
  downstream effect without a `PICKED` transition), and mandatory
  citations (no figure without a BoQ/Schedule businessKey). Each rule
  is independently sufficient to block the worst failure mode; all
  three together make the failure unreachable.
- **Risk.**
  - *Citation gaming.* Claude may produce a BoQ citation that is
    technically valid (resolves to a current `BoqItem`) but
    irrelevant to the proposal's cost claim. Mitigation: per-proposal
    confidence score (ADR-0005) plus the per-Persona-version output
    metric ("% picks reversed by Admin during simulation review") so
    the regression is detectable; deeper structural enforcement (e.g.
    "the cited `BoqItem.itemCost * inferred multiplier` must be
    within X% of `costDeltaAed`") is deferred to a Stage 2 hardening
    ADR once we have pilot data on whether this failure actually
    happens.
  - *Reviewer rubber-stamping.* The "mandatory pick" property is only
    as strong as the reviewer's attention. If reviewers click "pick
    option 1" reflexively on a 100-clash queue, the human gate
    degenerates into noise. Mitigation: the UI surface (a separate
    design doc) presents the three options side-by-side with
    citations expanded by default and a confirmation step on
    `costDeltaAed > 100,000` or `timeDeltaDays > 5` (these thresholds
    are a Khaled default; Al Ayham may tune in review). Behavioural
    mitigation; not load-bearing in this ADR.
  - *Persona prompt rewrite weakens the rules.* The three persona
    sentences (advisory, three options, mandatory citation) are
    duplicated by the service-side validation precisely so that a
    prompt edit alone cannot loosen them. Risk remains that a
    well-meaning prompt edit changes the *flavour* of the output (e.g.
    fewer coordination requirements listed). Mitigation: the
    `personaBusinessKey + personaVersion` is pinned on every
    proposal row, so a quality regression after a Persona edit is
    attributable to the exact version.
  - *Scenario creation in the pick transaction.* If `Scenario`
    creation fails (e.g. expiry-day computation error), the entire
    pick transaction rolls back and the proposal stays in
    `AWAITING_HUMAN_PICK`. The reviewer sees a `500` and retries.
    This is correct, but it does couple Scenario availability to
    pick availability. Mitigation: `Scenario` creation is a single
    INSERT with no external dependencies; if it fails, the database
    is in trouble and pick failure is the least of our problems.
- **Replacement path.**
  - *Tighter citation semantics.* If pilot data shows reviewers
    spending time correcting irrelevant-but-valid citations, a
    Stage 2 ADR can introduce structural plausibility checks (cost
    band, activity-discipline match). The current rule (citation
    must resolve) is the floor; refinements are additive.
  - *Bulk pick affordance.* If pilot data shows the per-clash pick
    is the right reviewer experience but for large clash queues we
    need a "review all and pick" workflow, a Stage 2 ADR can layer a
    multi-pick endpoint on top of `pickProposal` — emphatically not
    a bypass of it. Each pick still creates one Scenario; the bulk
    affordance is a UI loop, not a server-side shortcut.
  - *Per-discipline persona split.* Plan section 5 names a parallel
    Persona `engineering.discipline_coordinator.ar-AE` for cross-
    discipline clashes. If discipline-specific advisory quality
    diverges (e.g. mechanical clashes need different reasoning than
    structural), the proposer service is generic — it dispatches to
    Personas by clash discipline classification. The state machine
    and citation rules stay unchanged.
  - *Cross-layer commit (the actual unblock).* Once ADR-0013 (Layer
    Priority Policy) lands, the `engineering.clash.proposal.picked`
    Outbox event grows a Layer 2 subscriber that proposes a baseline
    delta on the same Scenario branch, and the existing Promote-to-
    canonical gate becomes the single chokepoint for "this clash pick
    moves a date in P6 canonical." That is a strict superset of the
    behaviour this ADR locks; nothing in this ADR is overturned.

## Cite

- 2026-06-08 post-meeting plan, **section 3.3** (the 4 personas) — the
  `revit.clash.analyst.ar-AE` persona, the ~100 clash sizing anchor,
  and the explicit "BoQ + Schedule + Drawings" attachment list.
- Same plan, **section 3.4** (Simulation mode) — the rule that picking
  a clash solution triggers a `SimulationRun` on a `Scenario` branch,
  never a canonical write; and the 30-day default Scenario expiry.
- Same plan, **section 4.3** (LLM error handling) — strict tool-use
  schema and the contract-violation retry policy that section 1 of
  this ADR builds on.
- Same plan, **section 4.4** (Computer Use Guardrails) — the
  bright-line "advisory services never write canonical" property this
  ADR encodes in the DI graph.
- Same plan, **section 5 Layer 1 row** — the Layer 1 inputs / outputs
  / role-access table this ADR implements.
- Same plan, **section 6** — C5's blocked status on the Layer Priority
  Policy decision (this ADR ships the unblocked slice of C5).
- ADR-0005 — the Evidence package and confidence-score primitives this
  ADR reuses for citation traceability.
- ADR-0010 — the Persona system that owns `revit.clash.analyst.ar-AE`
  versioning and the prompt-drift metrics this ADR's risk register
  depends on.
- ADR-0011 — the Computer Use safety rules that frame the advisory-vs-
  authoritative bright line.
- ADR-0012 — the `Layer` enum, the multi-valued `Evidence ↔ Layer`
  join, the canonical `ClashItem` / `BoQ` / `BoqItem` entity
  reservations, the `engineering.` Outbox prefix, and the Stage 2
  deferral that this ADR is explicit about respecting.
- Feedback memory note ("never group versioned entities by
  `project.id`; always use `businessKey`") — applied to every citation
  resolution rule in section 4.2.
