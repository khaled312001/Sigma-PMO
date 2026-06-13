import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SafetyAgentService } from './safety-agent.service';
import { SafetyController } from './safety.controller';
import { SafetyGovernanceService } from './safety-governance.service';
import { SafetyService } from './safety.service';

/**
 * SafetyModule — Safety Governance (Mr. Ayham, 2026-06-13 full governance
 * lifecycle). Builds on the SafetyRecord entity (CanonicalModule) and reads the
 * canonical Project + Activity rows (CanonicalModule) to flag critical-path
 * impact. Governs implementation of approved HSE plans during execution:
 * incidents, near-misses, inspections, permits, corrective actions, toolbox
 * talks and audits — producing a safety compliance score, an HSE performance
 * index, a safety risk register, a safety trend, and stop-work claim chains
 * (Safety Event → Stop Work → Delay → Critical Path → EOT → Claim readiness).
 * Registers the `ext.safety` extension agent — with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [SafetyController],
  providers: [SafetyService, SafetyGovernanceService, SafetyAgentService],
  exports: [SafetyService, SafetyGovernanceService],
})
export class SafetyModule {}
