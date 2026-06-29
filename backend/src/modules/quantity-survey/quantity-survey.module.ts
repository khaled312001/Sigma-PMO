import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BoqIntelligenceService } from './boq-intelligence.service';
import { BoqTraceabilityService } from './boq-traceability.service';
import { CostEstimationService } from './cost-estimation.service';
import { MeasurementService } from './measurement.service';
import { QsGovernanceService } from './qs-governance.service';
import { QuantitySurveyAgentService } from './quantity-survey-agent.service';
import { QuantitySurveyController } from './quantity-survey.controller';
import { QuantitySurveyService } from './quantity-survey.service';
import { TraceabilityService } from './traceability.service';

/**
 * QuantitySurveyModule — Quantity Survey Intelligence (Mr. Ayham, 2026-06-12):
 * the Global Cost Classification Framework, classified cost estimation, BOQ
 * intelligence, measurement & final account, and the QS governance layer.
 * Registers the `ext.quantity_survey` extension agent — importing this module
 * in AppModule is the entire structural cost (zero edits to L0–L8).
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [QuantitySurveyController],
  providers: [
    CostEstimationService,
    BoqIntelligenceService,
    BoqTraceabilityService,
    MeasurementService,
    QsGovernanceService,
    QuantitySurveyService,
    TraceabilityService,
    QuantitySurveyAgentService,
  ],
  exports: [CostEstimationService, QsGovernanceService, QuantitySurveyService, TraceabilityService],
})
export class QuantitySurveyModule {}
