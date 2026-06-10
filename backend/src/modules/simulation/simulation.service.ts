import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { Activity, Alert, Project, Scenario } from '../canonical/entities';
import { OutboxService } from '../outbox/outbox.service';

/** Outbox event fired when a scenario is promoted (ADR-0012 namespace). */
export const SCENARIO_PROMOTED_EVENT_TYPE = 'simulation.scenario.promoted';

const DEFAULT_SCENARIO_TTL_DAYS = 30;

/**
 * Sandbox simulation service (ADR-0010 §5, post-meeting plan §3.4).
 *
 * Wave 1 shipped `fork` with an EMPTY snapshot. Wave 6 makes the fork
 * real: the snapshot freezes the project header, the full current
 * activity list (dates + durations + progress), and the open-alert
 * summary at fork time — so the scenario page renders an actual
 * baseline-vs-now comparison instead of `{}`.
 */
@Injectable()
export class SimulationService {
  constructor(
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  /**
   * Fork a Scenario from the project's current state, freezing a REAL
   * snapshot: project header + current activities + alert counts. Rules
   * re-evaluate against this frozen state; mutations never reach canonical.
   */
  async fork(
    projectBusinessKey: string,
    name: string,
    authorUserId: string | null,
    authorDisplay: string | null = null,
    summary = '',
  ): Promise<Scenario> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_SCENARIO_TTL_DAYS * 24 * 60 * 60 * 1000);
    const baselineSnapshot = await this.buildSnapshot(projectBusinessKey);
    const scenario = this.scenarios.create({
      projectBusinessKey,
      name,
      authorUserId,
      authorDisplay,
      status: 'open',
      forkedFromAt: now,
      summary,
      baselineSnapshot,
      expiresAt,
    });
    return this.scenarios.save(scenario);
  }

  /** All scenarios attached to a project, newest fork first. */
  listScenarios(projectBusinessKey: string): Promise<Scenario[]> {
    return this.scenarios.find({
      where: { projectBusinessKey },
      order: { forkedFromAt: 'DESC' },
    });
  }

  async discard(scenarioId: string): Promise<void> {
    const scenario = await this.scenarios.findOne({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException(`No scenario with id ${scenarioId}`);
    scenario.status = 'discarded';
    await this.scenarios.save(scenario);
  }

  /**
   * Promote a scenario (Wave 7 — the C5 gate, live).
   *
   * What promotion DOES depends on the scenario kind:
   *  - `clash-impact` scenarios promote through the clash apply gate
   *    (ScheduleRevisionService) — this method refuses them with a pointer
   *    so the schedule revision + claim letter are never skipped.
   *  - Generic / compression scenarios: status flips to `committed`, the
   *    promoter is stamped on the summary (audit), and one
   *    `simulation.scenario.promoted` event lands on the cross-layer
   *    Outbox so downstream layers (Reports, Governance) react.
   *
   * Discarded / already-committed scenarios refuse re-promotion.
   */
  async commit(
    scenarioId: string,
    promotedBy: string,
  ): Promise<{ status: 'committed'; outboxEventId: string | null }> {
    const scenario = await this.scenarios.findOne({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException(`No scenario with id ${scenarioId}`);
    if (scenario.status !== 'open') {
      throw new BadRequestException(
        `Scenario ${scenarioId} is "${scenario.status}" — only open scenarios can be promoted.`,
      );
    }
    const kind = (scenario.baselineSnapshot as { kind?: string } | null)?.kind;
    if (kind === 'clash-impact') {
      throw new BadRequestException(
        'Clash-impact scenarios promote through the clash approval gate ' +
          '(POST /clashes/:id/options/:idx/apply) so the schedule revision and the ' +
          'FIDIC claim letter are issued atomically — promote it from the /clashes page.',
      );
    }

    scenario.status = 'committed';
    scenario.summary =
      `${scenario.summary ? `${scenario.summary}\n` : ''}` +
      `Promoted to canonical by ${promotedBy} at ${new Date().toISOString()}.`;
    await this.scenarios.save(scenario);

    let outboxEventId: string | null = null;
    if (this.outbox) {
      const event = await this.outbox.push(
        Layer.SIMULATION,
        SCENARIO_PROMOTED_EVENT_TYPE,
        {
          scenarioId: scenario.id,
          projectBusinessKey: scenario.projectBusinessKey,
          name: scenario.name,
          kind: kind ?? 'generic',
          promotedBy,
        },
        undefined,
        { correlationId: scenario.id },
      );
      outboxEventId = event.id;
    }
    return { status: 'committed', outboxEventId };
  }

  // ───────────────────────── internals ─────────────────────────

  /** Freeze the project's current state into a renderable snapshot. */
  private async buildSnapshot(projectBusinessKey: string): Promise<Record<string, unknown>> {
    const project = await this.projects.findOne({
      where: { businessKey: projectBusinessKey, isCurrent: true },
    });
    if (!project) {
      return { note: `No current project row for "${projectBusinessKey}" at fork time.` };
    }
    const activities = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });
    const versionIds = (
      await this.projects.find({ where: { businessKey: projectBusinessKey }, select: { id: true } })
    ).map((p) => p.id);
    const alerts = versionIds.length
      ? await this.alerts.find({ where: { projectId: In(versionIds) }, take: 500 })
      : [];

    const dated = activities.filter((a) => a.plannedStart && a.plannedFinish);
    const projectStart = dated.length
      ? dated.map((a) => a.plannedStart!).reduce((m, x) => (x < m ? x : m))
      : null;
    const projectFinish = dated.length
      ? dated.map((a) => a.plannedFinish!).reduce((m, x) => (x > m ? x : m))
      : null;

    return {
      frozenAt: new Date().toISOString(),
      project: {
        businessKey: project.businessKey,
        name: project.name,
        status: project.status,
        dataDate: project.dataDate,
        plannedStart: projectStart,
        plannedFinish: projectFinish,
      },
      schedule: {
        activityCount: activities.length,
        completed: activities.filter((a) => (a.actualPctComplete ?? 0) >= 1).length,
        inProgress: activities.filter(
          (a) => (a.actualPctComplete ?? 0) > 0 && (a.actualPctComplete ?? 0) < 1,
        ).length,
        notStarted: activities.filter((a) => (a.actualPctComplete ?? 0) <= 0).length,
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        warning: alerts.filter((a) => a.severity === 'warning').length,
      },
      activities: activities.slice(0, 200).map((a) => ({
        businessKey: a.businessKey,
        name: a.name,
        wbsCode: a.wbsCode,
        plannedStart: a.plannedStart,
        plannedFinish: a.plannedFinish,
        plannedDurationDays: a.plannedDurationDays,
        actualPctComplete: a.actualPctComplete,
        status: a.status,
      })),
    };
  }
}
