import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/**
 * Global rate-limiting buckets. The `default` bucket protects all routes; the
 * `auth`, `ingest` and `ai` buckets are tighter and are attached to specific
 * controllers via `@Throttle({ bucket: { limit, ttl } })` decorators.
 *
 * Dev (NODE_ENV !== 'production') multiplies every bucket by 50× so that
 * React StrictMode double-mounts, Fast Refresh rebuilds and concurrent
 * page-level fetches don't trip 429s while iterating. Production keeps the
 * tight values from `configuration.ts`.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = (config.get<string>('env') ?? process.env.NODE_ENV) !== 'production';
        const devMultiplier = isDev ? 50 : 1;
        const m = (limit: number): number => limit * devMultiplier;
        return [
          {
            name: 'default',
            ttl: config.get<number>('throttlerDefaultTtlMs') ?? 60_000,
            limit: m(config.get<number>('throttlerDefaultLimit') ?? 100),
          },
          {
            name: 'auth',
            ttl: 60_000,
            limit: m(config.get<number>('throttlerAuthLimit') ?? 10),
          },
          {
            name: 'ingest',
            ttl: 60_000,
            limit: m(config.get<number>('throttlerIngestLimit') ?? 30),
          },
          {
            // Match the bucket name used by `@Throttle({ ai: { ... } })` on
            // the clash-solution-proposer controller — without it registered
            // here the global guard would fall back to the most restrictive
            // bucket (auth) on the AI route.
            name: 'ai',
            ttl: 60_000,
            limit: m(12),
          },
        ];
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppThrottlerModule {}
