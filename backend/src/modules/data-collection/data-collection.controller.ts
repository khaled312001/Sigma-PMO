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
import { ProjectRecord } from '../canonical/entities';
import { ProjectRecordService } from './project-record.service';
import type { IngestRecordInput, OcrIngestInput } from './project-record.service';

/**
 * `/records` — the L1 Data Collection surface for the polymorphic record
 * families. Reads are `canRead`; ingesting a record requires `canIngest`.
 *
 * Wave 9 (Agent D) adds the Repository-intelligence surface: OCR-document
 * upload (`POST /records/ocr`), per-record re-classification
 * (`POST /records/:id/classify`), and LIKE search (`GET /records/search`).
 */
@Controller('records')
export class DataCollectionController {
  constructor(private readonly records: ProjectRecordService) {}

  @Get('types')
  @RequiresCapability('canRead')
  types(): string[] {
    return [...ProjectRecordService.TYPES];
  }

  @Get('search')
  @RequiresCapability('canRead')
  search(
    @Query('projectKey') projectKey?: string,
    @Query('q') q?: string,
  ): Promise<ProjectRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.records.search(projectKey, q ?? '');
  }

  @Get()
  @RequiresCapability('canRead')
  list(
    @Query('projectKey') projectKey?: string,
    @Query('type') type?: string,
  ): Promise<ProjectRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.records.list(projectKey, type);
  }

  @Get('inventory')
  @RequiresCapability('canRead')
  inventory(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.records.inventory(projectKey);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canIngest')
  ingest(@Body() body: IngestRecordInput): Promise<ProjectRecord> {
    return this.records.ingest(body);
  }

  @Post('ocr')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 20, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  ocr(@Body() body: OcrIngestInput): Promise<ProjectRecord> {
    if (!body?.projectBusinessKey) throw new BadRequestException('projectBusinessKey is required');
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    return this.records.ingestOcr(body);
  }

  @Post(':id/classify')
  @HttpCode(200)
  @RequiresCapability('canIngest')
  classify(@Param('id') id: string): Promise<ProjectRecord> {
    return this.records.classify(id);
  }
}
