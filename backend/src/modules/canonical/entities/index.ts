import { Activity } from './activity.entity';
import { AgentExecution } from './agent-execution.entity';
import { Alert } from './alert.entity';
import { AnalyticsSnapshot } from './analytics-snapshot.entity';
import { BaselineBuildJob } from './baseline-build-job.entity';
import { BoQ } from './boq.entity';
import { BoqItem } from './boq-item.entity';
import { Claim } from './claim.entity';
import { ClashItem } from './clash-item.entity';
import { ConceptDocument } from './concept-document.entity';
import { ConfidenceScore } from './confidence-score.entity';
import { CorrectiveAction } from './corrective-action.entity';
import { CostEstimate } from './cost-estimate.entity';
import { DecisionReview } from './decision-review.entity';
import { DrawingPackage } from './drawing-package.entity';
import { Enterprise } from './enterprise.entity';
import { ExecutiveSummary } from './executive-summary.entity';
import { FeasibilityAssessment } from './feasibility-assessment.entity';
import { FeasibilityStudySection } from './feasibility-study-section.entity';
import { FundingFacility } from './funding-facility.entity';
import { GovernanceDecision } from './governance-decision.entity';
import { GovernancePolicy } from './governance-policy.entity';
import { GovernanceStatusSnapshot } from './governance-status-snapshot.entity';
import { IngestionRun } from './ingestion-run.entity';
import { InvestmentOpportunity } from './investment-opportunity.entity';
import { LessonsLearned } from './lessons-learned.entity';
import { LifecycleLedgerEntry } from './lifecycle-ledger.entity';
import { OpportunityScreening } from './opportunity-screening.entity';
import { MonthlyReport } from './monthly-report.entity';
import { Persona } from './persona.entity';
import { Portfolio } from './portfolio.entity';
import { Program } from './program.entity';
import { ProcurementFinding } from './procurement-finding.entity';
import { ProcurementPackage } from './procurement-package.entity';
import { Project } from './project.entity';
import { ProjectMemory } from './project-memory.entity';
import { ProjectRecord } from './project-record.entity';
import { ProjectPolicyAddon } from './project-policy-addon.entity';
import { QsFinding } from './qs-finding.entity';
import { Report } from './report.entity';
import { Resource } from './resource.entity';
import { ResourceAssignment } from './resource-assignment.entity';
import { Risk } from './risk.entity';
import { RoleCapabilityOverride } from './role-capability-override.entity';
import { RuleEvaluation } from './rule-evaluation.entity';
import { Scenario } from './scenario.entity';
// `Source` is the Wave 2 curated reference catalogue (FIDIC, PMI, ISO, …). It
// lives in the sources/ module but is re-exported here so other modules can
// import via the canonical barrel like every other entity. Not added to
// `CANONICAL_ENTITIES` — SourcesModule owns its own TypeOrmModule.forFeature.
import { Source } from '../../sources/source.entity';
// `OutboxEvent` is the durable cross-layer bus row (ADR-0012, Stage 1). Lives
// in the outbox/ module but is re-exported here for the same reason as
// `Source` — modules import via this canonical barrel by convention. Not
// added to `CANONICAL_ENTITIES`; OutboxModule owns its own forFeature.
import { OutboxEvent } from '../../outbox/outbox.entity';
// `Letter` is the Wave 2 FIDIC governance artefact (post-meeting plan §3.5,
// ADR-0010 §6). Lives in the letters/ module and is re-exported here so
// downstream Wave 3 modules (notification fan-out, audit log enrichers)
// can import via the canonical barrel like every other entity. Not added
// to `CANONICAL_ENTITIES` — LettersModule owns its own forFeature.
import { Letter } from '../../letters/letter.entity';
// `OrgChartReview` is the Wave 3 PMI compliance review row. Lives in the
// org-charts/ module and is re-exported here for the same reason as
// `Letter` — modules import via this canonical barrel by convention. Not
// added to `CANONICAL_ENTITIES` — OrgChartsModule owns its own forFeature.
import { OrgChartReview } from '../../org-charts/org-chart-review.entity';
import { OutputComparison } from './output-comparison.entity';
import { SourceFile } from './source-file.entity';
import { SystemSetting } from './system-setting.entity';
import { User } from './user.entity';
import { Vendor } from './vendor.entity';
// Full governance lifecycle (2026-06-13) — the five site-governance entities.
import { SafetyRecord } from './safety-record.entity';
import { FireSafetyRecord } from './fire-safety-record.entity';
import { AuthoritySubmission } from './authority-submission.entity';
import { UtilityConnection } from './utility-connection.entity';
import { OperationalReadinessItem } from './operational-readiness-item.entity';

