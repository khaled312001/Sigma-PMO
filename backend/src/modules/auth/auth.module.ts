import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CanonicalModule } from '../canonical/canonical.module';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [CanonicalModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    ApiKeyGuard,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
  exports: [AuthService, ApiKeyGuard],
})
export class AuthModule {}
