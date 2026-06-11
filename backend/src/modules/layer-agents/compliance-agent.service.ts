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
import { GovernanceStatusService } from '../hierarchy/governance-status.service';
import { OutboxService } from '../outbox/outbox.service';
import { GovernanceDecisionService } from '../governance/governance-decision.service';
import { RuleEngineService } from '../rules/rule-engine.service';

/**
 * L3 Compliance Agent (Mr. Ayham's Layer 3) — the existing deterministic
 * governance-decision engine, retrofitted into the Agent Contract. It maps the
 * current findings to FIDIC clauses, accountability, and escalation, then
 * triggers the 4-tier governance-status recompute for the node so the
 * authoritative Green/Yellow/Orange/Red reflects the latest compliance picture.
 *
 * Objective: evaluate compliance against contract/FIDIC/governance procedures
 * + approval hierarchies. Output: governance decisions + escalations + the
 * recomputed node status.
 */
@Injectable()
export class ComplianceAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly ruleEngine: RuleEngineService,
    private readonly decisions: GovernanceDecisionService,
    private readonly status: GovernanceStatusService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l3.compliance',
      layer: AgentLayer.L3_COMPLIANCE,
      objective:
        'Evaluate compliance against contract requirements, FIDIC obligations, ' +
        'governance procedures, internal workflows and approval hierarchies.',
      inputs: ['rule alerts (from L2)', 'governance policy (from L0)'],
      outputs: ['governance decisions (FIDIC clause + accountability + escalation)', 'recomputed 4-tier status'],
      ruleReferences: ['FIDIC 8.4/8.5/8.6', 'FIDIC 13/14', 'FIDIC 20.1', 'PMI governance'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l3.compliance');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new Error(`No current project "${projectKey}"`);

    // Use the evaluation L2 produced when provided; otherwise evaluate fresh so
    // the agent is also runnable standalone.
    const evaluationId =
      (ctx.params?.evaluationId as string | undefined) ??
      (await this.ruleEngine.evaluateProject(project.id)).evaluationId;

    const outcome = await this.decisions.decideForEvaluation(evaluationId, projectKey);

    // Highest escalation across the decisions (L1 < L2 < L3).
    let maxLevel = 0;
    for (const lvl of Object.keys(outcome.byLevel ?? {})) {
      const n = Number.parseInt(lvl.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(n) && n > maxLevel) maxLevel = n;
    }
    const escalationLevel = maxLevel > 0 ? `L${maxLevel}` : null;

    // Recompute the node's authoritative 4-tier status now that decisions exist.
    const statusResult = await this.status.recomputeProject(projectKey);

    // Compliance confidence: high when decisions cover the findings cleanly.
    const confidence = outcome.decisionCount > 0 ? 0.85 : 0.7;

    return {
      outputRefs: {
        evaluationId,
        decisionCount: outcome.decisionCount,
        byParty: outcome.byParty,
        byLevel: outcome.byLevel,
        governanceStatus: statusResult.status,
      },
      confidence: { overall: confidence, breakdown: { rule: 'compliance-coverage-v1' } },
      escalationLevel,
      governanceStatus: statusResult.status,
      outboxEvents: [
        {
          eventType: 'agent.l3.compliance.completed',
          payload: {
            projectKey,
            decisionCount: outcome.decisionCount,
            escalationLevel,
            status: statusResult.status,
          },
        },
      ],
      summary: `Compliance for ${projectKey}: ${outcome.decisionCount} decision(s), status ${statusResult.status}${escalationLevel ? ` (max ${escalationLevel})` : ''}.`,
    };
  }
}
