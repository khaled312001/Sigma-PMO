import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { AcceptanceController } from './acceptance.controller';
import { AcceptanceRunnerService } from './acceptance.service';

/**
 * AcceptanceModule — the Sigma Validation / Acceptance Framework (Mr. Ayham,
 * 2026-06-13): the formal 23-test acceptance program for declaring Sigma
 * "production-ready & market-ready". Holds the catalog as data and a runner
 * that executes each test against the LIVE platform.
 *
 * Imports `AgentsModule` (for the registry + orchestrator the runner drives)
 * and `CanonicalModule` (for the `AgentExecution` repository the TEST-22 audit
 * check queries). Wires in with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, CanonicalModule],
  controllers: [AcceptanceController],
  providers: [AcceptanceRunnerService],
  exports: [AcceptanceRunnerService],
})
export class AcceptanceModule {}
