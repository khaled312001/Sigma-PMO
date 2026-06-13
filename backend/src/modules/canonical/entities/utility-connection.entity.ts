import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * UtilityConnection — a single utility connection (power, water, telecom, gas,
 * sewerage, district cooling) under Utility Governance (Mr. Ayham, 2026-06-13
 * 17-stage lifecycle scope). Tracks utility readiness & connection status plus
 * the delay exposure of each connection against its required-by date. Append-only
 * by (businessKey, isCurrent): an update supersedes the prior current row with an
 * incremented version, preserving the change history (same discipline as every
 * canonical versioned entity).
 */
@Entity('utility_connection')
@Index(['projectBusinessKey', 'isCurrent'])
export class UtilityConnection extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "UTL-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** power | water | telecom | gas | sewerage | district_cooling. */
  @Column({ type: 'varchar', length: 24 })
  utilityType!: string;

  /** not_started | applied | in_progress | testing | energized | connected. */
  @Column({ type: 'varchar', length: 24, default: 'not_started' })
  status!: string;

  /** When the connection application was lodged with the utility provider. */
  @Column({ type: 'date', nullable: true })
  applicationDate!: string | null;

  /** Forecast date the connection will be live/energized. */
  @Column({ type: 'date', nullable: true })
  forecastConnectionDate!: string | null;

  /** The date the connection is required by (driven by the delivery schedule). */
  @Column({ type: 'date', nullable: true })
  requiredByDate!: string | null;

  /** Provider, meter/account refs, milestones, history: free-form details. */
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
