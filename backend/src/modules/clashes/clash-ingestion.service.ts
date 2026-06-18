import { createHash } from 'node:crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Layer, IngestionStatus, SourceType } from '../../common/enums';
import { ClashItem, IngestionRun, SourceFile } from '../canonical/entities';
import { ProjectOwnershipService } from '../canonical/project-ownership.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  ClashDataset,
  ClashExcelParser,
  ClashRow,
  composeDescription,
  deriveSeverity,
} from './parsers/clash-excel.parser';

/**
 * Outcome returned by `ingest()`. Mirrors `IngestionService.ingest()` so the
 * UI can render a clash upload the same way it renders a P6 upload —
 * `runId` + `sourceFileId` + `counts` are the shared minimum.
 */
export interface ClashIngestionOutcome {
  runId: string;
  sourceFileId: string;
  parser: string;
  status: IngestionStatus;
  counts: {
    clashesParsed: number;
    clashesPersisted: number;
    rejectedRows: number;
  };
  /** Sheet picked + header alignment + reject reasons (audit aid). */
  parserMeta: ClashDataset['meta'];
}

/**
 * `ClashIngestionService` — Layer 1 / Engineering source ingestion for
 * Navisworks / Revit Interference Check Excel exports (post-meeting plan
 * §3.7, ADR-0012 §5).
 *
 * **What it does:**
 *  1. Hashes the buffer (SHA-256) and persists a `SourceFile` row so the raw
 *     bytes are traceable forever (same provenance contract as the existing
 *     P6 / Excel ingestion — ADR-0003).
 *  2. Opens an `IngestionRun` row in `PENDING`, runs the `ClashExcelParser`,
 *     persists one `ClashItem` per parsed row, and flips the run to
 *     `NORMALIZED` (or `FAILED` if no rows survived).
 *  3. **Inside the same transaction**, pushes one `engineering.clash.ingested`
 *     event onto the cross-layer Outbox per clash row, so downstream layers
 *     (Planning impact, FIDIC EOT exposure, Reports) can react via the
 *     mechanism locked in ADR-0012 §3. Per-row events (rather than one
 *     batch event) are intentional: the post-meeting plan §3.7 names
 *     individual clashes as the unit of cross-layer reasoning, and the
 *     ClashSolutionProposer (Wave 2 sibling) consumes one event per
 *     clash.
 *
 * **What it does NOT do:**
 *  - It does not call any AI (the `ClashSolutionProposer` lives in its own
 *    module and consumes the outbox events asynchronously).
 *  - It does not write back into `Activity` or `Alert` — Layer-1 ingestion
 *    is the source of clash truth, downstream layers attach their own
 *    rows.
 *  - It does not run validation that can block a file. Rows missing a
 *    `clashRef` are skipped + counted; rows with bad disciplines fall
 *    through to `disciplinesInvolved = []`. The post-meeting plan §3.7
 *    expects ~100 clashes per medium project — we will not fail 99 good
 *    rows because one row is malformed.
 *
 * The output `Layer` of every produced clash row is **ENGINEERING** by
 * construction (ADR-0012 §5: ClashItem.layer = `ENGINEERING` constant).
 */
