import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Vendor — a supplier/subcontractor in the Procurement Intelligence vendor
 * registry (Mr. Ayham, 2026-06-12). Carries the deterministic intelligence
 * scores (qualification / evaluation / performance / risk) the procurement
 * governance engine reasons against when comparing bids and recommending
 * awards. Append-only by (businessKey, isCurrent).
 */
@Entity('vendor')
@Index(['businessKey', 'isCurrent'])
export class Vendor extends UuidEntity {
  /** Natural key, e.g. "VND-014" — stable across versions. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Trade/material category (e.g. concrete, steel, MEP, facade). */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  category!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  country!: string | null;

  /** 0–100 deterministic scores. */
  @Column({ type: 'double', default: 0 })
  qualificationScore!: number;

  @Column({ type: 'double', default: 0 })
  evaluationScore!: number;

  @Column({ type: 'double', default: 0 })
  performanceScore!: number;

  /** 0–100, higher = riskier. */
  @Column({ type: 'double', default: 0 })
  riskScore!: number;

  /** qualified | provisional | disqualified. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'provisional' })
  status!: string;

  /**
   * Inputs the scores were derived from: { yearsActive, completedProjects,
   * financialStanding, certifications[], onTimeDeliveryRate, defectRate,
   * disputes, singleSourceDependence, … } + score basis strings.
   */
  @Column({ type: 'json' })
  details!: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
