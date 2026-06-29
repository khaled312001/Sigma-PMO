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
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ClashItem } from '../canonical/entities';
import {
  ClashDetail,
  ClashDetectOutcome,
  ClashIngestionOutcome,
  ClashIngestionService,
} from './clash-ingestion.service';
import { ClashPdfService } from './clash-pdf.service';

/**
 * POST body for `/clashes/upload`. Mirrors the existing
 * `IngestionController.upload` shape (base64 JSON, not multipart) so the
 * browser SDK can reuse its existing upload helper without dragging
 * `@nestjs/platform-express` `MulterModule` into another module.
 *
 * The base64 detour also dodges the multipart-streaming gotchas that bite
 * Computer Use sessions (per ADR-0011 §6 — the agent only sees JSON, never
 * file streams).
 */
interface UploadClashReportBody {
  /** Original filename — used to sniff format (`.xlsx` / `.xlsm`). */
  filename: string;
  /** Base64-encoded Excel bytes. */
  contentBase64: string;
  /** `Project.businessKey` the clashes belong to. */
  projectKey: string;
}

/** POST body for `/clashes/detect` (native geometric clash, Task 1). */
interface DetectClashBody {
  /** `Project.businessKey` the clashes belong to. */
  projectKey: string;
  /** ProjectRecord id of the first uploaded IFC bim-model. */
  modelAId: string;
  /** ProjectRecord id of the second uploaded IFC bim-model. */
  modelBId: string;
  /** Optional clearance tolerance in mm (soft-clash threshold). */
  clearanceMm?: number;
}

/**
 * Layer 1 (Engineering) clash surface — post-meeting plan §3.7,
 * ADR-0012 §5.
 *
 * Routes:
 *  - `POST /clashes/upload`   — ingest one Navisworks / Revit Excel export.
 *                                Requires `canIngest`; throttled the same
 *                                way as the generic ingestion upload (30 req/min)
 *                                because Excel parsing is CPU-bound and we
 *                                do not want one client to starve another.
 *  - `GET  /clashes?projectKey=…`
 *                              — list all clash items for one project.
 *  - `GET  /clashes/:id`       — fetch a single clash item.
 *  - `GET  /clashes/:id/pdf`   — render the full clash-detail to an A4 PDF
 *                                (Req R4 — "تقرير Clash Detail واضح" +
 *                                "إمكانية تصدير PDF"). Requires `canRead`.
 *
 * The downstream `ClashSolutionProposer` (which generates the three options
 * per clash via the `revit.clash.analyst` persona) is **not** wired here —
 * it consumes the `engineering.clash.ingested` outbox events the service
 * pushes during ingestion. That keeps this controller deterministic and
 * test-cheap.
 */
@Controller('clashes')
export class ClashesController {
  constructor(
    private readonly ingestion: ClashIngestionService,
    private readonly pdf: ClashPdfService,
  ) {}

  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  async upload(@Body() body: UploadClashReportBody): Promise<ClashIngestionOutcome> {
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const buffer = Buffer.from(body.contentBase64, 'base64');
    return this.ingestion.ingest(body.filename, buffer, body.projectKey);
  }

  /**
   * Native geometric clash detection over two uploaded IFC models (Task 1).
   * Produces real ClashItem rows from file geometry (resolved world XYZ +
   * AABB overlap), which then drive the existing propose → simulate → apply
   * chain unchanged. Requires `canIngest` (it writes canonical clash rows).
   */
  @Post('detect')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 10, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  detect(@Body() body: DetectClashBody): Promise<ClashDetectOutcome> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.modelAId) throw new BadRequestException('modelAId is required');
    if (!body?.modelBId) throw new BadRequestException('modelBId is required');
    return this.ingestion.detectFromModels({
      projectBusinessKey: body.projectKey,
      modelAId: body.modelAId,
      modelBId: body.modelBId,
      clearanceMm: body.clearanceMm,
    });
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<ClashItem[]> {
    if (!projectKey) {
      throw new BadRequestException('projectKey query parameter is required');
    }
    return this.ingestion.listByProject(projectKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<ClashDetail> {
    return this.ingestion.getDetailById(id);
  }

  /**
   * Render the full clash-detail to a downloadable A4 PDF (Req R4). Every
   * acceptance field — model A/B, GUIDs, location X/Y/Z, grid, penetration,
   * linked activity, responsible party, cost/time impact, decision audit —
   * is laid out in `ClashPdfService`. `canRead` matches `GET /clashes/:id`
   * because the PDF carries the same data, no more. We stream the buffer via
   * the raw `Response` (same pattern as `LettersController.renderPdf`).
   */
  @Get(':id/pdf')
  @RequiresCapability('canRead')
  async renderPdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const detail = await this.ingestion.getDetailById(id);
    const buffer = await this.pdf.render(detail);
    res
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="clash-${detail.clashRef}.pdf"`)
      .send(buffer);
  }
}
