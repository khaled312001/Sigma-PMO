import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

import { BadRequestException, Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import { resolveAllowedPath } from '../../../common/path-allowlist';
import { RequiresCapability } from '../../auth/require-capability.decorator';
import { IngestionOutcome, IngestionService } from '../../ingestion/ingestion.service';

interface P6WebhookPayload {
  filename: string;
  /** Either a base64-encoded XER/XML body, or a server-resolvable path. */
  contentBase64?: string;
  path?: string;
}

/**
 * Primavera P6 inbound webhook. Accepts either inline base64 bytes (Cycle 8
 * default) or a server-side path (allowlisted to the storage and samples dirs
 * — path traversal is blocked). Routes through the standard ingest pipeline.
 */
@Controller('integrations/p6')
export class P6WebhookController {
  private readonly logger = new Logger(P6WebhookController.name);
  private readonly allowedRoots: string[];

  constructor(
    private readonly ingestion: IngestionService,
    private readonly config: ConfigService,
  ) {
    this.allowedRoots = [
      resolve(process.cwd(), config.get<string>('storageDir') ?? '../data/storage'),
      resolve(process.cwd(), config.get<string>('samplesDir') ?? '../data/samples'),
    ];
  }

  @Post('webhook')
  @HttpCode(202)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  async receive(@Body() body: P6WebhookPayload): Promise<IngestionOutcome> {
    if (!body.filename) throw new BadRequestException('filename is required');
    let buffer: Buffer;
    if (body.contentBase64) {
      buffer = Buffer.from(body.contentBase64, 'base64');
    } else if (body.path) {
      const safe = resolveAllowedPath(body.path, this.allowedRoots);
      buffer = await fs.readFile(safe);
    } else {
      throw new BadRequestException('Either contentBase64 or path must be supplied');
    }
    this.logger.log(`P6 webhook received ${body.filename} (${buffer.byteLength} bytes)`);
    return this.ingestion.ingest(body.filename, buffer);
  }
}
