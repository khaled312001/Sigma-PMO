import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Activity, Project, Scenario } from '../canonical/entities';
import { ActivityLike, CpmResult, CpmService, RelType } from './cpm.service';

/** Default daily crash premium (AED/day) when an activity carries no budget. */
const DEFAULT_CRASH_COST_PER_DAY = 5_000;
/** Crash premium multiplier applied to the activity's own daily burn rate. */
const CRASH_PREMIUM = 1.5;
/** Max fraction of a critical activity's duration that crashing can remove. */
const MAX_CRASH_FRACTION = 0.4;

export type RecoveryStrategy = 'crash' | 'fast-track' | 're-sequence';

export interface RecoveryOption {
  strategy: RecoveryStrategy;
  label: string;
  /** Days recovered vs the un-modified CPM project duration. */
  recoveredDays: number;
  /** Direct cost of the option in AED (0 for fast-track / re-sequence). */
  costAED: number;
  /** Critical activities the option acts on. */
  targetActivityKeys: string[];
  /** Per-activity moves (crash days / overlapped link), for traceability + apply. */
  moves: RecoveryMove[];
  /** Project duration (days) after applying the option. */
  projectedDurationDays: number;
  note: string;
}

export interface RecoveryMove {
  activityKey: string;
  /** Crash: days removed. Fast-track/re-sequence: 0 (the link type changes). */
  crashDays?: number;
  /** Fast-track/re-sequence: relationship type the successor link is set to. */
  relType?: RelType;
}

export interface RecoveryProposal {
  scenarioId: string;
  projectKey: string;
  baselineDurationDays: number;
  targetFinishIso: string | null;
  requiredRecoveryDays: number;
  options: RecoveryOption[];
  criticalPath: string[];
  caveats: string[];
}

/**
 * RecoveryPlanService — schedule-recovery option generator built on the CPM
 * solver (Task 4, Primavera-CPM requirement). Given a late project + a target
 * finish, it identifies the critical-path activities and generates three
 * families of recovery options:
 *
 *   - CRASH       shorten critical activity durations at a cost; re-CPM to
 *                 measure the recovered days and price them.
 *   - FAST-TRACK  overlap FS-linked critical activities (FS→SS) where allowed;
 *                 re-CPM to measure recovered days at zero direct cost.
 *   - RE-SEQUENCE overlap the front of the critical chain (FS→SS on the first
 *                 driving links); re-CPM to measure recovered days.
 *
 * Each option is re-run through `CpmService` so `recoveredDays` is a true
 * logic-network delta, not an estimate. Proposals persist append-only as a
 * `Scenario` row (`baselineSnapshot.kind = 'recovery-plan'`) so the chosen
 * option can later be applied to revised Activity versions via
 * `ScheduleRevisionService`.
 */
@Injectable()
export class RecoveryPlanService {
  private readonly logger = new Logger(RecoveryPlanService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
    private readonly cpm: CpmService,
  ) {}

