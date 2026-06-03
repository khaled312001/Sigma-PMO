# ADR-0009 — Vision alignment & extensibility map

- **Status:** Proposed (pending Sigma review)
- **Date:** 2026-06-04
- **Layer / Cycle:** Cross-cutting — informs every layer post-v1.0.0
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance), Syed Moinuddin (architecture)

## Context

On **2026-06-04** Al Ayham wrote to refine the product vision:

> *"The long-term objective is to build a platform that connects BIM-based
> planning, Primavera schedules, daily operational reporting, contractual
> obligations (FIDIC), PMBOK governance processes, and AI-assisted analysis
> into a single governance workflow … evolving toward an AI-enabled
> Governance & Transformation Platform rather than a traditional project
> management application. For now, this does not change the Phase 1
> objective."*

He also locked the six-question progression the platform must progressively
answer:

1. What deviated?
2. Why did it deviate?
3. Who owns the deviation?
4. What evidence supports the conclusion?
5. What contractual exposure exists?
6. What corrective action should be considered?

This ADR is the architectural answer to his request for "thoughts on
scalability, modularity, and how best to preserve flexibility for future
expansion." It does **not** change Phase 1 scope; it makes the destination
explicit so Phase 1 work cannot paint future cycles into a corner.

## Decision

We adopt the six-question progression as a first-class architectural
contract, and we map the current Phase 1 architecture to it. Every future
cycle MUST extend along these axes through the already-existing modular
seams; new code paths that bypass the seams are an ADR-level decision in
their own right.

### 1. The six-question model — where each answer lives today

| #   | Question                          | Phase 1 module(s) answering it                                         | Extension axis (future) |
| --- | --------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| 1   | What deviated?                    | `modules/rules/*` (6 deterministic rules) → `Alert` table              | More rules; new sources |
| 2   | Why did it deviate?               | `Alert.context` JSON + `RootCause` taxonomy (Cycle-9 follow-on)        | Cause-classifier service; daily-ops correlation |
| 3   | Who owns the deviation?           | `GovernanceDecision.responsibleParty`                                   | Per-party SLA model; org-chart resolution |
| 4   | What evidence supports the answer?| `EvidenceService.forAlert()` → SHA-256 source archive + `rawSource`     | BIM model snapshots; daily-report attachments |
| 5   | What contractual exposure?        | `GovernancePolicy` + FIDIC mapping in `default-policy.ts`               | Multi-edition FIDIC; per-project policy; sub-clause expansion |
| 6   | What corrective action?           | `GovernanceDecision.interventions[]` + `DecisionReview` audit          | Action-library; auto-routed workflows; closed-loop tracking |

Every Phase 1 cycle already touches every row. The platform isn't a
project-management app with reporting bolted on; it is a governance state
machine whose six outputs already exist.

### 2. Modularity contract — five plug-in shapes

The codebase has five plug-in shapes. **Every future capability must enter
through one of them or raise an ADR to add a sixth.**

| Plug-in shape       | Today's contract                                            | Where new shapes plug in                                  |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| **Parser**          | `Parser` interface + `ParserRegistry.detectAndParse()`      | New format = new file in `modules/ingestion/parsers/` + one registry line (XER, PMXML, MSPROJECT_XML, Excel, CSV today; BIM IFC / Synchro / daily-ops CSV next) |
| **Rule**            | `Rule` interface + `RuleEngineService.registeredRules()`    | New deviation class = new `*.rule.ts` + `@Injectable()` + array entry (6 classes today; root-cause, slippage-velocity, BIM-vs-actual next) |
| **Integration adapter** | `NotificationsService.send({channel, …})` channel switch | New channel = new branch + adapter (log, Slack, Teams, Email today; BIM360 webhook, Aconex, daily-ops API next) |
| **Decision**        | `GovernanceDecisionService.decideForEvaluation()` + `GovernancePolicy` JSON | New decision logic = policy JSON change (no code) OR new clause-mapping fn |
| **Summary**         | `SummaryService` deterministic builder + optional `LlmService` rewriter | New narrative = new builder; LLM stays a thin rewriter over deterministic facts (ADR-0006 boundary preserved) |

Each shape has: a TypeScript interface, a registry/router, and golden-file
or unit tests. Adding a member to any shape is a sub-day change.

### 3. Extension points the future vision needs — and where they go

