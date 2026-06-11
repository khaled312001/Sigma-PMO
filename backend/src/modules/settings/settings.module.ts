import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { GovernanceConfigController } from './governance-config.controller';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Runtime-configurable platform settings. The `SettingsService` provides
 * AES-256-GCM encryption around `SystemSetting` rows; other modules (e.g.
 * `ClaudeService`) import this module to read the decrypted plaintext at
 * request time when their env-var fallback is empty.
 *
 * Also hosts the Governance Configuration Center (`GovernanceConfigController`)
 * — the typed `governance.config` JSON document + its `governance.escalateAfterDays`
 * scalar mirror, both persisted through `SettingsService`.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [SettingsController, GovernanceConfigController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
