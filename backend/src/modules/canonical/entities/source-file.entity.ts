import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { SourceType } from '../../../common/enums';

/**
 * An ingested source file, content-addressed by SHA-256 so re-uploads of the
 * exact same bytes are detected. The original file is archived immutably at
 * `storedPath` (see StorageService) — the root of the traceability chain.
 */
@Entity('source_file')
export class SourceFile extends UuidEntity {
  /**
   * Multi-tenant company scope (SaaS). The company whose ingestion produced this
   * file; NULL for platform/legacy uploads. Defence-in-depth alongside the
   * project-ownership guards — every download path is already mediated by a
   * project-scoped endpoint, and this stamps the archive row itself per tenant.
   */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Column({ type: 'varchar', length: 512 })
  filename!: string;

  @Column({ type: 'varchar', length: 32 })
  sourceType!: SourceType;

  @Index()
  @Column({ type: 'char', length: 64 })
  contentSha256!: string;

  @Column({ type: 'int' })
  byteSize!: number;

  @Column({ type: 'varchar', length: 1024 })
  storedPath!: string;
}
