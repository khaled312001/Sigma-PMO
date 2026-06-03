import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Email outbound channel for the Notifications layer. When `EMAIL_SMTP_URL`
 * is set, nodemailer connects via that URL (e.g. `smtps://user:pass@host:465`
 * or `smtp://user:pass@host:587`). When unset, send() resolves to false and
 * the caller falls back to the structured-log channel of NotificationsService.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const url = (config.get<string>('emailSmtpUrl') ?? '').trim();
    this.from = (config.get<string>('emailFrom') ?? 'sigma-pmo@example.com').trim();
    if (!url) {
      this.transporter = null;
      this.logger.debug('Email disabled — EMAIL_SMTP_URL is not set.');
      return;
    }
    this.transporter = createTransport(url);
    this.logger.log('Email transport configured.');
  }

  isEnabled(): boolean {
    return this.transporter !== null;
  }

  async send(message: EmailMessage): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Email send failed: ${(error as Error).message}`);
      return false;
    }
  }
}
