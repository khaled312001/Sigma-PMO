import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SystemSetting } from '../canonical/entities';

/**
 * SettingsService — AES-256-GCM encryption around `SystemSetting` rows.
 *
 * Master key resolution:
 *  1. `process.env.SETTINGS_ENCRYPTION_KEY` (raw 64-char hex preferred).
 *  2. Falls back to a SHA-256 of `process.env.DB_PASSWORD || 'sigma-pmo-dev'`
 *     so dev environments work without an explicit env var, while still
 *     producing a deterministic key on a given machine.
 *
 * The raw plaintext NEVER leaves this service. Read endpoints get a
 * `configured` boolean + a fingerprint (first 8 + last 4 chars). Internal
 * services (ClaudeService) get a `decrypt(key)` call.
 */
type ChangeListener = (settingKey: string) => void | Promise<void>;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly masterKey: Buffer;
  /**
   * Subscribers notified after every `set()` or `clear()` so dependent
   * services (e.g. ClaudeService when the Anthropic key changes) can
   * invalidate their caches. Listeners run sequentially after the write;
   * a thrown listener does NOT roll the write back, only logs.
   */
  private readonly changeListeners: ChangeListener[] = [];

  /** Register a callback fired after any setting changes. */
  onChange(cb: ChangeListener): void {
    this.changeListeners.push(cb);
  }

  private async fireChange(settingKey: string): Promise<void> {
    for (const cb of this.changeListeners) {
      try {
        await cb(settingKey);
      } catch (e) {
        this.logger.warn(`Setting "${settingKey}" change listener threw: ${(e as Error).message}`);
      }
    }
  }

  constructor(
    @InjectRepository(SystemSetting)
    private readonly repo: Repository<SystemSetting>,
    config: ConfigService,
  ) {
    const fromEnv = process.env.SETTINGS_ENCRYPTION_KEY ?? '';
    if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      this.masterKey = Buffer.from(fromEnv, 'hex');
    } else {
      const seed = process.env.DB_PASSWORD ?? config.get<string>('database.password') ?? 'sigma-pmo-dev';
      this.masterKey = createHash('sha256').update(`sigma-pmo-settings::${seed}`).digest();
      this.logger.warn(
        'SETTINGS_ENCRYPTION_KEY not set; falling back to derived dev key. Production MUST set a 64-char hex env var.',
      );
    }
  }

  /** Persist (or update) a setting under its plaintext value. */
  async set(settingKey: string, plaintext: string, updatedBy: string | null): Promise<void> {
    const ciphertext = this.encrypt(plaintext);
    const fingerprint = this.fingerprint(plaintext);
    const existing = await this.repo.findOne({ where: { settingKey } });
    if (existing) {
      existing.encryptedValue = ciphertext;
      existing.fingerprint = fingerprint;
      existing.updatedBy = updatedBy;
      await this.repo.save(existing);
    } else {
      await this.repo.save(
        this.repo.create({
          settingKey,
          encryptedValue: ciphertext,
          fingerprint,
          updatedBy,
        }),
      );
    }
    this.logger.log(`Setting "${settingKey}" updated by ${updatedBy ?? 'unknown'} (fingerprint ${fingerprint}).`);
    await this.fireChange(settingKey);
  }

  /** Fetch the plaintext value of a setting, or null if not configured. */
  async getPlaintext(settingKey: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { settingKey } });
    if (!row) return null;
    try {
      return this.decrypt(row.encryptedValue);
    } catch (e) {
      this.logger.error(`Failed to decrypt setting "${settingKey}": ${(e as Error).message}`);
      return null;
    }
  }

  /** Public-safe read — never returns the plaintext value. */
  async describe(settingKey: string): Promise<{
    settingKey: string;
    configured: boolean;
    fingerprint: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
  }> {
    const row = await this.repo.findOne({ where: { settingKey } });
    if (!row) {
      return { settingKey, configured: false, fingerprint: null, updatedBy: null, updatedAt: null };
    }
    return {
      settingKey,
      configured: true,
      fingerprint: row.fingerprint,
      updatedBy: row.updatedBy,
      updatedAt: row.createdAt.toISOString(),
    };
  }

  /** Remove a setting entirely. */
  async clear(settingKey: string): Promise<void> {
    await this.repo.delete({ settingKey });
    this.logger.log(`Setting "${settingKey}" cleared.`);
    await this.fireChange(settingKey);
  }

  // ── crypto helpers ──

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout: iv (12) || tag (16) || ciphertext
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  private decrypt(b64: string): string {
    const raw = Buffer.from(b64, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  /** First 8 + masked middle + last 4 chars — printable, non-reversible. */
  private fingerprint(plaintext: string): string {
    if (!plaintext) return '';
    if (plaintext.length <= 12) return `${plaintext.slice(0, 2)}…${plaintext.slice(-2)}`;
    return `${plaintext.slice(0, 8)}…${plaintext.slice(-4)}`;
  }
}

/** Known setting keys — typed barrel so callers don't typo. */
export const SETTING_KEYS = {
  ANTHROPIC_API_KEY: 'anthropic.api_key',
  SLACK_WEBHOOK_URL: 'integrations.slack_webhook',
  TEAMS_WEBHOOK_URL: 'integrations.teams_webhook',
  EMAIL_SMTP_URL: 'integrations.email_smtp',
  // ── Autodesk APS (BIM / Revit / IFC integration) ──
  // 2-legged OAuth client credentials for Autodesk Platform Services. With
  // both set, the platform translates Revit/IFC models via Model Derivative
  // and extracts element quantities into the Quantity-Survey pipeline.
  AUTODESK_CLIENT_ID: 'autodesk.aps_client_id',
  AUTODESK_CLIENT_SECRET: 'autodesk.aps_client_secret',
  // ── Primavera P6 EPPM REST (live schedule pull) ──
  P6_BASE_URL: 'primavera.p6_base_url',
  P6_DATABASE: 'primavera.p6_database',
  P6_USERNAME: 'primavera.p6_username',
  P6_PASSWORD: 'primavera.p6_password',
} as const;
