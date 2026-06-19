import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { EvidenceChunk } from './evidence-chunk.entity';
import { EvidenceController } from './evidence.controller';
import { EvidenceCron } from './evidence.cron';
import { EvidenceFile } from './evidence-file.entity';
import { EvidenceItem } from './evidence-item.entity';
import { EvidenceProcessorService } from './evidence-processor.service';
import { EvidenceRoom } from './evidence-room.entity';
import { EvidenceService } from './evidence.service';

/**
 * Scalable Evidence Memory / Dispute Data Room (Mr. Ayham, 2026-06-19) — a
 * source-verifiable evidence repository for disputes, claims and completed
 * projects, with batch upload, staged background processing (all file types),
 * on-demand capacity expansion, and human-review-before-commit.
 */
@Module({
  imports: [
    AuthModule,
    ClaudeModule,
    IngestionModule, // StorageService
    CanonicalModule, // ProjectRecord / SourceFile / IngestionRun repos
    TypeOrmModule.forFeature([EvidenceRoom, EvidenceFile, EvidenceChunk, EvidenceItem, AuditLog]),
  ],
  controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceProcessorService, EvidenceCron],
  exports: [EvidenceService, EvidenceProcessorService],
})
export class EvidenceModule {}
