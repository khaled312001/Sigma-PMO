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
        // IMPORTANT: ThrottlerGuard enforces EVERY registered throttler on EVERY
        // route. So `default` is the only bucket that may carry a real global
        // limit — it protects all routes. The `auth`/`ingest`/`ai` buckets exist
        // ONLY so the per-route `@Throttle({ auth|ingest|ai: { limit } })`
        // decorators (login, register, ingest, AI) can tighten THEIR routes; they
        // MUST stay effectively unlimited globally, otherwise the smallest of them
        // (auth=10/min) would silently cap the entire API to ~10 req/min per IP.
        const UNBOUND = 10_000_000;
        return [
          {
            name: 'default',
            ttl: config.get<number>('throttlerDefaultTtlMs') ?? 60_000,
            limit: m(config.get<number>('throttlerDefaultLimit') ?? 600),
          },
          { name: 'auth', ttl: 60_000, limit: UNBOUND },
          { name: 'ingest', ttl: 60_000, limit: UNBOUND },
          { name: 'ai', ttl: 60_000, limit: UNBOUND },
        ];
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppThrottlerModule {}
