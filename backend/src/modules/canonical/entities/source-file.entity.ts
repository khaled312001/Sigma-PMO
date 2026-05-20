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
