import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CanonicalModule } from '../canonical/canonical.module';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [CanonicalModule],
  controllers: [AuthController],
  providers: [
    ApiKeyGuard,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
