import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer } from '../../common/enums';
import {
  AgentExecution,
  Alert,
  ConfidenceScore,
  Project,
  Risk,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { AnalyticsAgentService } from '../analytics/analytics-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { RiskScoringService } from './risk-scoring.service';

interface RiskCandidate {
  title: string;
  category: string;
  probability: number;
  impact: number;
  source: string;
  mitigation: string;
}

/**
 * L5 Risk Agent (Mr. Ayham's Layer 5) — early risk identification, probability/
 * impact assessment, prioritization, mitigation recommendations, escalation
 * triggers. Deterministic: it derives risks from the L2 alerts and the L4 EVM
 * signals (no LLM), scores each with `RiskScoringService`, and upserts the
 * register (one open risk per title per project — re-runs refresh, not
 * duplicate). Critical/high risks set an escalation trigger.
 */
@Injectable()
export class RiskAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
    private readonly scoring: RiskScoringService,
    private readonly analytics: AnalyticsAgentService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l5.risk',
      layer: AgentLayer.L5_RISK,
      objective:
        'Early risk identification, probability/impact assessment, risk ' +
        'prioritization, mitigation recommendations and escalation triggers.',
      inputs: ['rule alerts (from L2)', 'EVM indicators (from L4)'],
      outputs: ['scored risk register entries (probability × impact)', 'mitigations', 'escalation triggers'],
      ruleReferences: ['PMI Risk Management', 'ISO 31000'],
    };
  }

  list(projectKey: string): Promise<Risk[]> {
    return this.risks.find({
      where: { projectBusinessKey: projectKey },
      order: { priorityScore: 'DESC' },
    });
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l5.risk');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);

    const candidates = await this.deriveCandidates(project.id, projectKey);

    let maxPriority = 0;
    let escalations = 0;
    for (const c of candidates) {
      const scored = this.scoring.score(c.probability, c.impact);
      maxPriority = Math.max(maxPriority, scored.priorityScore);
      const needsEsc = this.scoring.needsEscalation(scored.priorityScore);
      if (needsEsc) escalations += 1;

      const existing = await this.risks.findOne({
        where: { projectBusinessKey: projectKey, title: c.title, status: 'open' },
      });
      const row = existing ?? this.risks.create({ projectBusinessKey: projectKey, title: c.title, status: 'open', agentGenerated: true });
      row.category = c.category;
      row.probability = scored.probability;
      row.impact = scored.impact;
      row.priorityScore = scored.priorityScore;
      row.tier = scored.tier;
      row.source = c.source;
      row.mitigation = c.mitigation;
      row.escalationTrigger = needsEsc
        ? `Escalate to ${scored.tier === 'critical' ? 'L3 (governance board)' : 'L2 (project director)'} — priority ${scored.priorityScore}.`
        : null;
      await this.risks.save(row);
    }

    const escalationLevel = maxPriority >= 0.6 ? 'L3' : maxPriority >= 0.35 ? 'L2' : null;
    // Risk confidence: derived signals are well-grounded; moderate-high.
    const confidence = candidates.length > 0 ? 0.8 : 0.7;

    return {
      outputRefs: {
        riskCount: candidates.length,
        maxPriority: Math.round(maxPriority * 1000) / 1000,
        escalations,
      },
      confidence: { overall: confidence, breakdown: { rule: 'risk-derivation-v1' } },
      escalationLevel,
      outboxEvents: [
        {
          eventType: 'agent.l5.risk.completed',
          payload: { projectKey, riskCount: candidates.length, maxPriority: Math.round(maxPriority * 1000) / 1000 },
        },
      ],
      summary: `Risk register for ${projectKey}: ${candidates.length} risk(s), max priority ${Math.round(maxPriority * 1000) / 1000}${escalationLevel ? ` (${escalationLevel})` : ''}.`,
    };
  }

  /** Deterministic risk derivation from L2 alerts + L4 EVM. */
  private async deriveCandidates(projectId: string, projectKey: string): Promise<RiskCandidate[]> {
    const out: RiskCandidate[] = [];
    const alertRows = await this.alerts.find({ where: { projectId } });

    // 1) Risks from the alert mix, grouped by rule code.
    const byCode = new Map<string, { critical: number; warning: number; total: number }>();
    for (const a of alertRows) {
      const e = byCode.get(a.code) ?? { critical: 0, warning: 0, total: 0 };
      if (a.severity === 'critical') e.critical += 1;
      else if (a.severity === 'warning') e.warning += 1;
      e.total += 1;
      byCode.set(a.code, e);
    }
    for (const [code, e] of byCode) {
      if (e.critical === 0 && e.warning < 3) continue; // only material signals
      const probability = Math.min(1, 0.4 + e.total * 0.05);
      const impact = e.critical > 0 ? 0.85 : 0.5;
      out.push({
        title: `${humanizeCode(code)} risk`,
        category: categoryForCode(code),
        probability,
        impact,
        source: code,
        mitigation: mitigationForCode(code),
      });
    }

    // 2) Risks from EVM (cost/schedule performance).
    try {
      const a = await this.analytics.computeProject(projectKey);
      if (a.evm.cpi !== null && a.evm.cpi < 0.95) {
        out.push({
          title: 'Cost overrun risk',
          category: 'cost',
          probability: Math.min(1, 0.5 + (0.95 - a.evm.cpi)),
          impact: 0.8,
          source: 'EVM:CPI',
          mitigation: 'Re-baseline cost forecast; review committed vs incurred cost; tighten change control on variations.',
        });
      }
      const scheduleSlipping = (a.evm.spi !== null && a.evm.spi < 0.95) || a.productivity.progressDeltaPct < -5;
      if (scheduleSlipping) {
        out.push({
          title: 'Schedule slippage risk',
          category: 'schedule',
          probability: a.evm.spi !== null ? Math.min(1, 0.5 + (0.95 - a.evm.spi)) : 0.6,
          impact: 0.85,
          source: a.evm.spi !== null ? 'EVM:SPI' : 'progress-delta',
          mitigation: 'Critical-path recovery analysis; consider acceleration/resequencing; issue early-warning notice under the contract.',
        });
      }
    } catch {
      // analytics unavailable for this node — alert-derived risks still stand.
    }

    return out;
  }
}

function humanizeCode(code: string): string {
  return code.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function categoryForCode(code: string): string {
  if (code.startsWith('COST')) return 'cost';
  if (code.startsWith('SCHEDULE') || code.startsWith('DURATION')) return 'schedule';
  if (code.startsWith('RESOURCE')) return 'resource';
  if (code.startsWith('STALE')) return 'contractual';
  return 'schedule';
}
function mitigationForCode(code: string): string {
  const map: Record<string, string> = {
    SCHEDULE_FINISH_SLIPPED: 'Run a critical-path recovery analysis and issue an early-warning notice; assess EOT entitlement.',
    SCHEDULE_BEHIND_PLAN: 'Resequence near-term activities; add resources to lagging paths; tighten look-ahead control.',
    DURATION_OVERRUN: 'Investigate productivity drivers; revise remaining-duration estimates; confirm crew availability.',
    COST_OVERRUN: 'Freeze discretionary spend; re-forecast EAC; route variations through change control.',
    RESOURCE_UNDERUSE: 'Re-level resources to the critical path; confirm subcontractor mobilisation.',
    STALE_REPORTING: 'Enforce the reporting cadence under the governance SOP; escalate non-submission.',
  };
  return map[code] ?? 'Investigate the underlying deviation and define a corrective action with an owner and due date.';
}
