import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailService, EmailStatus } from '../integrations/email/email.service';

export interface NotificationMessage {
  channel: 'email' | 'slack' | 'teams' | 'log';
  to: string;
  subject?: string;
  body: string;
  context?: Record<string, unknown>;
}

export interface NotificationsStatus {
  email: EmailStatus;
  slackEnabled: boolean;
  teamsEnabled: boolean;
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

  /** Delivery-channel status for the /notifications/status surface (no secrets). */
  getStatus(): NotificationsStatus {
    return {
      email: this.email.getStatus(),
      slackEnabled: this.slackWebhook.length > 0,
      teamsEnabled: this.teamsWebhook.length > 0,
    };
  }

  /**
   * Send a one-off test email to prove the SMTP pathway end-to-end. Returns
   * whether it was accepted by the transport. Throws only when email is not
   * configured at all (so the controller can answer 400 with a clear message).
   */
  async sendTestEmail(to: string): Promise<boolean> {
    if (!this.email.isEnabled()) {
      throw new Error('SMTP not configured — set EMAIL_SMTP_URL or the /admin/settings email SMTP URL.');
    }
    const delivered = await this.email.send({
      to,
      subject: 'Sigma PMO — SMTP test email',
      text:
        'This is a test email from Sigma PMO confirming the outbound SMTP channel is working.\n' +
        'رسالة اختبار من منصّة Sigma PMO تؤكد أن قناة البريد SMTP تعمل.',
    });
    this.logger.log(`notify[test-email] to=${to} delivered=${delivered}`);
    return delivered;
  }

  /**
   * Email a rendered report as a PDF attachment (the "prove sending a report
   * from the platform" path). Throws when SMTP is not configured so the caller
   * can answer 400 with a clear message.
   */
  async emailReport(
    recipients: string[],
    subject: string,
    filename: string,
    pdf: Buffer,
    bodyText: string,
  ): Promise<{ delivered: boolean; to: string[] }> {
    if (!this.email.isEnabled()) {
      throw new Error('SMTP not configured — set EMAIL_SMTP_URL or the /admin/settings email SMTP URL.');
    }
    const to = recipients.map((r) => r.trim()).filter(Boolean);
    const delivered = await this.email.send({
      to: to.join(', '),
      subject,
      text: bodyText,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
    this.logger.log(`notify[email-report] to=${to.join(',')} file=${filename} delivered=${delivered}`);
    return { delivered, to };
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
