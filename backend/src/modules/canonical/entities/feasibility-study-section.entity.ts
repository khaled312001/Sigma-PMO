import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * FeasibilityStudySection — one section of the Level-2 professional
 * feasibility & bankability study (Executive Summary, Market Assessment,
 * CAPEX & OPEX, NPV/IRR/DSCR analyses, Sensitivity, Bankability, …).
 *
 * Sections are versioned append-only: regenerating a study inserts new rows
 * with `version + 1` and flips `isCurrent` on the old ones, so an approved
 * study an investor saw can always be reconstructed. Audience packages
 * (Investor / Partner / Bank) are *compositions over* these rows — they hold
 * no content of their own.
 */
@Entity('feasibility_study_section')
@Index(['opportunityId', 'sectionKey', 'isCurrent'])
export class FeasibilityStudySection extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  opportunityId!: string;

  /** Stable key, e.g. executive_summary, dscr_analysis, bankability. */
  @Column({ type: 'varchar', length: 48 })
  sectionKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Markdown body (deterministically generated; LLM polish is opt-in later). */
  @Column({ type: 'longtext' })
  content!: string;

  /** Structured tables/figures backing the prose (rendered by the frontend). */
  @Column({ type: 'json', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  /** generated | approved — the human gate before a section ships to a package. */
  @Column({ type: 'varchar', length: 16, default: 'generated' })
  status!: string;

  /** deterministic | llm — provenance of the prose. */
  @Column({ type: 'varchar', length: 16, default: 'deterministic' })
  source!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  approvedBy!: string | null;

  /** Threads the cross-module journey (sketch → … → decision) together. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  journeyCorrelationId!: string | null;
}
