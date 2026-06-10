import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { LettersModule } from '../letters/letters.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ScheduleRevisionService } from './schedule-revision.service';
import { SimulationController } from './simulation.controller';
import { SimulationEngineService } from './simulation-engine.service';
import { SimulationService } from './simulation.service';

/**
 * Scenario sandbox + what-if engine (ADR-0010 §5, post-meeting plan §3.4,
 * correction-plan §2.3–§2.4).
 *
 * Wave 1 shipped fork/list/discard with an empty snapshot. Wave 6 adds:
 *
 *  - `SimulationEngineService` — deterministic clash-impact projector.
 *    Computes the project-level time/cost delta of a clash-resolution
 *    option via the total-float heuristic and persists the what-if as a
 *    Scenario row (the "يعمل عليها فورًا simulation" requirement from the
 *    2026-06-08 meeting @ 00:07:49).
 *
 *  - `ScheduleRevisionService` — the atomic approve-and-apply arm. Records
 *    the decision, issues append-only Activity versions with the shifted
 *    dates, commits the Scenario, pushes `planning.schedule.revised` onto
 *    the Outbox, and best-effort drafts the FIDIC claim letter (the
 *    "رح يعمل reflection مباشرةً على البرنامج الزمني" requirement @ 00:10:24).
 *
 * Imports `LettersModule` for the claim-letter hand-off and `OutboxModule`
 * for the cross-layer event push. No module cycle: letters/outbox do not
 * import simulation.
 */
@Module({
  imports: [CanonicalModule, OutboxModule, LettersModule],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationEngineService, ScheduleRevisionService],
  exports: [SimulationService, SimulationEngineService, ScheduleRevisionService],
})
export class SimulationModule {}
