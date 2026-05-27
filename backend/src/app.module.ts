import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { AuthModule } from './modules/auth/auth.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RulesModule } from './modules/rules/rules.module';
import { SummaryModule } from './modules/summary/summary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    DatabaseModule,
    CanonicalModule,
    AuthModule,
    GovernanceModule,
    IngestionModule,
    NotificationsModule,
    IntegrationsModule,
    RulesModule,
    SummaryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
