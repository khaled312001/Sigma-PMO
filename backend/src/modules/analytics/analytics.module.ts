import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RulesModule } from '../rules/rules.module';
import { AnalyticsAgentService } from './analytics-agent.service';
import { AnalyticsExtrasService } from './analytics-extras.service';
import { AnalyticsController } from './analytics.controller';
import { EarnedScheduleService } from './earned-schedule.service';
import { EvmService } from './evm.service';

/**
 * AnalyticsModule — the L4 Analytics Agent (Phase 3). Imports RulesModule for
 * `SnapshotService` (canonical snapshot loader), AgentsModule for the registry,
 * Canonical + Outbox for repos + bus. The L4 agent self-registers on init.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, RulesModule],
  controllers: [AnalyticsController],
  providers: [EvmService, EarnedScheduleService, AnalyticsAgentService, AnalyticsExtrasService],
  exports: [AnalyticsAgentService, EvmService, EarnedScheduleService, AnalyticsExtrasService],
})
export class AnalyticsModule {}
