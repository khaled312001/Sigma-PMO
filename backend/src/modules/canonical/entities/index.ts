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
import { Persona } from './persona.entity';
import { Project } from './project.entity';
import { Report } from './report.entity';
import { Resource } from './resource.entity';
import { ResourceAssignment } from './resource-assignment.entity';
import { RuleEvaluation } from './rule-evaluation.entity';
import { Scenario } from './scenario.entity';
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
  Persona,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  RuleEvaluation,
  Scenario,
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
];
