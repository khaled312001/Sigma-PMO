import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from '../canonical/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommunicationRule } from './communication-rule.entity';
import { CommunicationRuleController } from './communication-rule.controller';
import { CommunicationRuleService } from './communication-rule.service';
import { Communication } from './communication.entity';
import { CommunicationsAlertsCron } from './communications-alerts.cron';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

/**
 * Communication evidence tracking (Mr. Ayham, 2026-06-19). An auditable record of
 * project communications/notices with an AUTHENTICATED open-in-Sigma evidence
 * trail, a full lifecycle (sent → delivered → opened → attachment-viewed →
 * acknowledged → accepted/rejected → action-completed/no-action → escalated/
 * disputed), per-company communication RULES (channels, approved recipients,
 * unread-alert period, escalation matrix, required ack/response, deemed-notice)
 * and an hourly automatic alert + escalation sweep.
 */
@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Communication, CommunicationRule, AuditLog, User]),
  ],
  controllers: [CommunicationsController, CommunicationRuleController],
  providers: [CommunicationsService, CommunicationRuleService, CommunicationsAlertsCron],
  exports: [CommunicationsService, CommunicationRuleService],
})
export class CommunicationsModule {}
