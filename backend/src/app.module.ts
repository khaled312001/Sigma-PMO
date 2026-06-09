import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { buildLoggerModule } from './common/logger';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AppThrottlerModule } from './common/throttler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PersonasModule } from './modules/personas/personas.module';
import { RulesModule } from './modules/rules/rules.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { SummaryModule } from './modules/summary/summary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    buildLoggerModule(),
    AppThrottlerModule,
    DatabaseModule,
    CanonicalModule,
    AuthModule,
    GovernanceModule,
    IngestionModule,
    NotificationsModule,
    IntegrationsModule,
    RulesModule,
    SummaryModule,
    PersonasModule,
    SimulationModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request-ID first — pino-http reads x-request-id via its genReqId callback.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
