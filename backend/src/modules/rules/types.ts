import { Activity, Project, Report, Resource, ResourceAssignment } from '../canonical/entities';
import { AlertSeverity } from '../../common/enums';

/** Current-snapshot of one project (only isCurrent rows). */
export interface ProjectSnapshot {
  project: Project;
  activities: Activity[];
  resources: Resource[];
  assignments: ResourceAssignment[];
  reports: Report[];
}

/** Draft alert produced by a Rule; the engine persists it as an Alert row. */
export interface AlertDraft {
  code: string;
  severity: AlertSeverity;
  summary: string;
  context: Record<string, unknown>;

  projectId: string;
  activityId?: string;
  resourceId?: string;
  assignmentId?: string;
  reportId?: string;

  /** Source traceability of the data that triggered this alert. */
  ingestionRunId: string;
  sourceFileId: string;
}

/** Thresholds tuned in one place; later cycles will move these to config. */
export interface RuleConfig {
  /** Activity is "behind plan" when actual% + this < planned% (default 5%). */
  scheduleBehindThreshold: number;
  /** Cost overrun triggers when actualCost > budgetedCost * this (default 1.10). */
  costOverrunThreshold: number;
  /** Duration overrun triggers when actualDays > plannedDays * this (default 1.10). */
  durationOverrunThreshold: number;
  /** Resource underuse triggers when actualUnits / plannedUnits < this (default 0.70). */
  resourceUnderuseThreshold: number;
  /** Stale-reporting triggers if no report within this many days from dataDate (default 14). */
  staleReportingDays: number;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  scheduleBehindThreshold: 0.05,
  costOverrunThreshold: 1.1,
  durationOverrunThreshold: 1.1,
  resourceUnderuseThreshold: 0.7,
  staleReportingDays: 14,
};

/** Pure rule: takes a snapshot, returns alert drafts. No DB side effects. */
export interface Rule {
  readonly code: string;
  readonly defaultSeverity: AlertSeverity;
  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[];
}
