import {
  Column,
  CreateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Base for all persisted entities: a UUID primary key and a creation timestamp.
 */
export abstract class UuidEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

/**
 * Provenance + append-only versioning carried by every canonical entity.
 *
 * Governance rules (see ADR-0003):
 *  - Each record is produced by exactly one IngestionRun and carries its
 *    originating source file, so any value is traceable to its source.
 *  - Records are never overwritten: re-ingesting a business entity inserts a new
 *    row with an incremented `version` and flips `isCurrent` on the prior row.
 *  - `rawSource` preserves the original parsed payload verbatim for full
 *    traceability ("why is this value here?").
 */
export abstract class TraceableEntity extends UuidEntity {
  /**
   * Multi-tenant company scope (SaaS). Nullable for pre-SaaS rows (backfilled to
   * a default company by the Tenancy migration); stamped from the request's
   * company context on every new write. The platform SUPER_ADMIN reads across
   * all companies. Indexed for the per-company query filter.
   */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'char', length: 36 })
  ingestionRunId!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  /** Natural/business key from the source system (project id, activity code, ...). */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  businessKey!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  /** Original parsed row, preserved verbatim for audit and traceability. */
  @Column({ type: 'json' })
  rawSource!: Record<string, unknown>;
}
