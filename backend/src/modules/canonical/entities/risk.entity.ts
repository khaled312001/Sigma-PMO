import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Risk — a register entry produced by the L5 Risk Agent (Mr. Ayham's Layer 5:
 * early risk identification, probability/impact, prioritization, mitigation,
 * escalation triggers). Probability and impact are [0,1]; priorityScore is
 * their product and drives the tier. Risks are deduped per (project, title):
 * a re-run updates the existing open risk rather than duplicating it.
 */
@Entity('risk')
@Index(['projectBusinessKey', 'status'])
export class Risk extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** `schedule` | `cost` | `quality` | `contractual` | `resource` | `safety`. */
  @Column({ type: 'varchar', length: 32 })
  category!: string;

  @Column({ type: 'double' })
  probability!: number;

  @Column({ type: 'double' })
  impact!: number;

  @Column({ type: 'double' })
  priorityScore!: number;

  /** `low` | `medium` | `high` | `critical`. */
  @Index()
  @Column({ type: 'varchar', length: 16 })
  tier!: string;

  /** Which signal raised this risk (rule code / EVM index / manual). */
  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'text' })
  mitigation!: string;

  @Column({ type: 'text', nullable: true })
  escalationTrigger!: string | null;

  /** `open` | `mitigating` | `closed`. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  /** True when the L5 agent created it (vs a human-entered risk). */
  @Column({ type: 'boolean', default: true })
  agentGenerated!: boolean;
}
