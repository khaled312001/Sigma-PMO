import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * OpportunityScreening — pre-feasibility opportunity intelligence (Mr. Ayham,
 * 2026-06-12 active scope). The first gate of the investment lifecycle:
 * Idea → Opportunity Intelligence → Rapid Assessment → Feasibility →
 * Bankability → Investment Governance. Append-only; each screening snapshots
 * the inputs + the deterministic scores so the recommendation is reproducible.
 */
@Entity('opportunity_screening')
@Index(['projectType', 'recommendation'])
export class OpportunityScreening extends UuidEntity {
  /** Owning company (multi-tenant SaaS) — null for legacy/default-tenant rows. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index()
  @Column({ type: 'varchar', length: 48 })
  projectType!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  city!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimatedInvestment!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  /** Screening inputs: business objective, funding mix, market/competition signals. */
  @Column({ type: 'json' })
  inputs!: Record<string, unknown>;

  /** Deterministic 0–100 scores + market intelligence breakdown. */
  @Column({ type: 'json' })
  scores!: Record<string, unknown>;

  /** 0–100 composite opportunity score. */
  @Column({ type: 'double' })
  opportunityScore!: number;

  /** proceed_to_feasibility | watchlist | reject. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  recommendation!: string;

  @Column({ type: 'varchar', length: 16 })
  governanceStatus!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
