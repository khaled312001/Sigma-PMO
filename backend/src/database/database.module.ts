import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../config/configuration';

/**
 * Global database wiring. Reads the typed `database` config and connects to
 * MySQL via TypeORM. `synchronize` is driven by config (dev only); production
 * uses migrations. Entities are auto-loaded from feature modules.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<DatabaseConfig>('database');
        return {
          type: 'mysql' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          autoLoadEntities: true,
          synchronize: db.synchronize,
          logging: db.logging,
          charset: 'utf8mb4',
          timezone: 'Z',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
