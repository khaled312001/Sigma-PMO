import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * CorrectiveAction — a recommended action the L8 Sigma Governance AI issues
 * when it consolidates the agent outputs (Mr. Ayham's L8: corrective action
 * recommendations + escalation management). Each action names where it came
 * from (the originating layer/finding) so the recommendation is traceable, and
 * carries a priority + status the governance team works down.
 */
@Entity('corrective_action')
@Index(['nodeBusinessKey', 'status'])
export class CorrectiveAction extends UuidEntity {
  @Column({ type: 'varchar', length: 16 })
  nodeType!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  nodeBusinessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  /** The agent layer that surfaced the underlying finding (e.g. l5_risk). */
  @Column({ type: 'varchar', length: 32 })
  sourceLayer!: string;

  /** `low` | `medium` | `high` | `critical`. */
  @Index()
  @Column({ type: 'varchar', length: 16 })
  priority!: string;

  /** Recommended escalation target (L1/L2/L3) when applicable. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  escalationLevel!: string | null;

  /** `open` | `in-progress` | `done` | `dismissed`. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  owner!: string | null;

  /** Dedup key so re-consolidation refreshes rather than duplicates. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  dedupKey!: string;
}
