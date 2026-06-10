import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, BoQ, Project, Scenario } from '../canonical/entities';

/**
 * Input to {@link SimulationEngineService.projectClashImpact}. Carries the
 * delta a chosen clash-resolution option would apply if approved.
 *
 * `affectedActivityKeys` is optional: when the clash option does not name
 * the activities it touches (the persona's `scopeImpact` is free text), the
 * engine falls back to the **conservative critical assumption** — it treats
 * the latest-finishing current activity as the affected one, which means
 * every impact day extends the project. The projection's `assumptions`
 * array records this so the human reviewer knows the number is a ceiling,
 * not a guarantee.
 */
export interface ClashImpactInput {
  projectKey: string;
  /** Audit anchors — stamped onto the persisted Scenario row. */
  clashId: string;
  optionIndex: number;
  optionLabel: string;
  /** Days the chosen option adds to (or, if negative, removes from) the schedule. */
  durationImpactDays: number;
  /** AED the chosen option adds, or null when the BoQ does not carry the line. */
  costImpactAED: number | null;
  /** Activity businessKeys the option touches (optional — see class doc). */
  affectedActivityKeys?: string[];
  requestedBy: string | null;
}

/** One affected activity's before/after inside a projection. */
export interface ActivityImpact {
  businessKey: string;
  name: string;
  plannedFinish: string | null;
  projectedFinish: string | null;
  /** Days of slack between this activity's finish and the project finish. */
  floatDays: number;
  /** True when the delay disappears into the activity's float (no project slip). */
  absorbedByFloat: boolean;
}

/**
 * The before/after picture the UI renders in the Simulation modal —
 * exactly the numbers Al Ayham asked for on 2026-06-08 (00:07:49):
 * "يعمل عليها فورًا simulation ويقل له: رح يصير عندك زيادة بالوقت 15 يوم
 * وزيادة بالتكاليف 100 ألف درهم".
 */
export interface SimulationProjection {
  scenarioId: string;
  projectKey: string;
  baselineStartIso: string | null;
  baselineFinishIso: string | null;
  baselineDurationDays: number | null;
  projectedFinishIso: string | null;
  projectedDurationDays: number | null;
  /** Project-level slip in days (0 when the float absorbs the delay). */
  durationDeltaDays: number;
  /** Current BoQ total (string decimal, as persisted) or null when no BoQ. */
  baselineCostAED: string | null;
  projectedCostAED: string | null;
  costDeltaAED: number | null;
  affectedActivities: ActivityImpact[];
  criticalPathChanged: boolean;
  /** Honest caveats — e.g. "no activity keys provided; assumed critical". */
  assumptions: string[];
}

/**
 * SimulationEngineService — deterministic what-if projector (Wave 6,
 * correction-plan §2.3).
 *
 * Given a clash-resolution option's (durationImpactDays, costImpactAED),
 * the engine computes the project-level slip using the **total-float
 * heuristic**: an activity delayed by D days extends the project by
 * `max(0, D - float)` where `float = projectFinish - activityFinish`.
 * This is exact for activities on the critical path (float = 0) and a
 * safe lower bound elsewhere — ingested schedules do not carry their
 * relationship graph, so a full CPM re-pass is not possible; the
 * projection's `assumptions` array says so explicitly rather than
 * pretending to a precision the data cannot support.
 *
 * Every projection persists a `Scenario` row (status `open`) carrying the
 * input + the computed numbers, so the eventual approval (ScheduleRevision)
 * can reference exactly what the human saw when they clicked Approve. The
 * scenario expires on the standard 30-day TTL if never applied.
 *
 * The engine NEVER mutates canonical truth — it reads, computes, and
 * writes only the Scenario sandbox row (post-meeting plan §3.4 contract).
 */
