import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { FeasibilityModule } from '../feasibility/feasibility.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OpportunityAgentService } from './opportunity-agent.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityIntelligenceService } from './opportunity-intelligence.service';
import { MarketIntelligenceService } from './market-intelligence.service';

/**
 * OpportunityModule — Opportunity Intelligence + Market Intelligence (Mr. Ayham,
 * 2026-06-12 active scope): the FIRST gate of the investment lifecycle
 * (Idea → Opportunity Intelligence → Rapid Assessment → Feasibility →
 * Bankability → Investment Governance). Reuses the Sigma Assumption Library
 * (FeasibilityModule) for deterministic scoring and registers the
 * `ext.opportunity` extension agent — its import in AppModule is the entire
 * structural cost: zero edits to L0–L8, the contract base, or the orchestrator.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule, FeasibilityModule],
  controllers: [OpportunityController],
  providers: [OpportunityIntelligenceService, MarketIntelligenceService, OpportunityAgentService],
  exports: [OpportunityIntelligenceService, MarketIntelligenceService],
})
export class OpportunityModule {}
