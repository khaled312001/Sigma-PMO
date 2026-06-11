import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ConceptDocument — an investor's earliest artefact: a hand sketch, concept
 * layout, photo of handwritten notes, or a preliminary PDF. Uploaded against
 * an `InvestmentOpportunity`, archived content-addressed (same store as every
 * ingested file), then optionally run through AI vision extraction.
 *
 * Human-approval gate (platform safety contract): `extraction` holds what the
 * AI *proposed*; nothing reaches the opportunity's feasibility inputs until a
 * human reviews and saves `confirmedFields` — that is the only write path
 * into the model.
 */
@Entity('concept_document')
export class ConceptDocument extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  opportunityId!: string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 64 })
  mimeType!: string;

  /** Content-addressed archive path (StorageService). */
  @Column({ type: 'varchar', length: 512 })
  storedPath!: string;

  @Column({ type: 'char', length: 64 })
  sha256!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  /** pending | extracted | confirmed | failed | manual (AI disabled). */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  extractionStatus!: string;

  /**
   * AI-proposed structured fields: plotAreaSqm, builtUpAreaSqm, floors,
   * functionalZones, approxDimensions, unitMix, capacity, writtenNotes,
   * keyAssumptions — plus model id + the raw text for audit.
   */
  @Column({ type: 'json', nullable: true })
  extraction!: Record<string, unknown> | null;

  /** What a human approved (possibly edited) — the only model-facing payload. */
  @Column({ type: 'json', nullable: true })
  confirmedFields!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  extractionError!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  uploadedBy!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  confirmedBy!: string | null;
}
