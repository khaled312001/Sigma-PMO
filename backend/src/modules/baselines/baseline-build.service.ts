import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceType } from '../../common/enums';
import { Activity, BaselineBuildJob, Project, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { XerWriterService } from './xer-writer.service';

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
    @Optional() @InjectRepository(Project) private readonly projects?: Repository<Project>,
    @Optional() @InjectRepository(Activity) private readonly activities?: Repository<Activity>,
    @Optional() @InjectRepository(SourceFile) private readonly sourceFiles?: Repository<SourceFile>,
    @Optional() @Inject(XerWriterService) private readonly xerWriter?: XerWriterService,
    @Optional() @Inject(StorageService) private readonly storage?: StorageService,
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

  /**
   * Author path (ADR-0017 — Accepted 2026-06-09).
   *
   * Generate a real P6 XER file from the canonical Project + Activity rows
   * for the given project. The job moves `pending → running → awaiting-approval`
   * synchronously here (the writer is fast); a human reviews the XER and
   * calls `approve()` to flip to `committed`. The XER bytes land in the
   * immutable source-file archive so the evidence chain extends naturally.
   *
   * This path uses NO Anthropic Computer Use — it is the deterministic
   * author route that replaces the MPXJ requirement.
   *
   * Throws if any of the optional dependencies (XerWriter / Storage / Project
   * repo) are missing — those are populated by the live module wiring; tests
   * that exercise only `submitJob` can leave them undefined.
   */
  async authorBaselineFromProject(input: {
    projectKey: string;
    authoredBy: string;
    baselineName?: string;
  }): Promise<BaselineBuildJob> {
    if (!input.projectKey) throw new BadRequestException('projectKey is required');
    if (!this.xerWriter || !this.storage || !this.projects || !this.activities || !this.sourceFiles) {
      throw new BadRequestException(
        'authorBaselineFromProject requires XerWriter + Storage + Project/Activity/SourceFile repos to be wired',
      );
    }

    const project = await this.projects.findOne({
      where: { businessKey: input.projectKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(`No current project with businessKey "${input.projectKey}"`);
    }
    const activities = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });

    // Create the job in `running` so observers see the lifecycle.
    const job: BaselineBuildJob = await this.jobs.save(
      this.jobs.create({
        projectBusinessKey: input.projectKey,
        drawingsSourceFileIds: [],
        personaSlug: DEFAULT_PLANNER_PERSONA_SLUG,
        status: 'running',
        progressPercent: 0,
        startedAt: new Date(),
        completedAt: null,
        outputXerSourceFileId: null,
        operatorNotes: `Author path; ${activities.length} activities; authored by ${input.authoredBy}`,
        failureReason: null,
      }),
    );

    try {
      const result = this.xerWriter.write({
        project,
        activities,
        authoredBy: input.authoredBy,
        baselineName: input.baselineName,
      });

      const sha256 = this.storage.sha256(result.buffer);
      const filename = `baseline-${input.projectKey}-${Date.now()}.xer`;
      const storedPath = await this.storage.archive(filename, result.buffer, sha256);

      const sourceFile: SourceFile = await this.sourceFiles.save(
        this.sourceFiles.create({
          filename,
          contentSha256: sha256,
          storedPath,
          byteSize: result.buffer.length,
          sourceType: SourceType.P6_XER,
        }),
      );

      job.status = 'awaiting-approval';
      job.outputXerSourceFileId = sourceFile.id;
      job.progressPercent = 100;
      job.completedAt = new Date();
      return this.jobs.save(job);
    } catch (e) {
      job.status = 'failed';
      job.failureReason = (e as Error).message;
      job.completedAt = new Date();
      await this.jobs.save(job);
      throw e;
    }
  }

  /**
   * Human approval — flips an `awaiting-approval` job to `committed`. This is
   * the gate Al Ayham asked for: the AI authored, the human approves, then
   * the XER bytes are released for whichever downstream surface (P6 desktop,
   * Computer Use replay, manual copy) wants them.
   */
  async approve(id: string, approvedBy: string): Promise<BaselineBuildJob> {
    const job = await this.getJob(id);
    if (job.status !== 'awaiting-approval') {
      throw new BadRequestException(
        `Job ${id} is in status "${job.status}" — only "awaiting-approval" can be approved.`,
      );
    }
    job.status = 'committed';
    job.operatorNotes = `${job.operatorNotes ?? ''}\nApproved by ${approvedBy} at ${new Date().toISOString()}`.trim();
    return this.jobs.save(job);
  }
}
