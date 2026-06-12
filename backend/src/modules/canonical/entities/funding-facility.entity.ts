import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * FundingFacility — a financing facility under Funding Governance (Mr. Ayham,
 * 2026-06-12 active scope). Connects Revenue Governance to Investment
 * Governance: loan facilities with drawdown, DSCR + covenant monitoring, debt
 * service tracking, and refinancing-risk signals. Append-only by (businessKey,
 * isCurrent).
 */
@Entity('funding_facility')
@Index(['projectBusinessKey', 'isCurrent'])
export class FundingFacility extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "FAC-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  lenderName!: string | null;

  /** senior-debt | mezzanine | equity | grant | revolving. */
  @Column({ type: 'varchar', length: 24 })
  facilityType!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  @Column({ type: 'double', nullable: true })
  interestRatePct!: number | null;

  @Column({ type: 'int', nullable: true })
  tenorYears!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  drawnAmount!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  repaidAmount!: string;

  /** Required minimum DSCR covenant (e.g. 1.20). */
  @Column({ type: 'double', nullable: true })
  dscrCovenant!: number | null;

  /** Latest computed/observed DSCR. */
  @Column({ type: 'double', nullable: true })
  currentDscr!: number | null;

  @Column({ type: 'date', nullable: true })
  maturityDate!: string | null;

  /** active | breached | refinanced | closed. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  /** Covenants + debt-service schedule + history: { covenants:[], schedule:[] }. */
  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
