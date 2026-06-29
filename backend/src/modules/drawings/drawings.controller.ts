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
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AppConfiguration } from '../../config/configuration';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { DrawingPackage } from '../canonical/entities';
import { DrawingsService } from './drawings.service';
import { DrawingUploadDto } from './dto/drawing-upload.dto';
import { DrawingCapabilitiesDto } from './dto/drawing-capabilities.dto';

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
@ApiTags('drawings')
@Controller('drawings')
export class DrawingsController {
  constructor(
    private readonly drawings: DrawingsService,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  @ApiBody({ type: DrawingUploadDto })
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

  /**
   * Honest capability matrix for the CAD/BIM surface — what the DWG → IFC →
   * clash story actually is. Declared before `:id` so the static path wins.
   * `apsEnabled` reflects the Autodesk APS connector's configured credentials.
   */
  @Get('capabilities')
  @RequiresCapability('canRead')
  @ApiResponse({ status: 200, type: DrawingCapabilitiesDto, description: 'Accepted formats + how geometry/clash extraction is performed (honest about the Navisworks-export + APS dependencies).' })
  capabilities(): DrawingCapabilitiesDto {
    const autodesk = this.config.get('autodesk', { infer: true });
    return {
      accepts: ['pdf', 'dwg', 'dxf', 'ifc'],
      geometryExtraction: 'autodesk-aps',
      apsEnabled: !!autodesk?.enabled,
      clashDetection: {
        mode: 'ingest-navisworks-export',
        apsModelCoordination: 'requires-paid-acc',
      },
      notes:
        'PDFs are text-extracted locally. DWG/DXF/IFC geometry and quantities are extracted via the ' +
        'Autodesk APS Model Derivative service (DWG→IFC→element counts) when APS credentials are configured; ' +
        'otherwise CAD files are archived only. Clash detection is always sourced by ingesting a Navisworks ' +
        'clash-test export — the platform does not run the clash engine itself; live in-cloud Model ' +
        'Coordination needs a paid Autodesk Construction Cloud account.',
    };
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<DrawingPackage> {
    return this.drawings.getById(id);
  }
}
