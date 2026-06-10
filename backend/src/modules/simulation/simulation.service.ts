import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Activity, Alert, Project, Scenario } from '../canonical/entities';

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
   * Promote a scenario to canonical truth. The clash-resolution path goes
   * through `ScheduleRevisionService.applyClashResolution` (ADR-0023);
   * generic scenario promotion (arbitrary edits → canonical) remains
   * gated on the admin + signature flow and is not exposed here.
   */
  async commit(scenarioId: string): Promise<{ status: 'committed' }> {
    const scenario = await this.scenarios.findOne({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException(`No scenario with id ${scenarioId}`);
    scenario.status = 'committed';
    await this.scenarios.save(scenario);
    return { status: 'committed' };
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
