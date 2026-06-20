import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ContractRulesController } from './contract-rules.controller';
import { ContractRulesService } from './contract-rules.service';

/**
 * ContractRulesModule — the Contract Rules Engine (Mr. Ayham acceptance #2):
 * the per-project clause-rule register, FIDIC presets, and the deterministic
 * procedural evaluators (preserved / weak / time-barred + the matter-clock
 * lifecycle). Builds on the ContractClauseRule + Claim entities (CanonicalModule).
 */
@Module({
  imports: [CanonicalModule],
  controllers: [ContractRulesController],
  providers: [ContractRulesService],
  exports: [ContractRulesService],
})
export class ContractRulesModule {}
