import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { BaselineBuildService } from './baseline-build.service';
import { BaselinesController } from './baselines.controller';

/**
 * Baseline build surface (post-meeting plan §3.1, ADR-0011).
 *
 * Wave 2 ships the stub only — submit / list / get on a row that parks in
 * `awaiting-enablement`. The Anthropic Computer Use driver, MPXJ/PMXML
 * writer, and the human approval gate are all Wave 3+ and stay out of this
 * module until ADR-0011 is Accepted.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [BaselinesController],
  providers: [BaselineBuildService],
  exports: [BaselineBuildService],
})
export class BaselinesModule {}