@Injectable()
export class ClashIngestionService {
  private readonly logger = new Logger(ClashIngestionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClashItem) private readonly clashes: Repository<ClashItem>,
    private readonly parser: ClashExcelParser,
    private readonly outbox: OutboxService,
    private readonly ownership?: ProjectOwnershipService,
  ) {}

  /**
   * Ingest one Navisworks / Revit clash report.
   *
   * @param filename             Original filename (used for SourceFile.name + parser sniff).
   * @param buffer               Raw Excel bytes (`.xlsx` / `.xlsm`).
   * @param projectBusinessKey   The `Project.businessKey` the clashes belong to.
   */
  async ingest(
    filename: string,
    buffer: Buffer,
    projectBusinessKey: string,
  ): Promise<ClashIngestionOutcome> {
    if (!projectBusinessKey) {
      throw new BadRequestException('projectBusinessKey is required');
    }
    if (!this.parser.supports(filename)) {
      throw new BadRequestException(`Unsupported clash report format: ${filename}`);
    }

    // Hash + archive the raw bytes — same provenance discipline as the
    // generic IngestionService (we do not call IngestionService directly
    // because its routing assumes the existing canonical buckets, and
    // clash data lives outside them).
    const contentSha256 = createHash('sha256').update(buffer).digest('hex');

    const sourceRepo = this.dataSource.getRepository(SourceFile);
    const runRepo = this.dataSource.getRepository(IngestionRun);

    const source = await sourceRepo.save(
      sourceRepo.create({
        filename,
        sourceType: SourceType.EXCEL,
        contentSha256,
        byteSize: buffer.byteLength,
        // No filesystem archive here (the dedicated `StorageService` is the
        // ingestion module's concern); we store an empty path and let the
        // SHA-256 act as the content address. A Wave 3 cycle can backfill
        // archival when the clash UI grows a "download original" affordance.
        storedPath: '',
      }),
    );

    const run = await runRepo.save(
      runRepo.create({
        sourceFileId: source.id,
        parser: this.parser.name,
        status: IngestionStatus.PENDING,
        startedAt: new Date(),
        rowCounts: {},
        summary: { projectBusinessKey },
      }),
    );

    let dataset: ClashDataset;
    try {
      dataset = await this.parser.parse(buffer);
    } catch (err) {
      run.status = IngestionStatus.FAILED;
      run.finishedAt = new Date();
      run.summary = {
        ...(run.summary ?? {}),
        error: err instanceof Error ? err.message : String(err),
      };
      await runRepo.save(run);
      this.logger.error(
        `Clash ingestion ${run.id} failed during parse: ${(err as Error).message}`,
      );
      throw err;
    }

    if (dataset.rows.length === 0) {
      run.status = IngestionStatus.FAILED;
      run.validationPassed = false;
      run.finishedAt = new Date();
      run.rowCounts = { clashesParsed: 0, clashesPersisted: 0, rejectedRows: dataset.meta.rejectedRows };
      run.summary = { ...(run.summary ?? {}), parserMeta: dataset.meta };
      await runRepo.save(run);
      this.logger.warn(
        `Clash ingestion ${run.id} produced 0 clash rows from ${filename} (sheet=${dataset.meta.sheetName})`,
      );
      return {
        runId: run.id,
        sourceFileId: source.id,
        parser: this.parser.name,
        status: run.status,
        counts: {
          clashesParsed: 0,
          clashesPersisted: 0,
          rejectedRows: dataset.meta.rejectedRows,
        },
        parserMeta: dataset.meta,
      };
    }

    // Persist clashes + push outbox events transactionally. Either every
    // ClashItem AND its matching outbox row commit, or none of them do.
    // This is the exact contract ADR-0012 §3 requires of producers: the
    // outbox row is in the same TypeORM transaction as the domain write.
    let persisted = 0;
    await this.dataSource.transaction(async (manager) => {
      for (const row of dataset.rows) {
        const entity = this.mapRowToEntity(
          row,
          source.id,
          projectBusinessKey,
        );
        const saved = await manager.getRepository(ClashItem).save(entity);
        persisted += 1;
        await this.pushIngestedEvent(manager, saved, projectBusinessKey, source.id, run.id);
      }
    });

    run.status = IngestionStatus.NORMALIZED;
    run.validationPassed = true;
    run.finishedAt = new Date();
    run.rowCounts = {
      clashesParsed: dataset.rows.length,
      clashesPersisted: persisted,
      rejectedRows: dataset.meta.rejectedRows,
    };
    run.summary = { ...(run.summary ?? {}), parserMeta: dataset.meta };
    await runRepo.save(run);

    this.logger.log(
      `Clash ingestion ${run.id} normalised ${persisted}/${dataset.rows.length} rows ` +
        `(rejected=${dataset.meta.rejectedRows}, sheet=${dataset.meta.sheetName}, ` +
        `project=${projectBusinessKey})`,
    );

    return {
      runId: run.id,
      sourceFileId: source.id,
      parser: this.parser.name,
      status: run.status,
      counts: {
        clashesParsed: dataset.rows.length,
        clashesPersisted: persisted,
        rejectedRows: dataset.meta.rejectedRows,
      },
      parserMeta: dataset.meta,
    };
  }

  /** Read endpoints — used by the controller. */
  listByProject(projectBusinessKey: string): Promise<ClashItem[]> {
    if (!projectBusinessKey) {
      throw new BadRequestException('projectBusinessKey is required');
    }
    return this.clashes.find({
      where: { projectBusinessKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<ClashItem> {
    const row = await this.clashes.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No clash item with id ${id}`);
    await this.ownership?.assertOwns(row.projectBusinessKey); // multi-tenant ownership
    return row;
  }

  /**
   * Convert a parsed `ClashRow` into the persisted `ClashItem`. We compute
   * `severity` + `description` here (not in the parser) because both are
   * domain decisions the parser shouldn't make on its own — same reason
   * the existing `Normalizer` lives outside the existing `ExcelParser`.
   */
  private mapRowToEntity(
    row: ClashRow,
    sourceFileId: string,
    projectBusinessKey: string,
  ): ClashItem {
    const severity = deriveSeverity(row.status, row.distanceMm);
    const description = composeDescription(row);
    return this.clashes.create({
      projectBusinessKey,
      sourceFileId,
      clashRef: row.clashRef,
      disciplinesInvolved: row.disciplinesInvolved,
      severity,
      description,
      proposedOptions: null, // populated by `ClashSolutionProposer` later
      chosenOptionIndex: null,
      decidedBy: null,
      decidedAt: null,
    });
  }

  /**
   * Push one `engineering.clash.ingested` event for the freshly persisted
   * row. Per ADR-0012 §6 the prefix MUST be `engineering.` — the
   * OutboxService will throw if we get it wrong, so the call shape is
   * validated at runtime, not just at compile time.
   *
   * The payload carries everything a downstream layer needs to react
   * without re-reading the DB: clash id + ref + severity + disciplines +
   * project + source. The full `description` is included because the
   * FIDIC layer needs it for EOT letter context (post-meeting plan §3.5),
   * and re-querying the ClashItem row in the consumer would defeat the
   * "in-process subscriber" simplicity of Stage 1.
   */
  private async pushIngestedEvent(
    manager: EntityManager,
    clash: ClashItem,
    projectBusinessKey: string,
    sourceFileId: string,
    ingestionRunId: string,
  ): Promise<void> {
    await this.outbox.push(
      Layer.ENGINEERING,
      'engineering.clash.ingested',
      {
        clashId: clash.id,
        clashRef: clash.clashRef,
        projectBusinessKey,
        sourceFileId,
        ingestionRunId,
        severity: clash.severity,
        disciplinesInvolved: clash.disciplinesInvolved,
        description: clash.description,
      },
      manager,
      { correlationId: ingestionRunId },
    );
  }
}
