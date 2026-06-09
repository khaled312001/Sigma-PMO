import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ClashItem } from '../canonical/entities';
import {
  ClashIngestionOutcome,
  ClashIngestionService,
} from './clash-ingestion.service';

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
 *
 * The downstream `ClashSolutionProposer` (which generates the three options
 * per clash via the `revit.clash.analyst` persona) is **not** wired here —
 * it consumes the `engineering.clash.ingested` outbox events the service
 * pushes during ingestion. That keeps this controller deterministic and
 * test-cheap.
 */
@Controller('clashes')
export class ClashesController {
  constructor(private readonly ingestion: ClashIngestionService) {}

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
  get(@Param('id') id: string): Promise<ClashItem> {
    return this.ingestion.getById(id);
  }
}
