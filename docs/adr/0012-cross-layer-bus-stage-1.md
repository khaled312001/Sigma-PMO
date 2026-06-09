# ADR-0012 — Cross-Layer Information Bus (Stage 1)

- **Status:** Proposed (Stage 1 deliverables only — Stage 2 priority-chain
  decision is blocked on Al Ayham open question 1 in the
  2026-06-08 post-meeting plan)
- **Date:** 2026-06-09
- **Layer / Cycle:** Cross-cutting — foundation for Layers 1–4 + Simulation
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0003 (canonical model & append-only traceability),
  ADR-0007 (Layer 2 governance policy), ADR-0008 (Layer 3 platform),
  ADR-0009 (vision alignment & extensibility), ADR-0010 (Claude vendor —
  forthcoming), ADR-0011 (Prompt Registry — forthcoming),
  ADR-0013 (Layer Priority Policy — forthcoming, deferred)

## Context

The 2026-06-08 working session with Al Ayham confirmed that the three product
layers — **Engineering / Revit (L1)**, **Planning / Primavera (L2)**, and
**Governance / FIDIC + PMI (L3)** — cannot remain isolated pipelines. They are
one product, and they must share project state so that a clash in L1 can move
a date in L2, and a moved date in L2 can trigger an EOT letter in L3. The
meeting also added **Reports (L4)** and **Simulation** as a cross-cutting
capability that must reuse the same plumbing without ever writing back to
canonical truth.

ADR-0009 sketched the destination through its "five plug-in shapes"; the
post-meeting plan goes further. Plan **section 3.7** ("جسور بين Layers —
Cross-layer information sharing") explicitly splits the cross-layer work
into:

- **Stage 1 — safe, deliverable now.** A `Layer` enum on every record that
  matters, a multi-valued `Evidence ↔ Layer` association (because a single
  BoQ line can legitimately serve Engineering, Planning **and** FIDIC at
  once), and a durable outbox for cross-layer notifications.
- **Stage 2 — deferred.** Which layer's verdict wins when L1, L2 and L3
  disagree on the same fact — the EOT example from plan section 3.7. This
  blocks C5 (SolutionProposer + Simulation) and C6 (FIDIC letter generator)
  per plan section 6, and it is open question 1 in plan section 9.

This ADR locks **Stage 1 only.** It deliberately stops at the point where any
of Al Ayham's possible answers to the priority-chain question remain
implementable on top of what we ship. ADR-0013 will lock Stage 2 after his
decision.

Plan sections also drawn on:

- **Section 2** ("تصحيح المفاهيم"), row 2.11 — the layers are one entity that
  must exchange information; the priority rule is deferred.
- **Section 3** ("الإضافات الجديدة") and especially **section 3.7** — the
  Stage 1 vs Stage 2 split and the explicit rejection of in-process
  `EventEmitter` for cross-container traffic.
- **Section 4.4** — Computer Use Guardrails: any cross-layer notification
  must survive the boundary between the NestJS process and a Computer Use
  container in a Windows VM, which an in-memory event emitter cannot.
- **Section 5** ("خريطة الـ Layers المعدّلة") — the canonical list of layers
  that the enum must encode, plus Simulation as a cross-cutting capability.
- **Section 7** ("الأدوار + Capability Matrix") — the role table that drives
  the `canSimulate` and `canEditPrompts` capabilities introduced alongside
  this ADR.

## Decision (Stage 1 only)

We introduce a **Cross-Layer Information Bus** with three primitives: a
`Layer` enum carried on the records that matter, a multi-valued
`Evidence ↔ Layer` association, and a MySQL-backed **Outbox** for
cross-layer notifications. Nothing here decides who wins on conflict; that is
Stage 2.

### 1. The `Layer` enum

A new enum lives in `backend/src/common/enums.ts`:

```ts
export enum Layer {
  ENGINEERING = 'ENGINEERING',  // L1 — Revit / BIM / clash analysis
  PLANNING    = 'PLANNING',     // L2 — Primavera audit + author paths
  GOVERNANCE  = 'GOVERNANCE',   // L3 — FIDIC + PMI letters & compliance
  REPORTS     = 'REPORTS',      // L4 — daily / weekly / monthly narratives
  SIMULATION  = 'SIMULATION',   // cross-cutting What-If sandbox
}
```

Five values, no more. The first four mirror plan section 5; `SIMULATION` is
listed as cross-cutting in the same section and earns its own enum slot so
that records produced inside a Scenario can be identified at a glance and
filtered out of every canonical query by default.

**Carrier records** (existing entities, Stage 1 additions):

| Entity        | Change                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `Alert`       | New nullable column `layer: Layer`. Existing rows stay `NULL`.               |
| `Decision`    | New nullable column `layer: Layer`. Existing rows stay `NULL`.               |
| `Persona` (new — defined in ADR-0011) | `layer: Layer` from creation (always populated for new rows). |
| `Evidence`    | Multi-valued — see section 2 below. **No** scalar `layer` column on Evidence. |

The `Alert` and `Decision` columns are **nullable by design**, per the
Wave 1 envelope: we do not migrate existing rows, and no service is yet
allowed to require a non-null `layer` for read or write. This is the
"safe to ship under any answer" property — turning the column non-null is a
Stage 2 action gated by ADR-0013.

### 2. `Evidence ↔ Layer` is multi-valued

Plan section 3.7 calls this out explicitly: *"قطعة Evidence واحدة (مثل سطر
BoQ) قد تكون مرجعاً مشروعاً لـ Engineering (تكلفة اشتباك) و Planning (مدة
نشاط) و FIDIC (تقدير مطالبة). الحل: حقل `layers: Layer[]` (multi-valued)،
أو jointable `EvidenceLayer`. **لا حقل scalar واحد.**"*

