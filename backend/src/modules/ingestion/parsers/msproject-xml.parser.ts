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
 * Parse an ISO 8601 duration like "PT80H0M0S" or "P1DT4H" into days using
 * the conventional 8-hour MSProject workday. Returns null if unparseable.
 */
function isoDurationToDays(value: string | null): number | null {
  if (!value) return null;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!m) return null;
  const d = Number.parseFloat(m[1] ?? '0');
  const h = Number.parseFloat(m[2] ?? '0');
  const min = Number.parseFloat(m[3] ?? '0');
  const sec = Number.parseFloat(m[4] ?? '0');
  const totalHours = d * 24 + h + min / 60 + sec / 3600;
  return totalHours / 8;
}

/**
 * Microsoft Project 2013+ XML parser. Reads the Project / Tasks / Resources
 * / Assignments tree (schema "http://schemas.microsoft.com/project") and
 * maps each entity to the canonical-raw shape used by the Normalizer.
 *
 * Tasks with `OutlineLevel === 0` (the project summary task) are skipped.
 */
@Injectable()
export class MSProjectXmlParser implements SourceParser {
  readonly name = 'msproject_xml';
  readonly sourceType = SourceType.MSPROJECT_XML;

  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  });

  supports(filename: string, buffer: Buffer): boolean {
    if (!filename.toLowerCase().endsWith('.xml')) return false;
    const head = buffer.toString('utf8', 0, 4096);
    return head.includes('schemas.microsoft.com/project');
  }

  parse(filename: string, buffer: Buffer): RawDataset {
    const dataset = emptyDataset(this.sourceType, this.name);
    const doc = this.parser.parse(buffer.toString('utf8')) as XmlNode;
    const root = (doc.Project ?? {}) as XmlNode;

    const projectKey = str(root, 'Title') ?? str(root, 'Name') ?? str(root, 'UID') ?? 'PROJECT';
    dataset.projects.push({
      businessKey: projectKey,
      name: str(root, 'Title') ?? str(root, 'Name'),
      status: str(root, 'Status'),
      clientName: str(root, 'Company'),
      currency: str(root, 'CurrencyCode'),
      plannedStart: str(root, 'StartDate'),
      plannedFinish: str(root, 'FinishDate'),
      actualStart: str(root, 'ActualStart') ?? str(root, 'StartDate'),
      actualFinish: str(root, 'ActualFinish'),
      dataDate: str(root, 'StatusDate'),
      __raw: root,
    });

    const tasks = (root.Tasks ?? {}) as XmlNode;
    for (const task of toArray(tasks.Task)) {
      // Skip the project summary task.
      if (str(task, 'OutlineLevel') === '0') continue;

      const taskKey = str(task, 'UID');
      if (!taskKey) continue;
      const pctComplete = str(task, 'PercentComplete');
      dataset.activities.push({
        businessKey: taskKey,
        projectKey,
        wbsCode: str(task, 'WBS') ?? str(task, 'OutlineNumber'),
        name: str(task, 'Name'),
        activityType: str(task, 'Type'),
        status: str(task, 'Summary') === '1' ? 'Summary' : null,
        plannedStart: str(task, 'Start'),
        plannedFinish: str(task, 'Finish'),
        actualStart: str(task, 'ActualStart'),
        actualFinish: str(task, 'ActualFinish'),
        plannedDurationDays: isoDurationToDays(str(task, 'Duration')),
        remainingDurationDays: isoDurationToDays(str(task, 'RemainingDuration')),
        actualPctComplete: pctComplete,
        budgetedCost: str(task, 'Cost'),
        actualCost: str(task, 'ActualCost'),
        __raw: task,
      });
    }

    const resources = (root.Resources ?? {}) as XmlNode;
    for (const resource of toArray(resources.Resource)) {
      const rid = str(resource, 'UID');
      if (!rid) continue;
      const typeCode = str(resource, 'Type');
      // MS Project: 0 = Material, 1 = Work (labour). Cost type = 2 in newer.
      const resourceType = typeCode === '0' ? 'material' : typeCode === '2' ? 'nonlabor' : 'labor';
      dataset.resources.push({
        businessKey: rid,
        projectKey,
        name: str(resource, 'Name'),
        resourceType,
        unitOfMeasure: str(resource, 'MaterialLabel'),
        maxUnitsPerDay: str(resource, 'MaxUnits'),
        standardRate: str(resource, 'StandardRate'),
        __raw: resource,
      });
    }

    const assignments = (root.Assignments ?? {}) as XmlNode;
    for (const assignment of toArray(assignments.Assignment)) {
      const taskUid = str(assignment, 'TaskUID');
      const resourceUid = str(assignment, 'ResourceUID');
      if (!taskUid || !resourceUid) continue;
      const work = isoDurationToDays(str(assignment, 'Work'));
      const actualWork = isoDurationToDays(str(assignment, 'ActualWork'));
      dataset.assignments.push({
        businessKey: `${taskUid}::${resourceUid}`,
        activityKey: taskUid,
        resourceKey: resourceUid,
        plannedUnits: work !== null ? work * 8 : null, // back to hours
        actualUnits: actualWork !== null ? actualWork * 8 : null,
        plannedCost: str(assignment, 'Cost'),
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
