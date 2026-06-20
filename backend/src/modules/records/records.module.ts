import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../audit/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { LegalHoldModule } from '../legal-hold/legal-hold.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

/**
 * Generic result-record management (Mr. Ayham, 2026-06-20): one reusable,
 * tenant-safe, audited surface to delete or edit any result row across all pages.
 * LegalHoldModule lets the delete path refuse to hard-delete a row under an
 * active preservation hold (acceptance #6/#12).
 */
@Module({
  imports: [AuthModule, LegalHoldModule, TypeOrmModule.forFeature([AuditLog])],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
