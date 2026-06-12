import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * QsFinding — a Quantity Survey governance finding (Mr. Ayham's QS Governance
 * Layer, 2026-06-12). The cross-source cost/quantity validation that compares
 * BIM quantities, BOQ, estimates and measured progress and flags deviations:
 * quantity variance, cost variance, over-measurement, duplicate quantities,
 * and quantity-to-cost mismatches. Deterministically generated + deduped, so
 * re-running the QS agent refreshes findings rather than duplicating them.
 */
@Entity('qs_finding')
@Index(['projectBusinessKey', 'status'])
export class QsFinding extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /**
   * quantity-variance | cost-variance | over-measurement |
   * duplicate-quantity | quantity-cost-mismatch.
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  findingType!: string;

  /** info | warning | critical. */
  @Column({ type: 'varchar', length: 16 })
  severity!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Cross-source references that produced the finding (the evidence). */
  @Column({ type: 'json' })
  refs!: Record<string, unknown>;

  /** Monetary impact of the deviation, when quantifiable. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  quantum!: string | null;

  /** open | reviewed | dismissed. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  /** Dedup key so re-validation refreshes rather than duplicates. */
  @Index()
  @Column({ type: 'varchar', length: 160 })
  dedupKey!: string;
}