@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
  ) {}

  /** Project the impact of one clash-resolution option. Persists a Scenario. */
  async projectClashImpact(input: ClashImpactInput): Promise<SimulationProjection> {
    if (!input.projectKey) throw new BadRequestException('projectKey is required');
    if (!Number.isFinite(input.durationImpactDays)) {
      throw new BadRequestException('durationImpactDays must be a finite number');
    }

    const project = await this.projects.findOne({
      where: { businessKey: input.projectKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(`No current project with businessKey "${input.projectKey}"`);
    }
    const rows = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });

    const assumptions: string[] = [];
    const dated = rows.filter((a) => a.plannedFinish);
    const baselineFinish = maxIso(dated.map((a) => a.plannedFinish!));
    const baselineStart = minIso(rows.map((a) => a.plannedStart).filter(isNonNull));
    const baselineDurationDays =
      baselineStart && baselineFinish ? daysBetween(baselineStart, baselineFinish) + 1 : null;

    // Resolve the affected set.
    let affected: Activity[];
    if (input.affectedActivityKeys && input.affectedActivityKeys.length > 0) {
      affected = dated.filter((a) => input.affectedActivityKeys!.includes(a.businessKey));
      const missing = input.affectedActivityKeys.filter(
        (k) => !affected.some((a) => a.businessKey === k),
      );
      if (missing.length > 0) {
        assumptions.push(
          `Activity keys not found in the current schedule and ignored: ${missing.join(', ')}.`,
        );
      }
      if (affected.length === 0) {
        throw new BadRequestException(
          'None of the provided affectedActivityKeys exist in the current schedule.',
        );
      }
    } else if (baselineFinish) {
      // Conservative: assume the option lands on the critical path.
      affected = dated.filter((a) => a.plannedFinish === baselineFinish);
      assumptions.push(
        'No affected activities were named by the option — the engine assumed the ' +
          'latest-finishing (critical) activities are impacted. The projected slip is a ceiling.',
      );
    } else {
      affected = [];
      assumptions.push('The schedule carries no dated activities; duration impact cannot slip the finish.');
    }

    // Total-float heuristic per affected activity.
    const d = Math.round(input.durationImpactDays);
    const impacts: ActivityImpact[] = affected.map((a) => {
      const floatDays = baselineFinish ? daysBetween(a.plannedFinish!, baselineFinish) : 0;
      const projectedFinish = a.plannedFinish ? addDaysIso(a.plannedFinish, d) : null;
      return {
        businessKey: a.businessKey,
        name: a.name,
        plannedFinish: a.plannedFinish,
        projectedFinish,
        floatDays,
        absorbedByFloat: d <= floatDays,
      };
    });

    const projectSlipDays =
      d <= 0
        ? 0
        : impacts.reduce((worst, i) => Math.max(worst, Math.max(0, d - i.floatDays)), 0);
    const projectedFinishIso =
      baselineFinish !== null ? addDaysIso(baselineFinish, projectSlipDays) : null;
    const projectedDurationDays =
      baselineDurationDays !== null ? baselineDurationDays + projectSlipDays : null;

    // Cost side — read the current BoQ total when one exists.
    const boq = await this.boqs.findOne({
      where: { businessKey: `boq:${input.projectKey}`, isCurrent: true },
    });
    const baselineCostAED = boq?.totalAmount ?? null;
    const costDeltaAED = input.costImpactAED;
    const projectedCostAED =
      baselineCostAED !== null && costDeltaAED !== null
        ? (Number(baselineCostAED) + costDeltaAED).toFixed(2)
        : baselineCostAED;
    if (baselineCostAED === null) {
      assumptions.push('No current BoQ on file — the cost projection shows the option delta only.');
    }
    if (costDeltaAED === null) {
      assumptions.push(
        'The option carries no grounded AED figure (not in the BoQ) — cost impact requires a variation order estimate.',
      );
    }

    const criticalPathChanged = impacts.some((i) => !i.absorbedByFloat) && d > 0;

    // Persist the what-if as a Scenario so the approval can reference it.
    const scenario = await this.scenarios.save(
      this.scenarios.create({
        projectBusinessKey: input.projectKey,
        name: `Clash ${input.clashId.slice(0, 8)} — option ${input.optionIndex + 1}`,
        authorUserId: null,
        authorDisplay: input.requestedBy,
        status: 'open',
        forkedFromAt: new Date(),
        summary:
          `What-if for clash ${input.clashId}, option "${input.optionLabel}": ` +
          `${d >= 0 ? '+' : ''}${d} day(s), ` +
          `${costDeltaAED === null ? 'cost ungrounded' : `AED ${costDeltaAED >= 0 ? '+' : ''}${costDeltaAED}`}. ` +
          `Projected project slip: ${projectSlipDays} day(s).`,
        baselineSnapshot: {
          kind: 'clash-impact',
          input: {
            clashId: input.clashId,
            optionIndex: input.optionIndex,
            optionLabel: input.optionLabel,
            durationImpactDays: d,
            costImpactAED: costDeltaAED,
            affectedActivityKeys: impacts.map((i) => i.businessKey),
          },
          projection: {
            baselineFinishIso: baselineFinish,
            projectedFinishIso,
            durationDeltaDays: projectSlipDays,
            baselineCostAED,
            projectedCostAED,
            criticalPathChanged,
          },
        },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );

    this.logger.log(
      `Simulated clash ${input.clashId} option ${input.optionIndex + 1} on ${input.projectKey}: ` +
        `slip=${projectSlipDays}d, costDelta=${costDeltaAED ?? 'n/a'}, scenario=${scenario.id}`,
    );

    return {
      scenarioId: scenario.id,
      projectKey: input.projectKey,
      baselineStartIso: baselineStart,
      baselineFinishIso: baselineFinish,
      baselineDurationDays,
      projectedFinishIso,
      projectedDurationDays,
      durationDeltaDays: projectSlipDays,
      baselineCostAED,
      projectedCostAED,
      costDeltaAED,
      affectedActivities: impacts,
      criticalPathChanged,
      assumptions,
    };
  }
}

// ───────────────────────── pure date helpers ─────────────────────────

function isNonNull<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`);
  const b = new Date(`${bIso}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function maxIso(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

function minIso(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (d < min ? d : min));
}