We pick the join-table form because it indexes cleanly, audits like every
other append-only relation in the codebase, and avoids JSON-column queries
on a hot read path:

```
evidence_layers
---------------
evidenceId   FK → evidence.id   (NOT NULL)
layer        ENUM(Layer)        (NOT NULL)
attachedAt   datetime           (NOT NULL, default now())
attachedBy   FK → users.id      (nullable — null = system-attached)

PRIMARY KEY (evidenceId, layer)
INDEX (layer, evidenceId)         -- per-layer fan-out queries
```

Append-only semantics: rows are inserted, never updated. A reattachment
under a new layer is a new row. Detachment is **not** supported in
Stage 1 — once a piece of evidence is recognised as serving a layer, it
stays recognised. (If we later need a "this evidence is no longer
relevant for layer X" signal, that is an ADR-level decision in its own
right; we will not paper over it with a soft-delete column now.)

### 3. The Outbox — durable, in-MySQL, append-only

Plan section 3.7 explicitly rules out NestJS `EventEmitter` for cross-layer
notifications: *"NestJS EventEmitter يعمل داخل process واحد ولا يجتاز حدود
الحاويات (Computer Use sessions في حاويات معزولة)."* It then recommends a
MySQL-backed Outbox with a polling subscriber, with a real broker (NATS /
Kafka / Redis Streams) deferred to post-Pilot.

This ADR locks the recommendation:

```
outbox_events
-------------
id           UUID         (PK)
createdAt    datetime(3)  (NOT NULL, default now(3))
sourceLayer  ENUM(Layer)  (NOT NULL)
eventType    varchar(80)  (NOT NULL)   -- e.g. 'clash.proposal.created'
payload      json         (NOT NULL)
processedAt  datetime(3)  (nullable — null = pending)

INDEX (processedAt, createdAt)         -- subscriber scan
INDEX (sourceLayer, createdAt)         -- per-layer audit
```

Properties (all enforced in Stage 1):

1. **Transactional with the domain write.** Producers insert an
   `outbox_events` row in the **same TypeORM transaction** as the entity
   change that produced the event. Either both land or neither lands. No
   producer is allowed to publish out-of-band.
2. **Append-only.** `processedAt` is the only column ever updated, and only
   by the subscriber service moving an event from pending to done. The row
   is never deleted; archival is a separate Stage 2+ concern.
3. **Single subscriber, single poll loop.** The subscriber runs in the
   NestJS process, polls every **1 second** for unprocessed events ordered
   by `createdAt`, dispatches them to in-process handlers, and stamps
   `processedAt`. One poll loop, no competing consumers, no leader
   election in Stage 1.
