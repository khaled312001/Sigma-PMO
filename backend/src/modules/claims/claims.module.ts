import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { Letter } from '../canonical/entities';
import { OutboxModule } from '../outbox/outbox.module';
import { ClaimsAgentService } from './claims-agent.service';
import { ClaimsExtrasService } from './claims-extras.service';
import { ClaimsController } from './claims.controller';
import { DelayAnalysisService } from './delay-analysis.service';
import { EntitlementService } from './entitlement.service';

/**
 * ClaimsModule — the L6 Claims & Disputes Agent (Phase 4). Deterministic delay
 * analysis + claims identification + evidence linking + entitlement/readiness/
 * package surfaces. Self-registers.
 *
 * `Letter` is registered locally via `forFeature` (it lives in LettersModule's
 * own feature set, not CANONICAL_ENTITIES) so the entitlement notice-window
 * test can read linked-letter dates without importing LettersModule.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, TypeOrmModule.forFeature([Letter])],
  controllers: [ClaimsController],
  providers: [DelayAnalysisService, ClaimsAgentService, EntitlementService, ClaimsExtrasService],
  exports: [ClaimsAgentService, DelayAnalysisService, EntitlementService, ClaimsExtrasService],
})
export class ClaimsModule {}
