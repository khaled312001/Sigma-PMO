import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
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

/** A project that could not be processed — surfaced so the UI shows WHY. */
export interface ReviewWorkflowFailure {
  projectKey: string;
  projectName: string;
  error: string;
}

/** Aggregate result of a (possibly multi-project) workflow run. */
export interface ReviewWorkflowResult {
  scope: 'project' | 'all';
  projectCount: number;
  totalAlertCount: number;
  totalDecisionCount: number;
  projects: ReviewWorkflowProjectResult[];
  /** Per-project failures (empty on a fully successful run). */
  failures: ReviewWorkflowFailure[];
  /** True when there were no projects to act on (clear "nothing to do" signal). */
  empty: boolean;
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
    const failures: ReviewWorkflowFailure[] = [];

    for (const project of targets) {
      // Resilient per project: one project failing (e.g. no activities yet)
      // must not fail the whole run — capture the reason and carry on so the
      // UI can show exactly which project failed and why.
      try {
        const evaluation = await this.engine.evaluateProject(project.id);
        const alerts = await this.alerts.find({
          where: { ruleEvaluationId: evaluation.evaluationId },
        });
        const decisionOutcome = await this.decisions.decideForAlerts(alerts, project.businessKey);
        results.push({
          projectKey: project.businessKey,
          projectId: project.id,
          projectName: project.name,
          evaluationId: evaluation.evaluationId,
          alertCount: evaluation.alertCount,
          decisionCount: decisionOutcome.decisionCount,
        });
      } catch (err) {
        const message = (err as Error).message ?? 'Unknown error';
        this.logger.warn(`Governance workflow: project "${project.businessKey}" failed: ${message}`);
        failures.push({ projectKey: project.businessKey, projectName: project.name, error: message });
      }
    }

    const totalAlertCount = results.reduce((acc, r) => acc + r.alertCount, 0);
    const totalDecisionCount = results.reduce((acc, r) => acc + r.decisionCount, 0);
    this.logger.log(
      `Governance workflow run over ${targets.length} project(s): ` +
        `${results.length} ok, ${failures.length} failed, ` +
        `${totalAlertCount} alert(s), ${totalDecisionCount} decision(s).`,
    );

    return {
      scope: projectKey ? 'project' : 'all',
      projectCount: results.length,
      totalAlertCount,
      totalDecisionCount,
      projects: results,
      failures,
      empty: targets.length === 0,
    };
  }

  private async resolveTargets(projectKey: string | null): Promise<Project[]> {
    // Multi-tenant: only ever act on the caller's own company's projects. The
    // projectKey arrives in the request body (not the query/params), so the
    // global ProjectScopeGuard does not cover it — scope it here.
    const cid = currentCompanyId();
    if (projectKey) {
      const where = { businessKey: projectKey, isCurrent: true } as FindOptionsWhere<Project>;
      if (cid) (where as FindOptionsWhere<Project> & { companyId: string }).companyId = cid;
      const project = await this.projects.findOne({ where });
      if (!project) throw new NotFoundException(`No current project with key "${projectKey}" in your company`);
      return [project];
    }
    const where = { isCurrent: true } as FindOptionsWhere<Project>;
    if (cid) (where as FindOptionsWhere<Project> & { companyId: string }).companyId = cid;
    return this.projects.find({ where });
  }
}
