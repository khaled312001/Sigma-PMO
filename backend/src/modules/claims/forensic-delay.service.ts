import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, Project } from '../canonical/entities';
import { CpmService } from '../schedule/cpm.service';

/**
 * ForensicDelayService — a deterministic forensic delay-analysis engine
 * (Mr. Ayham, 2026-06-20 acceptance point #1). It goes beyond summing slip days:
 * it overlays the approved (as-planned) programme against the as-built / forecast
 * programme, derives each activity's float-to-completion, isolates the
 * delay-DRIVING activities (those whose slip exceeds their float and therefore
 * push the completion date), windows the delay over the programme, detects
 * CONCURRENT delay (overlapping driving slips, which is non-compensable), and
 * resolves a net time-supported EOT with an entitlement STRENGTH and an explicit
 * WHY — explaining whether a delay claim is strong, moderate or weak on the
 * schedule-technical merits, not merely summarising documents.
 *
 * Deterministic-first: every number is computed from the canonical Activity rows
 * (planned vs actual dates) with named formulas; no LLM computes the delay. When
 * the imported schedule carries its relationship/logic graph (P6 TASKPRED parsed
 * into `Activity.predecessors[]`), criticality is taken from a full CPM
 * forward/backward pass (`CpmService`); otherwise it falls back to
 * float-to-completion on the dates — which branch was used is disclosed in
 * `caveats`.
 */
@Injectable()
export class ForensicDelayService {
  private readonly logger = new Logger(ForensicDelayService.name);

