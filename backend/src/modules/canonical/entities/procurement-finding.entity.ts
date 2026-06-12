import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ProcurementFinding — a Procurement Intelligence governance finding (Mr.
 * Ayham's Procurement Governance Validation, 2026-06-12). The continuous
 * cross-source comparison: BIM quantity vs procured quantity, procured vs
 * installed, planned vs actual delivery, consumption vs procurement records,
 * plus supply-chain / vendor risk. Deterministic + deduped.
 */
@Entity('procurement_finding')
@Index(['projectBusinessKey', 'status'])
export class ProcurementFinding extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /**
   * delivery-delay | qty-bim-vs-procured | qty-procured-vs-installed |
   * consumption-vs-procurement | supply-chain-risk | vendor-risk |
   * long-lead-exposure.
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

  /** The package(s)/vendor(s)/dates the finding compared. */
  @Column({ type: 'json' })
  refs!: Record<string, unknown>;

  /** Recommended corrective action (deterministic). */
  @Column({ type: 'text', nullable: true })
  recommendation!: string | null;

  /** open | reviewed | dismissed. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Index()
  @Column({ type: 'varchar', length: 160 })
  dedupKey!: string;
}
