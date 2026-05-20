import { Injectable } from '@nestjs/common';

import { asDate, asFraction, asString } from '../../common/coerce';
import { ResourceType } from '../../common/enums';
import { RawDataset, RawRecord } from '../ingestion/parsers/parser.interface';
import { ValidationIssue, ValidationReport } from './validation.types';

/**
 * Initial validation layer (Cycle 1): deterministic format + structural checks
 * on a parsed dataset before it is normalised. Errors block normalisation;
 * warnings are recorded but do not block.
 */
@Injectable()
export class ValidationService {
  validate(dataset: RawDataset): ValidationReport {
    const issues: ValidationIssue[] = [];

    const projectKeys = new Set<string>();
    const activityKeys = new Set<string>();
    const resourceKeys = new Set<string>();

    // --- Projects -------------------------------------------------------
    for (const project of dataset.projects) {
      const key = asString(project.businessKey);
      if (!key) {
        issues.push(err('project', null, 'businessKey', 'MISSING_KEY', 'Project is missing a business key.'));
        continue;
      }
      if (projectKeys.has(key)) {
        issues.push(err('project', key, 'businessKey', 'DUPLICATE_KEY', `Duplicate project key "${key}".`));
      }
      projectKeys.add(key);
      if (!asString(project.name)) {
        issues.push(warn('project', key, 'name', 'MISSING_NAME', `Project "${key}" has no name.`));
      }
      checkDateOrder(issues, 'project', key, project);
    }

    // --- Resources ------------------------------------------------------
    for (const resource of dataset.resources) {
      const key = asString(resource.businessKey);
      if (!key) {
        issues.push(err('resource', null, 'businessKey', 'MISSING_KEY', 'Resource is missing a business key.'));
        continue;
      }
      resourceKeys.add(key);
      if (!asString(resource.name)) {
        issues.push(warn('resource', key, 'name', 'MISSING_NAME', `Resource "${key}" has no name.`));
      }
      const type = asString(resource.resourceType)?.toLowerCase();
      if (type && !Object.values(ResourceType).includes(type as ResourceType)) {
        issues.push(warn('resource', key, 'resourceType', 'UNKNOWN_TYPE', `Resource "${key}" has unrecognised type "${type}".`));
      }
    }

    // --- Activities -----------------------------------------------------
    for (const activity of dataset.activities) {
      const key = asString(activity.businessKey);
      if (!key) {
        issues.push(err('activity', null, 'businessKey', 'MISSING_KEY', 'Activity is missing a business key.'));
        continue;
      }
      if (activityKeys.has(key)) {
        issues.push(err('activity', key, 'businessKey', 'DUPLICATE_KEY', `Duplicate activity key "${key}".`));
      }
      activityKeys.add(key);
      if (!asString(activity.name)) {
        issues.push(warn('activity', key, 'name', 'MISSING_NAME', `Activity "${key}" has no name.`));
      }
      const projectKey = asString(activity.projectKey);
      if (!projectKey) {
        issues.push(err('activity', key, 'projectKey', 'MISSING_PARENT', `Activity "${key}" has no project reference.`));
      } else if (projectKeys.size > 0 && !projectKeys.has(projectKey)) {
        issues.push(err('activity', key, 'projectKey', 'ORPHAN', `Activity "${key}" references unknown project "${projectKey}".`));
      } else if (projectKeys.size === 0) {
        // Partial source (e.g. an activities-only CSV): cannot resolve in
        // isolation. Recorded as a warning; resolution is deferred to ingest.
        issues.push(warn('activity', key, 'projectKey', 'UNRESOLVED_PARENT', `Activity "${key}" references project "${projectKey}" not present in this dataset.`));
      }
      checkFraction(issues, 'activity', key, 'actualPctComplete', activity.actualPctComplete);
      checkFraction(issues, 'activity', key, 'plannedPctComplete', activity.plannedPctComplete);
      checkDateOrder(issues, 'activity', key, activity);
    }

    // --- Assignments ----------------------------------------------------
    for (const assignment of dataset.assignments) {
      const key = asString(assignment.businessKey);
      const activityKey = asString(assignment.activityKey);
      const resourceKey = asString(assignment.resourceKey);
      if (activityKey && activityKeys.size > 0 && !activityKeys.has(activityKey)) {
        issues.push(err('assignment', key, 'activityKey', 'ORPHAN', `Assignment references unknown activity "${activityKey}".`));
      } else if (activityKey && activityKeys.size === 0) {
        issues.push(warn('assignment', key, 'activityKey', 'UNRESOLVED_PARENT', `Assignment references activity "${activityKey}" not present in this dataset.`));
      }
      if (resourceKey && resourceKeys.size > 0 && !resourceKeys.has(resourceKey)) {
        issues.push(warn('assignment', key, 'resourceKey', 'ORPHAN', `Assignment references unknown resource "${resourceKey}".`));
      }
    }

    // --- Reports --------------------------------------------------------
    for (const report of dataset.reports) {
      const key = asString(report.businessKey);
      const projectKey = asString(report.projectKey);
      if (projectKey && !projectKeys.has(projectKey)) {
        issues.push(warn('report', key, 'projectKey', 'ORPHAN', `Report references unknown project "${projectKey}".`));
      }
      if (report.reportDate !== undefined && asDate(report.reportDate) === null) {
        issues.push(err('report', key, 'reportDate', 'BAD_DATE', `Report "${key}" has an unparseable reportDate.`));
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.length - errorCount;
    return { passed: errorCount === 0, errorCount, warningCount, issues };
  }
}

function issue(
  severity: Severity,
  entity: string,
  businessKey: string | null,
  field: string | null,
  code: string,
  message: string,
): ValidationIssue {
  return { severity, entity, businessKey, field, code, message };
}

function err(entity: string, key: string | null, field: string | null, code: string, message: string): ValidationIssue {
  return issue('error', entity, key, field, code, message);
}

function warn(entity: string, key: string | null, field: string | null, code: string, message: string): ValidationIssue {
  return issue('warning', entity, key, field, code, message);
}

function checkFraction(issues: ValidationIssue[], entity: string, key: string | null, field: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (asFraction(value) === null) {
    issues.push(warn(entity, key, field, 'BAD_NUMBER', `${entity} "${key}" has a non-numeric ${field}.`));
  }
}

function checkDateOrder(issues: ValidationIssue[], entity: string, key: string | null, record: RawRecord): void {
  const start = asDate(record.plannedStart);
  const finish = asDate(record.plannedFinish);
  if (start && finish && finish.getTime() < start.getTime()) {
    issues.push(warn(entity, key, 'plannedFinish', 'DATE_ORDER', `${entity} "${key}" planned finish precedes planned start.`));
  }
}

type Severity = ValidationIssue['severity'];
