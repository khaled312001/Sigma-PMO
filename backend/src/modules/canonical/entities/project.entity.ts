import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { GovernanceStatus, LifecyclePhase } from '../../../common/enums';

/** Canonical Project entity (the top of the Project -> Activity hierarchy). */
@Entity('project')
export class Project extends TraceableEntity {
  @Column({ type: 'varchar', length: 512 })
  name!: string;

  // ── Governance hierarchy + lifecycle + status (2026-06-11 vision) ──
  // ALL nullable, no defaults: existing rows + the ingestion Normalizer
  // write path are unaffected. Ancestry is denormalized (program +
  // portfolio + enterprise businessKeys) so portfolio-level roll-up queries
  // never walk the tree at read time. businessKey links, never raw id.

  /** Parent program businessKey, when this project belongs to a program. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  programBusinessKey!: string | null;

  /** Denormalized portfolio ancestry (cheap roll-up). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  portfolioBusinessKey!: string | null;

  /** Denormalized enterprise ancestry (cheap roll-up). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  enterpriseBusinessKey!: string | null;

  /** Governance lifecycle position (Initiation … Closure). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  lifecyclePhase!: LifecyclePhase | string | null;

  /** Computed 4-tier governance status (leaf of the roll-up). */
  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  governanceStatus!: GovernanceStatus | string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  status!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  clientName!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  /** Schedule data date ("as-of" date for progress), stored as YYYY-MM-DD. */
  @Column({ type: 'date', nullable: true })
  dataDate!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedStart!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedFinish!: string | null;

  @Column({ type: 'date', nullable: true })
  actualStart!: string | null;

  @Column({ type: 'date', nullable: true })
  actualFinish!: string | null;

  /** Decimal returned as string by the driver to preserve precision. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  budgetAtCompletion!: string | null;
}
