import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EsgAgentService } from './esg-agent.service';

/**
 * EsgModule — the reference future/extension agent (Phase 8 extensibility
 * proof). Importing this module is the ENTIRE cost of adding a new agent: it
 * self-registers and appears in /agents, with no edit to any L0–L8 module, the
 * Agent Contract base, the registry or the orchestrator.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule],
  providers: [EsgAgentService],
  exports: [EsgAgentService],
})
export class EsgModule {}
