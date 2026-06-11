import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DataCollectionAgentService } from './data-collection-agent.service';
import { DataCollectionController } from './data-collection.controller';
import { ProjectRecordService } from './project-record.service';

/**
 * DataCollectionModule — the L1 Data Collection Agent (Phase 7) + the
 * polymorphic project-record store for the new source families. Self-registers
 * the L1 agent so the full L1→L8 pipeline runs every layer.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule],
  controllers: [DataCollectionController],
  providers: [ProjectRecordService, DataCollectionAgentService],
  exports: [ProjectRecordService, DataCollectionAgentService],
})
export class DataCollectionModule {}
