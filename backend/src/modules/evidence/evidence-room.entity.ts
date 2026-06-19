import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';
import type { EvidenceKind, EvidenceLimits, EvidenceMode } from './evidence.config';

export type EvidenceRoomStatus =
  | 'open' | 'indexing' | 'extracting' | 'chunking' | 'analyzing'
  | 'timelining' | 'reviewing' | 'ready' | 'committed' | 'failed' | 'closed';

/**
 * A Dispute Data Room / Evidence Memory for one dispute, claim or completed
 * project. Holds a scalable, retrievable, source-verifiable repository of files →
 * chunks → findings. Capacity comes from the `mode` and is RAISABLE per room by an
 * admin (`limits` + `limitOverride`, audited).
 */
@Entity('evidence_room')
export class EvidenceRoom extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'standard' })
  kind!: EvidenceKind;

  @Column({ type: 'varchar', length: 24, default: 'standard' })
  mode!: EvidenceMode;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'open' })
  status!: EvidenceRoomStatus;

  /** Current pipeline stage label (for progress display). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  stage!: string | null;

  /** Effective capacity = mode default merged with any admin override. */
  @Column({ type: 'json' })
  limits!: EvidenceLimits;

  /** True when an admin raised the limits beyond the mode default. */
  @Column({ type: 'boolean', default: false })
  limitOverride!: boolean;

  /** Live counters (files, indexed, extracted, chunks, items, conflicts, gaps). */
  @Column({ type: 'json', nullable: true })
  counts!: Record<string, number> | null;

  /** The assembled dispute/claim/project analysis (built in the final stage). */
  @Column({ type: 'json', nullable: true })
  report!: Record<string, unknown> | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastProcessedAt!: Date | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;
}
