import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alert, Project } from '../canonical/entities';
import { GovernanceDecisionService } from '../governance/governance-decision.service';
import { RuleEngineService } from './rule-engine.service';

/** One project's result inside a governance-review workflow run. */
export interface ReviewWorkflowProjectResult {
  projectKey: string;
  projectId: string;
  projectName: string;
  evaluationId: string;
  alertCount: number;
  decisionCount: number;
}

/** Aggregate result of a (possibly multi-project) workflow run. */
export interface ReviewWorkflowResult {
  scope: 'project' | 'all';
  projectCount: number;
  totalAlertCount: number;
  totalDecisionCount: number;
  projects: ReviewWorkflowProjectResult[];
}

/**
 * One-click automated governance-review workflow (L2). For a single project
 * (or every current project when no key is supplied) it runs the same two
 * steps the review page drives by hand:
 *
 *   1. evaluate — `RuleEngineService.evaluateProject` produces a fresh
 *      `RuleEvaluation` and its `Alert` rows.
 *   2. decide   — `GovernanceDecisionService.decideForAlerts` maps those
 *      alerts to `GovernanceDecision` rows under the resolved policy.
 *
 * Both steps are deterministic and already audit-traceable; this service is
 * pure orchestration so the "Run governance workflow" button is a single
 * request rather than the client firing evaluate then decide per project.
 *
 * Evaluating each project individually (rather than `evaluateAll`) is
 * deliberate: it yields one `RuleEvaluation` per project so the per-project
 * `{alertCount, decisionCount}` figures are exact and each decision batch is
 * scoped to that project's policy via its `projectKey`.
 */
@Injectable()
export class ReviewWorkflowService {
  private readonly logger = new Logger(ReviewWorkflowService.name);

  constructor(
    private readonly engine: RuleEngineService,
    private readonly decisions: GovernanceDecisionService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  async run(projectKey: string | null): Promise<ReviewWorkflowResult> {
    const targets = await this.resolveTargets(projectKey);
    const results: ReviewWorkflowProjectResult[] = [];

    for (const project of targets) {
      const evaluation = await this.engine.evaluateProject(project.id);
      const alerts = await this.alerts.find({
        where: { ruleEvaluationId: evaluation.evaluationId },
      });
      const decisionOutcome = await this.decisions.decideForAlerts(
        alerts,
        project.businessKey,
      );
      results.push({
        projectKey: project.businessKey,
        projectId: project.id,
        projectName: project.name,
        evaluationId: evaluation.evaluationId,
        alertCount: evaluation.alertCount,
        decisionCount: decisionOutcome.decisionCount,
      });
    }

    const totalAlertCount = results.reduce((acc, r) => acc + r.alertCount, 0);
    const totalDecisionCount = results.reduce((acc, r) => acc + r.decisionCount, 0);
    this.logger.log(
      `Governance workflow run over ${results.length} project(s): ` +
        `${totalAlertCount} alert(s), ${totalDecisionCount} decision(s).`,
    );

    return {
      scope: projectKey ? 'project' : 'all',
      projectCount: results.length,
      totalAlertCount,
      totalDecisionCount,
      projects: results,
    };
  }

  private async resolveTargets(projectKey: string | null): Promise<Project[]> {
    if (projectKey) {
      const project = await this.projects.findOne({
        where: { businessKey: projectKey, isCurrent: true },
      });
      if (!project) throw new NotFoundException(`No current project with key "${projectKey}"`);
      return [project];
    }
    return this.projects.find({ where: { isCurrent: true } });
  }
}