  static readonly VERSION = 'sigma-forensic-delay-v1';

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @Optional() private readonly cpm?: CpmService,
  ) {}

  async analyse(projectKey: string): Promise<ForensicDelayReport> {
    const project = await this.projects.findOne({ where: { businessKey: projectKey, isCurrent: true } });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const rows = await this.activities.find({ where: { projectId: project.id, isCurrent: true } });
    // When logic links are present, solve the CPM and pass the critical-key set
    // so the driving-path is taken from the network, not float-to-completion.
    let criticalKeys: Set<string> | null = null;
    const hasLogic = rows.some((a) => (a.predecessors?.length ?? 0) > 0);
    if (this.cpm && hasLogic) {
      try {
        const result = this.cpm.compute(
          projectKey,
          rows.map((a) => ({
            businessKey: a.businessKey,
            name: a.name,
            plannedStart: a.plannedStart,
            plannedFinish: a.plannedFinish,
            plannedDurationDays: a.plannedDurationDays,
            predecessors: a.predecessors,
          })),
        );
        criticalKeys = new Set(result.criticalPath);
      } catch {
        criticalKeys = null;
      }
    }
    return this.compute(
      projectKey,
      project.name,
      project.dataDate ?? null,
      project.plannedStart ?? null,
      rows,
      criticalKeys,
    );
  }

  /** Pure computation — exposed for unit testing without a DB. */
  compute(
    projectKey: string,
    projectName: string,
    dataDate: string | null,
    projectPlannedStart: string | null,
    rows: ScheduleActivity[],
    criticalKeys: Set<string> | null = null,
  ): ForensicDelayReport {
    const acts = rows
      .filter((a) => a.plannedFinish)
      .map((a) => this.toRow(a));

    const caveats = criticalKeys
      ? [
          'Critical path is taken from a full CPM forward/backward pass over the imported logic links ' +
            '(P6 TASKPRED parsed into Activity.predecessors[]): an activity is delay-driving when it sits ' +
            'on the network critical path AND its finish slip exceeds its float. Concurrency and windowing ' +
            'are then applied as below.',
          'The excusable / compensable / non-excusable split requires the contractual CAUSE of each delay ' +
            'event to be attributed (employer-risk vs contractor-risk vs neutral). This engine quantifies ' +
            'the schedule impact and isolates concurrency; cause attribution is a human/contract input.',
        ]
      : [
          'Critical path is derived from float-to-completion on the planned/actual dates: the imported ' +
            'schedule carries no relationship/logic links (Activity.predecessors[] empty), so an activity is ' +
            'treated as delay-driving when its finish slip exceeds its float to the programme completion. ' +
            'It is refined to a full CPM driving-path once logic links are imported.',
          'The excusable / compensable / non-excusable split requires the contractual CAUSE of each delay ' +
            'event to be attributed (employer-risk vs contractor-risk vs neutral). This engine quantifies ' +
            'the schedule impact and isolates concurrency; cause attribution is a human/contract input.',
        ];

    if (acts.length === 0) {
      return this.empty(projectKey, projectName, dataDate, caveats);
    }

    const asPlannedCompletion = maxDate(acts.map((a) => a.plannedFinish))!;
    const asBuiltCompletion = maxDate(acts.map((a) => a.forecastFinish ?? a.plannedFinish))!;
    const projectDelayDays = daysBetween(asPlannedCompletion, asBuiltCompletion);

    // Float to completion + driving potential (slip that exceeds float → pushes completion).
    // When a CPM critical-key set is available, an activity must ALSO sit on the
    // network critical path to count as a driver (logic-network refinement).
    for (const a of acts) {
      a.completionFloatDays = daysBetween(a.plannedFinish!, asPlannedCompletion); // ≥ 0
      a.drivingConsumptionDays = Math.max(0, a.finishVarianceDays - a.completionFloatDays);
      const onCriticalPath = criticalKeys ? !!a.businessKey && criticalKeys.has(a.businessKey) : true;
      a.isCriticalDriver = a.drivingConsumptionDays > 0 && onCriticalPath;
    }

    const drivers = acts
      .filter((a) => a.isCriticalDriver)
      .sort((x, y) => y.drivingConsumptionDays - x.drivingConsumptionDays);

    const startBase = parseDate(projectPlannedStart) ?? minDateStr(acts.map((a) => a.plannedStart ?? a.plannedFinish!));
    const windows = this.windows(startBase, asPlannedCompletion, drivers);
    const concurrency = this.concurrency(drivers);

    const netCriticalDelay = Math.max(0, projectDelayDays);
    const concurrentNonCompensable = Math.min(concurrency.concurrentDays, netCriticalDelay);
    const compensableCandidate = Math.max(0, netCriticalDelay - concurrentNonCompensable);

    const entitlement = this.entitlement(netCriticalDelay, drivers, concurrentNonCompensable, acts.length);

    const report: ForensicDelayReport = {
      projectKey,
      projectName,
      method: 'As-planned vs as-built overlay + float-to-completion windowing + concurrency netting (TIA-style net impact)',
      methodologyVersion: ForensicDelayService.VERSION,
      dataDate,
      activitiesAnalysed: acts.length,
      completedActivities: acts.filter((a) => a.isComplete).length,
      asPlannedCompletion: toISO(asPlannedCompletion),
      asBuiltOrForecastCompletion: toISO(asBuiltCompletion),
      projectDelayDays,
      criticalDrivers: drivers.slice(0, 25).map(serialiseRow),
      windows,
      concurrency,
      classification: {
        netCriticalDelayDays: netCriticalDelay,
        concurrentNonCompensableDays: concurrentNonCompensable,
        compensableCandidateDays: compensableCandidate,
        note:
          'Net critical delay is the programme completion slip (as-planned → as-built). The portion ' +
          'occurring concurrently with another independent driving delay is flagged non-compensable ' +
          '(concurrency). The remainder is the compensable CANDIDATE, subject to confirming the ' +
          'contractual cause of each driving event (excusable/compensable vs non-excusable).',
      },
      entitlement,
      caveats,
      narrative: '',
    };
    report.narrative = this.narrate(report, drivers);
    this.logger.log(
      `Forensic delay for ${projectKey}: net ${projectDelayDays}d (${drivers.length} driver(s), ` +
      `${concurrency.concurrentDays}d concurrent) → EOT ${entitlement.supportedEotDays}d [${entitlement.strength}].`,
    );
    return report;
  }

  // ──────────────────────── builders ────────────────────────

  private toRow(a: ScheduleActivity): InternalRow {
    const ps = parseDate(a.plannedStart);
    const pf = parseDate(a.plannedFinish)!; // filtered to present
    const as = parseDate(a.actualStart);
    const af = parseDate(a.actualFinish);
    const plannedDuration = num(a.plannedDurationDays) || (ps ? daysBetween(ps, pf) : 0);

    const isComplete = !!af;
    // Forecast finish: actual if complete; else project from actual start + planned
    // duration; else (not started) fall back to the planned finish (no slip info).
    let forecast: Date | null = af;
    if (!forecast) {
      if (as) forecast = addDays(as, Math.max(1, Math.round(plannedDuration)));
      else forecast = pf;
    }

    const startVar = as && ps ? daysBetween(ps, as) : 0;
    const finishVar = forecast ? daysBetween(pf, forecast) : 0;
    const actualDuration = as && forecast ? daysBetween(as, forecast) : plannedDuration;

    return {
      key: a.wbsCode || a.name || a.businessKey || 'activity',
      businessKey: a.businessKey ?? null,
      name: a.name || a.wbsCode || a.businessKey || 'Activity',
      plannedStart: ps,
      plannedFinish: pf,
      actualStart: as,
      forecastFinish: forecast,
      isComplete,
      startVarianceDays: startVar,
      finishVarianceDays: finishVar,
      durationVarianceDays: Math.round(actualDuration - plannedDuration),
      completionFloatDays: 0,
      drivingConsumptionDays: 0,
      isCriticalDriver: false,
    };
  }

  /** Split [start, completion] into up to 4 windows; sum driving consumption finishing in each. */
  private windows(start: Date | null, completion: Date, drivers: InternalRow[]): DelayWindow[] {
    if (!start || drivers.length === 0) return [];
    const span = Math.max(1, daysBetween(start, completion));
    const n = Math.min(4, Math.max(1, Math.ceil(span / 90))); // ~quarterly windows, capped at 4
    const step = Math.ceil(span / n);
    const out: DelayWindow[] = [];
    for (let i = 0; i < n; i += 1) {
      const from = addDays(start, i * step);
      const to = i === n - 1 ? completion : addDays(start, (i + 1) * step);
      const inWin = drivers.filter((d) => d.plannedFinish! >= from && d.plannedFinish! < addDays(to, 1));
      const slip = inWin.reduce((s, d) => s + d.drivingConsumptionDays, 0);
      out.push({
        index: i + 1,
        from: toISO(from)!,
        to: toISO(to)!,
        label: `Window ${i + 1} (${toISO(from)} → ${toISO(to)})`,
        drivingKeys: inWin.map((d) => d.key),
        windowSlipDays: slip,
      });
    }
    return out;
  }

  /** Concurrency: overlap of the delay periods [plannedFinish, forecastFinish] of driving activities. */
  private concurrency(drivers: InternalRow[]): { concurrentDays: number; pairs: ConcurrentPair[] } {
    const pairs: ConcurrentPair[] = [];
    let concurrentDays = 0;
    for (let i = 0; i < drivers.length; i += 1) {
      for (let j = i + 1; j < drivers.length; j += 1) {
        const a = drivers[i];
        const b = drivers[j];
        if (!a.forecastFinish || !b.forecastFinish) continue;
        const start = laterDate(a.plannedFinish!, b.plannedFinish!);
        const end = earlierDate(a.forecastFinish, b.forecastFinish);
        const overlap = daysBetween(start, end);
        if (overlap > 0) {
          pairs.push({ aKey: a.key, bKey: b.key, overlapDays: overlap });
          concurrentDays += overlap;
        }
      }
    }
    // Cap concurrency to the largest single driver's consumption (concurrency can
    // never exceed the delay actually on the path at once); keeps it defensible.
    const maxDriver = drivers.reduce((m, d) => Math.max(m, d.drivingConsumptionDays), 0);
    concurrentDays = Math.min(concurrentDays, maxDriver);
    pairs.sort((x, y) => y.overlapDays - x.overlapDays);
    return { concurrentDays, pairs: pairs.slice(0, 15) };
  }

  private entitlement(
    netCriticalDelay: number,
    drivers: InternalRow[],
    concurrentNonCompensable: number,
    totalActs: number,
  ): EntitlementVerdict {
    const supportedEotDays = Math.max(0, netCriticalDelay - concurrentNonCompensable);
    const reasons: string[] = [];
    const concurrencyFraction = netCriticalDelay > 0 ? concurrentNonCompensable / netCriticalDelay : 0;

    let strength: DelayStrength;
    if (netCriticalDelay <= 0) {
      strength = 'weak';
      reasons.push('The programme completion date did not slip (as-built ≤ as-planned), so there is no net time impact to support an EOT — individual activity slips were absorbed by float.');
    } else if (drivers.length === 0) {
      strength = 'weak';
      reasons.push('No activity slip exceeded its float to completion, so no activity actually drove the completion date — the delay is not time-supported on the critical path.');
    } else if (concurrencyFraction > 0.66) {
      strength = 'weak';
      reasons.push(`Concurrency dominates: ${Math.round(concurrencyFraction * 100)}% of the net critical delay occurs concurrently with another independent driving delay, which is generally non-compensable.`);
    } else if (concurrencyFraction <= 0.34 && supportedEotDays > 0) {
      strength = 'strong';
      reasons.push(`A clear driving path exists: ${drivers.length} activity(ies) consumed their float and pushed completion by ${netCriticalDelay} day(s), with limited concurrency (${Math.round(concurrencyFraction * 100)}%).`);
    } else {
      strength = 'moderate';
      reasons.push(`A driving path exists (${drivers.length} activity(ies), ${netCriticalDelay}-day net impact) but with material concurrency (${Math.round(concurrencyFraction * 100)}%) that reduces the compensable portion.`);
    }

    if (supportedEotDays > 0 && strength !== 'weak') {
      reasons.push(`Time-supported EOT ≈ ${supportedEotDays} day(s) (net critical delay ${netCriticalDelay}d less ${concurrentNonCompensable}d concurrent).`);
    }
    reasons.push(`${drivers.length} of ${totalActs} analysed activities sit on/near the driving path (float-to-completion consumed).`);
    reasons.push('Confirm the contractual cause of each driving event to classify it excusable/compensable vs non-excusable before serving notice.');

    return { supportedEotDays, strength, drivers: drivers.length, reasons };
  }

  private narrate(r: ForensicDelayReport, drivers: InternalRow[]): string {
    if (r.activitiesAnalysed === 0) return 'No schedule activities with planned dates were found to analyse.';
    const top = drivers.slice(0, 3).map((d) => `${d.name} (+${d.finishVarianceDays}d, float ${d.completionFloatDays}d)`).join('; ');
    const verdict = r.entitlement.strength.toUpperCase();
    return (
      `Forensic delay analysis (${r.methodologyVersion}) of ${r.activitiesAnalysed} activities. ` +
      `Approved (as-planned) completion ${r.asPlannedCompletion}; as-built/forecast completion ${r.asBuiltOrForecastCompletion} — ` +
      `a net programme slip of ${r.projectDelayDays} day(s). ` +
      (drivers.length
        ? `${drivers.length} activity(ies) drove the completion date by consuming their float to completion${top ? `: ${top}` : ''}. `
        : 'No activity consumed its float to completion, so none drove the finish date. ') +
      `Concurrency netting removes ${r.classification.concurrentNonCompensableDays} day(s) overlapping with other independent driving delays, ` +
      `leaving a compensable candidate of ${r.classification.compensableCandidateDays} day(s). ` +
      `On the schedule-technical merits the EOT position is ${verdict}: time-supported EOT ≈ ${r.entitlement.supportedEotDays} day(s). ` +
      `${r.entitlement.reasons[0]}`
    );
  }

  private empty(projectKey: string, projectName: string, dataDate: string | null, caveats: string[]): ForensicDelayReport {
    return {
      projectKey, projectName,
      method: 'As-planned vs as-built overlay + float-to-completion windowing + concurrency netting (TIA-style net impact)',
      methodologyVersion: ForensicDelayService.VERSION,
      dataDate,
      activitiesAnalysed: 0, completedActivities: 0,
      asPlannedCompletion: null, asBuiltOrForecastCompletion: null, projectDelayDays: 0,
      criticalDrivers: [], windows: [], concurrency: { concurrentDays: 0, pairs: [] },
      classification: { netCriticalDelayDays: 0, concurrentNonCompensableDays: 0, compensableCandidateDays: 0, note: 'No activities to analyse.' },
      entitlement: { supportedEotDays: 0, strength: 'weak', drivers: 0, reasons: ['No schedule activities with planned dates were found.'] },
      caveats,
      narrative: 'No schedule activities with planned dates were found to analyse for this project.',
    };
  }
}

