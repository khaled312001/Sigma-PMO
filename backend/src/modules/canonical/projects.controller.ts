import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';

import { companyScope, currentCompanyId } from '../../common/tenant/tenant-context';
import { IngestionStatus, SourceType } from '../../common/enums';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { IngestionRun, Project, SourceFile } from './entities';
import { ProjectScores, ProjectsScoresService } from './projects-scores.service';

export interface ProjectSummary {
  id: string;
  businessKey: string;
  name: string;
  status: string | null;
  clientName: string | null;
  dataDate: string | null;
  scenarioType: string | null;
}

/** ProjectSummary plus the additive deterministic score bundle (Agent A). */
export type ProjectSummaryWithScores = ProjectSummary & Partial<ProjectScores>;

/** DTO for manual project creation from the UI. */
interface CreateProjectDto {
  businessKey: string;
  name: string;
  clientName?: string | null;
  status?: string | null;
  currency?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  budgetAtCompletion?: string | null;
  /** Demo archetype: new-from-sketch | stalled | disputed. */
  scenarioType?: string | null;
}

/** DTO for updating an existing project. */
interface UpdateProjectDto {
  name?: string;
  clientName?: string | null;
  status?: string | null;
  currency?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  budgetAtCompletion?: string | null;
  scenarioType?: string | null;
}

/**
 * Listing + manual creation of canonical projects. The listing endpoint is used
 * by the front-end ProjectSwitcher (Phase 6), and the create endpoint allows
 * adding a project shell directly from the /projects page without uploading a
 * schedule file first.
 *
 * The listing is decorated with a deterministic per-project score bundle
 * (governance / risk / investment / composite + project + portfolio rankings).
 * The original fields are untouched; the scores are purely additive so existing
 * consumers keep working.
 */
@Controller('projects')
export class ProjectsController {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
    private readonly scores: ProjectsScoresService,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  async list(
    @Query('scenarioType') scenarioType?: string,
  ): Promise<ProjectSummaryWithScores[]> {
    const where = { isCurrent: true, ...companyScope() } as Record<string, unknown>;
    // Optional project-types filter (new-from-sketch | stalled | disputed).
    if (scenarioType) where.scenarioType = scenarioType;
    const rows = await this.projects.find({
      where,
      order: { name: 'ASC' },
    });

    // Decorate with scores. A failure here must NOT break the switcher: the
    // base summary is the contract, scores are best-effort.
    let scoreMap: Map<string, ProjectScores>;
    try {
      scoreMap = await this.scores.scoreAll(rows);
    } catch {
      scoreMap = new Map();
    }

    return rows.map((p) => ({
      id: p.id,
      businessKey: p.businessKey,
      name: p.name,
      status: p.status,
      clientName: p.clientName,
      dataDate: p.dataDate,
      scenarioType: p.scenarioType ?? null,
      ...(scoreMap.get(p.businessKey) ?? {}),
    }));
  }

  /**
   * Manually create a project shell from the UI. Creates the required stub
   * SourceFile + IngestionRun records (every canonical entity extends
   * TraceableEntity which needs ingestionRunId + sourceFileId), then inserts
   * the Project itself. The project can later be enriched via the Universal
   * Input page or file ingestion.
   */
  @Post()
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async create(@Body() body: CreateProjectDto): Promise<ProjectSummaryWithScores> {
    const key = (body.businessKey ?? '').trim();
    const name = (body.name ?? '').trim();
    if (!key || !name) {
      throw new ConflictException('businessKey and name are required');
    }

    // Check for duplicate businessKey within the same company scope.
    const existing = await this.projects.findOne({
      where: { businessKey: key, isCurrent: true, ...companyScope() },
    });
    if (existing) {
      throw new ConflictException(`A project with key "${key}" already exists`);
    }

    const companyId = currentCompanyId();

    // Create a stub SourceFile (manual-entry sentinel).
    const sf = await this.sourceFiles.save(
      Object.assign(new SourceFile(), {
        companyId,
        filename: `manual-project-${key}.json`,
        sourceType: SourceType.CSV,
        contentSha256: randomBytes(32).toString('hex'),
        byteSize: 0,
        storedPath: '__manual__',
      }),
    );

    // Create a stub IngestionRun tied to that source file.
    const run = await this.runs.save(
      Object.assign(new IngestionRun(), {
        companyId,
        sourceFileId: sf.id,
        parser: 'manual',
        status: IngestionStatus.NORMALIZED,
        startedAt: new Date(),
        finishedAt: new Date(),
        validationPassed: true,
        rowCounts: { project: 1 },
        summary: { source: 'manual-ui', projectKey: key },
      }),
    );

    // Create the project.
    const project = await this.projects.save(
      Object.assign(new Project(), {
        companyId,
        ingestionRunId: run.id,
        sourceFileId: sf.id,
        businessKey: key,
        version: 1,
        isCurrent: true,
        rawSource: { source: 'manual-ui', ...body },
        name,
        clientName: body.clientName?.trim() || null,
        status: body.status?.trim() || 'active',
        currency: body.currency?.trim() || null,
        plannedStart: body.plannedStart || null,
        plannedFinish: body.plannedFinish || null,
        budgetAtCompletion: body.budgetAtCompletion || null,
        scenarioType: body.scenarioType?.trim() || null,
      }),
    );

    return {
      id: project.id,
      businessKey: project.businessKey,
      name: project.name,
      status: project.status,
      clientName: project.clientName,
      dataDate: project.dataDate,
      scenarioType: project.scenarioType ?? null,
    };
  }

  /**
   * Update an existing project's editable fields.
   */
  @Patch(':id')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
  ): Promise<ProjectSummaryWithScores> {
    const project = await this.projects.findOne({
      where: { id, isCurrent: true, ...companyScope() },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (body.name !== undefined) project.name = body.name.trim();
    if (body.clientName !== undefined) project.clientName = body.clientName?.trim() || null;
    if (body.status !== undefined) project.status = body.status?.trim() || null;
    if (body.currency !== undefined) project.currency = body.currency?.trim() || null;
    if (body.plannedStart !== undefined) project.plannedStart = body.plannedStart || null;
    if (body.plannedFinish !== undefined) project.plannedFinish = body.plannedFinish || null;
    if (body.budgetAtCompletion !== undefined) project.budgetAtCompletion = body.budgetAtCompletion || null;
    if (body.scenarioType !== undefined) project.scenarioType = body.scenarioType?.trim() || null;

    await this.projects.save(project);

    return {
      id: project.id,
      businessKey: project.businessKey,
      name: project.name,
      status: project.status,
      clientName: project.clientName,
      dataDate: project.dataDate,
      scenarioType: project.scenarioType ?? null,
    };
  }

  /**
   * Soft-delete a project by marking it as no longer current.
   * The row is preserved for audit/traceability (append-only model).
   */
  @Delete(':id')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const project = await this.projects.findOne({
      where: { id, isCurrent: true, ...companyScope() },
    });
    if (!project) throw new NotFoundException('Project not found');

    project.isCurrent = false;
    await this.projects.save(project);

    return { ok: true };
  }
}
