import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

export type SupportKind = 'support' | 'request' | 'billing';
export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

/**
 * Company → platform request / technical-support ticket ("الطلبات والدعم
 * الفني"). Raised by a company, triaged by the platform SUPER_ADMIN from the
 * super-admin surface.
 */
@Entity('support_request')
export class SupportRequest extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  companyId!: string;

  @Column({ type: 'varchar', length: 32, default: 'support' })
  kind!: SupportKind;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: SupportStatus;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;

  /** Platform reply (set by the super-admin). */
  @Column({ type: 'text', nullable: true })
  reply!: string | null;
}
