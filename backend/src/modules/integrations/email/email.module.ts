import { Module } from '@nestjs/common';

import { SettingsModule } from '../../settings/settings.module';
import { EmailService } from './email.service';

/**
 * Email outbound channel. Imports SettingsModule so EmailService can read the
 * encrypted `integrations.email_smtp` SMTP URL (set from /admin/settings), with
 * the `EMAIL_SMTP_URL` env var as the fallback.
 */
@Module({
  imports: [SettingsModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
