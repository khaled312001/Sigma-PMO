# ADR-0028 — The standardized Agent Contract & the L0–L8 Governance OS

**Status:** Accepted (2026-06-11)
**Supersedes scope of:** ADR-0010 (per-page personas) extended into a formal agent taxonomy.

## Context

Mr. Ayham's 2026-06-11 vision re-frames Sigma PMO as a **multi-layer AI Governance Operating System**: every function is a dedicated **agent layer** (L0–L8), each an *independent, scalable service* following one standardized operating model, with the Sigma Governance AI (L8) as the final authority consolidating all outputs. The platform must also scale across a governance **hierarchy** (Enterprise → Portfolio → Program → Project), a governance **lifecycle** (Initiation → Closure), a 4-tier **governance status** (Green/Yellow/Orange/Red), and must let **future agents plug in without structural redesign**.

The codebase already had the raw materials scattered (personas, confidence scores, governance escalation, an outbox bus, append-only provenance). This ADR formalizes them into one contract.

## Decision

### 1. The Agent Contract (the standardized operating model)

Every layer implements the same seven-field contract Mr. Ayham specified:

| Field | Where it lives |
|---|---|
| **Objective** | `AgentDescriptor.objective` |
| **Inputs** | `AgentDescriptor.inputs` + the per-run `AgentRunContext` |
| **Processing Logic** | the subclass `process()` (deterministic-first; LLM narrates only) |
| **Outputs** | `AgentProcessResult.outputRefs` + cross-layer `OutboxEvent`s |
| **Confidence Score** | `AgentProcessResult.confidence` → persisted to `ConfidenceScore` |
| **Escalation Logic** | `AgentProcessResult.escalationLevel` (reuses `GovernanceDecision` L1–L3) |
| **Audit Trail** | one `AgentExecution` row per run (the central audit table) |

`BaseAgentService.run()` is the template method that opens the audit row → calls `process()` → persists confidence → emits outbox events → closes the audit row with status + escalation + governance status. **A layer becomes an agent by extending one class and implementing `describe()` + `process()`.**

### 2. Registry + orchestrator (the extensibility guarantee)

- `AgentRegistry` — agents self-register (`registry.register(this)` in `onModuleInit`). New agents appear in `/agents` automatically.
- `AgentOrchestrator` — runs one agent, or the full **L1→L8 pipeline** per node, threading a shared `correlationId`.
- **Adding a future agent costs exactly:** a new `AgentLayer` enum value (additive) + a module that extends `BaseAgentService` + importing that module in `AppModule`. **Zero edits** to any L0–L8 agent, the base service, the registry, or the orchestrator. Proven by `EsgModule` (the reference extension agent, `ext.esg`).

### 3. Layer ↔ surface coexistence (non-destructive)

The legacy `Layer` enum (`engineering|planning|…`, persisted on `Persona.layer` + `OutboxEvent.sourceLayer`) is **not migrated**. The new `AgentLayer` (L0–L8 + extensions) is a parallel axis, bridged by `LAYER_TO_AGENT_LAYER`.

### 4. Hierarchy, lifecycle, 4-tier status

- Hierarchy: `Enterprise`/`Portfolio`/`Program` entities + nullable denormalized ancestry on `Project`. All additive.
- Lifecycle: `LifecyclePhase` dimension on projects/programs.
- 4-tier status: `GovernanceStatusService` — a pure, deterministic leaf ladder (alerts + escalation + confidence → tier + explainable score) + worst-of-children roll-up, with an append-only `GovernanceStatusSnapshot` trail. **This is the brain of the system and is unit-tested in isolation.**

### 5. L8 consolidation is pull-based + idempotent

The Outbox is Stage-1 (no retry/DLQ), so `ConsolidationService` reads the **latest** `AgentExecution` per agent for a node rather than relying on event arrival order. Re-consolidation is safe to run repeatedly; corrective actions upsert by a dedup key and never resurrect a manually-closed action.

## The layer map

| Layer | Agent key | Implementation |
|---|---|---|
| L0 Knowledge & Rules | — (facade) | `KnowledgeService` (rule library + sources + frameworks + lessons + memory) |
| L1 Data Collection | `l1.data_collection` | ingestion + polymorphic `ProjectRecord` families (RFI/NCR/CR/…) |
| L2 Validation | `l2.validation` | wraps `RuleEngineService` |
| L3 Compliance | `l3.compliance` | wraps `GovernanceDecisionService` + status recompute |
| L4 Analytics | `l4.analytics` | deterministic EVM (`EvmService`) + productivity + forecast + portfolio roll-up |
| L5 Risk | `l5.risk` | probability×impact register from L2 alerts + L4 EVM |
| L6 Claims & Disputes | `l6.claims` | delay analysis + claims identification + evidence linking |
| L7 Executive Intelligence | `l7.executive` | strategic KPIs + governance headline |
| L8 Sigma Governance AI | `l8.sigma_governance` | consolidates all agents → authoritative status + corrective actions |
| *(extension)* | `ext.esg` | reference future agent — the extensibility proof |

## Consequences

- The platform is now genuinely a **Governance Decision Support System**: L8 doesn't just report — it recomputes the verdict and issues corrective actions.
- Every conclusion is traceable to the exact agent + run that produced it (`AgentExecution`).
- Future agents (Carbon, Procurement Intelligence, Resource Optimization, AI Governance & Ethics) follow `ext.esg`'s pattern.
- The deterministic-first posture is preserved: the LLM never computes a number that drives a governance decision.

## Verification

`tsc` clean (backend + frontend); jest green incl. `governance-status` roll-up + `evm` + `risk-scoring` specs; live: the full L1→L8 pipeline runs every layer under one correlationId and L8 produces a single authoritative Green/Yellow/Orange/Red per node; the `ext.esg` agent runs with zero edits to L0–L8 code.
