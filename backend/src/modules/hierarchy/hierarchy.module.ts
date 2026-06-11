import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { GovernanceStatusService } from './governance-status.service';
import { HierarchyController } from './hierarchy.controller';
import { HierarchyService } from './hierarchy.service';
import { RollupService } from './rollup.service';

/**
 * HierarchyModule — the multi-level governance hierarchy
 * (Enterprise → Portfolio → Program → Project) + the 4-tier Green/Yellow/
 * Orange/Red `GovernanceStatusService` (2026-06-11 governance OS, Phase 1).
 *
 * Imports `CanonicalModule` for every repo it touches (hierarchy entities +
 * Alert + GovernanceDecision + ConfidenceScore + GovernanceStatusSnapshot,
 * all in CANONICAL_ENTITIES).
 */
@Module({
  imports: [CanonicalModule],
  controllers: [HierarchyController],
  providers: [HierarchyService, GovernanceStatusService, RollupService],
  exports: [HierarchyService, GovernanceStatusService, RollupService],
})
export class HierarchyModule {}
