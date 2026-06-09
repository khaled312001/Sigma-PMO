import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Scenario } from '../canonical/entities';

const DEFAULT_SCENARIO_TTL_DAYS = 30;

/**
 * Sandbox simulation service (ADR-0010 §5, post-meeting plan §3.4).
 *
 * Wave 1 ships the `fork` + `listScenarios` + `discard` paths only; rule
 * re-evaluation against the snapshot, copy-on-write of Activities, and the
 * "promote to canonical" gate (the actual `commit`) are C5 work.
 */
@Injectable()
export class SimulationService {
  constructor(
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
  ) {}

  /**
   * Fork a Scenario from the project's current state. Wave 1 records the
   * fork with an **empty** `baselineSnapshot`; the snapshotter that copies
   * Activities + Alerts onto the branch lands in C5.
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
    const scenario = this.scenarios.create({
      projectBusinessKey,
      name,
      authorUserId,
      authorDisplay,
      status: 'open',
      forkedFromAt: now,
      summary,
      baselineSnapshot: {},
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
   * Promote a scenario to canonical truth. **Not implemented in Wave 1** —
   * the promotion path requires admin + signature and re-runs the six
   * deterministic rules against the merged state. Returns 501.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  commit(_scenarioId: string): Promise<{ status: 'committed' }> {
    throw new NotImplementedException('Scenario commit lands in C5');
  }
}
