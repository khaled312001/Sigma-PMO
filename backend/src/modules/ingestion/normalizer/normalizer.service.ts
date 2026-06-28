import { Injectable } from '@nestjs/common';
import { EntityManager, FindOptionsWhere } from 'typeorm';

import { asDate, asFraction, asNumber, asString, toDateOnly } from '../../../common/coerce';
import { TraceableEntity } from '../../../common/entities/base.entity';
import { currentCompanyId } from '../../../common/tenant/tenant-context';
import { ReportType, ResourceType } from '../../../common/enums';
import {
  Activity,
  IngestionRun,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  SourceFile,
} from '../../canonical/entities';
import { RawDataset, RawRecord } from '../parsers/parser.interface';

export interface NormalizationResult {
  counts: Record<string, number>;
}

type TraceableCtor<T extends TraceableEntity> = new () => T;

/**
 * Turns a parsed, validated RawDataset into canonical rows using append-only
 * versioning: each business entity is inserted as a NEW row tied to this run;
 * any prior current version is retired (isCurrent=false, version incremented).
 * Nothing is ever overwritten — full history is preserved (ADR-0003).
 *
 * Foreign keys (project/activity/resource) are resolved within the run by
 * business key, producing a coherent snapshot per ingestion.
 */
@Injectable()
export class NormalizerService {
  async normalize(
    manager: EntityManager,
    run: IngestionRun,
    source: SourceFile,
    dataset: RawDataset,
  ): Promise<NormalizationResult> {
    const projectIdByKey = new Map<string, string>();
    const activityIdByKey = new Map<string, string>();
    const resourceIdByKey = new Map<string, string>();
    const counts: Record<string, number> = {
      project: 0,
      resource: 0,
      activity: 0,
      report: 0,
      assignment: 0,
    };

    // --- Projects (parents first) --------------------------------------
    for (const raw of dataset.projects) {
      const key = asString(raw.businessKey);
      if (!key) continue;
      const entity = await this.startVersion(manager, Project, key, run, source, raw);
      entity.name = asString(raw.name) ?? key;
      entity.status = asString(raw.status);
      entity.clientName = asString(raw.clientName);
      entity.currency = asString(raw.currency);
      entity.dataDate = toDateOnly(asDate(raw.dataDate));
      entity.plannedStart = toDateOnly(asDate(raw.plannedStart));
      entity.plannedFinish = toDateOnly(asDate(raw.plannedFinish));
      entity.actualStart = toDateOnly(asDate(raw.actualStart));
      entity.actualFinish = toDateOnly(asDate(raw.actualFinish));
      entity.budgetAtCompletion = decimalString(raw.budgetAtCompletion);
      const saved = await manager.save(entity);
      projectIdByKey.set(key, saved.id);
      counts.project += 1;
    }

    // --- Resources -----------------------------------------------------
    for (const raw of dataset.resources) {
      const key = asString(raw.businessKey);
      if (!key) continue;
      const entity = await this.startVersion(manager, Resource, key, run, source, raw);
      const projectKey = asString(raw.projectKey);
      entity.projectId = (await this.resolveProjectId(manager, projectKey, projectIdByKey)) ?? null;
      entity.name = asString(raw.name) ?? key;
      entity.resourceType = mapResourceType(raw.resourceType);
      entity.unitOfMeasure = asString(raw.unitOfMeasure);
      entity.maxUnitsPerDay = asNumber(raw.maxUnitsPerDay);
      entity.standardRate = decimalString(raw.standardRate);
      const saved = await manager.save(entity);
      resourceIdByKey.set(key, saved.id);
      counts.resource += 1;
    }

    // --- Activities ----------------------------------------------------
    for (const raw of dataset.activities) {
      const key = asString(raw.businessKey);
      if (!key) continue;
      const projectKey = asString(raw.projectKey);
      // Resolve the parent project from THIS dataset or, failing that, from a
      // project the same company ingested earlier (cross-dataset upload).
      const projectId = await this.resolveProjectId(manager, projectKey, projectIdByKey);
      if (!projectId) continue; // genuine orphan (no such project anywhere)
      const entity = await this.startVersion(manager, Activity, key, run, source, raw);
      entity.projectId = projectId;
      entity.wbsCode = asString(raw.wbsCode);
      entity.name = asString(raw.name) ?? key;
      entity.activityType = asString(raw.activityType);
      entity.status = asString(raw.status);
      entity.plannedStart = toDateOnly(asDate(raw.plannedStart));
      entity.plannedFinish = toDateOnly(asDate(raw.plannedFinish));
      entity.actualStart = toDateOnly(asDate(raw.actualStart));
      entity.actualFinish = toDateOnly(asDate(raw.actualFinish));
      entity.plannedDurationDays = asNumber(raw.plannedDurationDays);
      entity.remainingDurationDays = asNumber(raw.remainingDurationDays);
      entity.plannedPctComplete = asFraction(raw.plannedPctComplete);
      entity.actualPctComplete = asFraction(raw.actualPctComplete);
      entity.budgetedCost = decimalString(raw.budgetedCost);
      entity.actualCost = decimalString(raw.actualCost);
      // CPM logic network (parsed from P6 TASKPRED + total_float/driving_path).
      entity.totalFloat = asNumber(raw.totalFloat) === null ? null : Math.round(asNumber(raw.totalFloat)!);
      entity.isCritical = raw.isCritical === true;
      entity.predecessors = Array.isArray(raw.predecessors)
        ? (raw.predecessors as Array<{ activityKey: string; type: string; lagDays: number }>)
        : null;
      const saved = await manager.save(entity);
      activityIdByKey.set(key, saved.id);
      counts.activity += 1;
    }

    // --- Reports -------------------------------------------------------
    for (const raw of dataset.reports) {
      const key = asString(raw.businessKey);
      if (!key) continue;
      const projectKey = asString(raw.projectKey);
      const projectId = await this.resolveProjectId(manager, projectKey, projectIdByKey);
      if (!projectId) continue;
      const entity = await this.startVersion(manager, Report, key, run, source, raw);
      entity.projectId = projectId;
      entity.reportType = mapReportType(raw.reportType);
      entity.reportDate = toDateOnly(asDate(raw.reportDate)) ?? toDateOnly(new Date())!;
      entity.periodStart = toDateOnly(asDate(raw.periodStart));
      entity.periodEnd = toDateOnly(asDate(raw.periodEnd));
      entity.submittedBy = asString(raw.submittedBy);
      entity.reportedPctComplete = asFraction(raw.reportedPctComplete);
      entity.narrative = asString(raw.narrative);
      entity.metrics =
        raw.metrics && typeof raw.metrics === 'object'
          ? (raw.metrics as Record<string, unknown>)
          : {};
      await manager.save(entity);
      counts.report += 1;
    }

    // --- Assignments ---------------------------------------------------
    for (const raw of dataset.assignments) {
      const activityKey = asString(raw.activityKey);
      const resourceKey = asString(raw.resourceKey);
      const activityId = activityKey ? activityIdByKey.get(activityKey) : undefined;
      const resourceId = resourceKey ? resourceIdByKey.get(resourceKey) : undefined;
      if (!activityId || !resourceId) continue;
      const key = asString(raw.businessKey) ?? `${activityKey}::${resourceKey}`;
      const entity = await this.startVersion(manager, ResourceAssignment, key, run, source, raw);
      entity.activityId = activityId;
      entity.resourceId = resourceId;
      entity.plannedUnits = asNumber(raw.plannedUnits);
      entity.actualUnits = asNumber(raw.actualUnits);
      entity.plannedCost = decimalString(raw.plannedCost);
      entity.actualCost = decimalString(raw.actualCost);
      await manager.save(entity);
      counts.assignment += 1;
    }

    return { counts };
  }