| Future capability                  | Plug-in shape(s) used                          | New code surface (estimated)                  |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| **BIM-based planning ingestion**   | Parser + Rule + Evidence                       | `modules/ingestion/parsers/ifc.parser.ts`, `modules/ingestion/parsers/synchro.parser.ts`, BIM-vs-schedule rule, evidence-chain extended to model element id |
| **Daily operational reporting**    | Parser + Integration adapter + Rule            | `modules/ingestion/parsers/daily-report.parser.ts`, optional inbound webhook adapter, `stale-reporting.rule.ts` already covers the gap rule |
| **Contractual obligations beyond FIDIC** | Decision (policy as data)                | New `GovernancePolicy` rows under different policy types (`fidic-2017`, `fidic-1999`, `mof-saudi`, etc.). No code change |
| **AI-assisted root-cause analysis**| Summary + Rule                                 | New `RootCauseService` (deterministic correlation + optional LLM rationale); slots into `Alert.context` and feeds Q2 of the six-question model |
| **Closed-loop corrective action**  | Decision + Integration adapter + new `Action` entity | New `governance_action` table (append-only), integration adapter to push to project-tracking tools, audit trail in `decision_review` already covers it |
| **Multi-tenant / multi-project portfolio** | Existing project model + RBAC `projectScopes` | Already in schema; needs UI work + ADR for tenancy boundary if cross-tenant analytics is added |
| **Custom dashboards / KPI tiles**  | Frontend only — `lib/api.ts` is the seam       | No backend change needed for read-side dashboards |

### 4. Scalability levers — what's in place, what's deferred

| Concern               | Phase 1 lever                                                   | Future headroom                                       |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Write volume          | Append-only + content-addressed archive (no in-place updates)   | Move `rawSource` to object storage when DB row sizes hurt; partition by `projectId` |
| Read volume           | Composite indexes on `(businessKey, isCurrent)`, `(severity, projectId)`, `(alertId, createdAt)` | Read-replicas; materialised views per dashboard |
| Compute (rules)       | Per-evaluation snapshot; each rule is `O(activities)` and pure  | Background queue once `evaluateAll()` becomes a multi-minute job |
| Storage               | SHA-256 dedup at archive layer                                  | Object storage tier with lifecycle policy             |
| LLM cost              | LLM optional; deterministic-first by ADR-0006                   | Prompt caching when summary volume grows               |
| Evidence size         | `rawSourceSnippets` already truncates; full bytes in archive    | On-demand fetch from archive when a reviewer drills in |

Nothing in Phase 1 forces a centralised, single-writer, in-memory shape.
The append-only model is the scalability story.

### 5. What this ADR does NOT do

- It does NOT expand the Service Agreement scope. Phase 1 closes at
  `v1.0.0-acceptance` per the contract.
- It does NOT pre-build BIM, daily-reporting, or root-cause classification —
  those are explicit re-scope triggers per Annex 2 and would be a new
  engagement.
- It does NOT lock specific vendors (IFC parser library, BIM platform,
  daily-reporting API). Each will get its own ADR when the cycle that needs
  it is scoped.
- It does NOT change the deterministic-vs-AI boundary set in ADR-0006: LLM
  stays a thin rewriter over deterministic facts, never the source of
  governance state.

## Consequences

- Future cycles have a written destination map; Phase 1 work is now provably
  aligned with the long-term vision and can be defended as such.
- Sigma can author governance policy through `/admin/policy` without code
  changes for any decision-level evolution.
- New domains (BIM, daily reporting, additional contract frameworks) enter
  through the five plug-in shapes; reviewer can audit each new capability
  against the same five questions.
- Anything that would bypass the shapes (e.g. a new top-level service that
  reads outside the canonical model) requires its own ADR + Syed review per
  ADR-0001.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason** — Al Ayham's 2026-06-04 vision message asked for thoughts on
  scalability / modularity / flexibility. This ADR is the durable answer,
  bound to specific code modules so it doesn't drift.
- **Risk** — A future cycle adds a domain that doesn't fit any existing
  shape and a sixth shape is needed. Mitigated by: ADR-0001 process requires
  written reason before implementation; the modular contract is auditable.
- **Replacement path** — If Sigma decides the platform should pivot away
  from the six-question progression, this ADR is superseded by a new one;
  the existing shapes remain reusable across most pivots (parser, rule,
  integration, decision, summary all generalise beyond construction).
