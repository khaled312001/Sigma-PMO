import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsBase64,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { BoQ, BoqItem } from '../canonical/entities';
import {
  BoqIngestionOutcome,
  BoqIngestionService,
} from './boq-ingestion.service';

/**
 * Browser-friendly upload payload — same `contentBase64` shape the
 * generic ingestion module uses, so the front-end can reuse its file-picker
 * component. The `projectBusinessKey` is required: every BoQ must be bound
 * to a project, never floating.
 */
export class BoqUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[\w.\-:]+$/, {
    message:
      'projectBusinessKey must contain only word characters, dot, hyphen, colon',
  })
  projectBusinessKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[\w. \-()]+\.(xlsx|xlsm)$/i, {
    message:
      'filename must end with .xlsx or .xlsm and contain only safe characters',
  })
  filename!: string;

  /** ~34 MB of base64 corresponds to ~25 MB binary; aligns with body limit. */
  @IsString()
  @IsBase64()
  @MaxLength(35_000_000)
  contentBase64!: string;
}

/**
 * BoQ ingestion surface (post-meeting plan §3.7 + §3.1).
 *
 * Write endpoint requires `canIngest` — the same gate as schedule ingestion,
 * since BoQs are first-class evidence and join the canonical audit trail.
 * Read endpoints follow the standard `canRead` gate.
 */
@Controller('boq')
export class BoqController {
  constructor(private readonly boqIngestion: BoqIngestionService) {}

  /**
   * Ingest one BoQ Excel file. On success the new header replaces the prior
   * `isCurrent` row (the prior row stays in the table forever, append-only),
   * a `planning.boq.ingested` event lands on the Outbox in the same
   * transaction, and the caller receives the surrogate id of the new BoQ.
   */
  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngestBoQ')
  upload(@Body() body: BoqUploadDto): Promise<BoqIngestionOutcome> {
    const buffer = Buffer.from(body.contentBase64, 'base64');
    return this.boqIngestion.ingest(
      body.projectBusinessKey,
      body.filename,
      buffer,
    );
  }

  /**
   * Current-version BoQ for a project. `:projectKey` is the project's
   * `businessKey` (e.g. `P-1000`) — the BoQ key wrapper (`boq:P-1000`) is
   * an implementation detail of the service.
   */
  @Get(':projectKey/current')
  @RequiresCapability('canRead')
  current(
    @Param('projectKey') projectKey: string,
  ): Promise<{ boq: BoQ; items: BoqItem[] }> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    return this.boqIngestion.getCurrent(projectKey);
  }

  /**
   * Every BoQ version for the project, newest first. Line items are not
   * included — call `/boq/:projectKey/current` (or a future
   * `/boq/by-id/:boqId/items`) when the lines are needed.
   */
  @Get(':projectKey/versions')
  @RequiresCapability('canRead')
  versions(@Param('projectKey') projectKey: string): Promise<BoQ[]> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    return this.boqIngestion.listVersions(projectKey);
  }
}
