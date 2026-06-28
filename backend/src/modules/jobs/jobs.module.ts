import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IngestionRun } from '../canonical/entities';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** Unified job/workflow status endpoint (read-only over execution records). */
@Module({
  imports: [TypeOrmModule.forFeature([IngestionRun])],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