export {
  Activity,
  AgentExecution,
  Alert,
  AnalyticsSnapshot,
  BaselineBuildJob,
  BoQ,
  BoqItem,
  Claim,
  ClashItem,
  ConceptDocument,
  ConfidenceScore,
  CorrectiveAction,
  CostEstimate,
  DecisionReview,
  DrawingPackage,
  Enterprise,
  ExecutiveSummary,
  FeasibilityAssessment,
  FeasibilityStudySection,
  FundingFacility,
  GovernanceDecision,
  GovernancePolicy,
  GovernanceStatusSnapshot,
  IngestionRun,
  InvestmentOpportunity,
  LessonsLearned,
  LifecycleLedgerEntry,
  OpportunityScreening,
  Letter,
  MonthlyReport,
  OrgChartReview,
  OutboxEvent,
  OutputComparison,
  Persona,
  Portfolio,
  ProcurementFinding,
  ProcurementPackage,
  Program,
  Project,
  ProjectMemory,
  ProjectPolicyAddon,
  ProjectRecord,
  QsFinding,
  Report,
  Resource,
  ResourceAssignment,
  Risk,
  RoleCapabilityOverride,
  RuleEvaluation,
  Scenario,
  Source,
  SourceFile,
  SystemSetting,
  User,
  Vendor,
  SafetyRecord,
  FireSafetyRecord,
  AuthoritySubmission,
  UtilityConnection,
  OperationalReadinessItem,
};

/** All canonical ORM entities, for TypeOrmModule.forFeature registration. */
export const CANONICAL_ENTITIES = [
  SourceFile,
  IngestionRun,
  Project,
  Activity,
  Resource,
  Report,
  ResourceAssignment,
  Alert,
  RuleEvaluation,
  ConfidenceScore,
  ExecutiveSummary,
  GovernancePolicy,
  GovernanceDecision,
  DecisionReview,
  User,
  // Wave 1 additions — see ADR-0010 + post-meeting plan §3.
  Persona,
  Scenario,
  ClashItem,
  BoQ,
  BoqItem,
  BaselineBuildJob,
  // Wave 2 — Monthly Narrative Report (post-meeting plan §3.6, §5).
  // Lives in canonical so the same `forFeature(CANONICAL_ENTITIES)` pattern
  // every feature module already uses picks it up automatically.
  MonthlyReport,
  // Wave 4 — runtime-configurable settings (Claude API key entry from /admin/settings).
  SystemSetting,
  // Wave 6 — project-scoped AI instructions authored inline (correction-plan §2.6).
  ProjectPolicyAddon,
  // Wave 7 — the project "understudy" memory (correction-plan §2.11).
  ProjectMemory,
  // Wave 7 — phase-1 drawings ingestion (correction-plan §2.1/§2.7).
  DrawingPackage,
  // Wave 8 — AI-vs-Human output comparison (correction-plan §2.10).
  OutputComparison,
  // Governance OS (2026-06-11 vision) — multi-level hierarchy
  // (Enterprise → Portfolio → Program → Project), the central agent-execution
  // audit, and append-only 4-tier governance-status snapshots.
  Enterprise,
  Portfolio,
  Program,
  AgentExecution,
  GovernanceStatusSnapshot,
  // Governance OS Phase 2 — L0 Knowledge & Rules Engine: Lessons Learned.
  LessonsLearned,
  // Governance OS Phase 3 — L4 Analytics: append-only EVM/KPI snapshots.
  AnalyticsSnapshot,
  // Governance OS Phase 4 — L5 Risk register + L6 Claims & Disputes.
  Risk,
  Claim,
  // Governance OS Phase 5 — L8 Sigma Governance corrective actions.
  CorrectiveAction,
  // Admin role-capability overrides (runtime permission control).
  RoleCapabilityOverride,
  // Governance OS Phase 7 — L1 Data Collection: polymorphic project records
  // (RFI/Submittal/NCR/Change Request/Procurement/Resource/Cost/Site Photo).
  ProjectRecord,
  // Investment & Feasibility Intelligence (2026-06-11 follow-up): idea-stage
  // opportunities, append-only model runs, versioned study sections, and
  // concept-sketch documents with human-gated AI extraction.
  InvestmentOpportunity,
  FeasibilityAssessment,
  FeasibilityStudySection,
  ConceptDocument,
  // Quantity Survey Intelligence + Procurement Intelligence (2026-06-12):
  // classified cost estimates, QS governance findings, the vendor registry,
  // procurement packages, and procurement governance findings.
  CostEstimate,
  QsFinding,
  Vendor,
  ProcurementPackage,
  ProcurementFinding,
  // Quantity + Cost Governance traceability ledger (2026-06-12 follow-up):
  // append-only lifecycle chain BIM→…→Paid / Budget→…→Final with provenance.
  LifecycleLedgerEntry,
  // Active-scope additions (2026-06-12): pre-feasibility opportunity screening
  // + funding facilities (DSCR/covenants/drawdown).
  OpportunityScreening,
  FundingFacility,
  // Full governance lifecycle (2026-06-13): Safety, Fire & Life Safety,
  // Authority, Utility & Operational Readiness governance records. Bankability
  // adds no entity (it reads FeasibilityAssessment + FundingFacility).
  SafetyRecord,
  FireSafetyRecord,
  AuthoritySubmission,
  UtilityConnection,
  OperationalReadinessItem,
];
