import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CanonicalModule } from '../canonical/canonical.module';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { ExecutiveModule } from '../executive/executive.module';
import { GovernanceDashboardController } from './governance-dashboard.controller';
import { GovernanceDashboardService } from './governance-dashboard.service';

/**
 * GovernanceDashboardModule — the read-only per-project governance dashboard
 * (Mr. Ayham acceptance 2026-06-28). Reads canonical rows (CanonicalModule) plus
 * `EvidenceRoom` (registered locally via `forFeature`, same pattern as
 * JourneyModule), and reuses `ExecutiveKpiService` (ExecutiveModule) for the
 * KPI summary. Aggregates only — no writes, no auto-approval.
 */
@Module({
  imports: [CanonicalModule, ExecutiveModule, TypeOrmModule.forFeature([EvidenceRoom])],
  controllers: [GovernanceDashboardController],
  providers: [GovernanceDashboardService],
  exports: [GovernanceDashboardService],
})
export class GovernanceDashboardModule {}
