import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AgentLayer } from '../../common/enums';
import {
  AgentExecution,
  Alert,
  Claim,
  ConfidenceScore,
  GovernanceDecision,
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
import { DelayAnalysisService } from './delay-analysis.service';

/**
 * L6 Claims & Disputes Agent (Mr. Ayham's Layer 6) — contract-event analysis,
 * delay analysis, evidence linking, potential-claim identification,
 * responsibility assessment, dispute-preparation support.
 *
 * Deterministic identification: delay events come from the rule-engine alerts
 * (via DelayAnalysisService), responsibility + FIDIC clause come from the L3
 * governance decisions already on those alerts, and every claim links its
 * evidence (alert + decision ids). Upserts the claim register (one potential
 * claim per title per project). The existing FIDIC letter drafter remains the
 * dispute-prep drafting surface.
 */
@Injectable()
export class ClaimsAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    private readonly delay: DelayAnalysisService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l6.claims',
      layer: AgentLayer.L6_CLAIMS,
      objective:
        'Contract event analysis, delay analysis, evidence linking, potential ' +
        'claims identification, responsibility assessment and dispute preparation.',
      inputs: ['schedule/cost alerts (from L2)', 'governance decisions (from L3)'],
      outputs: ['potential claims (EOT/cost/variation) with linked evidence + responsibility'],
      ruleReferences: ['FIDIC 8.4/8.5 (EOT)', 'FIDIC 20.1 (claims)', 'FIDIC 13/14 (variations/payment)'],
    };
  }

  list(projectKey: string): Promise<Claim[]> {
    return this.claims.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l6.claims');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);

    const alertRows = await this.alerts.find({ where: { projectId: project.id } });
    const decisionByAlert = await this.decisionsByAlert(alertRows.map((a) => a.id));

    let identified = 0;

    // ── EOT claim from delay events ──
    const delayEvents = this.delay.fromAlerts(
      alertRows.map((a) => ({ id: a.id, code: a.code, severity: a.severity, context: a.context })),
    );
    if (delayEvents.length > 0) {
      const totalDays = this.delay.totalDelay(delayEvents);
      const evidenceAlertIds = delayEvents.map((e) => e.alertId);
      const { party, clause } = this.assessResponsibility(evidenceAlertIds, decisionByAlert, 'FIDIC 8.4');
      await this.upsertClaim(projectKey, {
        title: 'Potential extension of time (EOT)',
        type: 'eot',
        basis:
          `${delayEvents.length} delay event(s) totalling ~${totalDays} day(s) identified from the schedule analysis. ` +
          `Assess entitlement and serve notice within the contractual window.`,
        estimatedDays: totalDays,
        estimatedAmount: null,
        responsibleParty: party,
        fidicClause: clause,
        evidenceRefs: evidenceAlertIds,
        confidence: 0.7,
      });
      identified += 1;
    }

    // ── Cost / variation claim from cost overrun alerts ──
    const costAlerts = alertRows.filter((a) => a.code === 'COST_OVERRUN');
    if (costAlerts.length > 0) {
      const ids = costAlerts.map((a) => a.id);
      const { party, clause } = this.assessResponsibility(ids, decisionByAlert, 'FIDIC 13');
      await this.upsertClaim(projectKey, {
        title: 'Potential cost / variation claim',
        type: 'cost',
        basis:
          `${costAlerts.length} cost-overrun finding(s). Review whether the overrun stems from an instructed ` +
          `variation or an employer risk event, and quantify the entitlement.`,
        estimatedDays: null,
        estimatedAmount: null,
        responsibleParty: party,
        fidicClause: clause,
        evidenceRefs: ids,
        confidence: 0.65,
      });
      identified += 1;
    }

    const confidence = identified > 0 ? 0.72 : 0.7;
    return {
      outputRefs: { claimsIdentified: identified, delayEvents: delayEvents.length },
      confidence: { overall: confidence, breakdown: { rule: 'claims-identification-v1' } },
      outboxEvents: [
        {
          eventType: 'agent.l6.claims.completed',
          payload: { projectKey, claimsIdentified: identified, delayEvents: delayEvents.length },
        },
      ],
      summary: `Claims for ${projectKey}: ${identified} potential claim(s) from ${delayEvents.length} delay event(s).`,
    };
  }

  private async decisionsByAlert(alertIds: string[]): Promise<Map<string, GovernanceDecision>> {
    const map = new Map<string, GovernanceDecision>();
    if (alertIds.length === 0) return map;
    const rows = await this.decisions.find({ where: { alertId: In(alertIds) } });
    for (const d of rows) if (!map.has(d.alertId)) map.set(d.alertId, d);
    return map;
  }

  /** Responsibility + clause from the linked governance decisions (majority). */
  private assessResponsibility(
    alertIds: string[],
    decisionByAlert: Map<string, GovernanceDecision>,
    defaultClause: string,
  ): { party: string; clause: string } {
    const partyTally = new Map<string, number>();
    let clause = defaultClause;
    for (const id of alertIds) {
      const d = decisionByAlert.get(id);
      if (!d) continue;
      partyTally.set(d.responsibleParty, (partyTally.get(d.responsibleParty) ?? 0) + 1);
      if (d.fidicClause) clause = d.fidicClause;
    }
    let party = 'shared';
    let best = 0;
    for (const [p, n] of partyTally) if (n > best) { best = n; party = p; }
    return { party, clause };
  }

  private async upsertClaim(
    projectKey: string,
    fields: Omit<Partial<Claim>, 'projectBusinessKey'> & { title: string },
  ): Promise<void> {
    const existing = await this.claims.findOne({
      where: { projectBusinessKey: projectKey, title: fields.title, status: 'potential' },
    });
    const row = existing ?? this.claims.create({ projectBusinessKey: projectKey, status: 'potential', agentGenerated: true });
    Object.assign(row, fields, { projectBusinessKey: projectKey });
    await this.claims.save(row);
  }
}
