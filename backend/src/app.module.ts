import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { buildLoggerModule } from './common/logger';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AppThrottlerModule } from './common/throttler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BaselinesModule } from './modules/baselines/baselines.module';
import { BoqModule } from './modules/boq/boq.module';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { ClashesModule } from './modules/clashes/clashes.module';
import { ClaudeModule } from './modules/claude/claude.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LettersModule } from './modules/letters/letters.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PersonasModule } from './modules/personas/personas.module';
import { RulesModule } from './modules/rules/rules.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { SourcesModule } from './modules/sources/sources.module';
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
    // Wave 2 — AI infrastructure foundation. SourcesModule before ClaudeModule
    // so the catalogue is seeded by the time any Claude call resolves a
    // persona that wants to cite from it.
    SourcesModule,
    ClaudeModule,
    // Wave 2 — BaselineBuildWorker stub. Accepts jobs and parks them in
    // `awaiting-enablement` until ADR-0011 (Computer Use safety) flips to
    // Accepted on Al Ayham's open question 6. See post-meeting plan §3.1.
    BaselinesModule,
    // Cross-layer Outbox (ADR-0012, Stage 1) — durable, append-only bus
    // sitting between L1/L2/L3/L4/Simulation. Producers inject
    // `OutboxService` and push from inside their own transaction.
    OutboxModule,
    // BoQ ingestion (post-meeting plan §3.7 + §3.1) — Excel parser + the
    // append-only BoQ / BoqItem write path, with a `planning.boq.ingested`
    // Outbox push on every successful run. Imported after OutboxModule so the
    // bus is available for the producer.
    BoqModule,
    // Clash ingestion (post-meeting plan §3.7, ADR-0012 §5) — Navisworks /
    // Revit Excel parser writing `ClashItem` rows and pushing one
    // `engineering.clash.ingested` event per row onto the cross-layer Outbox.
    // Layer 1 / Engineering. Imported after OutboxModule + CanonicalModule
    // so both the bus and the ClashItem repository are in scope.
    ClashesModule,
    // Layer 3 / Governance — FIDIC LetterDrafter (post-meeting plan §3.5,
    // ADR-0010 §6, ADR-0011 §3). Persists draft replies + compliance
    // letters via the `fidic-redbook-expert` persona, enforces the
    // mandatory citation footer against the SourceRegistry, and gates
    // status flips behind a human-approval click. No `send` route —
    // auto-send stays frozen until ADR-0011 flips on Q6. Imported after
    // ClaudeModule + SourcesModule so both are available.
    LettersModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request-ID first — pino-http reads x-request-id via its genReqId callback.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
