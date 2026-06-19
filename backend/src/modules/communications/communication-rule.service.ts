import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { CommunicationRule } from './communication-rule.entity';
import {
  CommunicationRulesConfig,
  DEFAULT_COMMUNICATION_RULES,
  validateCommunicationRules,
} from './communication-rules.config';

/**
 * Loads and versions per-company communication rules. A company-specific rule
 * overrides the global default; `companyId = null` updates the global default.
 * Append-only versioned (mirrors GovernancePolicyService).
 */
@Injectable()
export class CommunicationRuleService {
  constructor(
    @InjectRepository(CommunicationRule)
    private readonly rules: Repository<CommunicationRule>,
  ) {}

  /** The current rule row for the company (company-specific, else global default). */
  async resolveRow(companyId: string | null): Promise<CommunicationRule | null> {
    if (companyId) {
      const specific = await this.rules.findOne({ where: { companyId, isCurrent: true } });
      if (specific) return specific;
    }
    return this.rules.findOne({ where: { companyId: IsNull(), isCurrent: true } });
  }

  /** Resolved, validated config for a company (always coherent — defaults applied). */
  async resolveFor(companyId: string | null): Promise<CommunicationRulesConfig> {
    const row = await this.resolveRow(companyId);
    return validateCommunicationRules((row?.config ?? DEFAULT_COMMUNICATION_RULES) as Partial<CommunicationRulesConfig>);
  }

  /** Append a new rule version for the company, retiring any prior current row. */
  async upsert(
    companyId: string | null,
    input: Partial<CommunicationRulesConfig>,
    authoredBy: string | null,
  ): Promise<CommunicationRule> {
    const config = validateCommunicationRules(input);
    const prior = await this.rules.findOne({
      where: companyId ? { companyId, isCurrent: true } : { companyId: IsNull(), isCurrent: true },
    });
    let version = 1;
    if (prior) {
      version = prior.version + 1;
      prior.isCurrent = false;
      await this.rules.save(prior);
    }
    const next = this.rules.create({
      companyId,
      version,
      isCurrent: true,
      authoredBy,
      config: config as unknown as Record<string, unknown>,
    });
    return this.rules.save(next);
  }

  listVersions(companyId: string | null): Promise<CommunicationRule[]> {
    return this.rules.find({
      where: companyId ? { companyId } : { companyId: IsNull() },
      order: { version: 'DESC' },
      take: 50,
    });
  }
}
