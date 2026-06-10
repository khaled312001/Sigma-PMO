import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ProjectMemoryController } from './project-memory.controller';
import { ProjectMemoryService } from './project-memory.service';

/**
 * Project "understudy" memory (correction-plan §2.11). Standalone module —
 * `ClaudeModule` imports it so the prompt builder can inject the project's
 * learned facts, mirroring the PolicyAddons wiring (ADR-0025).
 */
@Module({
  imports: [CanonicalModule],
  controllers: [ProjectMemoryController],
  providers: [ProjectMemoryService],
  exports: [ProjectMemoryService],
})
export class ProjectMemoryModule {}
