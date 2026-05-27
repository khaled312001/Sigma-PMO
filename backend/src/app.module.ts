import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { RulesModule } from './modules/rules/rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    DatabaseModule,
    CanonicalModule,
    IngestionModule,
    RulesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