// ──────────────────────── public shapes ────────────────────────

export type DelayStrength = 'strong' | 'moderate' | 'weak';

/** The minimal activity shape the engine reads (subset of canonical Activity). */
export interface ScheduleActivity {
  businessKey?: string | null;
  wbsCode?: string | null;
  name?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  plannedDurationDays?: number | null;
  predecessors?: Array<{ activityKey: string; type: string; lagDays: number }> | null;
}

export interface ActivityDelayRow {
  key: string;
  name: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  forecastFinish: string | null;
  isComplete: boolean;
  startVarianceDays: number;
  finishVarianceDays: number;
  durationVarianceDays: number;
  completionFloatDays: number;
  drivingConsumptionDays: number;
  isCriticalDriver: boolean;
}

export interface DelayWindow {
  index: number;
  from: string;
  to: string;
  label: string;
  drivingKeys: string[];
  windowSlipDays: number;
}

export interface ConcurrentPair {
  aKey: string;
  bKey: string;
  overlapDays: number;
}

export interface EntitlementVerdict {
  supportedEotDays: number;
  strength: DelayStrength;
  drivers: number;
  reasons: string[];
}

export interface ForensicDelayReport {
  projectKey: string;
  projectName: string;
  method: string;
  methodologyVersion: string;
  dataDate: string | null;
  activitiesAnalysed: number;
  completedActivities: number;
  asPlannedCompletion: string | null;
  asBuiltOrForecastCompletion: string | null;
  projectDelayDays: number;
  criticalDrivers: ActivityDelayRow[];
  windows: DelayWindow[];
  concurrency: { concurrentDays: number; pairs: ConcurrentPair[] };
  classification: {
    netCriticalDelayDays: number;
    concurrentNonCompensableDays: number;
    compensableCandidateDays: number;
    note: string;
  };
  entitlement: EntitlementVerdict;
  caveats: string[];
  narrative: string;
}

