import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { BaselineBuildService } from './baseline-build.service';
import { BaselinePdfRendererService } from './baseline-pdf-renderer.service';
import { BaselineTemplateService } from './baseline-template.service';
import { BaselinesController } from './baselines.controller';
import { ComputerUseOrchestratorService } from './computer-use-orchestrator.service';
import { XerWriterService } from './xer-writer.service';

/**
 * Baseline build surface (post-meeting plan §3.1, ADR-0011).
 *
 * Wave 2 ships the stub only — submit / list / get on a row that parks in
 * `awaiting-enablement`. The Anthropic Computer Use driver, MPXJ/PMXML
 * writer, and the human approval gate are all Wave 3+ and stay out of this
 * module until ADR-0011 is Accepted.
 */
@Module({
  imports: [CanonicalModule, IngestionModule],
  controllers: [BaselinesController],
  providers: [
    BaselineBuildService,
    XerWriterService,
    ComputerUseOrchestratorService,
    BaselineTemplateService,
    BaselinePdfRendererService,
  ],
  exports: [
    BaselineBuildService,
    XerWriterService,
    ComputerUseOrchestratorService,
    BaselineTemplateService,
    BaselinePdfRendererService,
  ],
})
export class BaselinesModule {}
