import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

import { SourceType } from '../../../common/enums';
import {
  emptyDataset,
  RawDataset,
  RawRecord,
  SourceParser,
} from './parser.interface';

type XmlNode = Record<string, unknown>;

/** Normalise an XML child (which may be absent, single, or repeated) to an array. */
function toArray(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as XmlNode[];
}

function str(node: XmlNode, key: string): string | null {
  const value = node[key];
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

/**
 * Primavera P6 XML (PMXML) parser. Reads the standard APIBusinessObjects tree:
 * Projects (with nested Activities), Resources, and ResourceAssignments, mapping
 * each to the canonical-raw shape.
 */
@Injectable()
export class P6XmlParser implements SourceParser {
  readonly name = 'p6_xml';
  readonly sourceType = SourceType.P6_XML;

  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  });

  supports(filename: string, buffer: Buffer): boolean {
    if (!filename.toLowerCase().endsWith('.xml')) return false;
    // Distinguish PMXML from arbitrary XML by its root marker.
    return buffer.toString('utf8', 0, 4096).includes('APIBusinessObjects');
  }

  parse(filename: string, buffer: Buffer): RawDataset {
    const dataset = emptyDataset(this.sourceType, this.name);
    const doc = this.parser.parse(buffer.toString('utf8')) as XmlNode;
    const root = (doc.APIBusinessObjects ?? {}) as XmlNode;

    for (const project of toArray(root.Project)) {
      const projectKey = str(project, 'Id');
      dataset.projects.push({
        businessKey: projectKey,
        name: str(project, 'Name'),
        status: str(project, 'Status'),
        clientName: str(project, 'Client'),
        currency: str(project, 'Currency'),
        plannedStart: str(project, 'PlannedStartDate'),
        plannedFinish: str(project, 'FinishDate'),
        actualStart: str(project, 'ActualStartDate'),
        actualFinish: str(project, 'ActualFinishDate'),
        dataDate: str(project, 'DataDate'),
        budgetAtCompletion: str(project, 'Budget'),
        __raw: project,
      });

      for (const activity of toArray(project.Activity)) {
        dataset.activities.push({
          businessKey: str(activity, 'Id'),
          projectKey,
          wbsCode: str(activity, 'WBSCode'),
          name: str(activity, 'Name'),
          activityType: str(activity, 'Type'),
          status: str(activity, 'Status'),
          plannedStart: str(activity, 'PlannedStartDate'),
          plannedFinish: str(activity, 'PlannedFinishDate'),
          actualStart: str(activity, 'ActualStartDate'),
          actualFinish: str(activity, 'ActualFinishDate'),
          plannedDurationDays: str(activity, 'PlannedDuration'),
          remainingDurationDays: str(activity, 'RemainingDuration'),
          actualPctComplete: str(activity, 'PercentComplete'),
          budgetedCost: str(activity, 'BudgetedCost'),
          actualCost: str(activity, 'ActualCost'),
          __raw: activity,
        });
      }
    }

    for (const resource of toArray(root.Resource)) {
      dataset.resources.push({
        businessKey: str(resource, 'Id'),
        projectKey: str(resource, 'ProjectId'),
        name: str(resource, 'Name'),
        resourceType: (str(resource, 'Type') ?? 'labor').toLowerCase(),
        unitOfMeasure: str(resource, 'Unit'),
        maxUnitsPerDay: str(resource, 'MaxUnitsPerDay'),
        standardRate: str(resource, 'StandardRate'),
        __raw: resource,
      });
    }

    for (const assignment of toArray(root.ResourceAssignment)) {
      const activityKey = str(assignment, 'ActivityId');
      const resourceKey = str(assignment, 'ResourceId');
      dataset.assignments.push({
        businessKey: `${activityKey ?? '?'}::${resourceKey ?? '?'}`,
        activityKey,
        resourceKey,
        plannedUnits: str(assignment, 'PlannedUnits'),
        actualUnits: str(assignment, 'ActualUnits'),
        plannedCost: str(assignment, 'PlannedCost'),
        actualCost: str(assignment, 'ActualCost'),
        __raw: assignment,
      });
    }

    dataset.meta = {
      filename,
      counts: {
        projects: dataset.projects.length,
        activities: dataset.activities.length,
        resources: dataset.resources.length,
        assignments: dataset.assignments.length,
      },
    };
    return dataset;
  }
}
