import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthorityAgentService } from './authority-agent.service';
import { AuthorityController } from './authority.controller';
import { AuthorityGovernanceService } from './authority-governance.service';
import { AuthorityService } from './authority.service';

/**
 * AuthorityModule — Authority Governance (Mr. Ayham, 2026-06-13 — full 17-stage
 * governance lifecycle). Builds on the AuthoritySubmission entity and the
 * canonical Project/Activity schedule (CanonicalModule re-exports the TypeORM
 * repositories) to govern all authority submissions & approvals: readiness
 * scoring, outstanding comments, forecast approvals and — the core —
 * auto-calculated project delay exposure + critical-path impact when an approval
 * forecast slips past its required-by date. Registers the `ext.authority`
 * extension agent with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [AuthorityController],
  providers: [AuthorityService, AuthorityGovernanceService, AuthorityAgentService],
  exports: [AuthorityService, AuthorityGovernanceService],
})
export class AuthorityModule {}
