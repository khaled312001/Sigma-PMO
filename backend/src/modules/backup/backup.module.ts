import { Module } from '@nestjs/common';

import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/** Automatic + on-demand DB backups to R2/S3 (nightly @Cron + super-admin endpoint). */
@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
