import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SigmaGovernanceModule } from '../sigma-governance/sigma-governance.module';
import { ExecutiveAgentService } from './executive-agent.service';
import { ExecutiveKpiService } from './executive-kpi.service';
import { ExecutiveController } from './executive.controller';

/**
 * ExecutiveModule — the L7 Executive Intelligence Agent (Phase 5). Reads L4
 * analytics + L8 consolidation to produce strategic KPIs. Imports
 * SigmaGovernanceModule (L8 consolidation) + AnalyticsModule (L4). Self-registers.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, AnalyticsModule, SigmaGovernanceModule],
  controllers: [ExecutiveController],
  providers: [ExecutiveAgentService, ExecutiveKpiService],
  exports: [ExecutiveAgentService, ExecutiveKpiService],
})
export class ExecutiveModule {}
