import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { buildLoggerModule } from './common/logger';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { TenantContextMiddleware } from './common/tenant/tenant.middleware';
import { AppThrottlerModule } from './common/throttler.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AgentsModule } from './modules/agents/agents.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { BackupModule } from './modules/backup/backup.module';
import { BillingModule } from './modules/billing/billing.module';
import { SeedModule } from './modules/seed/seed.module';
import { BaselinesModule } from './modules/baselines/baselines.module';
import { DrawingsModule } from './modules/drawings/drawings.module';
import { EsgModule } from './modules/esg/esg.module';
import { ExecutiveModule } from './modules/executive/executive.module';
import { FeasibilityModule } from './modules/feasibility/feasibility.module';
import { QuantitySurveyModule } from './modules/quantity-survey/quantity-survey.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { FundingModule } from './modules/funding/funding.module';
import { PredictiveModule } from './modules/predictive/predictive.module';
// Full governance lifecycle (Mr. Ayham, 2026-06-13).
import { BankabilityModule } from './modules/bankability/bankability.module';
import { SafetyModule } from './modules/safety/safety.module';
import { FireLifeSafetyModule } from './modules/fire-life-safety/fire-life-safety.module';
import { AuthorityModule } from './modules/authority/authority.module';
import { UtilityModule } from './modules/utility/utility.module';
import { OperationalReadinessModule } from './modules/operational-readiness/operational-readiness.module';
// Sigma Validation / Acceptance Program (Mr. Ayham, 2026-06-13) — the formal
// 23-test acceptance framework for declaring Sigma production-ready.
import { AcceptanceModule } from './modules/acceptance/acceptance.module';
import { BoqModule } from './modules/boq/boq.module';
import { CanonicalModule } from './modules/canonical/canonical.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { ClashesModule } from './modules/clashes/clashes.module';
import { ClaudeModule } from './modules/claude/claude.module';
import { ComparisonModule } from './modules/comparison/comparison.module';
import { DataCollectionModule } from './modules/data-collection/data-collection.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { UniversalInputModule } from './modules/universal-input/universal-input.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { RecordsModule } from './modules/records/records.module';
import { QualityModule } from './modules/quality/quality.module';
import { AuthorityMatrixModule } from './modules/authority-matrix/authority-matrix.module';
import { LegalHoldModule } from './modules/legal-hold/legal-hold.module';
import { ContractRulesModule } from './modules/contract-rules/contract-rules.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LettersModule } from './modules/letters/letters.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgChartsModule } from './modules/org-charts/org-charts.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { HierarchyModule } from './modules/hierarchy/hierarchy.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LayerAgentsModule } from './modules/layer-agents/layer-agents.module';
import { PersonasModule } from './modules/personas/personas.module';
import { PolicyAddonsModule } from './modules/policy-addons/policy-addons.module';
import { ProjectMemoryModule } from './modules/project-memory/project-memory.module';
import { RiskModule } from './modules/risk/risk.module';
import { RulesModule } from './modules/rules/rules.module';
import { SigmaGovernanceModule } from './modules/sigma-governance/sigma-governance.module';
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
    // Cron host (communication unread-alert + escalation sweep, ADR Ayham 2026-06-19).
    ScheduleModule.forRoot(),
    DatabaseModule,
    CanonicalModule,
    AuthModule,
    // Always-on platform audit (records every mutation + login). Registered
    // right after AuthModule so its global interceptor wraps every controller.
    AuditModule,
    // Multi-tenant SaaS onboarding — public company self-registration (choosing
    // the construction-entity type that configures the platform) + company-scoped
    // user management. Imported after AuthModule so AuthService is available.
    OnboardingModule,
    // Multi-tenant SaaS — platform SUPER_ADMIN console (manages all companies,
    // subscriptions, support/requests + platform analytics). Gated canManagePlatform.
    SuperAdminModule,
    BackupModule,
    // SaaS billing (Stripe) — subscription Checkout with trial + signed webhook.
    BillingModule,
    // First-boot demo seeder (SEED_DEMO=true) — default company + 15 role
    // accounts so the login user-picker works on a fresh production database.
    SeedModule,
    GovernanceModule,
    IngestionModule,
    // Universal AI Input (Mr. Ayham, 2026-06-19) — one general entry point:
    // upload/paste any project info -> Claude maps it to the Sigma layers ->
    // staged human review -> confirm -> commit to official records + audit.
    UniversalInputModule,
    // Communication governance (Mr. Ayham, 2026-06-19) — auditable project
    // communications with an authenticated open-in-Sigma evidence trail.
    CommunicationsModule,
    EvidenceModule,
    RecordsModule,
    // QA/QC Governance (Mr. Ayham acceptance #4, 2026-06-20) — NCR/ITP/Inspection
    // lifecycle with the NCR → delay/cost/claim chain.
    QualityModule,
    // Contractual Authority Matrix (Mr. Ayham acceptance #10, 2026-06-20).
    AuthorityMatrixModule,
    // Legal-grade Evidence Integrity (Mr. Ayham acceptance #6/#12) — legal holds
    // (block hard-delete of dispute-linked rows) + chain-of-custody ledger.
    LegalHoldModule,
    // Contract Rules Engine (Mr. Ayham acceptance #2) — clause-rule register +
    // FIDIC seed + procedural (preserved/weak/time-barred) evaluator.
    ContractRulesModule,
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
    // Governance OS Phase 2 — L0 Knowledge & Rules Engine + the L2/L3
    // deterministic engines retrofitted as conformant agents.
    KnowledgeModule,
    LayerAgentsModule,
    // Governance OS Phase 3 — L4 Analytics Agent (EVM/forecasting/portfolio).
    AnalyticsModule,
    // Governance OS Phase 4 — L5 Risk Agent + L6 Claims & Disputes Agent.
    RiskModule,
    ClaimsModule,
    // Governance OS Phase 5 — L8 Sigma Governance AI (consolidator + command
    // center) and L7 Executive Intelligence. SigmaGovernance before Executive
    // so the consolidation service is available to L7.
    SigmaGovernanceModule,
    ExecutiveModule,
    // Governance OS Phase 7 — L1 Data Collection Agent + the new project-record
    // families (RFI/Submittal/NCR/Change-Request/Procurement/Resource/Cost/
    // Site-Photo). Completes the L1→L8 pipeline.
    DataCollectionModule,
    // Governance OS Phase 8 — reference future agent (ESG). Its mere import is
    // the entire cost of adding a new agent: it self-registers and runs with
    // zero change to any L0–L8 module or the Agent Contract core.
    EsgModule,
    // Investment & Feasibility Intelligence (2026-06-11 follow-up): Level-1
    // rapid investment assessment + Level-2 bankability engine + concept-
    // sketch intake. Registers as the `ext.investment` extension agent —
    // the second production proof of the zero-structural-change guarantee.
    FeasibilityModule,
    // Quantity Survey Intelligence (2026-06-12): the Global Cost Classification
    // Framework (NRM/UniFormat/MasterFormat/CESMM), classified cost estimation,
    // BOQ intelligence, measurement & final account, and the QS governance
    // layer — registers the `ext.quantity_survey` agent.
    QuantitySurveyModule,
    // Procurement Intelligence (2026-06-12): planning & long-lead tracking,
    // vendor intelligence, RFQ/bid governance, delivery tracking, and the
    // cross-source supply-chain validation — registers the `ext.procurement`
    // agent. Together they extend the governance chain: Investment → Quantity
    // Survey → Procurement → Portfolio → … → Governance Intelligence.
    ProcurementModule,
    // Revenue Governance (2026-06-12 follow-up): governs what is EARNED — the
    // revenue + cash-flow lifecycle chains and their impact on NPV/IRR/Payback,
    // via the `ext.revenue_governance` agent. Completes the move from Project to
    // Investment Governance (… → Procurement → Revenue → Portfolio → …).
    RevenueModule,
    // Active-scope required architecture (2026-06-12): Opportunity Intelligence
    // (pre-feasibility screening + Market Intelligence, `ext.opportunity`),
    // Funding Governance (facilities/DSCR/covenants, `ext.funding`), and the
    // Predictive Governance layer (forecast cost/schedule/revenue/procurement/
    // funding risk, `ext.predictive`).
    OpportunityModule,
    FundingModule,
    PredictiveModule,
    // Full governance lifecycle (Mr. Ayham, 2026-06-13) — Sigma as a complete
    // Investment, Delivery & Governance OS. Six agents completing the 17-stage
    // chain: Bankability Intelligence (feasibility → lender package, ext.bankability)
    // + the five site-governance layers Safety / Fire & Life Safety / Authority /
    // Utility / Operational Readiness, each wired to schedule/cost/risk/claims and
    // traced Decision → Finding → Agent → Evidence → Source. All plug in via the
    // registry with zero edits to L0–L8.
    BankabilityModule,
    SafetyModule,
    FireLifeSafetyModule,
    AuthorityModule,
    UtilityModule,
    OperationalReadinessModule,
    // Sigma Validation / Acceptance Program (2026-06-13): the 23-test formal
    // acceptance framework + /acceptance runner that exercises every layer.
    AcceptanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request-ID first — pino-http reads x-request-id via its genReqId callback.
    // Tenant context opens the per-request company-scope store (filled by the
    // auth guard) so data services isolate each company's records.
    consumer.apply(RequestIdMiddleware, TenantContextMiddleware).forRoutes('*');
  }
}
