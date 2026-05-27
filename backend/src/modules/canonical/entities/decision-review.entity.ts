import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Append-only audit of stakeholder actions on a governance decision: who
 * approved / rejected / acknowledged, when, and any comment. The "current
 * status" of a decision is the latest review action for it. Append-only so
 * the audit trail is preserved (matches the canonical-model convention).
 */
@Entity('decision_review')
export class DecisionReview extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  decisionId!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  alertId!: string;

  /** approve | reject | acknowledge */
  @Column({ type: 'varchar', length: 16 })
  action!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  performedByUserId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  performedByDisplay!: string | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;
}
