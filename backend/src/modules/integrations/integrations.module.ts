import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module';
import { P6WebhookController } from './p6/p6-webhook.controller';

@Module({
  imports: [IngestionModule],
  controllers: [P6WebhookController],
})
export class IntegrationsModule {}
