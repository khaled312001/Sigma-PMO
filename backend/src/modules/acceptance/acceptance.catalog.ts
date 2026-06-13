/**
 * Sigma Validation / Acceptance Framework — the formal 23-test acceptance
 * program Mr. Ayham specified (2026-06-13) for declaring Sigma
 * "production-ready & market-ready".
 *
 * This file is the CATALOG as data: the canonical, source-of-truth list of the
 * 23 acceptance tests. Each entry names the lifecycle stage it exercises, the
 * inputs it consumes, the outputs it must produce, the success criterion, and —
 * where one exists — the platform agentKey that satisfies it. The runner
 * (`acceptance.service.ts`) resolves those keys against the live AgentRegistry
 * and degrades gracefully when a key is absent, so the catalog can describe the
 * full intended program without coupling to which agents happen to be wired in
 * a given build.
 *
 * The agentKey strings below mirror what the agents actually register
 * (verified against the registry): `ext.opportunity`, `ext.investment`,
 * `ext.bankability`, `ext.quantity_survey`, `ext.procurement`, `l4.analytics`,
 * `l5.risk`, `ext.safety`, `ext.fire_life_safety`, `ext.authority`,
 * `ext.utility`, `ext.operational_readiness`, `l6.claims`,
 * `ext.revenue_governance`, `ext.funding`, `l7.executive`. Tests 09, 22 and 23
 * carry no agentKey — they validate ingestion/baselines, the audit trail, and
 * the full end-to-end pipeline respectively.
 */

/** One acceptance test, fully described as data. */
export interface AcceptanceTest {
  /** `TEST-01` … `TEST-23`. */
  id: string;
  /** Human-readable program title. */
  title: string;
  /** The platform lifecycle stage this test exercises. */
  lifecycleStage: string;
  /** Inputs the test consumes. */
  inputs: string[];
  /** Outputs the test must produce to pass. */
  expectedOutputs: string[];
  /** The pass/fail criterion in one sentence. */
  successCriteria: string;
  /**
   * The agent that satisfies this test, where one exists. The runner resolves
   * this against the live registry and skips (not-applicable) if it is absent.
   * Omitted for tests 09 (ingestion/baselines), 22 (audit trail) and 23 (E2E).
   */
  agentKey?: string;
  /** Whether the runner can execute this test automatically against the platform. */
  automatable: boolean;
}

/**
 * The 23-test acceptance program (Mr. Ayham, 2026-06-13), in order. The runner
 * executes these against the LIVE platform services.
 */
