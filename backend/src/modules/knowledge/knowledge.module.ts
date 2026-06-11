import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { SourcesModule } from '../sources/sources.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * KnowledgeModule — the L0 Knowledge & Rules Engine (Mr. Ayham's Layer 0,
 * Phase 2). A facade unifying the Sigma Rule Library, the curated standards
 * registry, governance frameworks/SOPs, Lessons Learned, and learned project
 * memory. Exports `KnowledgeService` so any agent can pull its knowledge pack.
 *
 * Imports `SourcesModule` so the `Source` repository is in scope (Sources owns
 * its own forFeature); `CanonicalModule` covers the rest.
 */
@Module({
  imports: [CanonicalModule, SourcesModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
