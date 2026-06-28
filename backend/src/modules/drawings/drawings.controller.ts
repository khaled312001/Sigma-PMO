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
import { DrawingPackage } from '../canonical/entities';
import { DrawingsService } from './drawings.service';

interface UploadDrawingsBody {
  projectKey: string;
  filename: string;
  contentBase64: string;
  uploadedBy?: string | null;
}

/**
 * `/drawings` — drawings ingestion (correction-plan §2.7). Accepts PDF sets
 * (feature-extracted) and AutoCAD .dwg/.dxf files (archived immutably; CAD
 * geometry/text extraction is deferred to the Autodesk APS connector — see
 * DrawingsService). Same base64 envelope as the other upload surfaces;
 * throttled on the ingest bucket because PDF parsing is CPU-bound.
 */
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  upload(@Body() body: UploadDrawingsBody): Promise<DrawingPackage> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    return this.drawings.ingestPdf({
      projectKey: body.projectKey,
      filename: body.filename,
      buffer: Buffer.from(body.contentBase64, 'base64'),
      uploadedBy: body.uploadedBy ?? null,
    });
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<DrawingPackage[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.drawings.list(projectKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<DrawingPackage> {
    return this.drawings.getById(id);
  }
}
