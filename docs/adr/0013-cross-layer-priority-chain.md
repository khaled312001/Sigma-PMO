# ADR-0013 — Cross-Layer Priority Chain (Stage 2)

- **Status:** Proposed — **blocked on Al Ayham open question 1** in the
  2026-06-08 post-meeting plan (section 9, Q1). This ADR is a deliberate
  placeholder ADR. It **will be flipped to Accepted with the priority
  order Al Ayham picks** at the dedicated Layer Priority Policy meeting
  (target date in plan: before 2026-06-30), at which point this document
  is filled in with the chosen order and the corresponding rule-engine
  wiring.
- **Date:** 2026-06-09
- **Layer / Cycle:** Cross-cutting — Stage 2 of the cross-layer work
  begun in ADR-0012. Blocks C5 (SolutionProposer + Simulation) and C6
  (FIDIC letter generator) per plan section 6.
- **Decision owner:** Khaled Ahmed (Service Provider — drafts the policy
  encoding once the order is picked).
- **Reviewers:** Al Ayham (product / governance — owns the decision
  itself; this ADR cannot be Accepted without his answer).
- **Related:** ADR-0001 (ADR contract), ADR-0003 (canonical model &
  append-only traceability), ADR-0004 (rule engine v1), ADR-0007
  (Layer 2 governance policy), ADR-0009 (vision alignment &
  extensibility), **ADR-0012 (Cross-Layer Information Bus — Stage 1, the
  foundation this ADR sits on)**.

## Context

ADR-0012 locked **Stage 1** of the cross-layer work: a `Layer` enum on
the records that matter, a multi-valued `Evidence ↔ Layer` association,
and a MySQL-backed Outbox for cross-layer notifications. Stage 1 was
written so it stays correct under **every** plausible answer to the
priority question — the carrier columns are nullable, the Outbox payload
is opaque, and no rule anywhere in the codebase currently resolves a
disagreement between layers.

