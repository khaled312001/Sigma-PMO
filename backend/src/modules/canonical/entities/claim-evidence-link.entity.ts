import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/** The chain leg a piece of evidence sits on in the forensic evidence chain. */
export type ClaimEvidenceLinkType =
  | 'letter' | 'daily_report' | 'baseline' | 'update' | 'photo' | 'video'
  | 'boq_line' | 'fidic_clause' | 'alert' | 'decision' | 'evidence_item';

/** A source-ref pointing back to the exact origin of a cited fact. */
export interface ClaimEvidenceSourceRef {
  fileId?: string | null;
  page?: number | null;
  paragraph?: number | null;
  sha256?: string | null;
}

/**
 * ClaimEvidenceLink — one cited piece of evidence on a forensic claim chain
 * (Mr. Ayham acceptance 2026-06-28, "the forensic evidence chain"). A single
 * claim cites a letter + daily report + baseline/update + photo/video + BOQ
 * line + FIDIC clause, each source-ref'd back to the exact file / page /
 * paragraph / sha256. `linkType` is the chain leg; `targetTable` + `targetId`
 * point at the cited canonical row; `sourceRef` carries the document anchor.
 */
@Entity('claim_evidence_link')
@Index(['claimId', 'linkType'])
export class ClaimEvidenceLink extends UuidEntity {
  /** Owning company (multi-tenant SaaS) — null for legacy/default-tenant rows. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'char', length: 36 })
  claimId!: string;

  @Column({ type: 'varchar', length: 24 })
  linkType!: ClaimEvidenceLinkType | string;

  /** Canonical table the cited row lives in (e.g. `letter`, `evidence_item`, `boq_item`). */
  @Column({ type: 'varchar', length: 64 })
  targetTable!: string;

  /** Id / key of the cited row. */
  @Column({ type: 'varchar', length: 128 })
  targetId!: string;

  /** Document anchor: { fileId, page, paragraph, sha256 }. */
  @Column({ type: 'json', nullable: true })
  sourceRef!: ClaimEvidenceSourceRef | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  note!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
