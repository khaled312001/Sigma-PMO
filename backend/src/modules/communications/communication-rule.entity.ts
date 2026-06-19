import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * Versioned, per-company project-communication rule document (Mr. Ayham,
 * 2026-06-19). `companyId = null` is the global default; a company-specific row
 * overrides it. Append-only versioned (isCurrent flag) so every change to the
 * communication matrix is itself an auditable governance record.
 *
 * `config` holds the full CommunicationRulesConfig — channels, approved
 * recipients/roles, unread-alert period, escalation matrix, required-ack +
 * response categories, response SLA, deemed-notice rules and responsible party.
 */
@Entity('communication_rule')
export class CommunicationRule extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 320, nullable: true })
  authoredBy!: string | null;

  @Column({ type: 'json' })
  config!: Record<string, unknown>;
}
