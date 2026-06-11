import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';

/**
 * The L1 Data Collection record types Mr. Ayham named beyond schedules/BIM/BoQ:
 * RFIs, Submittals, NCRs, Change Requests, Procurement/Resource/Cost logs, and
 * Site Photos. One polymorphic table with a `recordType` discriminator keeps
 * L1 "extensible to other project documents without structural redesign" — a
 * new record family is a new enum value + a `details` shape, never a migration.
 */
export type ProjectRecordType =
  | 'rfi'
  | 'submittal'
  | 'ncr'
  | 'change-request'
  | 'procurement-log'
  | 'resource-log'
  | 'cost-report'
  | 'site-photo'
  | 'other';

/**
 * ProjectRecord — one collected L1 project document/record. Extends
 * TraceableEntity so it shares append-only provenance (businessKey = the
 * record's natural id, e.g. "RFI-014"). `details` carries the type-specific
 * fields; the common columns power the cross-type list + downstream agents.
 */
@Entity('project_record')
@Index(['projectBusinessKey', 'recordType'])
export class ProjectRecord extends TraceableEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  recordType!: ProjectRecordType | string;

  /** Natural reference number, e.g. "RFI-014", "NCR-003", "CR-2026-07". */
  @Column({ type: 'varchar', length: 64 })
  refNumber!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  /** Free-form status per type, e.g. open/closed/approved/rejected/pending. */
  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  status!: string | null;

  /** Originating/responsible party (contractor/consultant/client/subcontractor). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  party!: string | null;

  @Column({ type: 'date', nullable: true })
  raisedDate!: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate!: string | null;

  /** Monetary impact for cost/variation-bearing records. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  amount!: string | null;

  /** Type-specific payload (discipline, attachments, photo metadata, …). */
  @Column({ type: 'json' })
  details!: Record<string, unknown>;
}
