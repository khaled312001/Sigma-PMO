import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { Alert, Project, RuleEvaluation } from '../canonical/entities';
import { EvaluateDto } from './dto/evaluate.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { ReviewWorkflowResult, ReviewWorkflowService } from './review-workflow.service';
import { RuleEngineService, RuleEvaluationOutcome } from './rule-engine.service';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly engine: RuleEngineService,
    private readonly workflow: ReviewWorkflowService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(RuleEvaluation) private readonly evaluations: Repository<RuleEvaluation>,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  registeredRules() {
    return this.engine.registeredRules();
  }

  @Post('evaluate')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async evaluate(@Body() body: EvaluateDto): Promise<RuleEvaluationOutcome> {
    if (body.projectKey) {
      const project = await this.projects.findOne({
        where: { businessKey: body.projectKey, isCurrent: true },
      });
      if (!project) throw new NotFoundException(`No current project with key "${body.projectKey}"`);
      return this.engine.evaluateProject(project.id);
    }
    if (body.projectId) return this.engine.evaluateProject(body.projectId);
    return this.engine.evaluateAll();
  }

  /**
   * One-click automated governance-review workflow: evaluate -> decide for one
   * project (or every current project when `projectKey` is omitted). Returns
   * per-project `{projectKey, alertCount, decisionCount}` so the review page
   * can toast the outcome without a second round-trip.
   */
  @Post('workflows/run')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  runWorkflow(@Body() body: RunWorkflowDto): Promise<ReviewWorkflowResult> {
    return this.workflow.run(body?.projectKey ?? null);
  }

  /**
   * List alerts, enriched with the stable project businessKey (joined from
   * the versioned project row that was current when the alert fired). The
   * businessKey is what client-side rollups MUST group by — alert.projectId
   * pins to a specific project VERSION and undercounts when newer ingestion
   * runs roll the project to a new version row.
   */
  @Get('alerts')
  @RequiresCapability('canRead')
  async listAlerts(
    @Query('evaluationId') evaluationId?: string,
    @Query('projectId') projectId?: string,
    @Query('projectKey') projectKey?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    const qb = this.alerts
      .createQueryBuilder('a')
      .leftJoin('project', 'p', 'p.id = a.projectId')
      .select('a.id', 'id')
      .addSelect('a.code', 'code')
      .addSelect('a.severity', 'severity')
      .addSelect('a.summary', 'summary')
      .addSelect('a.projectId', 'projectId')
      .addSelect('p.businessKey', 'projectBusinessKey')
      .addSelect('a.activityId', 'activityId')
      .addSelect('a.resourceId', 'resourceId')
      .addSelect('a.assignmentId', 'assignmentId')
      .addSelect('a.reportId', 'reportId')
      .addSelect('a.ingestionRunId', 'ingestionRunId')
      .addSelect('a.sourceFileId', 'sourceFileId')
      .addSelect('a.ruleEvaluationId', 'ruleEvaluationId')
      .addSelect('a.context', 'context')
      .addSelect('a.createdAt', 'createdAt')
      .orderBy('a.createdAt', 'DESC')
      .limit(take);
    if (evaluationId) qb.andWhere('a.ruleEvaluationId = :evaluationId', { evaluationId });
    if (projectId)   qb.andWhere('a.projectId = :projectId', { projectId });
    if (projectKey)  qb.andWhere('p.businessKey = :projectKey', { projectKey });
    if (severity)    qb.andWhere('a.severity = :severity', { severity });
    // Multi-tenant: an alert belongs to the caller's company iff its (joined)
    // project does. Null cid = unscoped (legacy/tests) → no extra filter.
    const cid = currentCompanyId();
    if (cid) qb.andWhere('p.companyId = :cid', { cid });
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => ({
      ...r,
      // context is stored as JSON; MySQL driver may hand it back as string
      context: typeof r.context === 'string' ? JSON.parse(r.context) : r.context,
    }));
  }

  @Get('evaluations')
  @RequiresCapability('canRead')
  listEvaluations(@Query('limit') limit?: string): Promise<RuleEvaluation[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 100);
    // Multi-tenant: scope to the caller's company via the evaluated project
    // (RuleEvaluation has no companyId; its project carries it).
    const qb = this.evaluations
      .createQueryBuilder('e')
      .leftJoin('project', 'p', 'p.id = e.projectId')
      .orderBy('e.createdAt', 'DESC')
      .take(take);
    const cid = currentCompanyId();
    if (cid) qb.andWhere('p.companyId = :cid', { cid });
    return qb.getMany();
  }
}
