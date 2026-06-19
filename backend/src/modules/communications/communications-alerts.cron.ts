import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CommunicationsService } from './communications.service';

/**
 * Automatic communication-alert sweep (Mr. Ayham, 2026-06-19). Runs hourly with
 * no request/tenant context and evaluates EVERY company's unopened official
 * communications against that company's rules: fires the 24h unread alert,
 * applies deemed-notice, and escalates per the communication matrix. Every event
 * is written to the audit log (system actor). Defensive — never throws into the
 * scheduler.
 */
@Injectable()
export class CommunicationsAlertsCron {
  private readonly logger = new Logger(CommunicationsAlertsCron.name);

  constructor(private readonly comms: CommunicationsService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'communication-alerts' })
  async sweep(): Promise<void> {
    try {
      const r = await this.comms.runAlertsForAll();
      if (r.alerted || r.escalated || r.deemed) {
        this.logger.log(
          `comm-alerts sweep: companies=${r.companies} alerted=${r.alerted} escalated=${r.escalated} deemed=${r.deemed}`,
        );
      }
    } catch (err) {
      this.logger.error(`comm-alerts sweep failed: ${(err as Error).message}`);
    }
  }
}
