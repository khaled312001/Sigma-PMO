import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { SourcesModule } from '../sources/sources.module';
import { LetterDrafterService } from './letter-drafter.service';
import { LetterPdfService } from './letter-pdf.service';
import { Letter } from './letter.entity';
import { LettersController } from './letters.controller';

/**
 * Layer 3 / Governance — FIDIC LetterDrafter module (post-meeting plan §3.5,
 * ADR-0010 §6, ADR-0011 §3).
 *
 * Wave 2 surface:
 *  - `LetterDrafterService` draws on `ClaudeService` (via `ClaudeModule`)
 *    and the curated `SourceRegistry` (via `SourcesModule`) to produce
 *    bilingual draft replies to incoming contractor letters AND draft
 *    compliance letters for deterministic rule findings.
 *  - `LetterPdfService` renders an approved letter to PDF (Wave 2 stub:
 *    bundled fonts, single page; Wave 3 swaps in Tajawal subset + real
 *    text flow once asset provenance is signed off).
 *  - `LettersController` exposes the draft / list / approve / pdf surface
 *    behind the existing `canEditPolicy` (writes) + `canRead` (reads)
 *    capability gates. There is **no `send` route** — auto-send is gated
 *    behind ADR-0011 until Q6 flips.
 *
 * Owns its own `TypeOrmModule.forFeature([Letter])` because `Letter` is a
 * Wave 2 entity scoped to this module — keeping it out of the canonical
 * barrel makes the gating rule from the post-meeting plan trivial to
 * enforce by grep (the canonical barrel never sees the Letter import,
 * which means no Wave-1 surface accidentally consumes the AI artefact).
 *
 * `CanonicalModule` is imported so we can inject the `SourceFile`
 * repository (the drafter reads the incoming contractor letter bytes via
 * `SourceFile.storedPath`). We re-use the existing repository registration
 * rather than registering our own `forFeature([SourceFile])` to avoid
 * provider-duplication ambiguity.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Letter]),
    CanonicalModule,
    ClaudeModule,
    SourcesModule,
  ],
  controllers: [LettersController],
  providers: [LetterDrafterService, LetterPdfService],
  exports: [LetterDrafterService, LetterPdfService],
})
export class LettersModule {}
