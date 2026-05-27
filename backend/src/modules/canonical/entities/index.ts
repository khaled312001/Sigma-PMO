import { Activity } from './activity.entity';
import { Alert } from './alert.entity';
import { ConfidenceScore } from './confidence-score.entity';
import { ExecutiveSummary } from './executive-summary.entity';
import { GovernanceDecision } from './governance-decision.entity';
import { GovernancePolicy } from './governance-policy.entity';
import { IngestionRun } from './ingestion-run.entity';
import { Project } from './project.entity';
import { Report } from './report.entity';
import { Resource } from './resource.entity';
import { ResourceAssignment } from './resource-assignment.entity';
import { RuleEvaluation } from './rule-evaluation.entity';
import { SourceFile } from './source-file.entity';
import { User } from './user.entity';

export {
  Activity,
  Alert,
  ConfidenceScore,
  ExecutiveSummary,
  GovernanceDecision,
  GovernancePolicy,
  IngestionRun,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  RuleEvaluation,
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
  User,
];
