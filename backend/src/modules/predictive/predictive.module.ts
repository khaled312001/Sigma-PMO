import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RulesModule } from '../rules/rules.module';
import { PredictionService } from './prediction.service';
import { PredictiveAgentService } from './predictive-agent.service';
import { PredictiveController } from './predictive.controller';

/**
 * PredictiveModule — Predictive Governance (Mr. Ayham, 2026-06-12 active scope).
 * Stateless forecasting (no entities of its own): reuses the canonical snapshot
 * loader (RulesModule → SnapshotService) for EVM activities, the revenue
 * lifecycle ledger, procurement findings and funding facilities (CanonicalModule
 * repos) to produce five deterministic forecasts. Registers the `ext.predictive`
 * extension agent — plugging into L0–L8 via the registry with zero core changes.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule, RulesModule],
  controllers: [PredictiveController],
  providers: [PredictionService, PredictiveAgentService],
  exports: [PredictionService],
})
export class PredictiveModule {}
