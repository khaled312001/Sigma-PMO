import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { buildLoggerModule } from './common/logger';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AppThrottlerModule } from './common/throttler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BaselinesModule } from './modules/baselines/baselines.module';
import { DrawingsModule } from './modules/drawings/drawings.module';
import { BoqModule } from './modules/boq/boq.module';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { ClashesModule } from './modules/clashes/clashes.module';
import { ClaudeModule } from './modules/claude/claude.module';
import { ComparisonModule } from './modules/comparison/comparison.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LettersModule } from './modules/letters/letters.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgChartsModule } from './modules/org-charts/org-charts.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { HierarchyModule } from './modules/hierarchy/hierarchy.module';
import { PersonasModule } from './modules/personas/personas.module';
import { PolicyAddonsModule } from './modules/policy-addons/policy-addons.module';
import { ProjectMemoryModule } from './modules/project-memory/project-memory.module';
import { RulesModule } from './modules/rules/rules.module';
import { SettingsModule } from './modules/settings/settings.module';
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
    // Wave 3 — PMI org-chart compliance (post-meeting plan §3.5). Cascades
    // findings into the FIDIC LetterDrafter for non-compliance letters.
    // Imported after LettersModule so the drafter is available, and after
    // IngestionModule so StorageService (re-exported) is in scope.
    OrgChartsModule,
    // Wave 4 — runtime-configurable platform settings. Surfaces the Claude
    // API key entry form at /admin/settings + AES-256-GCM-encrypted storage
    // in the `SystemSetting` table.
    SettingsModule,
    // Wave 6 — project-scoped AI instructions authored inline from every
    // AI surface (correction-plan §2.6). ClaudeModule consumes the addon
    // block in its prompt builder.
    PolicyAddonsModule,
    // Wave 7 — the project "understudy" memory (correction-plan §2.11):
    // learned facts per project, harvested from the alert/decision history
    // and injected into matching persona calls at confidence ≥ 0.6.
    ProjectMemoryModule,
    // Wave 7 — phase-1 drawings ingestion (PDF sets; correction-plan §2.7).
    // The detected floor count feeds the drawing-driven baseline generator.
    DrawingsModule,
    // Wave 8 — AI-vs-Human output comparison (correction-plan §2.10,
    // transcript 00:46:14). Human verdicts feed persona refinement.
    ComparisonModule,
    // Governance OS (2026-06-11 vision) — Phase 1 foundation:
    //  - AgentsModule: the standardized Agent Contract spine (registry +
    //    orchestrator + /agents surface) every L0–L8 layer attaches to.
    //  - HierarchyModule: Enterprise → Portfolio → Program → Project tree +
    //    the 4-tier Green/Yellow/Orange/Red GovernanceStatusService.
    AgentsModule,
    HierarchyModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request-ID first — pino-http reads x-request-id via its genReqId callback.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
