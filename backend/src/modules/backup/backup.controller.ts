import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { BackupService } from './backup.service';

/**
 * `/backup/**` — super-admin backup console (gated on `canManagePlatform`).
 * Lets the platform owner see the backups on R2 and trigger one on demand, in
 * addition to the nightly @Cron. The same dashboard chrome hosts this.
 */
@Controller('backup')
export class BackupController {
  constructor(private readonly svc: BackupService) {}

  @Get()
  @RequiresCapability('canManagePlatform')
  list() {
    return this.svc.listBackups();
  }

  @Post('run')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  run() {
    return this.svc.runBackup();
  }

  /** One-time push of pre-existing local files up to R2 (idempotent). */
  @Post('migrate-storage')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  migrateStorage() {
    return this.svc.migrateLocalStorage();
  }
}
