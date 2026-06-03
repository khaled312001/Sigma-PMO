import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { asString } from '../../common/coerce';
import { SourceType } from '../../common/enums';
import { ConfidenceScore, IngestionRun } from '../canonical/entities';
import { RawDataset, RawRecord } from '../ingestion/parsers/parser.interface';
import { ValidationReport } from '../validation/validation.types';

type EntityKind = 'project' | 'activity' | 'resource' | 'report' | 'assignment';

/** Required canonical-raw fields per entity (drives the completeness score). */
const REQUIRED_FIELDS: Record<EntityKind, string[]> = {
  project: ['businessKey', 'name', 'plannedStart', 'plannedFinish', 'dataDate'],
  activity: ['businessKey', 'projectKey', 'name', 'plannedStart', 'plannedFinish', 'plannedDurationDays', 'actualPctComplete'],
  resource: ['businessKey', 'name', 'resourceType'],
  report: ['businessKey', 'projectKey', 'reportType', 'reportDate'],
  assignment: ['activityKey', 'resourceKey', 'plannedUnits'],
};

/** Source reliability weighting — system exports rank above manual entry. */
const SOURCE_RELIABILITY: Record<SourceType, number> = {
  [SourceType.P6_XML]: 1.0,
  [SourceType.P6_XER]: 0.95,
  [SourceType.MSPROJECT_XML]: 0.95,
  [SourceType.EXCEL]: 0.85,
  [SourceType.CSV]: 0.7,
};

/** Composite weights — overall = 0.4·completeness + 0.4·consistency + 0.2·source. */
const W_COMPLETE = 0.4;
const W_CONSIST = 0.4;
const W_SOURCE = 0.2;

@Injectable()
export class ConfidenceService {
  constructor(
    @InjectRepository(ConfidenceScore)
    private readonly scores: Repository<ConfidenceScore>,
  ) {}

  /** Pure: compute the score from inputs alone. Deterministic and testable. */
  compute(
    dataset: RawDataset,
    validation: ValidationReport,
  ): { completeness: number; consistency: number; sourceReliability: number; overall: number; breakdown: Record<string, unknown> } {
    const perEntity: Record<string, { rows: number; populated: number; required: number; ratio: number }> = {};
    let totalPopulated = 0;
    let totalRequired = 0;

    const buckets: [EntityKind, RawRecord[]][] = [
      ['project', dataset.projects],
      ['activity', dataset.activities],
      ['resource', dataset.resources],
      ['report', dataset.reports],
      ['assignment', dataset.assignments],
    ];

    for (const [kind, rows] of buckets) {
      const required = REQUIRED_FIELDS[kind];
      let populated = 0;
      for (const row of rows) {
        for (const field of required) {
          if (isPopulated(row[field])) populated += 1;
        }
      }
      const totalForKind = rows.length * required.length;
      const ratio = totalForKind === 0 ? 1 : populated / totalForKind;
      perEntity[kind] = { rows: rows.length, populated, required: totalForKind, ratio };
      totalPopulated += populated;
      totalRequired += totalForKind;
    }

    const completeness = totalRequired === 0 ? 1 : clamp01(totalPopulated / totalRequired);

    // Consistency: each error costs 10pp, each warning 2pp; floor at 0.
    const consistency = clamp01(1 - (validation.errorCount * 0.1 + validation.warningCount * 0.02));

    const sourceReliability = SOURCE_RELIABILITY[dataset.sourceType] ?? 0.5;

    const overall = clamp01(
      W_COMPLETE * completeness + W_CONSIST * consistency + W_SOURCE * sourceReliability,
    );

    return {
      completeness,
      consistency,
      sourceReliability,
      overall,
      breakdown: {
        perEntity,
        validation: { errors: validation.errorCount, warnings: validation.warningCount },
        weights: { completeness: W_COMPLETE, consistency: W_CONSIST, sourceReliability: W_SOURCE },
        sourceType: dataset.sourceType,
      },
    };
  }

  /** Compute + persist for a given run; idempotent on `ingestionRunId`. */
  async record(manager: EntityManager, run: IngestionRun, dataset: RawDataset, validation: ValidationReport): Promise<ConfidenceScore> {
    const score = this.compute(dataset, validation);
    const repo = manager.getRepository(ConfidenceScore);
    const existing = await repo.findOne({ where: { ingestionRunId: run.id } });
    const entity = repo.create({
      ...(existing ?? {}),
      ingestionRunId: run.id,
      ...score,
    });
    return repo.save(entity);
  }

  findByRun(ingestionRunId: string): Promise<ConfidenceScore | null> {
    return this.scores.findOne({ where: { ingestionRunId } });
  }
}

function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return asString(value) !== null;
  return true;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
