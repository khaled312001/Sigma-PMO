import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module';
import { EmailModule } from './email/email.module';
import { P6WebhookController } from './p6/p6-webhook.controller';

@Module({
  imports: [IngestionModule, EmailModule],
  controllers: [P6WebhookController],
  exports: [EmailModule],
})
export class IntegrationsModule {}
