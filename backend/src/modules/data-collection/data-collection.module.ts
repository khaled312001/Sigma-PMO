import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClassificationService } from './classification.service';
import { DataCollectionAgentService } from './data-collection-agent.service';
import { DataCollectionController } from './data-collection.controller';
import { ProjectRecordService } from './project-record.service';

/**
 * DataCollectionModule — the L1 Data Collection Agent (Phase 7) + the
 * polymorphic project-record store for the new source families. Self-registers
 * the L1 agent so the full L1→L8 pipeline runs every layer.
 *
 * Wave 9 (Agent D) adds:
 *  - `ClassificationService` — the deterministic Repository-intelligence
 *    keyword classifier (auto-tags every record on write).
 *  - `IngestionModule` (StorageService) — to archive OCR-document uploads
 *    immutably before extraction.
 *  - `ClaudeModule` (ClaudeService) — Vision OCR for scanned documents, behind
 *    `isEnabled()` with a graceful manual-pending fallback.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, ClaudeModule, IngestionModule],
  controllers: [DataCollectionController],
  providers: [ProjectRecordService, DataCollectionAgentService, ClassificationService],
  exports: [ProjectRecordService, DataCollectionAgentService],
})
export class DataCollectionModule {}
