import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { BaselineBuildJob, Project, SourceFile } from '../canonical/entities';
import { BaselineBuildService, DEFAULT_PLANNER_PERSONA_SLUG } from './baseline-build.service';
import { BaselinePdfRendererService } from './baseline-pdf-renderer.service';

interface SubmitBaselineJobBody {
  projectKey: string;
  drawingsSourceFileIds: string[];
  personaSlug?: string;
}

interface AuthorBaselineBody {
  projectKey: string;
  authoredBy: string;
  baselineName?: string;
}

interface ApproveBody {
  approvedBy: string;
}

/**
 * Baseline build surface (post-meeting plan §3.1, ADR-0011).
 *
 * Wave 2 ships the stub: submissions are accepted, persisted as
 * `awaiting-enablement`, and listed/fetched. The real Computer Use driver is
 * Wave 3+ and stays dark behind this surface until ADR-0011 is Accepted.
 *
 * Writes require `canSimulate` (any role that may fork a Scenario may also
 * queue a baseline build — contractor remains read-only here). Reads follow
 * the standard `canRead` gate.
 */
@Controller('baselines')
export class BaselinesController {
  constructor(
    private readonly baselines: BaselineBuildService,
    private readonly pdfRenderer: BaselinePdfRendererService,
    @InjectRepository(SourceFile)
    private readonly sourceFiles: Repository<SourceFile>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
  ) {}

  @Post('jobs')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  submit(@Body() body: SubmitBaselineJobBody): Promise<BaselineBuildJob> {
    if (!body?.projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!Array.isArray(body?.drawingsSourceFileIds)) {
      throw new BadRequestException('drawingsSourceFileIds must be an array');
    }
    return this.baselines.submitJob(
      body.projectKey,
      body.drawingsSourceFileIds,
      body.personaSlug ?? DEFAULT_PLANNER_PERSONA_SLUG,
    );
  }

  @Get('jobs')
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<BaselineBuildJob[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.baselines.listJobs(projectKey);
  }

  @Get('jobs/:id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<BaselineBuildJob> {
    return this.baselines.getJob(id);
  }