4. **Backpressure signal.** If the count of rows with
   `processedAt IS NULL` exceeds **30** at any poll tick, the subscriber
   emits a `WARN` log and a single Alert-style notification ("outbox queue
   depth = N"). This is the mitigation called out below in Risk.
5. **Per-handler isolation.** A failing handler does not block other
   events. The event is retried on the next poll until either it succeeds
   or a max-retries threshold (Stage 2) is reached. Stage 1 ships with
   unbounded retries plus the queue-depth warning — adequate for Pilot
   volumes, not adequate for portfolio scale.
6. **No payload schema enforcement yet.** `payload` is opaque JSON.
   Per-event-type contracts are owned by the producing module's tests.
   Schema-registry-style validation is a Stage 2+ concern.

### 4. What Stage 1 deliberately does NOT do

This is the contract that keeps Wave 1 safe under every plausible answer
from Al Ayham:

- **No Layer Priority Policy.** There is no rule, anywhere in the codebase
  after this ADR ships, that says "L2 beats L1" or "L3 always wins on
  contractual exposure." Conflict resolution between layers does not exist
  yet. ADR-0013 will introduce it.
- **No cross-layer Claude tool.** Plan section 3.7 names a future
  `get_cross_layer_context(projectId, layer)` tool. **Stage 1 does not
  define it.** The schema, freshness contract, and cycle-breaker (idempotency
  key, max fan-out) all depend on Stage 2 decisions. Until then, any code
  that needs cross-layer information assembles it explicitly from a DB
  query at the call site and passes it to the Persona as a single
  pinned context block (this also preserves Prompt cache hit-ratio — see
  ADR-0011).
- **No NOT-NULL migrations.** `Alert.layer` and `Decision.layer` stay
  nullable for the entire Stage 1 lifetime. Existing data is never
  back-filled by a migration; only writes from this point forward may
  populate the column. Wave 1 envelope rule.
- **No broker.** No NATS, no Redis Streams, no Kafka. The Outbox is the
  only transport.
- **No frontend.** Stage 1 ships backend skeletons, entities, capability
  flags, and unit tests. UI for Personas, Simulation sandbox, or any
  cross-layer surface is Wave 3+ per the orchestration plan.

### 5. New canonical entities introduced alongside this ADR

This ADR also reserves the names and shapes of the new canonical entities
that Wave 1 brings into existence. Their full module wiring lives in
ADR-0011 (Prompt Registry) and the C1.5 / C5 design docs; the table below
exists here so that the Outbox `eventType` namespace and the `Layer` enum
have a known set of producers to anchor against.

| Entity              | Base class(es)            | Purpose                                                                                                              | Layer field |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------- |
| `Persona`           | `UuidEntity` + `TraceableEntity` | A named expert system prompt (plan section 3.3). `businessKey` = slug (e.g. `fidic.red_book.expert.ar-AE`). `version` increments per edit. `isCurrent` flags the live row. | Always set  |
| `Scenario`          | `UuidEntity`              | A What-If sandbox branch (plan section 3.4). Holds `parentSnapshotId`, `createdBy`, default 30-day expiry.            | `SIMULATION` (constant) |
| `ClashItem`         | `UuidEntity` + `TraceableEntity` | One detected clash from a Revit clash list (plan section 3.1 / Layer 1 in section 5). `businessKey` = clash GUID. | `ENGINEERING` (constant) |
| `BoQ`               | `UuidEntity` + `TraceableEntity` | Bill of Quantities header. `businessKey` per project + revision tag.                                                | nullable — BoQ is shared evidence (section 2) |
| `BoqItem`           | `UuidEntity` + `TraceableEntity` | Line item under a BoQ. `businessKey` = BoQ id + line number.                                                          | nullable — same reason |
| `BaselineBuildJob`  | `UuidEntity`              | A run of the AI-author pipeline (plan section 3.1, Author Path). Lifecycle: `PENDING → RUNNING → AWAITING_APPROVAL → APPROVED \| REJECTED`. | `PLANNING` (constant) |

All entities extend `UuidEntity` from `backend/src/common/entities/base.entity.ts`,
as is the existing repo convention. Append-only entities additionally extend
`TraceableEntity` (`businessKey` + `version` + `isCurrent`), matching the
pattern already established by `Project`, `Activity`, `Resource` etc.
**The Feedback memory note applies: any rollup over these entities groups by
`businessKey`, never by `id`.**

### 6. Outbox event-type namespace (initial reservation)

Reserved prefixes, one per layer producer, to keep handler routing clean:

| Prefix          | Owning layer | Example event types                                                                                            |
| --------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `engineering.`  | L1           | `engineering.clash.ingested`, `engineering.clash.proposal.created`                                              |
| `planning.`     | L2           | `planning.baseline.job.awaiting_approval`, `planning.audit.alert.raised`                                       |
| `governance.`   | L3           | `governance.letter.received`, `governance.letter.draft.ready_for_approval`                                     |
| `reports.`      | L4           | `reports.monthly.snapshot.taken`, `reports.monthly.rendered`                                                   |
| `simulation.`   | Simulation   | `simulation.scenario.created`, `simulation.scenario.expired`                                                   |

No event type outside these prefixes is permitted on the Outbox in Stage 1.
Cross-layer subscribers identify themselves by the prefix they care about;
they do not subscribe to wildcards. This keeps fan-out bounded and the
"who reacts to what" question auditable from the row data alone.

## Consequences

- Stage 2 (ADR-0013) has a clean foundation: `Layer` is already on the
  records that need it, evidence already supports being shared across
  layers, and a durable event channel already exists across container
  boundaries. The priority-chain decision becomes a pure policy decision,
  not a coupled infrastructure decision.
- Existing data is untouched. No migration back-fills `layer` on existing
  `Alert` or `Decision` rows; queries that don't ask about `layer`
  continue to behave exactly as before.
- New modules (PersonasModule, SimulationModule) can be wired against the
  Outbox immediately, even though they cannot yet produce or consume
  cross-layer effects. The wiring is the contract; the behaviour stays
  inside their own layer until ADR-0013.
- C5 (SolutionProposer + Simulation infrastructure) and C6 (FIDIC letter
  generator) remain **blocked** on Al Ayham's priority-chain answer, as
  plan section 6 already records. This ADR is not a workaround for that
  block; it is the foundation that makes the unblock cheap.
- A future swap of the Outbox to a real broker (NATS / Redis Streams /
  Kafka) is a per-producer, per-consumer migration — no schema breakage
  for any entity, because the bus is a one-way channel and every event
  type is owned by exactly one producer.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** The 2026-06-08 meeting demanded that the three layers talk to
  each other. Plan section 3.7 explicitly split the work into a safe Stage
  1 and a blocked Stage 2 so that we can build the foundation now without
  waiting for the priority-chain meeting. A MySQL Outbox matches the
  append-only philosophy already locked in ADR-0003, survives the
  process-boundary problem (NestJS process ↔ Windows VM Computer Use
  containers per plan section 4.4), and is durable + auditable on day one
  without operational dependencies beyond MySQL.
- **Risk.**
  - *Outbox poll lag.* A 1-second poll plus an unbounded retry loop means
    a stuck handler can grow the queue. Mitigation: the queue-depth
    warning at 30 pending rows surfaces the problem before user-visible
    delay; the next ADR (or a Stage 2 follow-up) introduces a max-retry
    cap and a dead-letter table.
  - *Single subscriber = single point of failure.* If the NestJS process
    is restarted the subscriber pauses; un-processed rows wait. Acceptable
    at Pilot volume; addressed by the broker-swap replacement path below
    when we go portfolio-scale.
  - *Layer enum churn.* Adding a sixth value later (e.g. a `FINANCE` layer
    once Sigma asks for cost integration) is a schema migration on every
    carrier table. Mitigation: the five values are picked to match plan
    section 5 exactly, and any sixth value is an ADR-level decision under
    ADR-0001.
  - *Multi-valued evidence misuse.* A developer may attach a piece of
    evidence to "all layers" reflexively. Mitigation: linter-style
    convention documented in this ADR — evidence is attached to a layer
    only when a specific layer's reasoner uses it; unit tests on
    `EvidenceService` will flag bulk attaches.
- **Replacement path.**
  - *Broker swap (scale).* Replace the polling subscriber with a
    `OutboxRelay` that streams new rows into NATS / Redis Streams / Kafka,
    keep the Outbox table as the durable transaction log. Producers are
    unaffected — they still write to the same table in the same
    transaction. Consumers move from in-process handlers to broker
    subscribers. Migration is one-module-at-a-time.
  - *Per-layer policy change.* If Al Ayham later renames or merges layers
    (e.g. "Governance" splits into "FIDIC" and "PMI"), the enum gets a
    new value, the carrier columns stay nullable on legacy values, and
    write paths emit the new value going forward. Read paths that filter
    by layer become a small UNION.
  - *Stage 2 supersedes nothing here.* ADR-0013 will add the priority
    chain on top of this foundation; it does not replace any decision in
    this ADR.

## Cite

- 2026-06-08 post-meeting plan, **section 3.7** ("جسور بين Layers — Cross-layer
  information sharing") — Stage 1 mechanism and Stage 2 deferral.
- Same plan, **section 2 row 2.11** — layers as one entity.
- Same plan, **section 3.4** — Simulation sandbox semantics.
- Same plan, **section 4.4** — Computer Use Guardrails, the process-boundary
  argument against in-memory EventEmitter.
- Same plan, **section 5** — Layer map, source of truth for the enum values.
- Same plan, **section 6** — C5 / C6 blocked on Stage 2.
- Same plan, **section 7** — capability matrix that ADR companions consume.
- Same plan, **section 9 question 1** — the open question that blocks
  ADR-0013.
