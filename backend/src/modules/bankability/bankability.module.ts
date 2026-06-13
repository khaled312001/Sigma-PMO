import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { FeasibilityModule } from '../feasibility/feasibility.module';
import { FundingModule } from '../funding/funding.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BankabilityAgentService } from './bankability-agent.service';
import { BankabilityController } from './bankability.controller';
import { BankabilityService } from './bankability.service';

/**
 * BankabilityModule — Bankability Intelligence (Mr. Ayham, 2026-06-13 full
 * governance lifecycle). Reads the latest FeasibilityAssessment + the project's
 * FundingFacility rows (CanonicalModule) and reuses the deterministic annuity /
 * remaining-balance math from the feasibility financial model (FeasibilityModule)
 * to transform feasibility outputs into a lender-ready package: DSCR vs
 * covenant, an annuity-based debt schedule, funding requirements, a bankability
 * verdict and investor/lender package readiness. Registers the `ext.bankability`
 * extension agent — completing the feasibility → financeable-deal chain with
 * zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule, FeasibilityModule, FundingModule],
  controllers: [BankabilityController],
  providers: [BankabilityService, BankabilityAgentService],
  exports: [BankabilityService],
})
export class BankabilityModule {}