  /**
   * Author path (ADR-0017 Accepted). Generates a real P6 XER from the
   * project's canonical activities via XerWriterService and parks the job
   * in `awaiting-approval`. Requires `canSimulate` like submitJob.
   */
  @Post('jobs/author')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  author(@Body() body: AuthorBaselineBody): Promise<BaselineBuildJob> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.authoredBy) throw new BadRequestException('authoredBy is required');
    return this.baselines.authorBaselineFromProject({
      projectKey: body.projectKey,
      authoredBy: body.authoredBy,
      baselineName: body.baselineName,
    });
  }

  /**
   * Lightweight schedule preview — counts + first 8 activities + WBS
   * breakdown. Used by the /baselines UI to render the activity preview
   * card without downloading the full PDF.
   */
  @Get('jobs/:id/schedule.summary')
  @RequiresCapability('canRead')
  async getScheduleSummary(@Param('id') id: string): Promise<{
    activityCount: number;
    milestoneCount: number;
    criticalCount: number;
    dependencyCount: number;
    durationDays: number | null;
    wbsBreakdown: Array<{ code: string; count: number }>;
    sample: Array<{
      businessKey: string;
      name: string;
      wbsCode: string;
      plannedStart: string;
      plannedFinish: string;
      durationDays: number;
      isCritical: boolean;
      isMilestone: boolean;
      totalFloatDays: number;
    }>;
  }> {
    const job = await this.baselines.getJob(id);
    let synth = this.baselines.getSynthesized(id);
    if (!synth || synth.activities.length === 0) {
      synth = await this.baselines.resynthesise(job);
    }
    if (!synth || synth.activities.length === 0) {
      return {
        activityCount: 0,
        milestoneCount: 0,
        criticalCount: 0,
        dependencyCount: 0,
        durationDays: null,
        wbsBreakdown: [],
        sample: [],
      };
    }
    const project = await this.projects.findOne({
      where: { businessKey: job.projectBusinessKey, isCurrent: true },
    });
    const durationDays =
      project?.plannedStart && project?.plannedFinish
        ? Math.round(
            (new Date(`${project.plannedFinish}T00:00:00Z`).getTime() -
              new Date(`${project.plannedStart}T00:00:00Z`).getTime()) /
              86_400_000,
          ) + 1
        : null;
    const wbsCounts = new Map<string, number>();
    for (const a of synth.activities) {
      const root = a.wbsCode.split('.').slice(0, 2).join('.');
      wbsCounts.set(root, (wbsCounts.get(root) ?? 0) + 1);
    }
    const wbsBreakdown = [...wbsCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return {
      activityCount: synth.activities.length,
      milestoneCount: synth.activities.filter((a) => a.isMilestone).length,
      criticalCount: synth.activities.filter((a) => a.isCritical && !a.isMilestone).length,
      dependencyCount: synth.dependencies.length,
      durationDays,
      wbsBreakdown,
      sample: synth.activities.slice(0, 8).map((a) => ({
        businessKey: a.businessKey,
        name: a.name,
        wbsCode: a.wbsCode,
        plannedStart: a.plannedStart,
        plannedFinish: a.plannedFinish,
        durationDays: a.plannedDurationDays,
        isCritical: a.isCritical,
        isMilestone: a.isMilestone,
        totalFloatDays: a.totalFloatDays,
      })),
    };
  }

  /** Approve an `awaiting-approval` job → flips to `committed`. */
  @Post('jobs/:id/approve')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  approve(@Param('id') id: string, @Body() body: ApproveBody): Promise<BaselineBuildJob> {
    if (!body?.approvedBy) throw new BadRequestException('approvedBy is required');
    return this.baselines.approve(id, body.approvedBy);
  }

  /**
   * Stream the .xer file produced by the Author Path. The file lives in the
   * immutable SourceFile archive — we look it up via the job's
   * `outputXerSourceFileId` and pipe the on-disk bytes to the caller.
   */
  @Get('jobs/:id/xer')
  @RequiresCapability('canRead')
  async downloadXer(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const job = await this.baselines.getJob(id);
    if (!job.outputXerSourceFileId) {
      throw new NotFoundException(`Job ${id} has no .xer output (status=${job.status}).`);
    }
    const file = await this.sourceFiles.findOne({ where: { id: job.outputXerSourceFileId } });
    if (!file) {
      throw new NotFoundException(`SourceFile ${job.outputXerSourceFileId} not found.`);
    }
    let size: number | null = null;
    try {
      const s = await stat(file.storedPath);
      size = s.size;
    } catch {
      throw new NotFoundException(`XER file for job ${id} is missing on disk.`);
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="baseline-${job.projectBusinessKey}-${id.slice(0, 8)}.xer"`,
    );
    if (size !== null) res.setHeader('Content-Length', String(size));
    createReadStream(file.storedPath).pipe(res);
  }

  /**
   * Stream a senior-planner-style schedule PDF for the job — programme
   * cover, full Activity table (Activity ID / Name / Duration / Start /
   * Finish / Float, hierarchical WBS), Critical Path page, dependencies
   * table, sign-off block. Mirrors the Primavera P6 PDF print layout.
   */
  @Get('jobs/:id/schedule.pdf')
  @RequiresCapability('canRead')
  async downloadSchedulePdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const job = await this.baselines.getJob(id);
    // The synthesised plan lives in-process. After a backend restart it is
    // gone; re-derive it deterministically from the project's plannedStart
    // / plannedFinish so the same PDF can be rendered indefinitely without
    // re-running the author flow.
    let synth = this.baselines.getSynthesized(id);
    if (!synth || synth.activities.length === 0) {
      synth = await this.baselines.resynthesise(job);
    }
    if (!synth || synth.activities.length === 0) {
      throw new NotFoundException(
        `Job ${id} has no schedule available — the project has no plannedStart / plannedFinish on file.`,
      );
    }
    const project = await this.projects.findOne({
      where: { businessKey: job.projectBusinessKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(`No current project with key "${job.projectBusinessKey}"`);
    }
    const result = await this.pdfRenderer.render({
      project,
      baselineName: null,
      authoredBy: job.personaSlug,
      activities: synth.activities,
      dependencies: synth.dependencies,
      jobId: id,
    });
    const absolutePath = this.pdfRenderer.resolveAbsolutePath(result.storedPath);
    let size: number | null = null;
    try {
      const s = await stat(absolutePath);
      size = s.size;
    } catch {
      throw new NotFoundException(`Rendered PDF for baseline job ${id} not found on disk.`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="baseline-${job.projectBusinessKey}-${id.slice(0, 8)}.pdf"`,
    );
    if (size !== null) res.setHeader('Content-Length', String(size));
    createReadStream(absolutePath).pipe(res);
  }
}
