import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { daysBetween } from '../../common/dates';
import { Alert, GovernanceDecision, GovernancePolicy } from '../canonical/entities';
import { deriveDecisionCategory } from './decision-category';
import { GovernancePolicyConfig } from './default-policy';
import { GovernancePolicyService } from './governance-policy.service';

export interface DecisionOutcome {
  policyId: string;
  policyVersion: number;
  decisionCount: number;
  byParty: Record<string, number>;
  byLevel: Record<string, number>;
}

/**
 * Applies a governance policy to a set of alerts, producing one
 * GovernanceDecision per alert. Pure mapping logic (no LLM, no I/O beyond
 * the policy + alerts) — deterministic and Syed-reviewable.
 */
@Injectable()
export class GovernanceDecisionService {
  private readonly logger = new Logger(GovernanceDecisionService.name);

  constructor(
    private readonly policies: GovernancePolicyService,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
  ) {}

  async decideForEvaluation(ruleEvaluationId: string, projectKey: string | null): Promise<DecisionOutcome> {
    const alerts = await this.alerts.find({ where: { ruleEvaluationId } });
    return this.decideForAlerts(alerts, projectKey, new Date());
  }

  async decideForAlerts(alerts: Alert[], projectKey: string | null, asOf = new Date()): Promise<DecisionOutcome> {
    const policy = await this.policies.resolveFor(projectKey);
    const config = policy.config as unknown as GovernancePolicyConfig;

    const existing = alerts.length === 0
      ? []
      : await this.decisions.find({ where: { alertId: In(alerts.map((a) => a.id)), policyId: policy.id } });
    const existingByAlert = new Map(existing.map((d) => [d.alertId, d]));

    const drafts: GovernanceDecision[] = [];
    const byParty: Record<string, number> = {};
    const byLevel: Record<string, number> = {};

    for (const alert of alerts) {
      const decision = this.decideOne(alert, policy, config, asOf, existingByAlert.get(alert.id));
      drafts.push(decision);
      byParty[decision.responsibleParty] = (byParty[decision.responsibleParty] ?? 0) + 1;
      byLevel[decision.escalationLevel] = (byLevel[decision.escalationLevel] ?? 0) + 1;
    }

    if (drafts.length > 0) await this.decisions.save(drafts);
    this.logger.log(
      `Governance: ${drafts.length} decision(s) under policy ${policy.id} v${policy.version}.`,
    );
    return {
      policyId: policy.id,
      policyVersion: policy.version,
      decisionCount: drafts.length,
      byParty,
      byLevel,
    };
  }

  private decideOne(
    alert: Alert,
    policy: GovernancePolicy,
    config: GovernancePolicyConfig,
    asOf: Date,
    existing: GovernanceDecision | undefined,
  ): GovernanceDecision {
    const responsibleParty = config.accountability[alert.code] ?? 'shared';
    const fidic = config.fidic[alert.code] ?? null;
    const pmi = config.pmi[alert.code] ?? null;

    const ageDays = Math.max(
      0,
      daysBetween(alert.createdAt.toISOString().slice(0, 10), asOf.toISOString().slice(0, 10)) ?? 0,
    );
    const tier = config.escalation[alert.severity] ?? { ageDays: 0, level: 'L1', notify: [] };
    const escalationLevel = ageDays >= tier.ageDays ? tier.level : 'L1';
    const notifyParties = ageDays >= tier.ageDays ? tier.notify : [];

    const interventions = config.intervention[alert.code] ?? [];
    const rationaleParts = [
      `Rule ${alert.code} of severity ${alert.severity}; party: ${responsibleParty}.`,
    ];
    if (fidic) rationaleParts.push(`FIDIC mapping: ${fidic.clause} — ${fidic.notice}`);
    if (pmi) rationaleParts.push(`PMI/PMBOK: ${pmi}.`);
    rationaleParts.push(`Escalation: ${escalationLevel} (alert age ${ageDays}d, threshold ${tier.ageDays}d).`);

    const entity = existing ?? this.decisions.create({ alertId: alert.id });
    entity.policyId = policy.id;
    entity.policyVersion = policy.version;
    entity.responsibleParty = responsibleParty;
    entity.fidicClause = fidic?.clause ?? null;
    entity.fidicNotice = fidic?.notice ?? null;
    entity.fidicDeadlineDays = fidic?.deadlineDays ?? null;
    entity.escalationLevel = escalationLevel;
    entity.notifyParties = notifyParties;
    entity.interventions = interventions;
    entity.rationale = rationaleParts.join(' ');
    // R7: classify the decision domain deterministically (alert code + FIDIC
    // clause). financial | contractual | safety can NEVER be auto-approved.
    entity.category = deriveDecisionCategory(alert.code, entity.fidicClause);
    return entity;
  }
}
