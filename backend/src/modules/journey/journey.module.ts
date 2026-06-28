import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CanonicalModule } from '../canonical/canonical.module';
import { Letter } from '../canonical/entities';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { JourneyController } from './journey.controller';
import { JourneyService } from './journey.service';

/**
 * JourneyModule — the cross-module journey assembler (Mr. Ayham acceptance
 * 2026-06-28, "the one pipeline"). Reads canonical rows (CanonicalModule) plus
 * `Letter` and `EvidenceRoom` — both live in their own modules' feature sets,
 * not CANONICAL_ENTITIES — registered locally via `forFeature` so the journey
 * read does not pull the LettersModule / EvidenceModule graphs.
 */
@Module({
  imports: [CanonicalModule, TypeOrmModule.forFeature([Letter, EvidenceRoom])],
  controllers: [JourneyController],
  providers: [JourneyService],
  exports: [JourneyService],
})
export class JourneyModule {}
