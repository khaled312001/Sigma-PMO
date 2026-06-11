import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RiskAgentService } from './risk-agent.service';
import { RiskController } from './risk.controller';
import { RiskScoringService } from './risk-scoring.service';

/**
 * RiskModule — the L5 Risk Agent (Phase 4). Imports AnalyticsModule so the
 * agent can read EVM signals when deriving cost/schedule risks. Self-registers.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, AnalyticsModule],
  controllers: [RiskController],
  providers: [RiskScoringService, RiskAgentService],
  exports: [RiskAgentService, RiskScoringService],
})
export class RiskModule {}
