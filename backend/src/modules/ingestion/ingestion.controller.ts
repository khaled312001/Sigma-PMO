import { promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';

import { Body, Controller, Get, Header, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';

import { resolveAllowedPath } from '../../common/path-allowlist';
import { companyScope } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { IngestionRun } from '../canonical/entities';
import { IngestPathDto } from './dto/ingest-path.dto';
import { IngestUploadDto } from './dto/ingest-upload.dto';
import { IngestionOutcome, IngestionService } from './ingestion.service';
import { TemplateService } from './template.service';

@Controller('ingestion')
export class IngestionController {
  private readonly allowedRoots: string[];

  constructor(
    private readonly ingestion: IngestionService,
    private readonly templates: TemplateService,
    private readonly config: ConfigService,
    @InjectRepository(IngestionRun)
    private readonly runs: Repository<IngestionRun>,
  ) {
    // Resolve allowlist roots once at module init relative to backend cwd.
    this.allowedRoots = [
      resolve(process.cwd(), config.get<string>('storageDir') ?? '../data/storage'),
      resolve(process.cwd(), config.get<string>('samplesDir') ?? '../data/samples'),
    ];
  }

  /** Ingest a file the server can read from disk (internal/back-office use). */
  @Post('ingest-path')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngestSchedule')
  async ingestPath(@Body() body: IngestPathDto): Promise<IngestionOutcome> {
    const safePath = resolveAllowedPath(body.path, this.allowedRoots);
    const buffer = await fs.readFile(safePath);
    return this.ingestion.ingest(basename(safePath), buffer);
  }

  /** Browser-friendly upload: { filename, contentBase64 } JSON body. */
  @Post('upload')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngestSchedule')
  async upload(@Body() body: IngestUploadDto): Promise<IngestionOutcome> {
    const buffer = Buffer.from(body.contentBase64, 'base64');
    return this.ingestion.ingest(body.filename, buffer);
  }

  /** Official downloadable data template (xlsx, multi-sheet). Public — no data. */
  @Get('template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="sigma-pmo-data-template.xlsx"')
  async template(@Res() res: Response): Promise<void> {
    const buf = await this.templates.buildWorkbook();
    res.end(buf);
  }

  /** Recent ingestion runs (audit trail). */
  @Get('runs')
  @RequiresCapability('canRead')
  listRuns(@Query('limit') limit?: string): Promise<IngestionRun[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.runs.find({ where: { ...companyScope() }, order: { createdAt: 'DESC' }, take });
  }
}
