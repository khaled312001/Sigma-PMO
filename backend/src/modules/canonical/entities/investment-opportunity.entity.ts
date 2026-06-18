import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * InvestmentOpportunity — one investment idea moving through the Investment &
 * Feasibility Intelligence lifecycle (Mr. Ayham, 2026-06-11 follow-up):
 * idea → Level-1 rapid assessment → Level-2 professional study → governance
 * decision. The opportunity row holds the *inputs* (what the investor told us
 * plus what concept-sketch extraction confirmed); every computation result is
 * an append-only `FeasibilityAssessment` so the evidence trail never mutates.
 */
@Entity('investment_opportunity')
export class InvestmentOpportunity extends UuidEntity {
  /** Owning company (multi-tenant SaaS) — null for legacy/default-tenant rows. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  /** Natural reference, e.g. "INV-0007". Assigned at creation, stable forever. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Key into the Sigma feasibility assumption library (residential, retail, …). */
  @Index()
  @Column({ type: 'varchar', length: 48 })
  projectType!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  city!: string | null;

  /** Total investment envelope (CAPEX) the investor estimates. Nullable: a
   *  sketch-only idea may not have a number yet — the model derives one from
   *  built-up area × the type's cost benchmark. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimatedInvestment!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  /** { equityPct, debtPct, interestRatePct, tenorYears } — the funding mix. */
  @Column({ type: 'json' })
  fundingStructure!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  businessObjective!: string | null;

  /** idea | assessed | study | approved | rejected | hold. */
  @Index()
  @Column({ type: 'varchar', length: 24, default: 'idea' })
  stage!: string;

  /**
   * Structured feasibility inputs beyond the headline numbers: plotAreaSqm,
   * builtUpAreaSqm, floors, functionalZones, unitMix, capacity, notes…
   * Merged from manual entry + human-confirmed concept-sketch extraction.
   */
  @Column({ type: 'json' })
  inputs!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
