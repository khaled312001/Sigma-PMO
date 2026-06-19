import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';
import type { EvidenceItemType } from './evidence.config';

export type EvidenceItemDecision = 'confirm' | 'correct' | 'exclude';
export type EvidenceItemStatus = 'proposed' | 'confirmed' | 'corrected' | 'excluded';

/** A source-link: every finding cites the exact origin of its evidence. */
export interface EvidenceSourceRef {
  fileId: string;
  fileName: string;
  page: number | null;
  paragraph: number | null;
  docNumber?: string | null;
  party?: string | null;
  date?: string | null;
}

/**
 * A source-linked finding in a data room: a fact, dated event, conflict, gap,
 * strength, weakness or claim point. Every item carries `sourceRefs` back to the
 * original document(s) so the system can return to the source behind each
 * conclusion. Held for HUMAN review before commit.
 */
@Entity('evidence_item')
export class EvidenceItem extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  roomId!: string;

  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24 })
  type!: EvidenceItemType;

  @Column({ type: 'varchar', length: 32, nullable: true })
  layer!: string | null;

  @Column({ type: 'varchar', length: 512 })
  label!: string;

  @Column({ type: 'text', nullable: true })
  value!: string | null;

  @Column({ type: 'text', nullable: true })
  explanation!: string | null;

  @Column({ type: 'date', nullable: true })
  effectiveDate!: string | null;

  /** Position in the assembled chronology (set in the timeline stage). */
  @Column({ type: 'int', nullable: true })
  chronologyOrder!: number | null;

  @Column({ type: 'float', default: 0 })
  confidence!: number;

  @Column({ type: 'json', nullable: true })
  sourceRefs!: EvidenceSourceRef[] | null;

  /** For conflicts: the items that contradict each other. */
  @Column({ type: 'json', nullable: true })
  relatedItemIds!: string[] | null;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'proposed' })
  status!: EvidenceItemStatus;

  @Column({ type: 'text', nullable: true })
  correctedValue!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  decidedByEmail!: string | null;
}
