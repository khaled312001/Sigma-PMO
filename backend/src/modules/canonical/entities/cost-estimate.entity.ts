import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * CostEstimate — one append-only run of the Quantity Survey Intelligence cost
 * engine (Mr. Ayham, 2026-06-12). Spans the full QS lifecycle stage by stage
 * (conceptual → budget → cost-plan → tender → forecast → final-account) and
 * always snapshots which classification standard (NRM/UniFormat/MasterFormat/
 * CESMM) was used + the classified elemental breakdown, so every figure is
 * reproducible and traceable to the Global Cost Classification Framework.
 */
@Entity('cost_estimate')
@Index(['projectBusinessKey', 'stage', 'isCurrent'])
export class CostEstimate extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** conceptual | budget | cost-plan | tender | forecast | final-account. */
  @Index()
  @Column({ type: 'varchar', length: 24 })
  stage!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** The classification standard the elements are mapped to. */
  @Column({ type: 'varchar', length: 16, default: 'NRM' })
  standard!: string;

  /** How the estimate was derived (area-benchmark | bim-quantities | boq | manual). */
  @Column({ type: 'varchar', length: 24 })
  method!: string;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  /** Gross floor / built-up area driving area-rate estimates (m²). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  areaSqm!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalAmount!: string;

  /** Cost per m² (totalAmount / areaSqm) when area-based; null otherwise. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  ratePerSqm!: string | null;

  /**
   * Classified Cost Breakdown Structure: [{ element, label, code, standard,
   * quantity, unit, rate, amount, sharePct, vsBenchmarkPct, source }].
   */
  @Column({ type: 'json' })
  elements!: Array<Record<string, unknown>>;

  /** Benchmark comparison summary + value-engineering opportunities. */
  @Column({ type: 'json', nullable: true })
  benchmark!: Record<string, unknown> | null;

  @Column({ type: 'double', default: 0.7 })
  confidence!: number;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
