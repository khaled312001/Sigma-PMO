import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { GovernanceStatus, HierarchyLevel } from '../../../common/enums';

/**
 * Append-only snapshot of a computed governance status for ONE hierarchy node
 * (enterprise / portfolio / program / project). This is the *why* trail behind
 * a node being Orange: `inputs` records exactly which alerts, confidence, and
 * open escalations drove the verdict, so the 4-tier status is fully auditable
 * and reproducible — the same discipline the rest of the platform applies to
 * every AI/deterministic output.
 *
 * Never updated in place: each recompute inserts a new row, and the latest by
 * `computedAt` for a (nodeType, nodeBusinessKey) is the current status.
 */
@Entity('governance_status_snapshot')
@Index(['nodeType', 'nodeBusinessKey', 'computedAt'])
export class GovernanceStatusSnapshot extends UuidEntity {
  @Column({ type: 'varchar', length: 16 })
  nodeType!: HierarchyLevel | string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  nodeBusinessKey!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: GovernanceStatus | string;

  /** Numeric score [0,1] (0 = healthy, 1 = critical) backing the tier. */
  @Column({ type: 'double' })
  score!: number;

  /**
   * Reproducible breakdown: per-severity counts, max escalation level,
   * confidence average, child-status tallies for roll-up nodes, and the
   * deterministic rule that picked the tier.
   */
  @Column({ type: 'json' })
  inputs!: Record<string, unknown>;

  @Index()
  @Column({ type: 'datetime', precision: 6 })
  computedAt!: Date;
}