  /** Generate + persist recovery options for a (late) project. */
  async propose(projectKey: string, targetFinishIso?: string | null): Promise<RecoveryProposal> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const rows = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });

    const proposal = this.computeProposal(projectKey, rows, targetFinishIso ?? null);

    const scenario = await this.scenarios.save(
      this.scenarios.create({
        projectBusinessKey: projectKey,
        name: `Recovery plan — ${projectKey}`,
        authorUserId: null,
        authorDisplay: null,
        status: 'open',
        forkedFromAt: new Date(),
        summary:
          `Recovery options for ${projectKey}: baseline ${proposal.baselineDurationDays}d, ` +
          `required recovery ${proposal.requiredRecoveryDays}d, ` +
          `${proposal.options.length} option(s) ` +
          `(best recovers ${Math.max(0, ...proposal.options.map((o) => o.recoveredDays))}d).`,
        baselineSnapshot: {
          kind: 'recovery-plan',
          targetFinishIso: proposal.targetFinishIso,
          baselineDurationDays: proposal.baselineDurationDays,
          requiredRecoveryDays: proposal.requiredRecoveryDays,
          criticalPath: proposal.criticalPath,
          options: proposal.options as unknown as Record<string, unknown>[],
        },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );

    this.logger.log(
      `Recovery plan ${scenario.id} for ${projectKey}: ${proposal.options.length} option(s), ` +
        `required ${proposal.requiredRecoveryDays}d.`,
    );

    return { ...proposal, scenarioId: scenario.id };
  }

  /** List persisted recovery-plan scenarios for a project. */
  async listByProject(projectKey: string): Promise<Scenario[]> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    const all = await this.scenarios.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
    return all.filter((s) => (s.baselineSnapshot as { kind?: string })?.kind === 'recovery-plan');
  }

  /**
   * Apply a chosen recovery option to the canonical schedule via the
   * append-only Activity-versioning pattern (mirrors ScheduleRevisionService):
   * each affected current Activity row is retired (`isCurrent=false`) and a
   * v+1 clone becomes current with the crashed duration / overlapped link.
   * Marks the recovery Scenario `committed`.
   */
  async applyOption(input: {
    scenarioId: string;
    optionIndex: number;
    approvedBy: string;
  }): Promise<{ scenarioId: string; revisedActivityKeys: string[]; revisionNumber: number }> {
    if (!input.scenarioId) throw new BadRequestException('scenarioId is required');
    if (!input.approvedBy) throw new BadRequestException('approvedBy is required');

    const scenario = await this.scenarios.findOne({ where: { id: input.scenarioId } });
    if (!scenario) throw new NotFoundException(`No recovery scenario "${input.scenarioId}"`);
    const snapshot = scenario.baselineSnapshot as {
      kind?: string;
      options?: Array<{ strategy: RecoveryStrategy; moves: RecoveryMove[] }>;
    };
    if (snapshot?.kind !== 'recovery-plan') {
      throw new BadRequestException(`Scenario "${input.scenarioId}" is not a recovery plan`);
    }
    const option = (snapshot.options ?? [])[input.optionIndex];
    if (!option) {
      throw new BadRequestException(
        `Recovery scenario "${input.scenarioId}" has no option at index ${input.optionIndex}`,
      );
    }

    const project = await this.projects.findOne({
      where: { businessKey: scenario.projectBusinessKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(`No current project "${scenario.projectBusinessKey}"`);
    }

    const moveByKey = new Map(option.moves.map((m) => [m.activityKey, m]));
    const revisedKeys: string[] = [];
    let revisionNumber = 0;

    await this.dataSource.transaction(async (manager) => {
      const activityRepo = manager.getRepository(Activity);
      const scenarioRepo = manager.getRepository(Scenario);
      const current = await activityRepo.find({
        where: { projectId: project.id, isCurrent: true },
      });
      for (const row of current) {
        const move = moveByKey.get(row.businessKey);
        if (!move) continue;
        const crashDays = move.crashDays ?? 0;
        row.isCurrent = false;
        await activityRepo.save(row);
        const clone = activityRepo.create({
          ...row,
          id: undefined as unknown as string,
          version: row.version + 1,
          isCurrent: true,
          plannedFinish: row.plannedFinish ? addDaysIso(row.plannedFinish, -crashDays) : row.plannedFinish,
          plannedDurationDays:
            row.plannedDurationDays !== null
              ? Math.max(0, row.plannedDurationDays - crashDays)
              : row.plannedDurationDays,
          remainingDurationDays:
            row.remainingDurationDays !== null
              ? Math.max(0, row.remainingDurationDays - crashDays)
              : row.remainingDurationDays,
          predecessors: move.relType
            ? (row.predecessors ?? []).map((p) => ({ ...p, type: move.relType! }))
            : row.predecessors,
          rawSource: {
            ...(typeof row.rawSource === 'object' && row.rawSource !== null ? row.rawSource : {}),
            revisedBy: 'RecoveryPlanService',
            recoveryScenarioId: input.scenarioId,
            recoveryStrategy: option.strategy,
            approvedBy: input.approvedBy,
          },
        });
        const saved = await activityRepo.save(clone);
        revisedKeys.push(saved.businessKey);
        revisionNumber = Math.max(revisionNumber, saved.version);
      }

      scenario.status = 'committed';
      await scenarioRepo.save(scenario);
    });

    this.logger.log(
      `Applied recovery option ${input.optionIndex} (${option.strategy}) from scenario ` +
        `${input.scenarioId}: ${revisedKeys.length} activity revision(s) at rev ${revisionNumber}.`,
    );

    return { scenarioId: input.scenarioId, revisedActivityKeys: revisedKeys, revisionNumber };
  }

  // ───────────────────────── pure computation ─────────────────────────

  /** Pure proposal builder over a set of activity rows. Exposed for testing. */
  computeProposal(
    projectKey: string,
    rows: ActivityLike[],
    targetFinishIso: string | null,
  ): RecoveryProposal {
    const base = this.cpm.compute(projectKey, rows);
    const caveats: string[] = [];
    if (!base.hasLogic) {
      caveats.push(
        'The schedule carries no predecessor logic links — recovery options are computed on a ' +
          'degenerate network and should be treated as indicative only.',
      );
    }

    const criticalKeys = base.criticalPath;
    const baselineFinishDayIndex = base.projectDurationDays;
    const requiredRecoveryDays = this.requiredRecovery(base, rows, targetFinishIso);

    const options: RecoveryOption[] = [];
    const crash = this.crashOption(projectKey, rows, base, criticalKeys);
    if (crash) options.push(crash);
    const fastTrack = this.fastTrackOption(projectKey, rows, base, criticalKeys);
    if (fastTrack) options.push(fastTrack);
    const reseq = this.reSequenceOption(projectKey, rows, base, criticalKeys);
    if (reseq) options.push(reseq);

    if (options.length === 0) {
      caveats.push('No recoverable critical activities were found (nothing to crash or overlap).');
    }

    return {
      scenarioId: '',
      projectKey,
      baselineDurationDays: baselineFinishDayIndex,
      targetFinishIso,
      requiredRecoveryDays,
      options,
      criticalPath: criticalKeys,
      caveats,
    };
  }

  /** Recovery target in days: prefer an explicit target finish, else 20% of duration. */
  private requiredRecovery(base: CpmResult, rows: ActivityLike[], targetFinishIso: string | null): number {
    if (targetFinishIso) {
      const baseStart = minIso(rows.map((r) => r.plannedStart ?? null));
      if (baseStart) {
        const targetDayIndex = Math.round(
          (Date.parse(`${targetFinishIso.slice(0, 10)}T00:00:00Z`) -
            Date.parse(`${baseStart}T00:00:00Z`)) /
            86_400_000,
        );
        return Math.max(0, base.projectDurationDays - targetDayIndex);
      }
    }
    // No target finish → aim to claw back ~20% of the programme as a default.
    return Math.max(1, Math.round(base.projectDurationDays * 0.2));
  }

  /** CRASH: shorten critical activities (longest first) at a cost. */
  private crashOption(
    projectKey: string,
    rows: ActivityLike[],
    base: CpmResult,
    criticalKeys: string[],
  ): RecoveryOption | null {
    const rowByKey = new Map(rows.map((r) => [r.businessKey, r]));
    const critical = base.activities
      .filter((a) => criticalKeys.includes(a.businessKey) && a.durationDays > 1)
      .sort((x, y) => y.durationDays - x.durationDays);
    if (critical.length === 0) return null;

    const deltas = new Map<string, number>();
    const moves: RecoveryMove[] = [];
    let cost = 0;
    // Crash up to the top 3 longest critical activities by up to MAX_CRASH_FRACTION.
    for (const a of critical.slice(0, 3)) {
      const crashDays = Math.max(1, Math.floor(a.durationDays * MAX_CRASH_FRACTION));
      deltas.set(a.businessKey, -crashDays);
      moves.push({ activityKey: a.businessKey, crashDays });
      cost += crashDays * this.dailyCrashCost(rowByKey.get(a.businessKey));
    }

    const after = this.cpm.compute(projectKey, rows, { durationDeltaByKey: deltas });
    const recoveredDays = Math.max(0, base.projectDurationDays - after.projectDurationDays);

    return {
      strategy: 'crash',
      label: `Crash ${moves.length} critical activity(ies)`,
      recoveredDays,
      costAED: Math.round(cost),
      targetActivityKeys: moves.map((m) => m.activityKey),
      moves,
      projectedDurationDays: after.projectDurationDays,
      note:
        `Shortened ${moves.length} critical activity(ies) by up to ${Math.round(MAX_CRASH_FRACTION * 100)}% ` +
        `each (added crews/shifts); recovered ${recoveredDays} day(s) at a direct cost of AED ${Math.round(cost)}.`,
    };
  }

  /** FAST-TRACK: overlap FS-linked critical activities (FS→SS). Zero direct cost. */
  private fastTrackOption(
    projectKey: string,
    rows: ActivityLike[],
    base: CpmResult,
    criticalKeys: string[],
  ): RecoveryOption | null {
    // Successor critical activities whose predecessor link is FS and whose
    // predecessor is also critical → candidates to overlap.
    const relOverride = new Map<string, RelType>();
    const moves: RecoveryMove[] = [];
    for (const r of rows) {
      if (!criticalKeys.includes(r.businessKey)) continue;
      const fsPred = (r.predecessors ?? []).find(
        (p) => normType(p.type) === 'FS' && criticalKeys.includes(p.activityKey),
      );
      if (fsPred) {
        relOverride.set(r.businessKey, 'SS');
        moves.push({ activityKey: r.businessKey, relType: 'SS' });
      }
    }
    if (moves.length === 0) return null;

    const after = this.cpm.compute(projectKey, rows, { relOverrideByKey: relOverride });
    const recoveredDays = Math.max(0, base.projectDurationDays - after.projectDurationDays);
    if (recoveredDays === 0) return null;

    return {
      strategy: 'fast-track',
      label: `Fast-track ${moves.length} critical link(s) (FS→SS overlap)`,
      recoveredDays,
      costAED: 0,
      targetActivityKeys: moves.map((m) => m.activityKey),
      moves,
      projectedDurationDays: after.projectDurationDays,
      note:
        `Overlapped ${moves.length} finish-to-start critical link(s) into start-to-start; ` +
        `recovered ${recoveredDays} day(s) at no direct cost (added coordination/quality risk).`,
    };
  }

  /** RE-SEQUENCE: overlap only the first critical driving link (least-risk fast-track). */
  private reSequenceOption(
    projectKey: string,
    rows: ActivityLike[],
    base: CpmResult,
    criticalKeys: string[],
  ): RecoveryOption | null {
    // Pick the earliest-starting critical successor with an FS critical predecessor.
    const ordered = base.activities
      .filter((a) => criticalKeys.includes(a.businessKey))
      .sort((x, y) => x.es - y.es);
    let target: string | null = null;
    for (const a of ordered) {
      const r = rows.find((x) => x.businessKey === a.businessKey);
      const fsPred = (r?.predecessors ?? []).find(
        (p) => normType(p.type) === 'FS' && criticalKeys.includes(p.activityKey),
      );
      if (fsPred) {
        target = a.businessKey;
        break;
      }
    }
    if (!target) return null;

    const relOverride = new Map<string, RelType>([[target, 'SS']]);
    const after = this.cpm.compute(projectKey, rows, { relOverrideByKey: relOverride });
    const recoveredDays = Math.max(0, base.projectDurationDays - after.projectDurationDays);
    if (recoveredDays === 0) return null;

    return {
      strategy: 're-sequence',
      label: `Re-sequence the lead critical link (${target})`,
      recoveredDays,
      costAED: 0,
      targetActivityKeys: [target],
      moves: [{ activityKey: target, relType: 'SS' }],
      projectedDurationDays: after.projectDurationDays,
      note:
        `Re-sequenced the lead critical hand-off (${target}) to run in parallel with its predecessor; ` +
        `recovered ${recoveredDays} day(s) at no direct cost (lowest-risk overlap).`,
    };
  }

  private dailyCrashCost(row: ActivityLike | undefined): number {
    const budget = row?.budgetedCost;
    const duration = row ? durationDays(row) : 0;
    if (budget && duration > 0) {
      const n = Number(budget);
      if (Number.isFinite(n) && n > 0) return (n / duration) * CRASH_PREMIUM;
    }
    return DEFAULT_CRASH_COST_PER_DAY;
  }
}

// ───────────────────────── helpers ─────────────────────────

function normType(t: string): RelType {
  const up = (t ?? '').toUpperCase();
  return up === 'SS' || up === 'FF' || up === 'SF' ? (up as RelType) : 'FS';
}

function durationDays(r: ActivityLike): number {
  if (r.plannedDurationDays != null && Number.isFinite(r.plannedDurationDays)) {
    return Math.max(0, Math.round(r.plannedDurationDays));
  }
  if (r.plannedStart && r.plannedFinish) {
    const a = Date.parse(`${r.plannedStart.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${r.plannedFinish.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(0, Math.round((b - a) / 86_400_000));
  }
  return 0;
}

function minIso(dates: Array<string | null>): string | null {
  let m: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    const iso = d.slice(0, 10);
    if (m === null || iso < m) m = iso;
  }
  return m;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
