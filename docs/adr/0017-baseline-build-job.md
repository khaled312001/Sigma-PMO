# ADR-0017 — Baseline Build Job lifecycle

- **Status:** Accepted (2026-06-09) — Author Path is fully delivered as
  the pure-TypeScript `XerWriterService` (drops the MPXJ commercial Java
  library, generates P6-compatible `.xer` from the canonical Project +
  Activity rows). State machine: `pending → running → awaiting-approval
  → committed`, with `failed` as a terminal off-path. The Computer Use
  replay path is now ungated since ADR-0011 was also Accepted on the
  same day.
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 2 (Planning) — locked here so C10 (Author Path)
  starts from a settled lifecycle contract; C11 (Demo Path) will extend
  the same state machine without redefining it.
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0003 (canonical model & append-only traceability),
  ADR-0006 (deterministic-first boundary), ADR-0010 (Persona system —
  `planning.p6.expert.ar-AE` is the persona that drives this job),
  ADR-0011 (Computer Use safety — gates the Demo Path extension),
  ADR-0012 (Cross-Layer Bus Stage 1 — reserves
  `planning.baseline.job.awaiting_approval` on the Outbox and pins the
  `Layer = PLANNING` carrier value), ADR-0013 (Layer Priority Policy —
  forthcoming, irrelevant to this lifecycle)

## Context

The 2026-06-08 working session, captured in plan **section 3.1**, locked
the Planning layer's headline capability: Sigma's `planning.p6.expert`
persona builds a real Primavera P6 baseline — WBS → Activities →
Durations → Relationships → Calendars → Critical Path → integrated
Baseline — **inside Sigma's own canonical model**, then emits a single
PMXML file via MPXJ that the human planner imports into P6 Pro with one
click. This is the **Author Path** (production), and it is explicitly
distinguished in plan section 3.1 from the **Demo Path** (presentation),
where Computer Use opens P6 inside a Windows VM and visually replays the
already-built baseline for client confidence.

Plan section 3.1 also nails down two non-negotiables that this ADR must
encode:

- **The Job enters `AWAITING_APPROVAL` before any final write to P6.**
  Two human signatures are required to move to `APPROVED`: the
  contractor/consultant's lead planner **and** the client's PD. The
  reviewer can reject the build wholesale, or reject specific
  activities/relationships and push the Agent to retry under guidance.
- **PMXML does not permit updating an existing baseline** (Oracle
  constraint, documented in plan section 3.1 footnote). A baseline edit
  is a new baseline that replaces the old one — the lifecycle must make
  this re-build legible as a new job, not a mutation of an old one.

ADR-0012 already reserved `BaselineBuildJob` in the canonical entity
table as a Wave 1 stub (entity definition only, no service logic) and
pinned its carrier value at `Layer = PLANNING`. ADR-0010 already named
`planning.p6.expert.<locale>` as the persona it consumes. Plan section
6 lists this as **C10**, the new dedicated cycle that builds the
production Author Path. **What is missing — and what this ADR fixes — is
the state machine and the hand-off contracts** that C10 will implement
and C11 (Demo Path) will later extend.

The decision below is split intentionally:

- The **stub portion** — the entity, the four-state machine
  (`PENDING → RUNNING → AWAITING_APPROVAL → COMMITTED | FAILED`), the
  hand-off events on the Outbox, the dual-reviewer gate, and the
  Author-Path PMXML emission contract — is **Accepted**. It is safe
  under any answer Al Ayham gives to the open Computer Use questions,
  because the Author Path runs server-side and does not touch a desktop.
- The **Computer Use replay portion** — extending the lifecycle so that
  a `COMMITTED` job can spawn a downstream Demo-Path session that opens
  the emitted PMXML inside P6 Pro on a Windows VM under the 12 rules of
  ADR-0011 — is **pending**. It does not ship, and no code references it
  beyond a reserved `replayedAt` column on the job row that stays
  `NULL` until ADR-0011 is `Accepted`.

This split matches the Wave 1 envelope rule from ADR-0012: ship what is
safe under every plausible answer; defer what is coupled to a vendor-beta
safety decision.

