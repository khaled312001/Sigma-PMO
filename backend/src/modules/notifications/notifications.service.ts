import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailService } from '../integrations/email/email.service';

export interface NotificationMessage {
  channel: 'email' | 'slack' | 'teams' | 'log';
  to: string;
  subject?: string;
  body: string;
  context?: Record<string, unknown>;
}

/**
 * Outbound notifications. Channels:
 *  - email: routes through EmailService (nodemailer SMTP) when EMAIL_SMTP_URL set
 *  - slack: posts to SLACK_WEBHOOK_URL when set
 *  - teams: posts to TEAMS_WEBHOOK_URL when set
 *  - log:   structured log only (always available)
 *
 * Every channel falls back to a structured log line if its underlying
 * transport isn't configured — the audit trail is therefore always complete.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly slackWebhook: string;
  private readonly teamsWebhook: string;

  constructor(
    config: ConfigService,
    private readonly email: EmailService,
  ) {
    this.slackWebhook = (config.get<string>('slackWebhookUrl') ?? '').trim();
    this.teamsWebhook = (config.get<string>('teamsWebhookUrl') ?? '').trim();
  }

  async send(message: NotificationMessage): Promise<void> {
    let delivered = false;

    if (message.channel === 'email' && this.email.isEnabled()) {
      delivered = await this.email.send({
        to: message.to,
        subject: message.subject ?? 'Sigma PMO notification',
        text: message.body,
      });
    } else if (message.channel === 'slack' && this.slackWebhook) {
      delivered = await this.postWebhook(this.slackWebhook, {
        text: `*${message.subject ?? 'Sigma PMO'}*\n${message.body}`,
      });
    } else if (message.channel === 'teams' && this.teamsWebhook) {
      delivered = await this.postWebhook(this.teamsWebhook, {
        text: `${message.subject ?? 'Sigma PMO'}\n${message.body}`,
      });
    }

    // Always log — even on successful delivery — so the audit trail captures every notification.
    this.logger.log(
      `notify[${message.channel}] to=${message.to} subject=${message.subject ?? ''} ` +
        `delivered=${delivered} body=${message.body.slice(0, 200)}`,
    );
  }

  private async postWebhook(url: string, payload: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (error) {
      this.logger.warn(`Webhook delivery failed: ${(error as Error).message}`);
      return false;
    }
  }
}
