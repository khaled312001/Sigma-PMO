import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClaimsAgentService } from './claims-agent.service';
import { ClaimsController } from './claims.controller';
import { DelayAnalysisService } from './delay-analysis.service';

/**
 * ClaimsModule — the L6 Claims & Disputes Agent (Phase 4). Deterministic delay
 * analysis + claims identification + evidence linking. Self-registers.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule],
  controllers: [ClaimsController],
  providers: [DelayAnalysisService, ClaimsAgentService],
  exports: [ClaimsAgentService, DelayAnalysisService],
})
export class ClaimsModule {}
