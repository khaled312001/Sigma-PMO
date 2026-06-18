import { join } from 'node:path';

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
          // Compiled migrations ship in the image at dist/src/migrations. In
          // production we run any pending migrations automatically on connect,
          // so a fresh database (e.g. a brand-new container/volume) is fully
          // built BEFORE the app serves traffic — no manual migration step.
          // In dev the schema is managed locally, so auto-run stays off.
          migrations: [join(__dirname, '..', 'migrations', '*.{js,ts}')],
          migrationsRun: isProd,
          migrationsTableName: 'migrations',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
