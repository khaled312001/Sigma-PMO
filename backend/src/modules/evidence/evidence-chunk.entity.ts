import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * An analysable slice of a source document, with its SOURCE position preserved
 * (page + paragraph) so every finding can be traced back to the exact location.
 * This is what makes the dispute-layer AI retrieval-based and verifiable rather
 * than dependent on a single request's context window.
 */
@Entity('evidence_chunk')
export class EvidenceChunk extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  roomId!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  fileId!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Column({ type: 'int' })
  chunkIndex!: number;

  @Column({ type: 'int', nullable: true })
  page!: number | null;

  @Column({ type: 'int', nullable: true })
  paragraph!: number | null;

  @Column({ type: 'mediumtext' })
  text!: string;

  @Column({ type: 'int', default: 0 })
  charCount!: number;
}
