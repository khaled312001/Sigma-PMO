import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CanonicalModule } from '../canonical/canonical.module';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilitiesService } from './capabilities.service';

@Module({
  imports: [CanonicalModule],
  controllers: [AuthController, CapabilitiesController],
  providers: [
    AuthService,
    CapabilitiesService,
    ApiKeyGuard,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
  exports: [AuthService, CapabilitiesService, ApiKeyGuard],
})
export class AuthModule {}
