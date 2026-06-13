import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { FireLifeSafetyAgentService } from './fire-life-safety-agent.service';
import { FireLifeSafetyController } from './fire-life-safety.controller';
import { FireLifeSafetyGovernanceService } from './fire-life-safety-governance.service';
import { FireLifeSafetyService } from './fire-life-safety.service';

/**
 * FireLifeSafetyModule — Fire & Life Safety Governance (Mr. Ayham, 2026-06-13
 * 17-stage lifecycle scope). Builds on the FireSafetyRecord entity
 * (CanonicalModule) to govern fire-strategy compliance and authority approvals
 * (Civil Defence): fire strategy + drawings, civil-defence reviews, testing &
 * commissioning and inspections — with outstanding-comment tracking,
 * approval-forecast risk and a Fire Readiness composite. Registers the
 * `ext.fire_life_safety` extension agent with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [FireLifeSafetyController],
  providers: [FireLifeSafetyService, FireLifeSafetyGovernanceService, FireLifeSafetyAgentService],
  exports: [FireLifeSafetyService, FireLifeSafetyGovernanceService],
})
export class FireLifeSafetyModule {}