## Decision (stub portion — Accepted)

### 1. The `BaselineBuildJob` entity

`BaselineBuildJob` extends `UuidEntity` (as ADR-0012 §5 already
declared). It is **not** a `TraceableEntity` — a job is an immutable
historical record of a single build attempt, not a versioned business
object. A re-build is a new row with a new `id` and a fresh
`businessKey` derived from `projectId + attemptOrdinal`, not a new
version of an old row.

Columns (Stage 1):

```
baseline_build_jobs
-------------------
id              UUID         (PK)
projectId       FK → projects.id        (NOT NULL, indexed)
attemptOrdinal  int          (NOT NULL)  -- 1 = first build for this project, 2 = re-build after rejection, ...
businessKey     varchar(120) (NOT NULL, unique)  -- `${projectId}#${attemptOrdinal}`
layer           ENUM(Layer)  (NOT NULL, constant `PLANNING`)  -- per ADR-0012 §1

state           ENUM(JobState) (NOT NULL)  -- see §2; default 'PENDING'
personaSlug     varchar(120) (NOT NULL)  -- e.g. 'planning.p6.expert.ar-AE'
personaVersion  int          (NOT NULL)  -- pinned at job start, never re-resolved mid-run

createdBy       FK → users.id (NOT NULL)
createdAt       datetime(3)  (NOT NULL, default now(3))
startedAt       datetime(3)  (nullable)  -- set on PENDING → RUNNING
awaitingAt      datetime(3)  (nullable)  -- set on RUNNING → AWAITING_APPROVAL
committedAt     datetime(3)  (nullable)  -- set on AWAITING_APPROVAL → COMMITTED
failedAt        datetime(3)  (nullable)  -- set on any → FAILED

failureReason   varchar(500) (nullable)  -- populated only when state = FAILED
pmxmlArtifactId FK → artifacts.id (nullable) -- populated on RUNNING → AWAITING_APPROVAL
rationaleReport FK → artifacts.id (nullable) -- the per-activity rationale + evidenceRefs bundle

reviewerPlanner FK → users.id (nullable)  -- contractor/consultant lead planner sign-off
reviewerPlannerAt datetime(3) (nullable)
reviewerPd      FK → users.id (nullable)  -- client PD sign-off
reviewerPdAt    datetime(3)  (nullable)

-- Reserved for ADR-0011 flip; stays NULL in the stub:
replayedAt      datetime(3)  (nullable)
replaySessionId FK → computer_use_sessions.id (nullable)

