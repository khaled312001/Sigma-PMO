import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Versioned governance policy (Layer 2). Holds the accountability map, FIDIC
 * mapping per rule code, escalation thresholds, and the intervention library.
 * `projectKey` = null is the global default; project-specific policies
 * override it on a per-project basis.
 *
 * Stored as JSON so Al Ayham / Sigma can author proprietary rules without
 * code deployments (governance flexibility per the contract).
 */
@Entity('governance_policy')
export class GovernancePolicy extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  projectKey!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authoredBy!: string | null;

  /**
   * Full policy document — see DEFAULT_GOVERNANCE_POLICY for the shape:
   *   { accountability, fidic, pmi, escalation, intervention }.
   */
  @Column({ type: 'json' })
  config!: Record<string, unknown>;
}
