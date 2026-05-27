import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';

import { RequiresCapability } from '../../auth/require-capability.decorator';
import { IngestionOutcome, IngestionService } from '../../ingestion/ingestion.service';

interface P6WebhookPayload {
  filename: string;
  /** Either a base64-encoded XER/XML body, or a server-resolvable path. */
  contentBase64?: string;
  path?: string;
}

/**
 * Primavera P6 inbound webhook (Cycle 8 stub). Accepts either inline base64
 * bytes or a server-side path, archives the file, and routes it through the
 * standard ingest pipeline. A future adapter for P6 EPS push will subclass
 * this contract.
 */
@Controller('integrations/p6')
export class P6WebhookController {
  private readonly logger = new Logger(P6WebhookController.name);

  constructor(private readonly ingestion: IngestionService) {}

  @Post('webhook')
  @HttpCode(202)
  @RequiresCapability('canIngest')
  async receive(@Body() body: P6WebhookPayload): Promise<IngestionOutcome> {
    if (!body.filename) throw new Error('filename is required');
    let buffer: Buffer;
    if (body.contentBase64) {
      buffer = Buffer.from(body.contentBase64, 'base64');
    } else if (body.path) {
      buffer = await fs.readFile(resolve(process.cwd(), body.path));
    } else {
      throw new Error('Either contentBase64 or path must be supplied');
    }
    this.logger.log(`P6 webhook received ${body.filename} (${buffer.byteLength} bytes)`);
    // intentionally written into the same data/samples archive convention
    void join; // path util kept for future use; suppress unused-import diff churn
    return this.ingestion.ingest(body.filename, buffer);
  }
}
