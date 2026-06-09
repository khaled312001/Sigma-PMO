import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * SystemSetting — runtime-configurable platform settings that a Sigma
 * admin can manage from the UI without redeploying.
 *
 * Values are stored as an AES-256-GCM ciphertext (`encryptedValue` =
 * base64(iv || authTag || ciphertext)) keyed by a per-tenant master key
 * (`SETTINGS_ENCRYPTION_KEY` env var). The raw value never leaves the
 * service layer — read endpoints return only a `configured` boolean and
 * a fingerprint (first 8 + last 4 chars).
 *
 * The Wave 4 use-case is the Anthropic API key: an admin enters it in
 * /admin/settings, the value is encrypted, and `ClaudeService.isEnabled()`
 * starts returning true. Future settings (Slack webhook, Teams webhook,
 * email SMTP password) can ride on the same row shape.
 */
@Entity('system_setting')
export class SystemSetting extends UuidEntity {
  /** Stable lookup key, e.g. `anthropic.api_key`. Unique. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  settingKey!: string;

  /** AES-GCM ciphertext, base64-encoded. */
  @Column({ type: 'text' })
  encryptedValue!: string;

  /** First 8 + last 4 chars of the plaintext, for the UI fingerprint. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  fingerprint!: string | null;

  /** Last user to update this setting (displayName). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  updatedBy!: string | null;
}
