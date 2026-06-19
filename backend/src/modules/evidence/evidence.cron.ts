import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { EvidenceRoom } from './evidence-room.entity';
import { EvidenceProcessorService } from './evidence-processor.service';

/**
 * Background driver for the Dispute Data Rooms. Every minute it advances any room
 * still in a processing state by one bounded stage-batch — so large disputes
 * (hundreds of files) process incrementally without blocking, and survive a
 * restart (resumable from the persisted file/room status). Defensive.
 */
@Injectable()
export class EvidenceCron {
  private readonly logger = new Logger(EvidenceCron.name);
  private busy = false;

  constructor(
    @InjectRepository(EvidenceRoom) private readonly rooms: Repository<EvidenceRoom>,
    private readonly processor: EvidenceProcessorService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'evidence-processing' })
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const active = await this.rooms.find({
        where: { status: In(['indexing', 'extracting', 'chunking', 'analyzing', 'timelining']) },
        order: { lastProcessedAt: 'ASC' },
        take: 20,
      });
      for (const room of active) {
        // Advance a few batches per room per tick (bounded — keeps the tick short).
        for (let i = 0; i < 6; i++) {
          const r = await this.processor.advance(room.id);
          if (!r || ['ready', 'committed', 'closed', 'failed'].includes(r.status)) break;
        }
      }
      if (active.length) this.logger.log(`evidence sweep advanced ${active.length} room(s)`);
    } catch (err) {
      this.logger.error(`evidence sweep failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
