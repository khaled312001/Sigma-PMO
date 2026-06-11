import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ProjectRecord } from '../canonical/entities';
import { ProjectRecordService } from './project-record.service';
import type { IngestRecordInput } from './project-record.service';

/**
 * `/records` — the L1 Data Collection surface for the new record families.
 * Reads are `canRead`; ingesting a record requires `canIngest`.
 */
@Controller('records')
export class DataCollectionController {
  constructor(private readonly records: ProjectRecordService) {}

  @Get('types')
  @RequiresCapability('canRead')
  types(): string[] {
    return [...ProjectRecordService.TYPES];
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
}
