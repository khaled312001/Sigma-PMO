import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLog } from './audit-log.entity';

/**
 * Always-on platform audit. Registers the global `AuditInterceptor` (records
 * every mutation + login) and the company-scoped read surface `GET /audit`.
 * Registered globally as an APP_INTERCEPTOR so it covers every controller.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AuditModule {}
