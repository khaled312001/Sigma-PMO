import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Claim — a potential contractual claim identified by the L6 Claims & Disputes
 * Agent (Mr. Ayham's Layer 6: contract event analysis, delay analysis, evidence
 * linking, potential claims identification, responsibility assessment, dispute
 * prep). Each claim links to the evidence (alert/decision/letter ids) that
 * substantiates it and names the FIDIC clause + responsible party.
 */
@Entity('claim')
@Index(['projectBusinessKey', 'status'])
export class Claim extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** `eot` (extension of time) | `cost` | `variation` | `disruption`. */
  @Column({ type: 'varchar', length: 24 })
  type!: string;

  @Column({ type: 'text' })
  basis!: string;

  /** Estimated time impact in days (null when not a time claim). */
  @Column({ type: 'int', nullable: true })
  estimatedDays!: number | null;

  /** Estimated cost impact (string for decimal precision). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimatedAmount!: string | null;

  /** contractor | consultant | client | sigma | shared. */
  @Column({ type: 'varchar', length: 32 })
  responsibleParty!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fidicClause!: string | null;

  /**
   * The underlying delay / contract-event date (Mr. Ayham acceptance 2026-06-28):
   * the procedural clock (FIDIC 20.1 notice / time-bar) runs from here. Nullable
   * — when absent the forensic chain falls back to the earliest linked letter.
   */
  @Column({ type: 'date', nullable: true })
  delayEventDate!: string | null;

  /** When notice of this claim was served (ISO date). Nullable — falls back to
   *  the earliest linked letter date when the chain evaluates the notice window. */
  @Column({ type: 'date', nullable: true })
  noticeServedDate!: string | null;

  /** Ids of the evidence that substantiates the claim (alerts/decisions/letters). */
  @Column({ type: 'json' })
  evidenceRefs!: string[];

  /** `potential` | `under-review` | `submitted` | `rejected`. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'potential' })
  status!: string;

  @Column({ type: 'double' })
  confidence!: number;

  @Column({ type: 'boolean', default: true })
  agentGenerated!: boolean;
}
