import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * AuthoritySubmission — an authority/permit submission under Authority
 * Governance (Mr. Ayham, 2026-06-13 — full 17-stage governance lifecycle).
 * Tracks every submission to an external authority (municipality, civil
 * defence, utilities, environmental, RTA, health …) through draft → submitted →
 * under_review → comments → approved/rejected, with the required-by / forecast
 * approval dates and the schedule activities each approval gates. When a
 * forecast approval slips past the required-by date, that gap is project delay
 * exposure (authority delay — not the contractor's fault) and, when it touches a
 * critical-path activity, a critical-path impact feeding claims. Append-only by
 * (businessKey, isCurrent) — same discipline as every canonical versioned entity.
 */
@Entity('authority_submission')
@Index(['projectBusinessKey', 'isCurrent'])
export class AuthoritySubmission extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "AUTH-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** municipality | civil_defense | electricity | water | telecom | environmental | rta | health | other. */
  @Column({ type: 'varchar', length: 32 })
  authority!: string;

  /** Free-form submission type (e.g. building permit, NOC, connection approval). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  submissionType!: string | null;

  /** draft | submitted | under_review | comments | approved | rejected. */
  @Column({ type: 'varchar', length: 24, default: 'submitted' })
  status!: string;

  /** Count of outstanding comments raised by the authority on this submission. */
  @Column({ type: 'int', default: 0 })
  openComments!: number;

  @Column({ type: 'date', nullable: true })
  submittedDate!: string | null;

  @Column({ type: 'date', nullable: true })
  forecastApprovalDate!: string | null;

  @Column({ type: 'date', nullable: true })
  requiredByDate!: string | null;

  /** Schedule Activity businessKeys this approval gates (critical-path linkage). */
  @Column({ type: 'json', nullable: true })
  affectedActivityKeys!: string[] | null;

  /** History / attachments / authority-reference numbers: free-form audit bag. */
  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
