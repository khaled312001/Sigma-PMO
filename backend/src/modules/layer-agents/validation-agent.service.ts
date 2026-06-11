import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer } from '../../common/enums';
import {
  AgentExecution,
  ConfidenceScore,
  Project,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { RuleEngineService } from '../rules/rule-engine.service';
import { SIGMA_RULE_LIBRARY } from '../knowledge/rule-catalog';

/**
 * L2 Validation Agent (Mr. Ayham's Layer 2) — the existing deterministic rule
 * engine, retrofitted into the standardized Agent Contract. The underlying
 * `RuleEngineService` is unchanged (still Syed-reviewable, deterministic); this
 * wrapper just makes it a conformant agent: it opens an `AgentExecution` audit
 * row, derives a consistency confidence, and emits a cross-layer Outbox event.
 *
 * Objective: data quality + schedule/progress/resource validation + conflict
 * detection. Output: rule alerts. Confidence: data consistency derived from
 * the finding mix.
 */
@Injectable()
export class ValidationAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly ruleEngine: RuleEngineService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l2.validation',
      layer: AgentLayer.L2_VALIDATION,
      objective:
        'Validate ingested project data: quality, missing information, ' +
        'schedule/progress validation, resource validation, conflict detection.',
      inputs: ['canonical snapshot (activities, resources, assignments, reports)'],
      outputs: ['rule alerts (info/warning/critical)', 'data-consistency confidence'],
      ruleReferences: SIGMA_RULE_LIBRARY.map((r) => r.code),
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l2.validation');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new Error(`No current project "${projectKey}"`);

    const outcome = await this.ruleEngine.evaluateProject(project.id);

    const critical = outcome.bySeverity['critical'] ?? 0;
    const warning = outcome.bySeverity['warning'] ?? 0;
    // Consistency confidence: a clean validation is 1.0; criticals/warnings
    // erode it deterministically. Floor at 0.3 so the score stays meaningful.
    const consistency = Math.max(0.3, 1 - (critical * 0.1 + warning * 0.02));

    return {
      outputRefs: {
        evaluationId: outcome.evaluationId,
        alertCount: outcome.alertCount,
        byCode: outcome.byCode,
        bySeverity: outcome.bySeverity,
      },
      confidence: {
        overall: consistency,
        consistency,
        breakdown: { critical, warning, rule: 'validation-consistency-v1' },
      },
      outboxEvents: [
        {
          eventType: 'agent.l2.validation.completed',
          payload: { projectKey, evaluationId: outcome.evaluationId, alertCount: outcome.alertCount },
        },
      ],
      summary: `Validated ${projectKey}: ${outcome.alertCount} alert(s) (${critical} critical, ${warning} warning).`,
    };
  }
}
