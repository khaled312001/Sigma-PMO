import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';

/**
 * Scenario sandbox (ADR-0010 §5, post-meeting plan §3.4).
 *
 * Wave 1 ships fork/list/discard with an empty snapshot. Snapshot population,
 * rule re-evaluation on the branch, and the "promote to canonical" gate are
 * deliberately out of scope here.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [SimulationController],
  providers: [SimulationService],
  exports: [SimulationService],
})
export class SimulationModule {}
