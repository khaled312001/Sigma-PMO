import { Injectable } from '@nestjs/common';

import { SourceType } from '../../../common/enums';
import { emptyDataset, RawDataset, SourceParser } from './parser.interface';

/** P6 logs durations in hours; the canonical model stores days. */
const HOURS_PER_DAY = 8;

/**
 * P6ApiParser — maps the JSON envelope produced by the live P6 EPPM REST
 * connector (`P6ClientService`) into the canonical-raw shape the Normalizer
 * consumes. This is the live-pull sibling of the file parsers: identical output
 * contract, so a live P6 sync rides the exact same validate → normalise →
 * confidence pipeline as an uploaded `.xer`. Selected by the `.p6json`
 * extension or the `"kind":"p6-eppm-rest"` marker.
 */
@Injectable()
export class P6ApiParser implements SourceParser {
  readonly name = 'p6-api';
  readonly sourceType = SourceType.P6_API;

  supports(filename: string, buffer: Buffer): boolean {
    if (filename.toLowerCase().endsWith('.p6json')) return true;
    const head = buffer.subarray(0, 256).toString('utf8');
    return head.includes('"kind"') && head.includes('p6-eppm-rest');
  }

  parse(filename: string, buffer: Buffer): RawDataset {
    const dataset = emptyDataset(this.sourceType, this.name);
    let env: P6Envelope;
    try {
      env = JSON.parse(buffer.toString('utf8')) as P6Envelope;
    } catch (e) {
      dataset.meta = { error: `Invalid P6 live envelope JSON: ${(e as Error).message}` };
      return dataset;
    }

    const projectKey = str(env.project?.Id) ?? str(env.project?.ObjectId) ?? 'P6-LIVE';

    if (env.project) {
      const p = env.project;
      dataset.projects.push({
        businessKey: projectKey,
        name: str(p.Name) ?? projectKey,
        status: str(p.Status) ?? null,
        clientName: null,
        currency: null,
        dataDate: str(p.DataDate),
        plannedStart: str(p.PlannedStartDate) ?? str(p.StartDate),
        plannedFinish: str(p.FinishDate),
        actualStart: str(p.ActualStartDate),
        actualFinish: str(p.ActualFinishDate),
        budgetAtCompletion: num(p.OriginalBudget),
        __raw: p,
      });
    }

    for (const a of env.activities ?? []) {
      dataset.activities.push({
        businessKey: str(a.Id) ?? str(a.ObjectId) ?? '',
        projectKey,
        wbsCode: str(a.WBSCode),
        name: str(a.Name) ?? '',
        activityType: mapActivityType(str(a.Type)),
        status: str(a.Status) ?? null,
        plannedStart: str(a.StartDate),
        plannedFinish: str(a.FinishDate),
        actualStart: str(a.ActualStartDate),
        actualFinish: str(a.ActualFinishDate),
        plannedDurationDays: hoursToDays(num(a.PlannedDuration)),
        remainingDurationDays: hoursToDays(num(a.RemainingDuration)),
        plannedPctComplete: null,
        actualPctComplete: pct(num(a.PercentComplete)),
        budgetedCost: num(a.BudgetedTotalCost),
        actualCost: num(a.ActualTotalCost),
        __raw: a,
      });
    }

    for (const r of env.resources ?? []) {
      dataset.resources.push({
        businessKey: str(r.Id) ?? str(r.ObjectId) ?? '',
        projectKey: null,
        name: str(r.Name) ?? '',
        resourceType: mapResourceType(str(r.ResourceType)),
        unitOfMeasure: str(r.UnitOfMeasureAbbreviation),
        maxUnitsPerDay: num(r.MaxUnitsPerTime),
        standardRate: num(r.PricePerUnit),
        __raw: r,
      });
    }

    for (const s of env.assignments ?? []) {
      dataset.assignments.push({
        businessKey: str(s.ObjectId) ?? `${str(s.ActivityId)}:${str(s.ResourceId)}`,
        activityKey: str(s.ActivityId) ?? str(s.ActivityObjectId) ?? '',
        resourceKey: str(s.ResourceId) ?? str(s.ResourceObjectId) ?? '',
        plannedUnits: num(s.PlannedUnits),
        actualUnits: num(s.ActualUnits),
        plannedCost: num(s.PlannedCost),
        actualCost: num(s.ActualCost),
        __raw: s,
      });
    }

    dataset.meta = {
      source: 'p6-eppm-rest',
      filename,
      database: env.database ?? null,
      counts: {
        projects: dataset.projects.length,
        activities: dataset.activities.length,
        resources: dataset.resources.length,
        assignments: dataset.assignments.length,
      },
    };
    return dataset as RawDataset;
  }
}

// ───────────────────────── helpers ─────────────────────────

interface P6Record {
  [key: string]: unknown;
}
interface P6Envelope {
  kind?: string;
  database?: string | null;
  project?: P6Record | null;
  activities?: P6Record[];
  resources?: P6Record[];
  assignments?: P6Record[];
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function hoursToDays(hours: number | null): number | null {
  if (hours === null) return null;
  return Math.round((hours / HOURS_PER_DAY) * 100) / 100;
}

/** P6 PercentComplete is 0–100; the canonical model stores a 0–1 fraction. */
function pct(value: number | null): number | null {
  if (value === null) return null;
  const f = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, f));
}

function mapActivityType(type: string | null): string {
  if (!type) return 'task';
  return /milestone/i.test(type) ? 'milestone' : 'task';
}

function mapResourceType(type: string | null): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('material')) return 'material';
  if (t.includes('nonlabor') || t.includes('non-labor') || t.includes('equip')) return 'nonlabor';
  return 'labor';
}
