import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ContractRulesModule } from '../contract-rules/contract-rules.module';
import { Letter } from '../canonical/entities';
import { EvidenceFile } from '../evidence/evidence-file.entity';
import { EvidenceItem } from '../evidence/evidence-item.entity';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { ClaimsAgentService } from './claims-agent.service';
import { ClaimsExtrasService } from './claims-extras.service';
import { ClaimsController } from './claims.controller';
import { DelayAnalysisService } from './delay-analysis.service';
import { EntitlementService } from './entitlement.service';
import { ForensicDelayService } from './forensic-delay.service';

/**
 * ClaimsModule — the L6 Claims & Disputes Agent (Phase 4). Deterministic delay
 * analysis + claims identification + evidence linking + entitlement/readiness/
 * package surfaces. Self-registers.
 *
 * `Letter` is registered locally via `forFeature` (it lives in LettersModule's
 * own feature set, not CANONICAL_ENTITIES) so the entitlement notice-window
 * test can read linked-letter dates without importing LettersModule. The
 * Evidence-room entities (Room/File/Item) are registered the same way so the
 * forensic evidence chain can pull source-ref'd findings without importing
 * EvidenceModule.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, ContractRulesModule, OutboxModule, TypeOrmModule.forFeature([Letter, EvidenceRoom, EvidenceFile, EvidenceItem])],
  controllers: [ClaimsController],
  providers: [DelayAnalysisService, ClaimsAgentService, EntitlementService, ClaimsExtrasService, ForensicDelayService],
  exports: [ClaimsAgentService, DelayAnalysisService, EntitlementService, ClaimsExtrasService, ForensicDelayService],
})
export class ClaimsModule {}