The 2026-06-08 post-meeting plan, **section 3.7** ("جسور بين Layers —
Cross-layer information sharing"), names the question this ADR will
eventually answer with the EOT worked example:

> لو الـ Engineering AI قال "هذا الاشتباك يستلزم تأخير 10 أيام" والـ
> Planning AI قال "Critical Path ما يقبلش أكتر من 3 أيام" والـ FIDIC AI
> قال "أي تأخير فوق 5 أيام يستحق EOT" — مين له الكلمة الأخيرة؟

The same section explicitly defers the answer to a dedicated meeting and
records:

> سياسة الأولوية بين الطبقات (Layer Priority Policy) — قرار مُؤجَّل،
> يحجب C5/C6 … نُضيف كيان `CrossLayerPolicy` فارغ مع
> `priorityOrder: number[]` كـ Placeholder، ونوثّق التأجيل في ADR-0013.

Plan **section 9 question 1** restates this as the first open question to
Al Ayham and asks for a dated meeting before C5 enters scope (target:
before 2026-06-30). Plan section 6 records that **C5** and **C6** are
blocked on this decision, and plan section 3.7 also flags that
the future Claude tool `get_cross_layer_context(projectId, layer)` —
schema, freshness contract, and cycle-breaker — depends on this policy
and is therefore also blocked.

This ADR exists in `Proposed` state now so that:

1. The blocking dependency is **visible in the ADR log**, not only in
   the plan, and the cross-references from ADR-0012, the rule engine,
   and future C5/C6 design docs have a stable anchor.
2. The shape of the eventual decision is pre-agreed (what gets decided,
   what code it touches, what stays out of scope), so the Layer
   Priority Policy meeting can be a **policy** meeting, not an
   architecture meeting.
3. The Wave 1 envelope built on ADR-0012 stays honest: any code shipped
   between now and the meeting that would have prejudged the priority
   order is a contract violation against this ADR.

## Decision (to be finalised once Al Ayham picks the order)

When this ADR is flipped to **Accepted**, it will lock the following.
The exact priority order is the slot Al Ayham fills in — every other
element of the decision is fixed now.

### 1. The decision to be made

Al Ayham picks **one** of the following resolution policies, applied
when two or more layers produce conflicting verdicts on the same fact
(the EOT worked example in plan section 3.7):

- **A. Strict layer priority.** A single total order over the five
  `Layer` values from ADR-0012 (`ENGINEERING`, `PLANNING`,
  `GOVERNANCE`, `REPORTS`, `SIMULATION`). The highest-priority layer's
  verdict wins; lower-priority verdicts are preserved as evidence and
  surfaced in the explanation, but they do not change the outcome.
- **B. Domain-scoped priority.** Different orders apply in different
  decision domains — e.g. **contractual exposure** decisions are won by
  `GOVERNANCE`, **schedule feasibility** decisions are won by
  `PLANNING`, **physical feasibility** decisions are won by
  `ENGINEERING`. Each domain has its own total order over the relevant
  subset of layers.
- **C. Human-arbitrated.** No automatic winner. On conflict, the system
  raises a typed `LayerConflict` Alert with all verdicts attached as
  evidence, and a named human role (e.g. Project Director) resolves it
  in the UI; the resolution is recorded as a `Decision` with
  `layer = GOVERNANCE` and a `resolutionSource = 'HUMAN_ARBITRATION'`
  field. No layer is ever a silent winner.

The Layer Priority Policy meeting picks A, B, or C; if A or B, it also
picks the order(s); if B, it also picks the domain partition.
`SIMULATION` is excluded from the order in every option — Simulation
verdicts never bind canonical truth, per ADR-0012.

### 2. Code surface the choice will touch (fixed regardless of A/B/C)

These artefacts are reserved now so the post-meeting flip is mechanical:

- **`CrossLayerPolicy` entity** (new — placeholder reserved by plan
  section 3.7). Extends `UuidEntity` + `TraceableEntity`. Fields when
  Accepted:
  - `policyKind: 'STRICT' | 'DOMAIN_SCOPED' | 'HUMAN_ARBITRATED'` —
    encodes which of A/B/C Al Ayham picked.
  - `priorityOrder: Layer[]` — populated for `STRICT`, **empty** for
    the other two kinds (validated, not silently zero-filled).
  - `domainOrders: { domain: string; order: Layer[] }[]` — populated
    only for `DOMAIN_SCOPED`, otherwise empty.
  - `arbitratorRole: string | null` — populated only for
    `HUMAN_ARBITRATED`, otherwise null.
  - `businessKey = 'cross_layer_policy.global'` for the singleton row
    (per Feedback memory note: rollups group by `businessKey`, never by
    `id`; superseding the policy is a new version of the same
    `businessKey`).
- **`CrossLayerConflictResolver` service** (new). Single entry point
  for every layer-aware reasoner to ask "given these N verdicts on the
  same fact, what is the bound answer?" Returns either a winning
  verdict (A/B) or a raised `LayerConflict` Alert id (C). This service
  is the **only** code in the repo allowed to read
  `CrossLayerPolicy.priorityOrder`.
- **Rule engine integration (ADR-0004).** A new rule-engine
  pre-condition `requiresCrossLayerResolution` is added; rules that
  produce verdicts in multiple layers route through the resolver
  before stamping a `Decision`. No existing rule changes shape; the
  hook is opt-in per rule.
- **Outbox event types (ADR-0012 namespace).** Reserved on the
  cross-layer prefix:
  - `crosslayer.conflict.detected` — emitted by the resolver when ≥ 2
    layers disagree on the same fact, regardless of A/B/C.
  - `crosslayer.conflict.resolved` — emitted when a `Decision` lands
    that closes the conflict (auto under A/B, human under C).
  - `crosslayer.policy.updated` — emitted when a new
    `CrossLayerPolicy` version becomes `isCurrent`.
- **`Alert.layer` and `Decision.layer` lifecycle change.** Once this
  ADR is Accepted, both columns become **NOT NULL going forward** for
  rows produced by any code path that calls
  `CrossLayerConflictResolver`. Legacy rows stay nullable (Wave 1
  envelope, ADR-0012). A NOT-NULL migration is **not** part of this
  ADR; it is a separate post-Accept task with its own checklist.
- **`get_cross_layer_context(projectId, layer)` Claude tool** (plan
  section 3.7, currently undefined). Schema, freshness contract, and
  cycle-breaker land in a follow-up design doc once this ADR is
  Accepted — they all depend on the chosen kind. Until then, code that
  needs cross-layer information assembles it explicitly from a DB
  query at the call site, per ADR-0012.

### 3. What this ADR deliberately does NOT decide

- **It does not pick the order.** That is Al Ayham's call at the
  meeting. Until then, no code anywhere in the repo encodes an
  implicit order, hard-codes a winner, or assumes one layer dominates.
- **It does not migrate existing rows.** `Alert.layer` and
  `Decision.layer` stay nullable on legacy data after this ADR ships,
  exactly as ADR-0012 specified.
- **It does not unblock C5 or C6 on its own.** C5 and C6 remain blocked
  on this ADR's flip to Accepted, per plan section 6. Shipping this
  document in `Proposed` does not change their status.
- **It does not introduce a broker.** The Outbox from ADR-0012 carries
  every cross-layer conflict event. NATS / Redis Streams / Kafka stays
  deferred.

## Consequences

- The blocking dependency between Al Ayham's pending decision and the
  C5 / C6 codepaths is now ADR-tracked, not only plan-tracked.
  ADR-0012's forward reference (`ADR-0013 (Layer Priority Policy —
  forthcoming, deferred)`) is honoured.
- The post-meeting flip is a small edit: choose `policyKind`, populate
  the relevant order field, mark `isCurrent`. No architecture rework.
- Until this ADR is Accepted, any pull request that resolves a
  cross-layer conflict — explicitly or implicitly — must be rejected on
  review, with this ADR cited. The ADR-0012 contract (Alert and
  Decision `layer` columns nullable, no cross-layer Claude tool, no
  rule of priority) is the test.
- Once Accepted, the `CrossLayerPolicy` row becomes the single source
  of truth for "who wins on conflict". Future changes to the order are
  new `CrossLayerPolicy` versions under the same `businessKey`,
  emitting `crosslayer.policy.updated` on the Outbox — auditable like
  every other governance change in the system.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** Plan section 3.7 made the deferral explicit and asked
  for an ADR that documents it. Plan section 9 Q1 routes the actual
  decision to a dated meeting before C5 enters scope. Recording the
  deferral as a `Proposed` ADR — rather than waiting until the meeting
  to write anything — gives ADR-0012, the rule engine (ADR-0004),
  and the C5 / C6 design docs a stable forward reference. It also
  makes the contract concrete: this ADR enumerates which choices are
  on the table (A/B/C above) so that the meeting itself is a one-hour
  policy meeting, not a multi-hour architecture meeting. This is the
  smallest viable Stage 2 stub that lets Stage 1 ship without
  prejudging the outcome.
- **Risk.**
  - *Drift between ADR and final decision.* Al Ayham may pick an
    option not in {A, B, C} above. Mitigation: this ADR is `Proposed`,
    so the enumeration is itself revisable; if Al Ayham picks a fourth
    option, this document gets a new revision before being flipped to
    Accepted — that is the normal ADR-0001 flow.
  - *Premature reliance.* Another module (C5, C6, or a future
    cross-layer reasoner) may be tempted to read
    `CrossLayerPolicy.priorityOrder` while the row is still a
    placeholder. Mitigation: the row does not exist in the DB until
    this ADR is Accepted; the entity definition lives in code as a
    reservation only, and `CrossLayerConflictResolver` throws on
    construction until the policy is loaded. There is no "default"
    behaviour to lean on.
  - *Meeting slippage.* If the priority meeting slips past 2026-06-30,
    C5 and C6 slip with it. Mitigation: the slip is visible — plan
    section 6 already names the dependency, and this ADR makes it
    visible from the ADR log. Khaled raises the slip in the weekly
    review the moment the meeting drifts.
  - *Scope creep at the meeting.* Al Ayham may want to debate Layer
    enum membership, evidence sharing, or the Outbox at the same
    meeting. Mitigation: those are ADR-0012 decisions, already
    Accepted (or will be, by the time of the meeting). This ADR
    constrains the meeting to choosing A/B/C and (if applicable) the
    order.
- **Replacement path.**
  - *Flip to Accepted.* The expected path. Al Ayham picks A/B/C and
    the order(s); Khaled fills in section 1 of this ADR with the
    choice, creates the `CrossLayerPolicy` migration with the chosen
    row, wires `CrossLayerConflictResolver` to read it, and the ADR
    status moves to Accepted. No ADR-0012 change is needed.
  - *Supersede by a different mechanism.* If the meeting concludes
    that the right answer is "no policy at all, every reasoner stays
    in its own layer and conflicts are surfaced as Alerts only", this
    ADR is replaced by a successor ADR that documents that choice;
    the `CrossLayerPolicy` entity is dropped from the reservation and
    `CrossLayerConflictResolver` is replaced by an Alert raiser. ADR-0012
    is unaffected.
  - *Withdraw.* If the project pivot drops C5 and C6 entirely (e.g.
    pilot ends without FIDIC scope), this ADR is marked
    `Superseded by ADR-XXXX` with the pivot ADR cited. ADR-0012 is
    unaffected; the Stage 1 plumbing remains useful for L4 (Reports)
    even with no priority policy in force.

## Cite

- 2026-06-08 post-meeting plan, **section 3.7** ("جسور بين Layers —
  Cross-layer information sharing") — the Stage 1 / Stage 2 split, the
  EOT worked example, the explicit instruction to document the
  deferral in ADR-0013, and the reserved `CrossLayerPolicy` placeholder.
- Same plan, **section 6** — C5 (SolutionProposer + Simulation) and
  C6 (FIDIC letter generator) are blocked on the priority decision.
- Same plan, **section 9 question 1** — the open question to Al Ayham
  that this ADR is blocked on, with the target meeting date before
  2026-06-30.
- **ADR-0012 (Cross-Layer Information Bus — Stage 1)** — the foundation
  this ADR sits on; the `Layer` enum, the `Evidence ↔ Layer` join, the
  Outbox, and the explicit forward reference to this ADR
  ("ADR-0013 (Layer Priority Policy — forthcoming, deferred)") all
  originate there.
- ADR-0001 — the ADR contract this document follows (Reason / Risk /
  Replacement, `Proposed` before implementation, Accepted only after
  review).
- ADR-0004 — the rule engine that will gain the
  `requiresCrossLayerResolution` pre-condition once this ADR is
  Accepted.
