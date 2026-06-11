import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BankabilityService } from './bankability.service';
import { ConceptIntakeService } from './concept-intake.service';
import { FeasibilityController } from './feasibility.controller';
import { FeasibilityService } from './feasibility.service';
import { FinancialModelService } from './financial-model.service';
import { InvestmentAgentService } from './investment-agent.service';
import { RapidAssessmentService } from './rapid-assessment.service';

/**
 * FeasibilityModule — Investment & Feasibility Intelligence (Mr. Ayham,
 * 2026-06-11 follow-up): Level-1 rapid investment assessment, the Level-2
 * professional feasibility & bankability engine with audience packages, and
 * concept-sketch intake (upload → AI extraction → human confirm).
 *
 * Registers as the `ext.investment` extension agent — like EsgModule, its
 * import in AppModule is the entire structural cost: zero edits to L0–L8,
 * the contract base, the registry or the orchestrator.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, ClaudeModule, IngestionModule, OutboxModule],
  controllers: [FeasibilityController],
  providers: [
    FinancialModelService,
    RapidAssessmentService,
    BankabilityService,
    ConceptIntakeService,
    FeasibilityService,
    InvestmentAgentService,
  ],
  exports: [FeasibilityService, RapidAssessmentService, BankabilityService],
})
export class FeasibilityModule {}
