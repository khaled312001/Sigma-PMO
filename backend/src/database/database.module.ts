import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../config/configuration';

/**
 * Global database wiring. Reads the typed `database` config and connects to
 * MySQL via TypeORM. `synchronize` is config-driven in development; production
 * **always** uses migrations regardless of the config value (defence in depth
 * — operators cannot accidentally enable auto-sync in prod by setting
 * `DB_SYNCHRONIZE=true`). Entities are auto-loaded from feature modules.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<DatabaseConfig>('database');
        const isProd = (config.get<string>('env') ?? '').toLowerCase() === 'production';
        return {
          type: 'mysql' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          autoLoadEntities: true,
          // Hard guarantee: never auto-sync in production.
          synchronize: isProd ? false : db.synchronize,
          logging: db.logging,
          charset: 'utf8mb4',
          timezone: 'Z',
          // Migrations are loaded by the standalone data-source.ts for CLI;
          // the runtime connection runs whatever the migrations have applied.
        };
      },
    }),
  ],
})
export class DatabaseModule {}
