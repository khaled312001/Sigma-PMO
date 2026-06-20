import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * AuthorityMatrixEntry — one authorized representative's CONTRACTUAL authority on
 * a project (Mr. Ayham acceptance #10: the Contractual Authority Matrix, distinct
 * from the platform's technical RBAC). It records who, on behalf of which party,
 * may perform which contractual actions (issue an instruction, approve material,
 * reject work, sign a daily report, approve a variation, send a notice, approve
 * an EOT, certify payment, represent the owner/contractor), within an optional
 * monetary limit and validity window, evidenced by an appointment document.
 *
 * AuthorityCheckService reads these rows to decide whether correspondence /
 * instructions originate from an AUTHORIZED person — and to flag the contractual
 * effect when they do not. Append-only by (businessKey, isCurrent).
 */
@Entity('authority_matrix_entry')
@Index(['projectBusinessKey', 'isCurrent'])
export class AuthorityMatrixEntry extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "AUTH-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  /** The party the representative acts for: owner | employer | contractor | consultant | engineer | subcontractor | pmo. */
  @Index()
  @Column({ type: 'varchar', length: 24 })
  party!: string;

  @Column({ type: 'varchar', length: 255 })
  personName!: string;

  @Index()
  @Column({ type: 'varchar', length: 320, nullable: true })
  personEmail!: string | null;

  /** Contractual title, e.g. "Engineer", "Employer's Representative", "Project Director". */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  /**
   * Contractual actions this person is authorized to perform. Keys from:
   * issue_instruction | approve_material | reject_work | sign_daily_report |
   * approve_variation | send_notice | approve_eot | certify_payment |
   * represent_owner | represent_contractor.
   */
  @Column({ type: 'json' })
  actions!: string[];

  /** Optional monetary authority limit (e.g. approve variations up to this value). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  monetaryLimit!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  @Column({ type: 'date', nullable: true })
  validFrom!: string | null;

  @Column({ type: 'date', nullable: true })
  validTo!: string | null;

  /** SourceFile id of the appointment / delegation-of-authority document. */
  @Column({ type: 'char', length: 36, nullable: true })
  evidenceSourceFileId!: string | null;

  /** active | revoked. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
