import { Injectable } from '@nestjs/common';

import { daysBetween } from '../../../common/dates';
import { ReportType } from '../../../common/enums';
import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Reporting-cadence window in days. A weekly report is expected at least every
 * {@link WEEKLY_WINDOW_DAYS} days; if none has landed in the window ending at
 * the project data date, the contractor has gone dark on the weekly cadence.
 */
const WEEKLY_WINDOW_DAYS = 14;

/**
 * Cross-source consistency rule (L2). Flags when there is NO weekly Report
 * dated within the {@link WEEKLY_WINDOW_DAYS}-day window before the project
 * `dataDate`. This is the cadence-gap variant of `STALE_REPORTING`, scoped
 * specifically to the *weekly* obligation (FIDIC progress reporting) rather
 * than any report at all.
 *
 * Severity INFO by design — a missed weekly is a process signal, not yet a
 * contractual default. The governance layer escalates it if it persists.
 *
 * Deterministic-first: pure date arithmetic against `dataDate`. No LLM.
 */
@Injectable()
export class MissingWeeklyReportRule implements Rule {
  readonly code = 'MISSING_WEEKLY_REPORT';
  readonly defaultSeverity = AlertSeverity.INFO;

  evaluate(snapshot: ProjectSnapshot, _config: RuleConfig): AlertDraft[] {
    const { project, reports } = snapshot;
    if (!project.dataDate) return [];

    const weeklies = reports.filter((r) => r.reportType === ReportType.WEEKLY && r.reportDate);

    // Most recent weekly within the window ending at dataDate?
    const latestWeekly = [...weeklies].sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0];

    const ageDays = latestWeekly
      ? daysBetween(latestWeekly.reportDate, project.dataDate)
      : null;

    // A weekly inside the window clears the rule.
    if (ageDays !== null && ageDays >= 0 && ageDays <= WEEKLY_WINDOW_DAYS) return [];

    const summary = latestWeekly
      ? `No weekly report for "${project.name}" in the last ${WEEKLY_WINDOW_DAYS} day(s) ` +
        `(latest weekly ${latestWeekly.reportDate} is ${ageDays ?? '?'} day(s) before data date ${project.dataDate}).`
      : `Project "${project.name}" has no weekly reports on file as of data date ${project.dataDate}.`;

    return [
      {
        code: this.code,
        severity: this.defaultSeverity,
        summary,
        context: {
          dataDate: project.dataDate,
          windowDays: WEEKLY_WINDOW_DAYS,
          latestWeeklyDate: latestWeekly?.reportDate ?? null,
          ageDays,
          weeklyCount: weeklies.length,
        },
        projectId: project.id,
        reportId: latestWeekly?.id,
        ingestionRunId: latestWeekly?.ingestionRunId ?? project.ingestionRunId,
        sourceFileId: latestWeekly?.sourceFileId ?? project.sourceFileId,
      },
    ];
  }
}
