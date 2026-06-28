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

import { RequiresCapability } from '../../auth/require-capability.decorator';
import { ProjectRecord } from '../../canonical/entities';
import { BimModelService } from '../../clashes/bim-model.service';
import { AutodeskApsService, AutodeskImportResult, AutodeskStatus, DerivativeFormat } from './autodesk-aps.service';

interface ImportBody {
  projectKey: string;
  filename: string;
  contentBase64: string;
  bucketKey?: string;
  uploadedBy?: string | null;
  /** Model Derivative output: `svf2` (default, viewer + QS counts) or `ifc`. */
  outputFormat?: DerivativeFormat;
}

/**
 * `/integrations/autodesk` — live BIM integration via Autodesk Platform
 * Services. `status` + `viewer-token` are reads; `import` translates a model
 * and writes the extracted quantities into the same `bim-model` surface the
 * Quantity-Survey pipeline already consumes (gated on `canIngest`).
 *
 * The connector needs ONLY the client's APS client id + secret (set encrypted
 * at /admin/settings). With them blank the surface reports `enabled:false` and
 * the BIM features keep working off the local IFC parser.
 */
@Controller('integrations/autodesk')
export class AutodeskController {
  constructor(
    private readonly aps: AutodeskApsService,
    private readonly bim: BimModelService,
  ) {}

  @Get('status')
  @RequiresCapability('canRead')
  status(@Query('probe') probe?: string): Promise<AutodeskStatus> {
    return this.aps.getStatus(probe === 'true' || probe === '1');
  }

  /** 2-legged `viewables:read` token for the front-end Autodesk Viewer. */
  @Get('viewer-token')
  @RequiresCapability('canRead')
  viewerToken(): Promise<{ accessToken: string; expiresIn: number }> {
    return this.aps.getViewerToken();
  }

  @Post('import')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 10, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  async import(@Body() body: ImportBody): Promise<{ result: AutodeskImportResult; record: ProjectRecord }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    if (body.outputFormat && body.outputFormat !== 'svf2' && body.outputFormat !== 'ifc') {
      throw new BadRequestException('outputFormat must be "svf2" or "ifc"');
    }

    const result = await this.aps.importModel({
      filename: body.filename,
      buffer: Buffer.from(body.contentBase64, 'base64'),
      bucketKey: body.bucketKey,
      outputFormat: body.outputFormat,
    });

    const record = await this.bim.ingestFromCounts({
      projectKey: body.projectKey,
      sourceRef: body.filename,
      projectName: body.filename,
      counts: result.counts,
      origin: 'autodesk-aps',
      extra: { urn: result.urn, translationStatus: result.status, objectCount: result.objectCount, categories: result.categories },
      uploadedBy: body.uploadedBy ?? null,
    });

    return { result, record };
  }
}
