import {
  AgentLayer,
  GovernanceStatus,
  HierarchyLevel,
  LifecyclePhase,
} from '../../common/enums';

/**
 * The standardized Agent operating model Mr. Ayham specified (2026-06-11):
 * every layer is an independent service exposing the SAME seven-field contract
 * — Objective, Inputs, Processing Logic, Outputs, Confidence Score, Escalation
 * Logic, Audit Trail. This file is the TypeScript embodiment of that contract;
 * `BaseAgentService` provides the Processing/Audit machinery, and each layer
 * fills in its descriptor + `process()`.
 *
 * Designed so future agents (ESG, Carbon, Procurement Intelligence, Resource
 * Optimization, AI Governance & Ethics) implement this interface and register —
 * with zero change to the core.
 */

/** Static self-description of an agent (the contract's declarative half). */
export interface AgentDescriptor {
  /** Stable key, e.g. `l2.validation`, `l8.sigma_governance`. */
  agentKey: string;
  layer: AgentLayer;
  /** Objective — what the agent is responsible for. */
  objective: string;
  /** Inputs — data sources/documents the agent consumes. */
  inputs: string[];
  /** Outputs — findings/recommendations/alerts/scores produced. */
  outputs: string[];
  /** Rule References — Source ids + rule codes the agent reasons against. */
  ruleReferences: string[];
  /** Persona slug this agent narrates through (null = pure deterministic). */
  personaSlug?: string;
}

/** Per-run context handed to an agent (the "Inputs" binding at call time). */
export interface AgentRunContext {
  nodeType?: HierarchyLevel | string;
  /** The hierarchy node businessKey (project/program/portfolio/enterprise). */
  nodeBusinessKey?: string;
  /** Convenience: the project businessKey when the node is a project. */
  projectKey?: string;
  lifecyclePhase?: LifecyclePhase | string;
  /** Threads a multi-agent pipeline run together. */
  correlationId?: string | null;
  /** Who/what triggered this run (user displayName or orchestrator tag). */
  triggeredBy?: string | null;
  /** Free-form agent-specific parameters. */
  params?: Record<string, unknown>;
}

/** A confidence result an agent produces (maps onto `ConfidenceScore`). */
export interface AgentConfidence {
  overall: number;
  completeness?: number;
  consistency?: number;
  sourceReliability?: number;
  breakdown?: Record<string, unknown>;
}

/** An Outbox event an agent wants emitted transactionally with its audit row. */
export interface AgentOutboxEvent {
  /** Must satisfy the Outbox reserved prefixes (the `agent.` prefix is added). */
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * What an agent's `process()` returns — the "Outputs / Confidence / Escalation"
 * fields of the contract. `BaseAgentService` persists all of this onto the
 * `AgentExecution` audit row and emits the Outbox events.
 */
export interface AgentProcessResult {
  /** References to artefacts produced (alert ids, decision ids, snapshot ids…). */
  outputRefs?: Record<string, unknown>;
  /** Confidence the run produced (persisted to a ConfidenceScore by the base). */
  confidence?: AgentConfidence | null;
  /** If the agent already persisted a ConfidenceScore, its id (avoids dup). */
  confidenceScoreId?: string | null;
  /** Highest escalation raised this run (L1…L3). */
  escalationLevel?: string | null;
  /** Governance status this run contributed to its node. */
  governanceStatus?: GovernanceStatus | null;
  outboxEvents?: AgentOutboxEvent[];
  /** Human-readable one-line outcome for logs/UI. */
  summary?: string;
}

/** The runtime contract every agent satisfies. */
export interface Agent {
  descriptor(): AgentDescriptor;
  /** Run the agent end-to-end (audit + outbox handled by BaseAgentService). */
  run(ctx: AgentRunContext): Promise<import('../canonical/entities').AgentExecution>;
}