INDEX (projectId, attemptOrdinal)
INDEX (state, createdAt)
INDEX (personaSlug, personaVersion)
```

Notes on shape:

- `businessKey = ${projectId}#${attemptOrdinal}` honors the **Feedback
  memory note** ("never group versioned entities by `project.id`, group
  by `businessKey`"): rollups over jobs group by `businessKey`, so a
  re-build (attemptOrdinal = 2) does not silently collapse into the
  rejected first attempt under the same `projectId`.
- `personaSlug` + `personaVersion` are **pinned at job start**. If the
  admin edits `planning.p6.expert.ar-AE` to v7 while a job is in
  `RUNNING` on v6, the job continues to consume v6 to completion. This
  protects the audit chain demanded by ADR-0010 §rationale: "the
  persona that produced this artifact is identifiable by slug+version,
  not by 'whatever is current today'."
- `replayedAt` / `replaySessionId` are **reserved nullable columns** —
  the Wave 1 envelope rule again. They stay NULL across the entire
  stub lifetime. No migration back-fills them, no service requires
  them, no read path filters on them. They become live only after
  ADR-0011 is `Accepted` and C11 lands.

### 2. The state machine

Four operating states plus two terminal states:

```
                +-----------+
                |  PENDING  |   (job row inserted; persona+inputs validated;
                +-----+-----+    nothing has run yet)
                      |
                      | start()
                      v
                +-----------+
                |  RUNNING  |   (persona is building WBS/activities/durations/
                +-----+-----+    relationships/calendars/CP/baseline inside
                      |          Sigma's canonical model; rationale + evidenceRefs
                      |          accumulating)
                      |
            +---------+---------+
            | submit()           | abort(reason)
            v                    v
+-----------+-----------+   +----+----+
|  AWAITING_APPROVAL    |   | FAILED  |  (terminal — failureReason populated,
+-----+----+------+-----+   +---------+   no further transitions)
      |    |      |
      |    |      | reject(reason)
      |    |      +-----------------> FAILED
      |    |
      |    | approve() — requires BOTH reviewerPlanner AND reviewerPd signed
      |    v
      |  +-----------+
      |  | COMMITTED |  (terminal — PMXML artifact + rationale report
      |  +-----------+   sealed; Outbox event emitted; cannot mutate)
      |
      +-- (no other outgoing transitions)
```

**Allowed transitions, exhaustively:**

| From               | To                  | Trigger                                               | Side effects                                                                                    |
| ------------------ | ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PENDING`          | `RUNNING`           | `start()` — invoked by the job runner picking up work | Set `startedAt`. Pin `personaVersion` (resolved exactly once here).                              |
| `PENDING`          | `FAILED`            | `abort(reason)` — pre-run validation fails            | Set `failedAt`, `failureReason`. Emit `planning.baseline.job.failed`.                            |
| `RUNNING`          | `AWAITING_APPROVAL` | `submit()` — persona finished building                | Set `awaitingAt`. Seal `pmxmlArtifactId`, `rationaleReport`. Emit `planning.baseline.job.awaiting_approval`. |
| `RUNNING`          | `FAILED`            | `abort(reason)` — runtime error / persona refusal / budget exceeded | Set `failedAt`, `failureReason`. Emit `planning.baseline.job.failed`.                                |
| `AWAITING_APPROVAL`| `COMMITTED`         | `approve()` — both reviewers signed                   | Set `committedAt`. Emit `planning.baseline.job.committed`. PMXML becomes the canonical baseline. |
| `AWAITING_APPROVAL`| `FAILED`            | `reject(reason)` — either reviewer rejects            | Set `failedAt`, `failureReason`. Emit `planning.baseline.job.rejected`. A re-build is a **new job** with `attemptOrdinal + 1`. |

**Forbidden transitions, exhaustively:**

- `COMMITTED → anything` — terminal. ADR-0003's append-only contract.
- `FAILED → anything` — terminal. Re-build is a new row.
- `AWAITING_APPROVAL → RUNNING` — once submitted, the persona's work is
  sealed. "Fix and resubmit" is a rejection + new job. This is the
  only safe shape given PMXML's "no baseline update" Oracle constraint
  (plan section 3.1 footnote): a partial fix would invite a partial
  re-emission that no PMXML import path can represent.
- `PENDING → AWAITING_APPROVAL` directly — must pass through `RUNNING`,
  even for zero-work jobs (the runner records a 0-duration `RUNNING`
  slice for audit symmetry).
- Any transition out of a terminal state in either direction.

The transition table is enforced in `BaselineBuildJobService.transition()`
as the only public mutation entry point; no other code may write to the
`state` column. Attempted illegal transitions throw
`InvalidJobTransitionError` and produce an `Alert` rather than a quiet
no-op.

### 3. The dual-reviewer gate

Plan section 3.1 is explicit: two signatures, lead planner **and** client
PD, both required before `COMMITTED`. This ADR encodes the gate as:

- `approve()` is idempotent **per reviewer**. The first call by a user
  whose role resolves to `lead_planner` populates `reviewerPlanner` +
  `reviewerPlannerAt`. The first call by a user whose role resolves to
  `client_pd` populates `reviewerPd` + `reviewerPdAt`.
- The state transition `AWAITING_APPROVAL → COMMITTED` fires only on
  the call that fills in the **second** of the two reviewer pairs. The
  call that fills in the first pair stays in `AWAITING_APPROVAL` and
  emits no Outbox event yet (reviewers know who has signed via the
  populated columns, which the UI renders).
- A `reject(reason)` by **either** reviewer transitions to `FAILED`
  immediately, regardless of whether the other reviewer has signed.
  Rejection is a single-signature action by design — one credible "no"
  ends the attempt.
- Reviewer identity is locked at the moment of signature; a later
  delegation does not retroactively change who approved. If a delegate
  signs, the delegate's `userId` is what lands in `reviewerPlanner` or
  `reviewerPd`.

ADR-0011 step-up authentication does **not** apply to the stub
Author-Path gate — the gate happens inside Sigma's web UI, not inside a
Computer Use session, and ADR-0011 §rule-5 is scoped to "approval gates
inside a session." A stronger gate (per-action OTP, nonce) is a possible
future hardening but is not implied by the current contracts and is
deferred.

### 4. The PMXML emission contract (Author Path hand-off)

When `submit()` fires (`RUNNING → AWAITING_APPROVAL`), the job runner
seals two artifacts:

1. **`pmxmlArtifactId`** — the single PMXML file emitted via MPXJ with
   `setWriteBaselines(true)`, containing the project **and** the
   integrated baseline in one file per plan section 3.1. Hash, size,
   PMXML schema version (matched against the per-client matrix
   committed in CI per plan section 3.1) and the MPXJ writer version
   are recorded in the artifact metadata.
2. **`rationaleReport`** — the structured per-activity rationale bundle:
   one row per activity recording the duration source (which BoQ line
   + which productivity reference), the relationship justification,
   the `ConfidenceScore` (carried forward from the existing entity),
   and the `evidenceRefs` set. This is what makes the build defensible
   in front of the reviewers and what makes a partial rejection
   actionable on the next attempt.

Both artifacts are **immutable from the moment `submit()` returns**. A
reviewer downloading the PMXML at T+1h gets the same bytes as a
reviewer downloading it at T+24h. If the persona could improve the
output by re-running, that is a new job — never a silent re-emission
under the same job id.

### 5. Outbox event emissions

Per ADR-0012 §6 the `planning.` prefix is reserved for this layer.
This ADR commits the following event types and their semantics:

| Event type                                      | Emitted on transition                  | Payload (opaque JSON, owned by this module's tests) |
| ----------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `planning.baseline.job.awaiting_approval`       | `RUNNING → AWAITING_APPROVAL`          | `{ jobId, projectId, businessKey, pmxmlArtifactId, rationaleReportId, personaSlug, personaVersion }` |
| `planning.baseline.job.committed`               | `AWAITING_APPROVAL → COMMITTED`        | `{ jobId, projectId, businessKey, pmxmlArtifactId, reviewerPlannerId, reviewerPdId, committedAt }`   |
| `planning.baseline.job.rejected`                | `AWAITING_APPROVAL → FAILED` (reject)  | `{ jobId, projectId, businessKey, rejectedBy, failureReason }`                                       |
| `planning.baseline.job.failed`                  | any `→ FAILED` (abort)                 | `{ jobId, projectId, businessKey, fromState, failureReason }`                                        |

Each emission happens inside the same TypeORM transaction as the
`state` column write, per ADR-0012 §3.1 (transactional with the domain
write). No emission outside the four listed types is permitted from
this module in Stage 1.

### 6. What the stub portion deliberately does NOT do

This is the contract that keeps the stub safe under every plausible
answer Al Ayham gives to the open Computer Use questions:

- **No Demo Path lifecycle extension.** A `COMMITTED` job does not
  automatically spawn a Computer Use session. `replayedAt` and
  `replaySessionId` stay NULL. The only thing a `COMMITTED` job does
  is publish `planning.baseline.job.committed` and seal its
  artifacts.
- **No Computer Use surface at all.** No FQDN entries on any
  allowlist, no container scheduling, no operator dashboard wiring.
  C11 will add all of that once ADR-0011 is `Accepted`.
- **No partial commit.** A reviewer cannot approve a subset of
  activities and reject the rest into a "partially committed"
  state — there is no such state. Partial rejection means the whole
  job moves to `FAILED` with reasoning that scopes which
  activities/relationships were unacceptable, and a new job
  (`attemptOrdinal + 1`) is created from the rationale + the
  rejection notes.
- **No re-running a `FAILED` job in place.** A re-build is a new
  row. This makes the audit trail trivial: every attempt is its own
  row, and `attemptOrdinal` orders them.
- **No mid-run persona swap.** The `personaSlug` + `personaVersion`
  pair is locked at `PENDING → RUNNING`. An admin who publishes a
  new persona version mid-run does not affect any in-flight job.
- **No frontend in this ADR.** The state machine ships with
  backend wiring (entity, service, transition guards, Outbox
  emissions) and unit tests. The reviewer UI is C10 cycle work.

## Decision (Computer Use replay portion — Pending, gated on ADR-0011)

When ADR-0011 flips from `Proposed` to `Accepted`, the lifecycle gains
one additional behavior — not a new state, just a post-`COMMITTED`
side effect:

- A `COMMITTED` job becomes eligible to spawn a downstream
  **`ComputerUseSession`** (entity to be defined in the ADR-0011 flip)
  that opens P6 Pro inside the Windows VM under the 12 rules and
  imports the sealed `pmxmlArtifactId`. The session is governed
  entirely by ADR-0011; this ADR only commits that `replayedAt` is
  set on session start and `replaySessionId` records the linkage.
- The job's `state` column is unaffected by replay. A replayed job
  remains `COMMITTED`. A failed replay is a failure of the session,
  not of the job. The Author Path artifact is the source of truth;
  the Demo Path session is a visualization layer (per plan section
  3.1).
- The dual-reviewer gate at `AWAITING_APPROVAL → COMMITTED` is
  **unchanged** by the replay extension. The gate exists to approve
  the baseline, not the visual replay; replay happens after the
  baseline is already canonical.

No code, schema migration, or event type is committed for the replay
portion until ADR-0011 is `Accepted`. The reserved nullable columns
are the only forward-compatibility surface; everything else is added
by the flip cycle.

## Consequences

- C10 starts from a settled lifecycle: the entity, the state machine,
  the transition guards, the dual-reviewer gate, the Outbox event
  types, and the PMXML emission contract are fixed acceptance
  criteria, not a moving target.
- C11 (Demo Path) inherits a clean extension point. The lifecycle
  does not need to be re-litigated — the replay extension adds a
  post-terminal side effect, not a new state.
- The Wave 1 envelope rule from ADR-0012 holds: `replayedAt` and
  `replaySessionId` stay NULL across the entire stub lifetime; no
  service reads them; no migration back-fills them.
- Append-only semantics extend naturally to attempts: every build
  attempt is a row, every re-build is a fresh `attemptOrdinal`, and
  the audit chain from a `COMMITTED` PMXML back to the BoQ lines and
  drawings is recoverable from `rationaleReport` + `evidenceRefs`
  without joining across versioned snapshots.
- The PMXML "no baseline update" Oracle constraint becomes legible
  in the lifecycle itself: a rejection forces a new job, which
  forces a fresh PMXML, which matches what the P6 import path can
  represent. No code is at liberty to attempt a partial re-emission.
- The persona-version pinning at job start protects ADR-0010's audit
  chain: every committed PMXML is traceable to a specific
  `personaSlug@version` pair that produced it, even if the persona
  has since been edited.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** Plan section 3.1 made the Author Path the production
  truth for Layer 2 and demanded a dual-signature approval gate
  before any baseline becomes canonical. C10 needs to build against
  a fixed lifecycle, not invent one mid-cycle. Splitting the ADR
  into a stub-Accepted portion and a Computer-Use-Pending portion
  lets us ship the production path now (which is what Al Ayham
  asked for: "the platform is not a tool — it is a virtual senior
  team that *creates*"), without waiting on the open Computer Use
  failure-rate question that gates ADR-0011.
- **Risk.**
  - *Reviewer-role resolution drift.* The dual-reviewer gate
    depends on resolving "this user is the lead planner" vs "this
    user is the client PD" against the role / capability matrix
    (ADR-0012 §context cites plan section 7). If a project does
    not have one of the two roles assigned, the job cannot reach
    `COMMITTED`. Mitigation: `submit()` validates that both roles
    are resolvable on the project at the moment of submission and
    aborts to `FAILED` with a clear `failureReason` if not, rather
    than letting the job linger in `AWAITING_APPROVAL`.
  - *PMXML schema version skew.* If the per-client P6 version
    matrix changes mid-job, the emitted PMXML could target a
    different schema than the importer expects. Mitigation: the
    schema version is captured in the `pmxmlArtifactId` metadata
    at `submit()` time, and the reviewer UI surfaces a warning if
    the project's current matrix entry disagrees with the
    artifact's recorded version.
  - *Attempt-ordinal contention.* Two runners trying to start a
    re-build for the same project simultaneously could race on
    `attemptOrdinal`. Mitigation: `attemptOrdinal` is allocated
    inside the same transaction as the `INSERT INTO
    baseline_build_jobs` via a `SELECT MAX(attemptOrdinal) ... FOR
    UPDATE` against the project row, which is acceptable at Pilot
    volume (one or two re-builds per project per week, never
    concurrent in practice).
  - *Replay-column dormancy bug.* A future contributor may misread
    the nullable `replayedAt` / `replaySessionId` columns as live
    and either populate them prematurely or filter on them in a
    canonical query. Mitigation: both columns carry a
    `@DormantUntilADR('ADR-0011')` decorator (a no-op TypeScript
    decorator that lints to a compile-time warning if the column
    is read or written outside the reserved replay code path, to
    be added in C10).
- **Replacement path.**
  - *State-machine reshape (e.g. adding a `REVIEWING` state
    between `AWAITING_APPROVAL` and `COMMITTED` if the dual-gate
    UX turns out to need an explicit "first reviewer signed,
    waiting for second" surface).* The transition table is the
    only authoritative source — adding a state is a guarded
    migration plus a new row in the transition table, no
    consumer of the Outbox events breaks because the existing
    four event types still fire on the same logical edges.
  - *Lifecycle replacement entirely.* If Al Ayham later decides
    the Author Path itself is not the production truth (e.g.
    flips to "P6 is the source of truth and we sync from it"),
    this ADR is superseded and the entity becomes a read-side
    projection of P6 state rather than the producer of PMXML.
    The Outbox event types stay stable across that swap because
    they describe outcomes ("a baseline is now canonical"), not
    mechanism.
  - *Demo-Path replay swap (vendor).* If Sigma later replaces
    Anthropic Computer Use with a different desktop-control
    runtime, only the session entity behind `replaySessionId`
    changes — the lifecycle remains intact. ADR-0011's vendor-
    agnosticism (its 12 rules apply to any future agent) carries
    through.

## Cite

- 2026-06-08 post-meeting plan, **section 3.1** ("بناء Baseline
  بالذكاء الاصطناعي") — the Author Path mandate, the
  `AWAITING_APPROVAL` state name, the dual-reviewer gate (lead
  planner + client PD), the PMXML-single-file emission via MPXJ,
  the "no baseline update" Oracle constraint, and the explicit
  Author Path / Demo Path split.
- Same plan, **section 3.2** — the 12 Computer Use rules that the
  pending replay portion will inherit unchanged once ADR-0011 is
  `Accepted`.
- Same plan, **section 6** — C10 as the dedicated cycle for the
  production Author Path, C11 as the Demo Path cycle.
- Same plan, **section 9 question 6** — the acceptable Computer
  Use failure rate, which gates ADR-0011 and therefore gates the
  pending replay portion of this ADR.
- ADR-0003 — append-only traceability (every attempt is a row;
  no in-place mutation of historical attempts).
- ADR-0010 — `planning.p6.expert.<locale>` persona; the
  `personaSlug` + `personaVersion` pinning rule preserves its
  audit chain.
- ADR-0011 — Computer Use safety 12 rules; gates the pending
  replay portion.
- ADR-0012 §1 — `Layer.PLANNING` carrier value on this entity.
- ADR-0012 §5 — entity reservation as `UuidEntity`.
- ADR-0012 §6 — `planning.` Outbox prefix.
- Feedback memory note — `businessKey` rollup discipline
  (`${projectId}#${attemptOrdinal}`, never `projectId` alone).
