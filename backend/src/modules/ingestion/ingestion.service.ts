import {
  HttpException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { IngestionStatus } from '../../common/enums';
import { currentCompanyId } from '../../common/tenant/tenant-context';
import { IngestionRun, SourceFile } from '../canonical/entities';
import { ConfidenceService } from '../governance/confidence.service';
import { ValidationReport } from '../validation/validation.types';
import { ValidationService } from '../validation/validation.service';
import { NormalizerService } from './normalizer/normalizer.service';
import { ParserRegistry } from './parsers/parser.registry';
import { StorageService } from './storage/storage.service';

export interface IngestionOutcome {
  runId: string;
  sourceFileId: string;
  parser: string;
  status: IngestionStatus;
  validation: ValidationReport;
  counts: Record<string, number>;
  confidence: { completeness: number; consistency: number; sourceReliability: number; overall: number } | null;
}

/**
 * Orchestrates one ingestion: archive -> open run -> parse -> validate ->
 * normalise. The SourceFile and IngestionRun are committed first so a failed
 * run still leaves an audit record; canonical writes happen in a transaction
 * that rolls back cleanly on error.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: ParserRegistry,
    private readonly validator: ValidationService,
    private readonly normalizer: NormalizerService,
    private readonly storage: StorageService,
    private readonly confidence: ConfidenceService,
  ) {}

  async ingest(filename: string, buffer: Buffer): Promise<IngestionOutcome> {
    const parser = this.registry.resolve(filename, buffer);
    const sha256 = this.storage.sha256(buffer);
    const storedPath = await this.storage.archive(filename, buffer, sha256);

    const sourceRepo = this.dataSource.getRepository(SourceFile);
    const runRepo = this.dataSource.getRepository(IngestionRun);

    const source = await sourceRepo.save(
      sourceRepo.create({
        companyId: currentCompanyId(),
        filename,
        sourceType: parser.sourceType,
        contentSha256: sha256,
        byteSize: buffer.byteLength,
        storedPath,
      }),
    );

    const run = await runRepo.save(
      runRepo.create({
        companyId: currentCompanyId(),
        sourceFileId: source.id,
        parser: parser.name,
        status: IngestionStatus.PENDING,
        startedAt: new Date(),
        rowCounts: {},
        summary: {},
      }),
    );

    try {
      const dataset = await parser.parse(filename, buffer);
      const validation = this.validator.validate(dataset);
      run.validationPassed = validation.passed;

      if (!validation.passed) {
        run.status = IngestionStatus.FAILED;
        run.finishedAt = new Date();
        run.summary = { validation, parserMeta: dataset.meta };
        await runRepo.save(run);
        this.logger.warn(`Ingestion ${run.id} failed validation (${validation.errorCount} errors).`);
        throw new UnprocessableEntityException({
          message: 'Validation failed',
          runId: run.id,
          validation,
        });
        // (confidence is intentionally not scored for failed runs)
      }

      const { counts, confidenceScore } = await this.dataSource.transaction(async (manager) => {
        const normalized = await this.normalizer.normalize(manager, run, source, dataset);
        const score = await this.confidence.record(manager, run, dataset, validation);
        return { counts: normalized.counts, confidenceScore: score };
      });

      // Reject files that parsed/validated but yielded NOTHING — an empty or
      // mis-shaped file must not look like a successful ingestion (audit 2026-06-28).
      const totalRows = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
      if (totalRows === 0) {
        run.status = IngestionStatus.FAILED;
        run.finishedAt = new Date();
        run.rowCounts = counts;
        run.summary = { validation, parserMeta: dataset.meta, reason: 'zero-records' };
        await runRepo.save(run);
        this.logger.warn(`Ingestion ${run.id} produced zero records — rejected.`);
        throw new UnprocessableEntityException({
          message:
            'No records were extracted from this file. Make sure it follows the expected template ' +
            '(projects, activities, resources, assignments, reports) and is not empty. ' +
            'Download the sample template from the Input page and try again.',
          runId: run.id,
          counts,
          validation,
          parserMeta: dataset.meta,
        });
      }

      run.status = IngestionStatus.NORMALIZED;
      run.rowCounts = counts;
      run.finishedAt = new Date();
      run.summary = { validation, parserMeta: dataset.meta, confidence: { overall: confidenceScore.overall } };
      await runRepo.save(run);

      this.logger.log(
        `Ingestion ${run.id} normalised ${parser.name}: ${JSON.stringify(counts)}; ` +
          `confidence=${confidenceScore.overall.toFixed(3)}.`,
      );

      return {
        runId: run.id,
        sourceFileId: source.id,
        parser: parser.name,
        status: run.status,
        validation,
        counts,
        confidence: {
          completeness: confidenceScore.completeness,
          consistency: confidenceScore.consistency,
          sourceReliability: confidenceScore.sourceReliability,
          overall: confidenceScore.overall,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      run.status = IngestionStatus.FAILED;
      run.finishedAt = new Date();
      run.summary = { error: error instanceof Error ? error.message : String(error) };
      await runRepo.save(run);
      this.logger.error(`Ingestion ${run.id} failed: ${run.summary.error as string}`);
      throw error;
    }
  }
}
