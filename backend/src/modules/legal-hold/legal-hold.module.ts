import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustodyEvent } from './custody-event.entity';
import { LegalHoldController } from './legal-hold.controller';
import { LegalHold } from './legal-hold.entity';
import { LegalHoldService } from './legal-hold.service';

/**
 * LegalHoldModule — preservation holds + the document chain-of-custody ledger
 * (Mr. Ayham acceptance #6/#12). Owns its own forFeature (the two entities are
 * not part of CANONICAL_ENTITIES). Exported so RecordsModule can block deletes
 * of held rows and EvidenceModule can log custody + verify integrity.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LegalHold, CustodyEvent])],
  controllers: [LegalHoldController],
  providers: [LegalHoldService],
  exports: [LegalHoldService],
})
export class LegalHoldModule {}
