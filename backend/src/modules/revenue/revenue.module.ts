import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { FeasibilityModule } from '../feasibility/feasibility.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QuantitySurveyModule } from '../quantity-survey/quantity-survey.module';
import { RevenueAgentService } from './revenue-agent.service';
import { RevenueController } from './revenue.controller';
import { RevenueGovernanceService } from './revenue-governance.service';

/**
 * RevenueModule — Revenue Governance (Mr. Ayham, 2026-06-12 follow-up).
 * Reuses the traceability ledger (QuantitySurveyModule) for the revenue +
 * cash-flow chains and the feasibility financial model (FeasibilityModule) for
 * the NPV/IRR impact. Registers the `ext.revenue_governance` extension agent —
 * completing the chain: Investment → Quantity Survey → Procurement → Revenue.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule, QuantitySurveyModule, FeasibilityModule],
  controllers: [RevenueController],
  providers: [RevenueGovernanceService, RevenueAgentService],
  exports: [RevenueGovernanceService],
})
export class RevenueModule {}
