import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { StorageService } from '../ingestion/storage/storage.service';
import { SafetyModule } from '../safety/safety.module';
import { QualityModule } from '../quality/quality.module';
import { SiteEvidenceController } from './site-evidence.controller';
import { SiteEvidenceService } from './site-evidence.service';

/**
 * SiteEvidenceModule — the smart-glasses / site-evidence capture channel
 * (Mr. Ayham acceptance 2026-06-28). Persists SiteEvidence (CanonicalModule),
 * archives the media via `StorageService` (provided locally, same self-contained
 * pattern as BoqModule), and can promote a capture into a Safety or Quality
 * finding through SafetyModule / QualityModule.
 */
@Module({
  imports: [CanonicalModule, SafetyModule, QualityModule],
  controllers: [SiteEvidenceController],
  providers: [SiteEvidenceService, StorageService],
  exports: [SiteEvidenceService],
})
export class SiteEvidenceModule {}
