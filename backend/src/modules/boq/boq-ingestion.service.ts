import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Layer, SourceType } from '../../common/enums';
import { BoQ, BoqItem, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { OutboxService } from '../outbox/outbox.service';
import { BoqExcelParser, ParsedBoqDocument } from './parsers/boq-excel.parser';

/** Outcome returned to the HTTP caller after a successful ingest. */
export interface BoqIngestionOutcome {
  /** Surrogate id of the persisted BoQ header row. */
  boqId: string;
  /** Append-only key: `boq:<projectBusinessKey>`. */
  businessKey: string;
  /** New version number — 1 on first ingest, prior.version + 1 otherwise. */
  version: number;
  /** Source file uuid the BoQ was parsed from. */
  sourceFileId: string;
  /** Persisted line count. */
  itemCount: number;
  /** Sum of line amounts as a string-typed decimal (currency precision). */
  totalAmount: string;
  /** Currency from header metadata; defaults to `'AED'`. */
  currency: string;
  /** Per-row warnings raised by the parser (e.g. amount mismatch > 1%). */
  warnings: string[];
}

/** `BoQ.businessKey` format — single source of truth for any cross-module reader. */
export const BOQ_BUSINESS_KEY_PREFIX = 'boq:';

/** Default currency when the header band carries none — matches the BoQ entity default. */
export const DEFAULT_BOQ_CURRENCY = 'AED';

/** ADR-0012 §6 reserved namespace for cross-layer notifications from BoQ ingest. */
export const BOQ_INGESTED_EVENT_TYPE = 'planning.boq.ingested';

/**
 * BoQ ingestion service — Wave 2 (post-meeting plan §3.7 + §3.1).
 *
 * Pipeline:
 *
 *  1. Archive the uploaded bytes under the immutable SHA-256 storage tree
 *     (reusing the existing `StorageService` — re-uploading the same file
 *     for the same project is idempotent at the file layer).
 *  2. Persist a `SourceFile` row tagged `EXCEL`, so the audit chain that
 *     governs every canonical record applies here too.
 *  3. Parse with `BoqExcelParser` — pure function over a buffer, no DB
 *     access, fully unit-tested.
 *  4. In a **single TypeORM transaction**, flip any prior `isCurrent` BoQ
 *     for this project to false, insert the new BoQ header at
 *     `version = prior.version + 1`, insert one `BoqItem` per parsed line,
 *     and push a `planning.boq.ingested` Outbox row carrying the new
 *     `boqId` + project key + per-line counts.
 *  5. Return a small outcome object so the HTTP caller can show a
 *     toast / link to the new version without a second query.
 *
 * Append-only semantics: the prior `isCurrent` row is **not** deleted —
 * it stays addressable forever, matching the project-wide governance
 * rule (ADR-0003) that says canonical records are never overwritten.
 *
 * The Outbox push lives **inside** the same transaction so a domain
 * crash rolls back the event too (ADR-0012 §3 contract: "transactional
 * with the domain write"). The consumer side wires its handler on its
 * own schedule — this service is producer-only.
 */
@Injectable()
export class BoqIngestionService {
  private readonly logger = new Logger(BoqIngestionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(BoqItem) private readonly items: Repository<BoqItem>,
    private readonly parser: BoqExcelParser,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Ingest one BoQ Excel buffer for a project. Returns the surrogate id and
   * version of the freshly persisted header — the caller redirects there.
   *
   * Rejects (without writing anything) when:
   *  - `projectBusinessKey` is blank,
   *  - the filename does not look like `.xlsx` / `.xlsm`,
   *  - the parser finds zero usable lines (a BoQ with no items is treated as
   *    a parse failure rather than an empty document so a stray cover-only
   *    file doesn't silently replace a real BoQ).
   */
  async ingest(
    projectBusinessKey: string,
    filename: string,
    buffer: Buffer,
  ): Promise<BoqIngestionOutcome> {
    if (!projectBusinessKey) {
      throw new BadRequestException('projectBusinessKey is required');
    }
    if (!this.parser.supports(filename)) {
      throw new BadRequestException(
        `Unsupported BoQ file: ${filename} — must be .xlsx or .xlsm`,
      );
    }
    if (!buffer || buffer.byteLength === 0) {
      throw new BadRequestException('BoQ upload buffer is empty');
    }

    // (1) archive — idempotent on identical bytes.
    const sha256 = this.storage.sha256(buffer);
    const storedPath = await this.storage.archive(filename, buffer, sha256);

    // (2) parse.
    let parsed: ParsedBoqDocument;
    try {
      parsed = await this.parser.parse(buffer);
    } catch (err) {
      throw new UnprocessableEntityException(
        `BoQ parser failed for ${filename}: ${(err as Error).message}`,
      );
    }
    if (parsed.lines.length === 0) {
      throw new UnprocessableEntityException(
        `BoQ parser found zero usable lines in ${filename} (sheet "${parsed.sheetName}").`,
      );
    }

    const businessKey = `${BOQ_BUSINESS_KEY_PREFIX}${projectBusinessKey}`;
    const currency = parsed.currency || DEFAULT_BOQ_CURRENCY;
    const totalAmount = sumAmounts(parsed.lines.map((l) => l.amount));

    // (3 + 4) atomic write — SourceFile + BoQ + BoqItems + Outbox row, one txn.
    const { boq, itemCount } = await this.dataSource.transaction(
      async (manager) => {
        const sourceRepo = manager.getRepository(SourceFile);
        const boqRepo = manager.getRepository(BoQ);
        const itemRepo = manager.getRepository(BoqItem);

        const sourceFile = await sourceRepo.save(
          sourceRepo.create({
            filename,
            sourceType: SourceType.EXCEL,
            contentSha256: sha256,
            byteSize: buffer.byteLength,
            storedPath,
          }),
        );

        // Flip the prior current row (if any) — version increments from there.
        const prior = await boqRepo.findOne({
          where: { businessKey, isCurrent: true },
        });
        let nextVersion = 1;
        if (prior) {
          nextVersion = prior.version + 1;
          prior.isCurrent = false;
          await boqRepo.save(prior);
        }

        const header = await boqRepo.save(
          boqRepo.create({
            businessKey,
            version: nextVersion,
            isCurrent: true,
            currency,
            totalAmount,
            sourceFileId: sourceFile.id,
            authoredBy: parsed.authoredBy,
          }),
        );

        const itemRows = parsed.lines.map((line) =>
          itemRepo.create({
            boqId: header.id,
            itemNumber: line.itemNumber,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            unitRate: line.unitRate,
            amount: line.amount,
            activityRef: line.activityRef,
          }),
        );
        await itemRepo.save(itemRows);

        // (5) outbox push — transactional with the write above.
        await this.outbox.push(
          Layer.PLANNING,
          BOQ_INGESTED_EVENT_TYPE,
          {
            boqId: header.id,
            projectBusinessKey,
            businessKey,
            version: nextVersion,
            itemCount: itemRows.length,
            currency,
            totalAmount,
            sourceFileId: sourceFile.id,
            warnings: parsed.warnings,
          },
          manager,
          { correlationId: header.id },
        );

        return { boq: header, itemCount: itemRows.length };
      },
    );

    this.logger.log(
      `Ingested BoQ ${businessKey} v${boq.version} from ${filename}: ${itemCount} lines, ` +
        `total ${totalAmount} ${currency}, ${parsed.warnings.length} warnings.`,
    );

    return {
      boqId: boq.id,
      businessKey,
      version: boq.version,
      sourceFileId: boq.sourceFileId,
      itemCount,
      totalAmount: totalAmount ?? '0.00',
      currency,
      warnings: parsed.warnings,
    };
  }

  /**
   * Current-version BoQ for a project, with all line items eagerly loaded.
   * Throws 404 if the project has never ingested a BoQ.
   */
  async getCurrent(
    projectBusinessKey: string,
  ): Promise<{ boq: BoQ; items: BoqItem[] }> {
    const businessKey = `${BOQ_BUSINESS_KEY_PREFIX}${projectBusinessKey}`;
    const boq = await this.boqs.findOne({
      where: { businessKey, isCurrent: true },
    });
    if (!boq) {
      throw new NotFoundException(
        `No current BoQ for project ${projectBusinessKey}`,
      );
    }
    const items = await this.items.find({
      where: { boqId: boq.id },
      order: { itemNumber: 'ASC' },
    });
    return { boq, items };
  }

  /**
   * Every BoQ ever ingested for this project, newest version first. The line
   * items are NOT included — callers that want them re-query via `boqId`.
   */
  listVersions(projectBusinessKey: string): Promise<BoQ[]> {
    const businessKey = `${BOQ_BUSINESS_KEY_PREFIX}${projectBusinessKey}`;
    return this.boqs.find({
      where: { businessKey },
      order: { version: 'DESC' },
    });
  }
}

/**
 * Sum a list of string-typed decimal amounts and return the result in the same
 * shape. We sum as numbers (Excel doubles never carry more than 15 significant
 * digits anyway) and toFixed(2) to land back on the BoQ entity's `decimal(18,2)`.
 *
 * Returns `null` when the input list is empty — matches the BoQ entity column
 * (nullable totalAmount) for the "header only" case, though `ingest()` rejects
 * empty BoQs before this path.
 */
function sumAmounts(values: string[]): string | null {
  if (values.length === 0) return null;
  const total = values.reduce((acc, raw) => acc + Number(raw), 0);
  if (!Number.isFinite(total)) return null;
  return total.toFixed(2);
}
