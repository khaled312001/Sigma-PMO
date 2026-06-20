import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

/**
 * Generic result-record management (Mr. Ayham, 2026-06-20): one reusable,
 * tenant-safe, audited surface to delete or edit any result row across all pages.
 */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AuditLog])],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