// ──────────────────────── internal ────────────────────────

interface InternalRow {
  key: string;
  businessKey: string | null;
  name: string;
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualStart: Date | null;
  forecastFinish: Date | null;
  isComplete: boolean;
  startVarianceDays: number;
  finishVarianceDays: number;
  durationVarianceDays: number;
  completionFloatDays: number;
  drivingConsumptionDays: number;
  isCriticalDriver: boolean;
}

function serialiseRow(a: InternalRow): ActivityDelayRow {
  return {
    key: a.key,
    name: a.name,
    plannedStart: toISO(a.plannedStart),
    plannedFinish: toISO(a.plannedFinish),
    actualStart: toISO(a.actualStart),
    forecastFinish: toISO(a.forecastFinish),
    isComplete: a.isComplete,
    startVarianceDays: a.startVarianceDays,
    finishVarianceDays: a.finishVarianceDays,
    durationVarianceDays: a.durationVarianceDays,
    completionFloatDays: a.completionFloatDays,
    drivingConsumptionDays: a.drivingConsumptionDays,
    isCriticalDriver: a.isCriticalDriver,
  };
}

// ── date utilities (deterministic, total; UTC) ──

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toISO(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function maxDate(ds: Array<Date | null>): Date | null {
  let m: Date | null = null;
  for (const d of ds) if (d && (!m || d > m)) m = d;
  return m;
}
function minDateStr(ds: Array<Date | null>): Date | null {
  let m: Date | null = null;
  for (const d of ds) if (d && (!m || d < m)) m = d;
  return m;
}
function laterDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
function earlierDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
