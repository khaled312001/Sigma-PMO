import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * FeasibilityAssessment — one append-only run of the deterministic investment
 * model against an opportunity. Level 1 is the rapid assessment (minimal
 * inputs + reference assumptions); Level 2 stamps the run that backs a
 * professional study generation. The row snapshots the inputs AND the
 * assumption set used, so every NPV/IRR figure is reproducible forever
 * (same discipline as `GovernanceStatusSnapshot.inputs`).
 */
@Entity('feasibility_assessment')
@Index(['opportunityId', 'createdAt'])
export class FeasibilityAssessment extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  opportunityId!: string;

  /** 1 = rapid investment assessment, 2 = professional study run. */
  @Column({ type: 'int', default: 1 })
  level!: number;

  /** Snapshot of the opportunity inputs the run consumed. */
  @Column({ type: 'json' })
  inputs!: Record<string, unknown>;

  /** Snapshot of the assumption set (library version + resolved values). */
  @Column({ type: 'json' })
  assumptions!: Record<string, unknown>;

  /**
   * Full deterministic model output: capexBreakdown, revenue/opex per year,
   * cashflows, npv, projectIrr, equityIrr, paybackYears, dscr {min, avg},
   * attractivenessScore, riskFactors, conditions.
   */
  @Column({ type: 'json' })
  results!: Record<string, unknown>;

  /** low | moderate | elevated | high. */
  @Column({ type: 'varchar', length: 16 })
  riskRating!: string;

  /** proceed | proceed_with_conditions | hold | reject. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  recommendation!: string;

  /** 4-tier mapping of the recommendation (green/yellow/orange/red). */
  @Column({ type: 'varchar', length: 16 })
  governanceStatus!: string;

  /** Input-completeness confidence (deterministic, 0–1). */
  @Column({ type: 'double' })
  confidence!: number;

  /** Optional human-readable narration (LLM, behind the approval gate). */
  @Column({ type: 'text', nullable: true })
  narrative!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
