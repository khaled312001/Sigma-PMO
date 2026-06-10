import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { PolicyAddonsController } from './policy-addons.controller';
import { PolicyAddonsService } from './policy-addons.service';

/**
 * Project-scoped AI instructions (correction-plan §2.6). Standalone module
 * so `ClaudeModule` can import it without a cycle — the prompt builder
 * appends `buildPromptBlock(projectKey, surface)` to every persona call
 * that declares its project context.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [PolicyAddonsController],
  providers: [PolicyAddonsService],
  exports: [PolicyAddonsService],
})
export class PolicyAddonsModule {}
