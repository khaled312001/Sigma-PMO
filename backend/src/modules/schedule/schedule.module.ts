import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CpmService } from './cpm.service';
import { RecoveryPlanService } from './recovery-plan.service';
import { ScheduleController } from './schedule.controller';

/**
 * Schedule analytics module (Mr. Ayham acceptance 2026-06-28).
 *
 *  - `CpmService` — standalone CPM solver over `Activity.predecessors[]`
 *    (forward/backward pass → ES/EF/LS/LF/float/isCritical + critical path,
 *    plus a delay-impact re-pass). Consumed by SimulationEngine + ForensicDelay
 *    for logic-network criticality, and exposed at `GET /projects/:key/cpm`.
 *  - `RecoveryPlanService` (Task 4) — crash/fast-track/re-sequence recovery on
 *    the CPM critical path.
 *
 * Imports CanonicalModule for the Project/Activity repositories. No cycle:
 * canonical does not import schedule.
 */
@Module({
  imports: [CanonicalModule, OutboxModule],
  controllers: [ScheduleController],
  providers: [CpmService, RecoveryPlanService],
  exports: [CpmService, RecoveryPlanService],
})
export class ScheduleModule {}
