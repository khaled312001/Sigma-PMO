import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationMessage {
  channel: 'email' | 'slack' | 'teams' | 'log';
  to: string;
  subject?: string;
  body: string;
  context?: Record<string, unknown>;
}

/**
 * Outbound notifications (Cycle 8 stub). Today: structured log only. When
 * `EMAIL_SMTP_URL` / `SLACK_WEBHOOK_URL` / `TEAMS_WEBHOOK_URL` are
 * configured, the corresponding adapter is wired in — interface intentionally
 * stable now so integrations can land without re-touching callers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly emailSmtp: string;
  private readonly slackWebhook: string;
  private readonly teamsWebhook: string;

  constructor(config: ConfigService) {
    this.emailSmtp = (config.get<string>('emailSmtpUrl') ?? '').trim();
    this.slackWebhook = (config.get<string>('slackWebhookUrl') ?? '').trim();
    this.teamsWebhook = (config.get<string>('teamsWebhookUrl') ?? '').trim();
  }

  async send(message: NotificationMessage): Promise<void> {
    if (message.channel === 'slack' && this.slackWebhook) {
      await this.postWebhook(this.slackWebhook, { text: `*${message.subject ?? 'Sigma PMO'}*\n${message.body}` });
      return;
    }
    if (message.channel === 'teams' && this.teamsWebhook) {
      await this.postWebhook(this.teamsWebhook, { text: `${message.subject ?? 'Sigma PMO'}\n${message.body}` });
      return;
    }
    // Default: structured log so the audit trail is still complete.
    this.logger.log(
      `notify[${message.channel}] to=${message.to} subject=${message.subject ?? ''} body=${message.body.slice(0, 200)}`,
    );
  }

  private async postWebhook(url: string, payload: unknown): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      this.logger.warn(`Webhook delivery failed: ${(error as Error).message}`);
    }
  }
}
