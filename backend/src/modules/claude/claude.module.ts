import { Module } from '@nestjs/common';

import { PersonasModule } from '../personas/personas.module';
import { SettingsModule } from '../settings/settings.module';
import { ClaudeController } from './claude.controller';
import { ClaudeService } from './claude.service';

/**
 * Wave 2 — direct `@anthropic-ai/sdk` wiring.
 *
 * The module pulls in `PersonasModule` so `ClaudeService` can look up the
 * active persona row by slug. It exposes `ClaudeService` as its only provider;
 * downstream feature modules (FIDIC LetterDrafter, ClashSolutionProposer,
 * MonthlyNarrativeWorker, BaselineBuildWorker) import this module and inject
 * the service.
 *
 * Intentionally NOT registered as `@Global()` — each feature module names
 * its dependency on Claude explicitly. This keeps the gating rule from
 * ADR-0011 (Computer Use frozen until status flip) easy to enforce by
 * grepping for `ClaudeModule` imports.
 */
@Module({
  imports: [PersonasModule, SettingsModule],
  controllers: [ClaudeController],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
