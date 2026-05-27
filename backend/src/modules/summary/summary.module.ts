import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { RulesModule } from '../rules/rules.module';
import { LlmService } from './llm.service';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [CanonicalModule, RulesModule],
  controllers: [SummaryController],
  providers: [SummaryService, LlmService],
  exports: [SummaryService],
})
export class SummaryModule {}
