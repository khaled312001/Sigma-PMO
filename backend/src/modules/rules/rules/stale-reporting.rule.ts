import { Injectable } from '@nestjs/common';

import { daysBetween } from '../../../common/dates';
import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Project-level: flags when the most-recent ingested progress report is older
 * than `staleReportingDays` days relative to the project data date.
 */
@Injectable()
export class StaleReportingRule implements Rule {
  readonly code = 'STALE_REPORTING';
  readonly defaultSeverity = AlertSeverity.INFO;

  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[] {
    const { project, reports } = snapshot;
    if (!project.dataDate) return [];

    if (reports.length === 0) {
      return [{
        code: this.code,
        severity: AlertSeverity.WARNING,
        summary: `Project "${project.name}" has no progress reports ingested.`,
        context: { reportCount: 0 },
        projectId: project.id,
        ingestionRunId: project.ingestionRunId,
        sourceFileId: project.sourceFileId,
      }];
    }

    const latest = [...reports]
      .filter((r) => r.reportDate)
      .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0];
    if (!latest) return [];

    const ageDays = daysBetween(latest.reportDate, project.dataDate);
    if (ageDays === null || ageDays <= config.staleReportingDays) return [];

    return [{
      code: this.code,
      severity: ageDays > 30 ? AlertSeverity.WARNING : this.defaultSeverity,
      summary:
        `Latest report for "${project.name}" is ${ageDays} day(s) before the project data date ` +
        `(threshold ${config.staleReportingDays}d).`,
      context: {
        latestReportDate: latest.reportDate,
        dataDate: project.dataDate,
        ageDays,
        threshold: config.staleReportingDays,
      },
      projectId: project.id,
      reportId: latest.id,
      ingestionRunId: latest.ingestionRunId,
      sourceFileId: latest.sourceFileId,
    }];
  }
}
