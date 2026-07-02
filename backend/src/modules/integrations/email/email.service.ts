import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailStatus {
  enabled: boolean;
  /** Where the SMTP URL came from — encrypted setting, env, or nothing. */
  configuredVia: 'settings' | 'env' | null;
  /** The from-address (safe to expose; never the SMTP URL, which embeds the password). */
  from: string;
  requiredEnv: string[];
}

/**
 * Email outbound channel for the Notifications layer.
 *
 * SMTP URL resolution (mirrors the Autodesk APS credential precedence):
 *   1. Encrypted `SystemSetting` `integrations.email_smtp` (set from /admin/settings) — preferred.
 *   2. `EMAIL_SMTP_URL` env var — fallback for headless boots.
 *   3. Neither → disabled; send() resolves to false and the caller falls back to
 *      the structured-log channel of NotificationsService.
 *
 * The URL (e.g. `smtps://user:pass@host:465` or `smtp://user:pass@host:587`)
 * embeds credentials, so it is NEVER logged or returned — only `getStatus()`
 * (enabled/from/source) and delivery booleans leave this service.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly envUrl: string;
  private readonly from: string;
  private dbUrl: string | null = null;
  private transporter: Transporter | null = null;
  private cachedUrl: string | null = null;

  constructor(
    config: ConfigService,
    @Optional() private readonly settings?: SettingsService,
  ) {
    this.envUrl = (config.get<string>('emailSmtpUrl') ?? '').trim();
    this.from = (config.get<string>('emailFrom') ?? 'sigma-pmo@example.com').trim();
  }

  async onModuleInit(): Promise<void> {
    await this.refreshFromSettings();
    if (!this.settings) return;
    this.settings.onChange(async (settingKey) => {
      if (settingKey === SETTING_KEYS.EMAIL_SMTP_URL) await this.refreshFromSettings();
    });
  }

  private async refreshFromSettings(): Promise<void> {
    if (!this.settings) return;
    try {
      this.dbUrl = (await this.settings.getPlaintext(SETTING_KEYS.EMAIL_SMTP_URL))?.trim() || null;
    } catch {
      this.dbUrl = null;
    }
  }

  /** Resolve the effective SMTP URL + where it came from. */
  private resolve(): { url: string; source: 'settings' | 'env' } | null {
    if (this.dbUrl) return { url: this.dbUrl, source: 'settings' };
    if (this.envUrl) return { url: this.envUrl, source: 'env' };
    return null;
  }

  private transport(): Transporter | null {
    const resolved = this.resolve();
    if (!resolved) {
      this.transporter = null;
      this.cachedUrl = null;
      return null;
    }
    if (resolved.url !== this.cachedUrl) {
      this.transporter = createTransport(resolved.url);
      this.cachedUrl = resolved.url;
      this.logger.log(`Email transport configured (source=${resolved.source}).`);
    }
    return this.transporter;
  }

  isEnabled(): boolean {
    return this.resolve() !== null;
  }

  getStatus(): EmailStatus {
    const resolved = this.resolve();
    return {
      enabled: resolved !== null,
      configuredVia: resolved?.source ?? null,
      from: this.from,
      requiredEnv: ['EMAIL_SMTP_URL'],
    };
  }

  async send(message: EmailMessage): Promise<boolean> {
    const transporter = this.transport();
    if (!transporter) return false;
    try {
      await transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Email send failed: ${(error as Error).message}`);
      return false;
    }
  }
}
