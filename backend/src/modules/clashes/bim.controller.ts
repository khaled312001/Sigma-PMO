import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ProjectRecord } from '../canonical/entities';
import { BimModelService } from './bim-model.service';

interface UploadBimBody {
  projectKey: string;
  filename: string;
  contentBase64: string;
  uploadedBy?: string | null;
}

/**
 * `/bim` — phase-2 BIM/IFC intake + model checks. Same base64 envelope as the
 * `/drawings` and `/input` upload surfaces (JSON only, no multipart — keeps the
 * `lib/api` SDK helper + rate limits working and lines up with the Computer-Use
 * contract that the surface sees JSON, never file streams). Ingest is gated on
 * `canIngest`; reads on `canRead`.
 */
@Controller('bim')
export class BimController {
  constructor(private readonly bim: BimModelService) {}

  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 20, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  upload(@Body() body: UploadBimBody): Promise<ProjectRecord> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    return this.bim.ingestIfc({
      projectKey: body.projectKey,
      filename: body.filename,
      buffer: Buffer.from(body.contentBase64, 'base64'),
      uploadedBy: body.uploadedBy ?? null,
    });
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<ProjectRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.bim.list(projectKey);
  }
}
