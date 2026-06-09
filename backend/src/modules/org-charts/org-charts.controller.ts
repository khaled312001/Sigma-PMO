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

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Letter } from '../letters/letter.entity';
import { OrgChartComplianceService } from './org-chart-compliance.service';
import { OrgChartReview } from './org-chart-review.entity';

/** Body for POST /org-charts/upload. */
interface UploadBody {
  projectKey: string;
  filename: string;
  /** Base64-encoded Excel bytes (≤ ~5MB). */
  contentBase64: string;
}

/** Max bytes accepted on a single upload (5 MB raw → ~6.7 MB base64). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Layer 3 / Governance — PMI org-chart compliance reviewer surface
 * (post-meeting plan §3.5).
 *
 * Routes:
 *  - `POST /org-charts/upload`           — review a contractor org-chart Excel
 *                                          (canIngest — same gate as ingestion)
 *  - `GET  /org-charts`                  — list reviews for a project (canRead)
 *  - `GET  /org-charts/:id`              — single review (canRead)
 *  - `POST /org-charts/:id/draft-letter` — cascade findings to a compliance
 *                                          letter (canEditPolicy)
 */
@Controller('org-charts')
export class OrgChartsController {
  constructor(private readonly compliance: OrgChartComplianceService) {}

  @Post('upload')
  @HttpCode(200)
  @RequiresCapability('canIngest')
  async upload(@Body() body: UploadBody): Promise<OrgChartReview> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');

    let buffer: Buffer;
    try {
      buffer = Buffer.from(body.contentBase64, 'base64');
    } catch {
      throw new BadRequestException('contentBase64 must be a valid base64 string');
    }
    if (buffer.length === 0) throw new BadRequestException('Decoded buffer is empty');
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(`File exceeds maximum size of ${MAX_BYTES} bytes`);
    }

    return this.compliance.ingestAndReview({
      projectKey: body.projectKey,
      filename: body.filename,
      buffer,
    });
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<OrgChartReview[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.compliance.list(projectKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  one(@Param('id') id: string): Promise<OrgChartReview> {
    return this.compliance.findOne(id);
  }

  @Post(':id/draft-letter')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  draftLetter(@Param('id') id: string): Promise<Letter> {
    return this.compliance.draftComplianceLetter(id);
  }
}
