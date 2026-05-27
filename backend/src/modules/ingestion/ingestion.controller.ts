import { promises as fs } from 'node:fs';
import { basename } from 'node:path';

import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { IngestionRun } from '../canonical/entities';
import { IngestPathDto } from './dto/ingest-path.dto';
import { IngestionOutcome, IngestionService } from './ingestion.service';

@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    @InjectRepository(IngestionRun)
    private readonly runs: Repository<IngestionRun>,
  ) {}

  /** Ingest a file the server can read from disk (internal/back-office use). */
  @Post('ingest-path')
  @HttpCode(200)
  @RequiresCapability('canIngest')
  async ingestPath(@Body() body: IngestPathDto): Promise<IngestionOutcome> {
    const buffer = await fs.readFile(body.path);
    return this.ingestion.ingest(basename(body.path), buffer);
  }

  /** Browser-friendly upload: { filename, contentBase64 } JSON body. */
  @Post('upload')
  @HttpCode(200)
  @RequiresCapability('canIngest')
  async upload(@Body() body: { filename: string; contentBase64: string }): Promise<IngestionOutcome> {
    const buffer = Buffer.from(body.contentBase64, 'base64');
    return this.ingestion.ingest(body.filename, buffer);
  }

  /** Recent ingestion runs (audit trail). */
  @Get('runs')
  listRuns(@Query('limit') limit?: string): Promise<IngestionRun[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    return this.runs.find({ order: { createdAt: 'DESC' }, take });
  }
}
