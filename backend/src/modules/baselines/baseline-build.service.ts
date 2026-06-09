import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BaselineBuildJob } from '../canonical/entities';

/**
 * The `failureReason` carried by every gated job until ADR-0011 (Computer Use
 * safety) flips from `Proposed` to `Accepted` on Al Ayham's open question 6.
 *
 * Surfaced as a constant so the spec, the UI, and any future ops query can
 * key off the exact same string without re-typing it.
 */
export const COMPUTER_USE_GATED_REASON =
  'Computer Use integration gated on ADR-0011 status flip per open question 6';

/** Initial state every Wave 2 baseline job parks in. */
export const AWAITING_ENABLEMENT_STATUS = 'awaiting-enablement';

/** Wave-2 default planner persona for any caller that omits `personaSlug`. */
export const DEFAULT_PLANNER_PERSONA_SLUG = 'planner-p6-25yr';

/**
 * BaselineBuildWorker — Wave 2 **stub**.
 *
 * Per the 2026-06-08 post-meeting plan §3.1 + ADR-0011, the actual AI-driven
 * Primavera P6 baseline build is the very last thing we wire up: it requires
 * Anthropic Computer Use, which itself is gated on Al Ayham approving the 12
 * guardrails in ADR-0011 (open question 6). Until that ADR flips to
 * `Accepted` we accept submissions, record the requested persona + drawings,
 * and immediately mark the job `awaiting-enablement` with a deterministic
 * `failureReason` so the front-end can render the reason without inspecting
 * any AI surface.
 *
 * Wave 3+ will replace the no-op `submitJob` with the real Computer Use
 * driver. The signature here is the contract: anyone calling `submitJob`
 * today gets back a row they can later observe transition to
 * `running → awaiting-approval → committed`.
 */
@Injectable()
export class BaselineBuildService {
  constructor(
    @InjectRepository(BaselineBuildJob)
    private readonly jobs: Repository<BaselineBuildJob>,
  ) {}

  /**
   * Record a baseline build request. **No work is performed** — the job is
   * persisted in the gated initial state and returned. Wave 3+ will pick it
   * up off the cross-layer Outbox once ADR-0011 is Accepted.
   */
  async submitJob(
    projectKey: string,
    drawingsSourceFileIds: string[],
    personaSlug: string = DEFAULT_PLANNER_PERSONA_SLUG,
  ): Promise<BaselineBuildJob> {
    if (!projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!Array.isArray(drawingsSourceFileIds)) {
      throw new BadRequestException('drawingsSourceFileIds must be an array');
    }
    const job = this.jobs.create({
      projectBusinessKey: projectKey,
      drawingsSourceFileIds,
      personaSlug: personaSlug || DEFAULT_PLANNER_PERSONA_SLUG,
      status: AWAITING_ENABLEMENT_STATUS,
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      outputXerSourceFileId: null,
      operatorNotes: null,
      failureReason: COMPUTER_USE_GATED_REASON,
    });
    return this.jobs.save(job);
  }

  /** All jobs attached to one project, newest first. */
  listJobs(projectKey: string): Promise<BaselineBuildJob[]> {
    return this.jobs.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getJob(id: string): Promise<BaselineBuildJob> {
    const row = await this.jobs.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No baseline build job with id ${id}`);
    return row;
  }
}