export const ACCEPTANCE_TESTS: AcceptanceTest[] = [
  {
    id: 'TEST-01',
    title: 'Opportunity Intelligence',
    lifecycleStage: 'Origination',
    inputs: ['opportunity brief (type, location, sector, sponsor)', 'market signals', 'strategic-fit criteria'],
    expectedOutputs: ['Opportunity Score', 'Market Attractiveness', 'Strategic Fit', 'Go/No-Go recommendation'],
    successCriteria:
      'The opportunity agent screens the opportunity and returns an Opportunity Score, market attractiveness and a go/no-go recommendation with a confidence score.',
    agentKey: 'ext.opportunity',
    automatable: true,
  },
  {
    id: 'TEST-02',
    title: 'Rapid Feasibility',
    lifecycleStage: 'Pre-Feasibility',
    inputs: ['confirmed opportunity inputs', 'rapid assumption library', 'indicative funding structure'],
    expectedOutputs: ['CAPEX', 'OPEX', 'NPV', 'IRR', 'Payback', 'rapid recommendation'],
    successCriteria:
      'The investment agent runs a Level-1 rapid assessment and returns CAPEX/OPEX, NPV, IRR and payback with a 4-tier governance recommendation.',
    agentKey: 'ext.investment',
    automatable: true,
  },
  {
    id: 'TEST-03',
    title: 'Professional Feasibility',
    lifecycleStage: 'Feasibility',
    inputs: ['detailed cost & revenue model', 'phased cashflow assumptions', 'sensitivity ranges'],
    expectedOutputs: ['full financial model', 'NPV', 'project & equity IRR', 'Payback', 'DSCR profile', 'risk rating'],
    successCriteria:
      'The investment agent runs the Level-2 professional feasibility model and returns NPV/IRR/payback, a year-by-year DSCR profile and a risk-rated recommendation.',
    agentKey: 'ext.investment',
    automatable: true,
  },
  {
    id: 'TEST-04',
    title: 'Bankability Assessment',
    lifecycleStage: 'Feasibility',
    inputs: ['professional feasibility results', 'funding facilities (debt/equity)', 'lender covenant thresholds'],
    expectedOutputs: ['DSCR', 'Loan Structure', 'Bankability Score', 'lender-readiness verdict'],
    successCriteria:
      'The bankability agent assesses DSCR, loan structure and covenant headroom and returns a bankability score and lender-readiness verdict.',
    agentKey: 'ext.bankability',
    automatable: true,
  },
  {
    id: 'TEST-05',
    title: 'Sketch Intelligence',
    lifecycleStage: 'Concept',
    inputs: ['concept-sketch document', 'extracted concept fields', 'area / massing assumptions'],
    expectedOutputs: ['concept area & massing', 'order-of-magnitude CAPEX', 'feasibility seed inputs'],
    successCriteria:
      'The investment agent ingests confirmed concept-sketch extractions and seeds an order-of-magnitude feasibility view from them.',
    agentKey: 'ext.investment',
    automatable: true,
  },
  {
    id: 'TEST-06',
    title: 'BIM Quantity Extraction',
    lifecycleStage: 'Design',
    inputs: ['BIM / model take-off', 'classification standard (NRM/UNIFORMAT)', 'element catalogue'],
    expectedOutputs: ['classified quantities', 'element breakdown', 'BIM-derived take-off'],
    successCriteria:
      'The quantity-survey agent extracts classified quantities from the BIM take-off and returns an element-level breakdown with a confidence score.',
    agentKey: 'ext.quantity_survey',
    automatable: true,
  },
  {
    id: 'TEST-07',
    title: 'BOQ Validation',
    lifecycleStage: 'Design',
    inputs: ['Bill of Quantities', 'BIM-derived quantities', 'rate library / benchmark'],
    expectedOutputs: ['BOQ vs BIM variance', 'over/under-measure findings', 'validated cost estimate'],
    successCriteria:
      'The quantity-survey agent validates the BOQ against BIM-derived quantities and raises over/under-measure findings with quantum.',
    agentKey: 'ext.quantity_survey',
    automatable: true,
  },
  {
    id: 'TEST-08',
    title: 'Procurement Intelligence',
    lifecycleStage: 'Procurement',
    inputs: ['procurement packages', 'vendor registry', 'long-lead & delivery dates'],
    expectedOutputs: ['Procurement Strategy', 'long-lead exposure', 'vendor evaluation', 'procurement findings'],
    successCriteria:
      'The procurement agent evaluates packages and vendors, flags long-lead exposure and returns a procurement strategy with governance findings.',
    agentKey: 'ext.procurement',
    automatable: true,
  },
  {
    id: 'TEST-09',
    title: 'Primavera Integration',
    lifecycleStage: 'Planning',
    inputs: ['Primavera P6 XER/XML export', 'WBS & activity network', 'baseline schedule'],
    expectedOutputs: ['ingested schedule', 'baseline build', 'activity/WBS rows'],
    successCriteria:
      'A Primavera export ingests cleanly into the platform, building a baseline and populating activity/WBS rows ready for project controls.',
    // No agent — this validates baselines/ingestion rather than an agent run.
    automatable: false,
  },
  {
    id: 'TEST-10',
    title: 'Project Controls',
    lifecycleStage: 'Execution',
    inputs: ['baseline + progress data', 'cost & schedule actuals', 'EVM parameters'],
    expectedOutputs: ['SPI', 'CPI', 'EAC', 'EVM/KPI analytics snapshot'],
    successCriteria:
      'The analytics agent computes EVM/KPI metrics (SPI, CPI, EAC) and writes a project-controls analytics snapshot.',
    agentKey: 'l4.analytics',
    automatable: true,
  },
  {
    id: 'TEST-11',
    title: 'Risk Intelligence',
    lifecycleStage: 'Execution',
    inputs: ['risk register', 'schedule & cost drivers', 'probability/impact scoring'],
    expectedOutputs: ['risk exposure', 'top risks', 'risk-adjusted outlook'],
    successCriteria:
      'The risk agent scores the register, ranks top risks and returns a risk-adjusted exposure for the project.',
    agentKey: 'l5.risk',
    automatable: true,
  },
  {
    id: 'TEST-12',
    title: 'Safety Governance',
    lifecycleStage: 'Execution',
    inputs: ['safety records & inspections', 'incident log', 'HSE rule references'],
    expectedOutputs: ['HSE Score', 'Safety Compliance', 'Open Findings'],
    successCriteria:
      'The safety agent computes an HSE score and safety-compliance level and reports open safety findings.',
    agentKey: 'ext.safety',
    automatable: true,
  },
  {
    id: 'TEST-13',
    title: 'Stop Work Scenario',
    lifecycleStage: 'Execution',
    inputs: ['critical safety / stop-work trigger', 'affected activities', 'schedule baseline'],
    expectedOutputs: ['Stop Work Record', 'Schedule Impact', 'EOT exposure', 'Claim Readiness'],
    successCriteria:
      'The safety agent records a stop-work scenario and quantifies schedule impact, EOT exposure and claim readiness.',
    agentKey: 'ext.safety',
    automatable: true,
  },
  {
    id: 'TEST-14',
    title: 'Fire Governance',
    lifecycleStage: 'Compliance',
    inputs: ['fire & life-safety records', 'code references (NFPA / civil defence)', 'inspection status'],
    expectedOutputs: ['Fire-Safety Compliance', 'open fire findings', 'life-safety readiness'],
    successCriteria:
      'The fire & life-safety agent assesses code compliance and returns fire-safety readiness with open findings.',
    agentKey: 'ext.fire_life_safety',
    automatable: true,
  },
  {
    id: 'TEST-15',
    title: 'Authority Governance',
    lifecycleStage: 'Compliance',
    inputs: ['authority submissions', 'approval pipeline', 'statutory deadlines'],
    expectedOutputs: ['Authority Readiness', 'Outstanding Approvals', 'Delay Exposure'],
    successCriteria:
      'The authority agent tracks submissions and returns authority readiness, outstanding approvals and delay exposure.',
    agentKey: 'ext.authority',
    automatable: true,
  },
  {
    id: 'TEST-16',
    title: 'Utility Governance',
    lifecycleStage: 'Compliance',
    inputs: ['utility connection records', 'provider milestones', 'energization dependencies'],
    expectedOutputs: ['Utility Readiness', 'outstanding connections', 'energization risk'],
    successCriteria:
      'The utility agent tracks connection records and returns utility readiness, outstanding connections and energization risk.',
    agentKey: 'ext.utility',
    automatable: true,
  },
  {
    id: 'TEST-17',
    title: 'Operational Readiness',
    lifecycleStage: 'Handover',
    inputs: ['operational-readiness checklist', 'commissioning status', 'handover dependencies'],
    expectedOutputs: ['Operational Readiness Score', 'open readiness items', 'handover verdict'],
    successCriteria:
      'The operational-readiness agent scores commissioning/handover readiness and returns open readiness items with a handover verdict.',
    agentKey: 'ext.operational_readiness',
    automatable: true,
  },
  {
    id: 'TEST-18',
    title: 'Claims Intelligence',
    lifecycleStage: 'Execution',
    inputs: ['claim events & notices', 'delay / disruption evidence', 'FIDIC clause references'],
    expectedOutputs: ['Claim Readiness', 'entitlement view', 'EOT / cost exposure'],
    successCriteria:
      'The claims agent assesses claim entitlement and returns claim readiness with EOT/cost exposure against the contract.',
    agentKey: 'l6.claims',
    automatable: true,
  },
  {
    id: 'TEST-19',
    title: 'Revenue Governance',
    lifecycleStage: 'Operation',
    inputs: ['revenue forecast & actuals', 'lifecycle ledger (revenue dimension)', 'feasibility baseline'],
    expectedOutputs: ['Revenue Variance', 'forecast vs actual', 'impact on NPV/IRR'],
    successCriteria:
      'The revenue-governance agent reconciles revenue forecast vs actual and returns the variance and its impact on NPV/IRR.',
    agentKey: 'ext.revenue_governance',
    automatable: true,
  },
  {
    id: 'TEST-20',
    title: 'Funding Governance',
    lifecycleStage: 'Operation',
    inputs: ['funding facilities', 'drawdown & repayment schedule', 'DSCR covenants'],
    expectedOutputs: ['Funding Health', 'DSCR headroom', 'covenant compliance', 'refinancing risk'],
    successCriteria:
      'The funding agent monitors facilities, DSCR and covenants and returns a funding-health composite with refinancing risk.',
    agentKey: 'ext.funding',
    automatable: true,
  },
  {
    id: 'TEST-21',
    title: 'Executive Intelligence',
    lifecycleStage: 'Governance',
    inputs: ['cross-layer agent outputs', 'governance status snapshots', 'portfolio rollups'],
    expectedOutputs: ['Executive Summary', 'consolidated governance status', 'executive scores'],
    successCriteria:
      'The executive agent consolidates cross-layer outputs into an executive summary with a unified governance status and executive scores.',
    agentKey: 'l7.executive',
    automatable: true,
  },
  {
    id: 'TEST-22',
    title: 'Audit Trail Validation',
    lifecycleStage: 'Governance',
    inputs: ['AgentExecution audit rows', 'inputRefs / outputRefs', 'confidence-score links'],
    expectedOutputs: ['traceable Decision→Finding→Agent→Evidence→Source chain', 'audit-row counts'],
    successCriteria:
      'Recent AgentExecution rows for the project carry agentKey, input/output references and a confidence-score link, proving the Decision→Agent→Evidence chain is intact.',
    // No agent — this checks AgentExecution traceability directly.
    automatable: true,
  },
  {
    id: 'TEST-23',
    title: 'End-to-End Sigma Validation',
    lifecycleStage: 'Full Lifecycle',
    inputs: ['the project node', 'every registered L1→L8 + EXT agent', 'pipeline correlation thread'],
    expectedOutputs: ['full pipeline run', 'per-agent executions', 'final consolidated governance status'],
    successCriteria:
      'The full L1→L8 + EXT pipeline runs end-to-end for the project, producing at least one agent execution and a consolidated final status.',
    // No agent — this runs the full orchestrator pipeline.
    automatable: true,
  },
];
