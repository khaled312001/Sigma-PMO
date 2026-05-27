import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alert, Project, RuleEvaluation } from '../canonical/entities';
import { EvaluateDto } from './dto/evaluate.dto';
import { RuleEngineService, RuleEvaluationOutcome } from './rule-engine.service';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly engine: RuleEngineService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(RuleEvaluation) private readonly evaluations: Repository<RuleEvaluation>,
  ) {}

  @Get()
  registeredRules() {
    return this.engine.registeredRules();
  }

  @Post('evaluate')
  @HttpCode(200)
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

  @Get('alerts')
  listAlerts(
    @Query('evaluationId') evaluationId?: string,
    @Query('projectId') projectId?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ): Promise<Alert[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    const where: Record<string, string> = {};
    if (evaluationId) where.ruleEvaluationId = evaluationId;
    if (projectId) where.projectId = projectId;
    if (severity) where.severity = severity;
    return this.alerts.find({ where, order: { createdAt: 'DESC' }, take });
  }

  @Get('evaluations')
  listEvaluations(@Query('limit') limit?: string): Promise<RuleEvaluation[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 100);
    return this.evaluations.find({ order: { createdAt: 'DESC' }, take });
  }
}