  /**
   * Resolve a child row's parent project id. Checks the projects ingested in
   * THIS dataset first; if not present (the common "upload activities after the
   * project" case), falls back to the current Project row with that businessKey
   * owned by the ingesting company. Resolved ids are cached so a cross-dataset
   * lookup runs at most once per project key. Returns undefined for a genuine
   * orphan (no such project in the dataset or the company's data).
   */
  private async resolveProjectId(
    manager: EntityManager,
    projectKey: string | null | undefined,
    cache: Map<string, string>,
  ): Promise<string | undefined> {
    if (!projectKey) return undefined;
    const cached = cache.get(projectKey);
    if (cached) return cached;
    const where: FindOptionsWhere<Project> = { businessKey: projectKey, isCurrent: true };
    const cid = currentCompanyId();
    if (cid) (where as FindOptionsWhere<Project> & { companyId: string }).companyId = cid;
    const existing = await manager.getRepository(Project).findOne({ where });
    if (existing) {
      cache.set(projectKey, existing.id);
      return existing.id;
    }
    return undefined;
  }

  /**
   * Build a new current-version entity for `businessKey`, retiring any existing
   * current version. Common traceability fields are populated; the caller fills
   * the entity-specific columns and saves.
   */
  private async startVersion<T extends TraceableEntity>(
    manager: EntityManager,
    ctor: TraceableCtor<T>,
    businessKey: string,
    run: IngestionRun,
    source: SourceFile,
    raw: RawRecord,
  ): Promise<T> {
    const repo = manager.getRepository<T>(ctor);
    // Scope the prior-version lookup to the ingesting company so one tenant can
    // never retire another tenant's row that happens to share a business key.
    const priorWhere: Record<string, unknown> = { businessKey, isCurrent: true };
    const cid = currentCompanyId();
    if (cid) priorWhere.companyId = cid;
    const prior = await repo.findOne({ where: priorWhere as FindOptionsWhere<T> });

    let version = 1;
    if (prior) {
      version = prior.version + 1;
      prior.isCurrent = false;
      await repo.save(prior);
    }

    const entity = repo.create();
    entity.ingestionRunId = run.id;
    entity.sourceFileId = source.id;
    entity.businessKey = businessKey;
    entity.version = version;
    entity.isCurrent = true;
    entity.rawSource = (raw.__raw ?? raw) as Record<string, unknown>;
    // Multi-tenant: stamp the ingesting company so the data is scoped to them.
    // Inherit the prior version's company when re-ingesting outside a request.
    entity.companyId = currentCompanyId() ?? prior?.companyId ?? null;
    return entity;
  }
}

function decimalString(value: unknown): string | null {
  const num = asNumber(value);
  return num === null ? null : String(num);
}

function mapResourceType(value: unknown): ResourceType {
  switch (asString(value)?.toLowerCase()) {
    case 'material':
      return ResourceType.MATERIAL;
    case 'equipment':
      return ResourceType.EQUIPMENT;
    case 'nonlabor':
      return ResourceType.NONLABOR;
    default:
      return ResourceType.LABOR;
  }
}

function mapReportType(value: unknown): ReportType {
  switch (asString(value)?.toLowerCase()) {
    case 'daily':
      return ReportType.DAILY;
    case 'monthly':
      return ReportType.MONTHLY;
    default:
      return ReportType.WEEKLY;
  }
}
