import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { FeasibilityModule } from '../feasibility/feasibility.module';
import { OutboxModule } from '../outbox/outbox.module';
import { FundingAgentService } from './funding-agent.service';
import { FundingController } from './funding.controller';
import { FundingGovernanceService } from './funding-governance.service';
import { FundingService } from './funding.service';

/**
 * FundingModule — Funding Governance (Mr. Ayham, 2026-06-12 active scope).
 * Builds on the FundingFacility entity (CanonicalModule) and the deterministic
 * debt-service annuity from the feasibility financial model (FeasibilityModule)
 * to govern how the project is financed: drawdown, DSCR + covenant monitoring,
 * refinancing risk and a funding-health composite. Registers the `ext.funding`
 * extension agent — connecting Revenue Governance to Investment Governance with
 * zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule, FeasibilityModule],
  controllers: [FundingController],
  providers: [FundingService, FundingGovernanceService, FundingAgentService],
  exports: [FundingService, FundingGovernanceService],
})
export class FundingModule {}
