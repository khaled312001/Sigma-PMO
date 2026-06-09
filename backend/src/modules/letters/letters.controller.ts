import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequiresCapability } from '../auth/require-capability.decorator';
import {
  ComplianceLetterContext,
  LetterDrafterService,
} from './letter-drafter.service';
import { Letter } from './letter.entity';
import { LetterPdfService } from './letter-pdf.service';

/** Body for POST /letters/draft-from-incoming. */
interface DraftFromIncomingBody {
  /** `SourceFile.id` of the uploaded contractor letter. */
  letterSourceFileId: string;
  /** `Project.businessKey`. */
  projectKey: string;
}

/** Body for POST /letters/draft-compliance. */
interface DraftComplianceBody {
  projectKey: string;
  /** Trigger code, e.g. `pmi.org-chart-non-compliance`. */
  complianceTrigger: string;
  /** Free-text narrative the persona should weave into the reply. */
  narrative: string;
  /** Optional structured facts (rule findings, etc.) the persona may cite. */
  facts?: Record<string, unknown>;
}

/**
 * Layer 3 / Governance FIDIC Letter surface (post-meeting plan §3.5,
 * ADR-0011 §3).
 *
 * Routes:
 *  - `POST /letters/draft-from-incoming` — drafts a reply to an uploaded
 *                                          contractor letter. Requires
 *                                          `canEditPolicy` because drafting
 *                                          a governance artefact is a policy
 *                                          action (sigma_admin / client).
 *  - `POST /letters/draft-compliance`    — drafts a compliance letter from a
 *                                          rule trigger. Same gate as above.
 *  - `GET  /letters?projectKey=…`        — list every draft / approved / sent
 *                                          letter for one project.
 *  - `GET  /letters/:id`                 — fetch one letter.
 *  - `POST /letters/:id/approve`         — flip status `draft` → `approved`.
 *                                          Wave 2 stops at approval; sending
 *                                          stays gated until ADR-0011 flips
 *                                          on Q6 (Computer Use enablement).
 *  - `GET  /letters/:id/pdf`             — render the approved letter to PDF
 *                                          (bilingual). 400 if still a draft.
 *
 * No route flips status to `sent` — auto-send is FORBIDDEN in Wave 2.
 */
@Controller('letters')
export class LettersController {
  constructor(
    private readonly drafter: LetterDrafterService,
    private readonly pdf: LetterPdfService,
  ) {}

  @Post('draft-from-incoming')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async draftFromIncoming(@Body() body: DraftFromIncomingBody): Promise<Letter> {
    if (!body?.letterSourceFileId) {
      throw new BadRequestException('letterSourceFileId is required');
    }
    if (!body?.projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    return this.drafter.draftFromIncoming(body.letterSourceFileId, body.projectKey);
  }

  @Post('draft-compliance')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async draftCompliance(@Body() body: DraftComplianceBody): Promise<Letter> {
    if (!body?.projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!body?.complianceTrigger) {
      throw new BadRequestException('complianceTrigger is required');
    }
    if (!body?.narrative) {
      throw new BadRequestException('narrative is required');
    }
    const context: ComplianceLetterContext = {
      triggerCode: body.complianceTrigger,
      narrative: body.narrative,
      facts: body.facts,
    };
    return this.drafter.draftComplianceLetter(
      body.projectKey,
      body.complianceTrigger,
      context,
    );
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Letter[]> {
    if (!projectKey) {
      throw new BadRequestException('projectKey query parameter is required');
    }
    return this.drafter.listByProject(projectKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<Letter> {
    return this.drafter.getById(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  approve(@Param('id') id: string): Promise<Letter> {
    return this.drafter.approve(id);
  }

  /**
   * Render an **approved** letter to PDF. We deliberately refuse to render
   * a still-`draft` letter so a reviewer cannot accidentally hand the
   * contractor a PDF that was never approved. The 400 is the contract.
   */
  @Get(':id/pdf')
  @RequiresCapability('canRead')
  async renderPdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const letter = await this.drafter.getById(id);
    if (letter.status === 'draft') {
      throw new BadRequestException(
        `Letter ${id} is still a draft — approve it before requesting a PDF`,
      );
    }
    const buffer = await this.pdf.render(letter);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="letter-${id}.pdf"`)
      .send(buffer);
  }
}
