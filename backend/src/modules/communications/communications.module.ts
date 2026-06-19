import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { Communication } from './communication.entity';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

/**
 * Communication governance — an auditable record of project communications with
 * an authenticated open-in-Sigma evidence trail and 24h-unread/escalation flags.
 */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Communication, AuditLog])],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
})
export class CommunicationsModule {}
