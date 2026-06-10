import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';

/**
 * AI-vs-Human output comparison (correction-plan §2.10). Standalone module —
 * deliberately AI-free: the verdict is a human governance judgement.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [ComparisonController],
  providers: [ComparisonService],
  exports: [ComparisonService],
})
export class ComparisonModule {}
