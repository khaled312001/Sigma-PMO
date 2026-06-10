import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * DrawingPackage — one uploaded drawings bundle (correction-plan §2.1/§2.7;
 * meeting 2026-06-08 @ 00:23:42 "base on this drawing… اعملي baseline
 * program").
 *
 * Phase 1 supports PDF drawing sets: the ingester archives the bytes
 * (SHA-256, immutable), extracts lightweight metadata (page count, sheet
 * titles, detected floor/zone hints) into `summary`, and the
 * drawing-driven baseline path feeds that summary to the planner persona.
 * IFC / DWG / RVT parsers extend the same row shape in later phases.
 */
@Entity('drawing_package')
export class DrawingPackage extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** SourceFile row holding the archived bytes. */
  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  @Column({ type: 'varchar', length: 512 })
  filename!: string;

  /** `pdf` (phase 1) | `ifc` | `dwg` | `rvt` | `nwd` (later phases). */
  @Column({ type: 'varchar', length: 16 })
  format!: string;

  /**
   * Extracted features the baseline generator consumes:
   * `{ pageCount, sheetTitles[], floorHints[], disciplineHints[], textExcerpt }`.
   */
  @Column({ type: 'json' })
  summary!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 128, nullable: true })
  uploadedBy!: string | null;
}
