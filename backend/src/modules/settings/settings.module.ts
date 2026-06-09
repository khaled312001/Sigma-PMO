import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Runtime-configurable platform settings. The `SettingsService` provides
 * AES-256-GCM encryption around `SystemSetting` rows; other modules (e.g.
 * `ClaudeService`) import this module to read the decrypted plaintext at
 * request time when their env-var fallback is empty.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
