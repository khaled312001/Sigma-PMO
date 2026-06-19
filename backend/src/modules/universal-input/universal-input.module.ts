import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { InputProposal } from './input-proposal.entity';
import { UniversalInputController } from './universal-input.controller';
import { UniversalInputService } from './universal-input.service';

/**
 * Universal AI Input — one general entry point that takes any project
 * information (files + pasted text), maps it to the Sigma layers with Claude,
 * and stages it for human review before committing to the official records.
 */
@Module({
  imports: [
    CanonicalModule, // ProjectRecord / SourceFile / IngestionRun / User repos
    AuthModule, // AuthService (caller resolution)
    ClaudeModule, // ClaudeService (extraction + mapping)
    IngestionModule, // StorageService (archive committed payload)
    TypeOrmModule.forFeature([InputProposal, AuditLog]),
  ],
  controllers: [UniversalInputController],
  providers: [UniversalInputService],
})
export class UniversalInputModule {}
