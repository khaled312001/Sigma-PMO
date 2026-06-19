import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';
import type { EvidenceCategory } from './evidence.config';

export type EvidenceFileStatus =
  | 'received' | 'indexed' | 'extracted' | 'chunked' | 'analyzed' | 'failed' | 'skipped';

/** One source document in a data room — the Evidence Index row. Content is
 * archived via StorageService (content-addressed); this row is its provenance. */
@Entity('evidence_file')
export class EvidenceFile extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  roomId!: string;

  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Column({ type: 'varchar', length: 512 })
  fileName!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ext!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'bigint', default: 0 })
  bytes!: number;

  @Index()
  @Column({ type: 'char', length: 64, nullable: true })
  sha256!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  storedPath!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'other' })
  category!: EvidenceCategory;

  /** Document reference number (extracted by the AI). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  docNumber!: string | null;

  /** Issuing party/company (extracted). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  party!: string | null;

  @Column({ type: 'date', nullable: true })
  docDate!: string | null;

  @Column({ type: 'int', nullable: true })
  pageCount!: number | null;

  @Column({ type: 'int', default: 0 })
  chunkCount!: number;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'received' })
  status!: EvidenceFileStatus;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;
}
