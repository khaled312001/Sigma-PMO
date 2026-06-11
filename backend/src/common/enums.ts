/** Canonical enumerations shared across the data model. */

/** How a source file was provided / which parser handles it. */
export enum SourceType {
  P6_XER = 'p6_xer',
  P6_XML = 'p6_xml',
  MSPROJECT_XML = 'msproject_xml',
  EXCEL = 'excel',
  CSV = 'csv',
  /** Primavera P6 Activity Table PDF exports (e.g. "Critical Path.pdf"). */
  P6_PDF = 'p6_pdf',
}

/** Lifecycle of a single ingest → validate → normalise execution. */
export enum IngestionStatus {
  PENDING = 'pending',
  PARSED = 'parsed',
  VALIDATED = 'validated',
  NORMALIZED = 'normalized',
  FAILED = 'failed',
}

/** Canonical resource categories (Primavera-aligned). */
export enum ResourceType {
  LABOR = 'labor',
  NONLABOR = 'nonlabor',
  MATERIAL = 'material',
  EQUIPMENT = 'equipment',
}

/** Reporting cadence for ingested progress reports. */
export enum ReportType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/** Severity classification for rule-engine alerts (Cycle 2). */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/** Lifecycle of one rule-engine evaluation run. */
export enum RuleEvaluationStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Platform layer a persona / alert / decision / evidence belongs to. Introduced
 * by ADR-0010 (per-page expert persona system) and reserved by ADR-0012 for
 * cross-layer Evidence/Alert/Decision tagging once cross-layer wiring lands.
 *
 * Wave 1 uses this only on `Persona.layer`; the other entities adopt it in a
 * later cycle without re-declaring the enum.
 */
export enum Layer {
  ENGINEERING = 'engineering',
  PLANNING = 'planning',
  GOVERNANCE = 'governance',
  REPORTS = 'reports',
  SIMULATION = 'simulation',
}

/**
 * The L0–L8 AI-agent taxonomy Mr. Ayham specified (2026-06-11 vision).
 *
 * This is a SEPARATE axis from {@link Layer}: `Layer` is the original
 * page/persona surface taxonomy (persisted on `Persona.layer` +
 * `OutboxEvent.sourceLayer`), while `AgentLayer` is the governance-OS service
 * taxonomy. The two coexist deliberately — we never destructively migrate the
 * persisted `Layer` values; personas associate to an agent-layer through the
 * registry, and {@link LAYER_TO_AGENT_LAYER} bridges the two.
 */
export enum AgentLayer {
  L0_KNOWLEDGE = 'l0_knowledge',
  L1_DATA_COLLECTION = 'l1_data_collection',
  L2_VALIDATION = 'l2_validation',
  L3_COMPLIANCE = 'l3_compliance',
  L4_ANALYTICS = 'l4_analytics',
  L5_RISK = 'l5_risk',
  L6_CLAIMS = 'l6_claims',
  L7_EXECUTIVE = 'l7_executive',
  L8_SIGMA_GOVERNANCE = 'l8_sigma_governance',
  // ── Extension agents (Mr. Ayham's future agents) ──
  // These plug in via the registry with ZERO change to the L0–L8 agent
  // implementations, the Agent Contract base, the registry or the orchestrator.
  // Adding one is: a new enum value here + a new module that extends
  // BaseAgentService + registering the module in AppModule. Nothing else.
  EXT_ESG = 'ext_esg',
  EXT_CARBON = 'ext_carbon',
  EXT_PROCUREMENT = 'ext_procurement',
  EXT_RESOURCE_OPTIMIZATION = 'ext_resource_optimization',
  EXT_AI_ETHICS = 'ext_ai_ethics',
}

/** The four governance levels (Enterprise → Portfolio → Program → Project). */
export enum HierarchyLevel {
  ENTERPRISE = 'enterprise',
  PORTFOLIO = 'portfolio',
  PROGRAM = 'program',
  PROJECT = 'project',
}

/** Governance lifecycle phases an initiative moves through. */
export enum LifecyclePhase {
  INITIATION = 'initiation',
  PLANNING = 'planning',
  EXECUTION = 'execution',
  MONITORING_CONTROL = 'monitoring_control',
  CLOSURE = 'closure',
}

/**
 * 4-tier governance status (Mr. Ayham's Green/Yellow/Orange/Red). Ordered
 * worst-last so a numeric rank can drive worst-of-children roll-up. This is
 * the consolidation output of L8 — distinct from the 3-tier {@link AlertSeverity}
 * which is a per-finding signal that *feeds* this status.
 */
export enum GovernanceStatus {
  GREEN = 'green',
  YELLOW = 'yellow',
  ORANGE = 'orange',
  RED = 'red',
}

/** Severity rank for deterministic worst-of comparison (higher = worse). */
export const GOVERNANCE_STATUS_RANK: Record<GovernanceStatus, number> = {
  [GovernanceStatus.GREEN]: 0,
  [GovernanceStatus.YELLOW]: 1,
  [GovernanceStatus.ORANGE]: 2,
  [GovernanceStatus.RED]: 3,
};

/**
 * Bridge from the legacy surface {@link Layer} to the {@link AgentLayer}
 * taxonomy. A persona tagged `governance` maps to the Compliance agent by
 * default; the registry can override per-agent. Non-destructive: read-only map.
 */
export const LAYER_TO_AGENT_LAYER: Record<Layer, AgentLayer> = {
  [Layer.ENGINEERING]: AgentLayer.L1_DATA_COLLECTION,
  [Layer.PLANNING]: AgentLayer.L4_ANALYTICS,
  [Layer.GOVERNANCE]: AgentLayer.L3_COMPLIANCE,
  [Layer.REPORTS]: AgentLayer.L7_EXECUTIVE,
  [Layer.SIMULATION]: AgentLayer.L5_RISK,
};

/**
 * Deterministic mapping from a finding's {@link AlertSeverity} to the
 * governance status it contributes. The L8 consolidator takes the worst
 * contribution across a node's open findings (then weights by count/escalation
 * — see GovernanceStatusService). info→green keeps clean nodes green.
 */
export const SEVERITY_TO_STATUS: Record<AlertSeverity, GovernanceStatus> = {
  [AlertSeverity.INFO]: GovernanceStatus.GREEN,
  [AlertSeverity.WARNING]: GovernanceStatus.YELLOW,
  [AlertSeverity.CRITICAL]: GovernanceStatus.ORANGE,
};
