import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ProcurementAgentService } from './procurement-agent.service';
import { ProcurementController } from './procurement.controller';
import { ProcurementGovernanceService } from './procurement-governance.service';
import { ProcurementPlanningService } from './procurement-planning.service';
import { ProcurementValidationService } from './procurement-validation.service';
import { VendorIntelligenceService } from './vendor-intelligence.service';

/**
 * ProcurementModule — Procurement Intelligence (Mr. Ayham, 2026-06-12): planning
 * & long-lead tracking, vendor intelligence, RFQ/bid governance + award,
 * delivery tracking, and the cross-source procurement governance-validation
 * layer. Registers the `ext.procurement` extension agent (zero edits to L0–L8).
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [ProcurementController],
  providers: [
    VendorIntelligenceService,
    ProcurementPlanningService,
    ProcurementGovernanceService,
    ProcurementValidationService,
    ProcurementAgentService,
  ],
  exports: [ProcurementValidationService, ProcurementPlanningService, VendorIntelligenceService],
})
export class ProcurementModule {}
