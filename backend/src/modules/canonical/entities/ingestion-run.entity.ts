import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { IngestionStatus } from '../../../common/enums';

/**
 * One execution of the ingest -> validate -> normalise pipeline for a source
 * file. Each run is a version boundary: the canonical records it produces are
 * tied to it, so a file can be re-ingested without overwriting prior data.
 */
@Entity('ingestion_run')
export class IngestionRun extends UuidEntity {
  /** Owning company (multi-tenant SaaS) — null for legacy/default-tenant runs. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  @Column({ type: 'varchar', length: 64 })
  parser!: string;

  @Column({ type: 'varchar', length: 32, default: IngestionStatus.PENDING })
  status!: IngestionStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'boolean', nullable: true })
  validationPassed!: boolean | null;

  /** Counts per entity type, e.g. { project: 1, activity: 320, resource: 14 }. */
  @Column({ type: 'json' })
  rowCounts!: Record<string, number>;

  /** Run summary: parser stats, validation report, and any error detail. */
  @Column({ type: 'json' })
  summary!: Record<string, unknown>;
}
