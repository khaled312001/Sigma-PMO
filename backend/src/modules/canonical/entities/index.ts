import { Activity } from './activity.entity';
import { Alert } from './alert.entity';
import { BaselineBuildJob } from './baseline-build-job.entity';
import { BoQ } from './boq.entity';
import { BoqItem } from './boq-item.entity';
import { ClashItem } from './clash-item.entity';
import { ConfidenceScore } from './confidence-score.entity';
import { DecisionReview } from './decision-review.entity';
import { ExecutiveSummary } from './executive-summary.entity';
import { GovernanceDecision } from './governance-decision.entity';
import { GovernancePolicy } from './governance-policy.entity';
import { IngestionRun } from './ingestion-run.entity';
import { MonthlyReport } from './monthly-report.entity';
import { Persona } from './persona.entity';
import { Project } from './project.entity';
import { Report } from './report.entity';
import { Resource } from './resource.entity';
import { ResourceAssignment } from './resource-assignment.entity';
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
import { SourceFile } from './source-file.entity';
import { User } from './user.entity';

export {
  Activity,
  Alert,
  BaselineBuildJob,
  BoQ,
  BoqItem,
  ClashItem,
  ConfidenceScore,
  DecisionReview,
  ExecutiveSummary,
  GovernanceDecision,
  GovernancePolicy,
  IngestionRun,
  Letter,
  MonthlyReport,
  OutboxEvent,
  Persona,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  RuleEvaluation,
  Scenario,
  Source,
  SourceFile,
  User,
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
];
