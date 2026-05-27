import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { GovernancePolicy } from '../canonical/entities';
import { DEFAULT_GOVERNANCE_POLICY, GovernancePolicyConfig } from './default-policy';

/**
 * Loads and versions governance policies. A project-specific policy
 * overrides the global default; setting `projectKey = null` updates the
 * global default itself. Policies are append-only versioned (mirroring the
 * canonical-model convention from Cycle 1).
 */
@Injectable()
export class GovernancePolicyService {
  constructor(
    @InjectRepository(GovernancePolicy)
    private readonly policies: Repository<GovernancePolicy>,
  ) {}

  /** Project-specific policy if present; otherwise the current global default. */
  async resolveFor(projectKey: string | null): Promise<GovernancePolicy> {
    if (projectKey) {
      const specific = await this.policies.findOne({ where: { projectKey, isCurrent: true } });
      if (specific) return specific;
    }
    const global = await this.policies.findOne({ where: { projectKey: IsNull(), isCurrent: true } });
    if (global) return global;
    // First boot: seed the default global policy.
    return this.upsert(null, DEFAULT_GOVERNANCE_POLICY, 'system');
  }

  /** Append a new policy version, retiring any prior current for the same key. */
  async upsert(
    projectKey: string | null,
    config: GovernancePolicyConfig | Record<string, unknown>,
    authoredBy: string | null,
  ): Promise<GovernancePolicy> {
    const prior = await this.policies.findOne({
      where: projectKey ? { projectKey, isCurrent: true } : { projectKey: IsNull(), isCurrent: true },
    });
    let version = 1;
    if (prior) {
      version = prior.version + 1;
      prior.isCurrent = false;
      await this.policies.save(prior);
    }
    const next = this.policies.create({
      projectKey,
      version,
      isCurrent: true,
      authoredBy,
      config: config as Record<string, unknown>,
    });
    return this.policies.save(next);
  }

  listVersions(projectKey: string | null): Promise<GovernancePolicy[]> {
    return this.policies.find({
      where: projectKey ? { projectKey } : { projectKey: IsNull() },
      order: { version: 'DESC' },
    });
  }
}
