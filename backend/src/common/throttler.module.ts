import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/**
 * Global rate-limiting buckets. The `default` bucket protects all routes; the
 * `auth` and `ingest` buckets are tighter and are attached to specific
 * controllers via `@Throttle({ auth: { limit, ttl } })` decorators.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('throttlerDefaultTtlMs') ?? 60_000,
          limit: config.get<number>('throttlerDefaultLimit') ?? 100,
        },
        {
          name: 'auth',
          ttl: 60_000,
          limit: config.get<number>('throttlerAuthLimit') ?? 10,
        },
        {
          name: 'ingest',
          ttl: 60_000,
          limit: config.get<number>('throttlerIngestLimit') ?? 30,
        },
      ],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppThrottlerModule {}
