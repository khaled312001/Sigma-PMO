import { Injectable } from '@nestjs/common';

import { SourceType } from '../../../common/enums';
import {
  emptyDataset,
  RawDataset,
  RawRecord,
  SourceParser,
} from './parser.interface';

/** Standard P6 work hours per day used to convert hour durations to days. */
const HOURS_PER_DAY = 8;

/** Map a Primavera resource type code to the canonical ResourceType value. */
function mapResourceType(code: unknown): string {
  switch (String(code ?? '').toUpperCase()) {
    case 'RT_LABOR':
      return 'labor';
    case 'RT_MAT':
      return 'material';
    case 'RT_EQUIP':
      return 'equipment';
    default:
      return 'nonlabor';
  }
}

function hoursToDays(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num / HOURS_PER_DAY : null;
}

/** Total float in whole days from a P6 hour count, or null. */
function floatDays(value: unknown): number | null {
  const days = hoursToDays(value);
  return days === null ? null : Math.round(days);
}

/** P6 boolean flag ('Y'/'1'/'true') → boolean. */
function p6Flag(value: unknown): boolean {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'Y' || s === '1' || s === 'TRUE';
}

/** Map a P6 TASKPRED pred_type code to a canonical relationship type. */
function mapPredType(code: unknown): string {
  switch (String(code ?? '').toUpperCase()) {
    case 'PR_SS':
      return 'SS';
    case 'PR_FF':
      return 'FF';
    case 'PR_SF':
      return 'SF';
    case 'PR_FS':
    default:
      return 'FS';
  }
}

/**
 * Primavera P6 XER parser. XER is a tab-delimited multi-table text format:
 *   %T <TABLE>   table start
 *   %F <fields>  field names
 *   %R <values>  one data row
 * Tables PROJECT, TASK, RSRC, TASKRSRC are mapped to the canonical-raw shape.
 */
@Injectable()
export class P6XerParser implements SourceParser {
  readonly name = 'p6_xer';
  readonly sourceType = SourceType.P6_XER;

  supports(filename: string): boolean {
    return filename.toLowerCase().endsWith('.xer');
  }

  parse(filename: string, buffer: Buffer): RawDataset {
    const dataset = emptyDataset(this.sourceType, this.name);
    const tables = this.readTables(buffer.toString('utf8'));

    for (const row of tables.PROJECT ?? []) {
      dataset.projects.push({
        businessKey: row.proj_id,
        name: row.proj_short_name ?? row.proj_id,
        status: row.status_code ?? null,
        plannedStart: row.plan_start_date ?? null,
        plannedFinish: row.scd_end_date ?? row.plan_end_date ?? null,
        dataDate: row.last_recalc_date ?? null,
        __raw: row,
      });
    }

    // Predecessor logic links (TASKPRED): one row per relationship — `task_id`
    // is the SUCCESSOR, `pred_task_id` the predecessor. Index by successor so
    // each activity carries its own predecessor list.
    const predsBySuccessor = new Map<string, Array<{ activityKey: string; type: string; lagDays: number }>>();
    for (const row of tables.TASKPRED ?? []) {
      const successor = row.task_id;
      const predecessor = row.pred_task_id;
      if (!successor || !predecessor) continue;
      const list = predsBySuccessor.get(successor) ?? [];
      list.push({
        activityKey: predecessor,
        type: mapPredType(row.pred_type),
        lagDays: floatDays(row.lag_hr_cnt) ?? 0,
      });
      predsBySuccessor.set(successor, list);
    }

    for (const row of tables.TASK ?? []) {
      const predecessors = predsBySuccessor.get(row.task_id) ?? null;
      dataset.activities.push({
        businessKey: row.task_id,
        projectKey: row.proj_id,
        wbsCode: row.task_code ?? null,
        name: row.task_name ?? null,
        activityType: row.task_type ?? null,
        status: row.status_code ?? null,
        plannedStart: row.target_start_date ?? null,
        plannedFinish: row.target_end_date ?? null,
        actualStart: row.act_start_date ?? null,
        actualFinish: row.act_end_date ?? null,
        plannedDurationDays: hoursToDays(row.target_drtn_hr_cnt),
        remainingDurationDays: hoursToDays(row.remain_drtn_hr_cnt),
        actualPctComplete: row.phys_complete_pct ?? null,
        totalFloat: floatDays(row.total_float_hr_cnt),
        isCritical: p6Flag(row.driving_path_flag),
        predecessors: predecessors && predecessors.length ? predecessors : null,
        __raw: row,
      });
    }

    for (const row of tables.RSRC ?? []) {
      dataset.resources.push({
        businessKey: row.rsrc_id,
        name: row.rsrc_name ?? row.rsrc_short_name ?? row.rsrc_id,
        resourceType: mapResourceType(row.rsrc_type),
        unitOfMeasure: row.unit_of_meas ?? null,
        __raw: row,
      });
    }

    for (const row of tables.TASKRSRC ?? []) {
      dataset.assignments.push({
        businessKey: row.taskrsrc_id,
        activityKey: row.task_id,
        resourceKey: row.rsrc_id,
        plannedUnits: row.target_qty ?? null,
        actualUnits: row.act_reg_qty ?? null,
        plannedCost: row.target_cost ?? null,
        actualCost: row.act_reg_cost ?? null,
        __raw: row,
      });
    }

    dataset.meta = {
      filename,
      tables: Object.fromEntries(
        Object.entries(tables).map(([name, rows]) => [name, rows.length]),
      ),
    };
    return dataset;
  }

  /** Read every %T table in the XER file into rows of {field: value}. */
  private readTables(text: string): Record<string, Record<string, string>[]> {
    const tables: Record<string, Record<string, string>[]> = {};
    let currentTable: string | null = null;
    let fields: string[] = [];

    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0) continue;
      const cells = line.split('\t');
      const tag = cells[0];

      if (tag === '%T') {
        currentTable = cells[1];
        fields = [];
        tables[currentTable] = [];
      } else if (tag === '%F') {
        fields = cells.slice(1);
      } else if (tag === '%R' && currentTable) {
        const values = cells.slice(1);
        const row: Record<string, string> = {};
        fields.forEach((field, i) => {
          row[field] = values[i] ?? '';
        });
        tables[currentTable].push(row);
      }
      // %E (end) and ERMHDR (header) are ignored.
    }

    return tables;
  }
}
