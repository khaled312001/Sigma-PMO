/**
 * Generates synthetic sample files in every supported format into
 * `data/samples/`:
 *   - p6_schedule.xer   (Primavera P6 XER, tab-delimited tables)
 *   - p6_schedule.xml   (Primavera P6 PMXML)
 *   - schedule.xlsx     (Excel workbook, one sheet per entity)
 *   - *.csv             (one CSV per entity type)
 *
 * Run:  npm run gen:samples
 */
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { Workbook } from 'exceljs';

import {
  ACTIVITIES,
  ASSIGNMENTS,
  PROJECT,
  REPORTS,
  RESOURCES,
} from './sample-data';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SAMPLES_DIR = join(REPO_ROOT, 'data', 'samples');

function xerResourceType(type: string): string {
  switch (type) {
    case 'material':
      return 'RT_Mat';
    case 'equipment':
      return 'RT_Equip';
    case 'nonlabor':
      return 'RT_Nonlabor';
    default:
      return 'RT_Labor';
  }
}

/** Build one XER table block: %T name / %F fields / %R rows. */
function xerTable(name: string, fields: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [`%T\t${name}`, `%F\t${fields.join('\t')}`];
  for (const row of rows) {
    lines.push(`%R\t${fields.map((f) => String(row[f] ?? '')).join('\t')}`);
  }
  return lines.join('\n');
}

function buildXer(): string {
  const dt = (d: string | null): string => (d ? `${d} 00:00` : '');

  const project = xerTable(
    'PROJECT',
    ['proj_id', 'proj_short_name', 'status_code', 'plan_start_date', 'scd_end_date', 'last_recalc_date'],
    [{
      proj_id: PROJECT.key,
      proj_short_name: PROJECT.name,
      status_code: PROJECT.status,
      plan_start_date: dt(PROJECT.plannedStart),
      scd_end_date: dt(PROJECT.plannedFinish),
      last_recalc_date: dt(PROJECT.dataDate),
    }],
  );

  const tasks = xerTable(
    'TASK',
    ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'status_code', 'target_start_date', 'target_end_date', 'act_start_date', 'act_end_date', 'target_drtn_hr_cnt', 'remain_drtn_hr_cnt', 'phys_complete_pct'],
    ACTIVITIES.map((a) => ({
      task_id: a.key,
      proj_id: PROJECT.key,
      task_code: a.wbs,
      task_name: a.name,
      task_type: a.type,
      status_code: a.status,
      target_start_date: dt(a.plannedStart),
      target_end_date: dt(a.plannedFinish),
      act_start_date: dt(a.actualStart),
      act_end_date: dt(a.actualFinish),
      target_drtn_hr_cnt: a.plannedDurationDays * 8,
      remain_drtn_hr_cnt: a.remainingDurationDays * 8,
      phys_complete_pct: Math.round(a.actualPctComplete * 100),
    })),
  );

  const rsrc = xerTable(
    'RSRC',
    ['rsrc_id', 'rsrc_name', 'rsrc_type', 'unit_of_meas'],
    RESOURCES.map((r) => ({
      rsrc_id: r.key,
      rsrc_name: r.name,
      rsrc_type: xerResourceType(r.type),
      unit_of_meas: r.unitOfMeasure,
    })),
  );

  const taskrsrc = xerTable(
    'TASKRSRC',
    ['taskrsrc_id', 'task_id', 'rsrc_id', 'target_qty', 'act_reg_qty', 'target_cost', 'act_reg_cost'],
    ASSIGNMENTS.map((s, i) => ({
      taskrsrc_id: `TR-${i + 1}`,
      task_id: s.activityKey,
      rsrc_id: s.resourceKey,
      target_qty: s.plannedUnits,
      act_reg_qty: s.actualUnits,
      target_cost: s.plannedCost,
      act_reg_cost: s.actualCost,
    })),
  );

  return [
    'ERMHDR\t19.12\t2026-05-15\tProject\tSIGMA\tSigma PMO\tKhaled\tUSD',
    project,
    tasks,
    rsrc,
    taskrsrc,
    '%E',
    '',
  ].join('\n');
}

function el(tag: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `      <${tag}>${text}</${tag}>\n`;
}

function buildXml(): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<APIBusinessObjects>\n';

  xml += '  <Project>\n';
  xml += el('Id', PROJECT.key);
  xml += el('Name', PROJECT.name);
  xml += el('Status', PROJECT.status);
  xml += el('Client', PROJECT.clientName);
  xml += el('Currency', PROJECT.currency);
  xml += el('PlannedStartDate', PROJECT.plannedStart);
  xml += el('FinishDate', PROJECT.plannedFinish);
  xml += el('ActualStartDate', PROJECT.actualStart);
  xml += el('DataDate', PROJECT.dataDate);
  xml += el('Budget', PROJECT.budgetAtCompletion);
  for (const a of ACTIVITIES) {
    xml += '    <Activity>\n';
    xml += el('Id', a.key);
    xml += el('WBSCode', a.wbs);
    xml += el('Name', a.name);
    xml += el('Type', a.type);
    xml += el('Status', a.status);
    xml += el('PlannedStartDate', a.plannedStart);
    xml += el('PlannedFinishDate', a.plannedFinish);
    xml += el('ActualStartDate', a.actualStart);
    xml += el('ActualFinishDate', a.actualFinish);
    xml += el('PlannedDuration', a.plannedDurationDays);
    xml += el('RemainingDuration', a.remainingDurationDays);
    xml += el('PercentComplete', Math.round(a.actualPctComplete * 100));
    xml += el('BudgetedCost', a.budgetedCost);
    xml += el('ActualCost', a.actualCost);
    xml += '    </Activity>\n';
  }
  xml += '  </Project>\n';

  for (const r of RESOURCES) {
    xml += '  <Resource>\n';
    xml += el('Id', r.key);
    xml += el('ProjectId', PROJECT.key);
    xml += el('Name', r.name);
    xml += el('Type', r.type);
    xml += el('Unit', r.unitOfMeasure);
    xml += el('MaxUnitsPerDay', r.maxUnitsPerDay);
    xml += el('StandardRate', r.standardRate);
    xml += '  </Resource>\n';
  }

  for (const s of ASSIGNMENTS) {
    xml += '  <ResourceAssignment>\n';
    xml += el('ActivityId', s.activityKey);
    xml += el('ResourceId', s.resourceKey);
    xml += el('PlannedUnits', s.plannedUnits);
    xml += el('ActualUnits', s.actualUnits);
    xml += el('PlannedCost', s.plannedCost);
    xml += el('ActualCost', s.actualCost);
    xml += '  </ResourceAssignment>\n';
  }

  xml += '</APIBusinessObjects>\n';
  return xml;
}

async function buildExcel(path: string): Promise<void> {
  const wb = new Workbook();
  wb.creator = 'Sigma PMO sample generator';

  const projects = wb.addWorksheet('Projects');
  projects.columns = [
    'businessKey', 'name', 'status', 'clientName', 'currency',
    'dataDate', 'plannedStart', 'plannedFinish', 'actualStart', 'actualFinish', 'budgetAtCompletion',
  ].map((key) => ({ header: key, key }));
  projects.addRow({
    businessKey: PROJECT.key, name: PROJECT.name, status: PROJECT.status,
    clientName: PROJECT.clientName, currency: PROJECT.currency, dataDate: PROJECT.dataDate,
    plannedStart: PROJECT.plannedStart, plannedFinish: PROJECT.plannedFinish,
    actualStart: PROJECT.actualStart, actualFinish: PROJECT.actualFinish,
    budgetAtCompletion: PROJECT.budgetAtCompletion,
  });

  const activities = wb.addWorksheet('Activities');
  activities.columns = [
    'businessKey', 'projectKey', 'wbsCode', 'name', 'activityType', 'status',
    'plannedStart', 'plannedFinish', 'actualStart', 'actualFinish',
    'plannedDurationDays', 'remainingDurationDays', 'plannedPctComplete', 'actualPctComplete',
    'budgetedCost', 'actualCost',
  ].map((key) => ({ header: key, key }));
  for (const a of ACTIVITIES) {
    activities.addRow({
      businessKey: a.key, projectKey: PROJECT.key, wbsCode: a.wbs, name: a.name,
      activityType: a.type, status: a.status, plannedStart: a.plannedStart,
      plannedFinish: a.plannedFinish, actualStart: a.actualStart, actualFinish: a.actualFinish,
      plannedDurationDays: a.plannedDurationDays, remainingDurationDays: a.remainingDurationDays,
      plannedPctComplete: a.plannedPctComplete, actualPctComplete: a.actualPctComplete,
      budgetedCost: a.budgetedCost, actualCost: a.actualCost,
    });
  }

  const resources = wb.addWorksheet('Resources');
  resources.columns = ['businessKey', 'projectKey', 'name', 'resourceType', 'unitOfMeasure', 'maxUnitsPerDay', 'standardRate']
    .map((key) => ({ header: key, key }));
  for (const r of RESOURCES) {
    resources.addRow({
      businessKey: r.key, projectKey: PROJECT.key, name: r.name, resourceType: r.type,
      unitOfMeasure: r.unitOfMeasure, maxUnitsPerDay: r.maxUnitsPerDay, standardRate: r.standardRate,
    });
  }

  const reports = wb.addWorksheet('Reports');
  reports.columns = ['businessKey', 'projectKey', 'reportType', 'reportDate', 'periodStart', 'periodEnd', 'submittedBy', 'reportedPctComplete', 'narrative']
    .map((key) => ({ header: key, key }));
  for (const r of REPORTS) {
    reports.addRow({
      businessKey: r.key, projectKey: PROJECT.key, reportType: r.reportType, reportDate: r.reportDate,
      periodStart: r.periodStart, periodEnd: r.periodEnd, submittedBy: r.submittedBy,
      reportedPctComplete: r.reportedPctComplete, narrative: r.narrative,
    });
  }

  const assignments = wb.addWorksheet('Assignments');
  assignments.columns = ['businessKey', 'activityKey', 'resourceKey', 'plannedUnits', 'actualUnits', 'plannedCost', 'actualCost']
    .map((key) => ({ header: key, key }));
  ASSIGNMENTS.forEach((s, i) => {
    assignments.addRow({
      businessKey: `TR-${i + 1}`, activityKey: s.activityKey, resourceKey: s.resourceKey,
      plannedUnits: s.plannedUnits, actualUnits: s.actualUnits, plannedCost: s.plannedCost, actualCost: s.actualCost,
    });
  });

  await wb.xlsx.writeFile(path);
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return `${lines.join('\n')}\n`;
}

async function buildCsvSet(): Promise<void> {
  await fs.writeFile(
    join(SAMPLES_DIR, 'projects.csv'),
    toCsv(
      ['businessKey', 'name', 'status', 'clientName', 'currency', 'dataDate', 'plannedStart', 'plannedFinish', 'actualStart', 'actualFinish', 'budgetAtCompletion'],
      [{
        businessKey: PROJECT.key, name: PROJECT.name, status: PROJECT.status, clientName: PROJECT.clientName,
        currency: PROJECT.currency, dataDate: PROJECT.dataDate, plannedStart: PROJECT.plannedStart,
        plannedFinish: PROJECT.plannedFinish, actualStart: PROJECT.actualStart, actualFinish: PROJECT.actualFinish,
        budgetAtCompletion: PROJECT.budgetAtCompletion,
      }],
    ),
  );

  await fs.writeFile(
    join(SAMPLES_DIR, 'activities.csv'),
    toCsv(
      ['businessKey', 'projectKey', 'wbsCode', 'name', 'activityType', 'status', 'plannedStart', 'plannedFinish', 'actualStart', 'actualFinish', 'plannedDurationDays', 'remainingDurationDays', 'plannedPctComplete', 'actualPctComplete', 'budgetedCost', 'actualCost'],
      ACTIVITIES.map((a) => ({
        businessKey: a.key,
        projectKey: PROJECT.key,
        wbsCode: a.wbs,
        name: a.name,
        activityType: a.type,
        status: a.status,
        plannedStart: a.plannedStart,
        plannedFinish: a.plannedFinish,
        actualStart: a.actualStart,
        actualFinish: a.actualFinish,
        plannedDurationDays: a.plannedDurationDays,
        remainingDurationDays: a.remainingDurationDays,
        plannedPctComplete: a.plannedPctComplete,
        actualPctComplete: a.actualPctComplete,
        budgetedCost: a.budgetedCost,
        actualCost: a.actualCost,
      })),
    ),
  );

  await fs.writeFile(
    join(SAMPLES_DIR, 'report_weekly.csv'),
    toCsv(
      ['businessKey', 'projectKey', 'reportType', 'reportDate', 'periodStart', 'periodEnd', 'submittedBy', 'reportedPctComplete', 'narrative'],
      REPORTS.map((r) => ({
        businessKey: r.key,
        projectKey: PROJECT.key,
        reportType: r.reportType,
        reportDate: r.reportDate,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        submittedBy: r.submittedBy,
        reportedPctComplete: r.reportedPctComplete,
        narrative: r.narrative,
      })),
    ),
  );
}

async function main(): Promise<void> {
  await fs.mkdir(SAMPLES_DIR, { recursive: true });
  await fs.writeFile(join(SAMPLES_DIR, 'p6_schedule.xer'), buildXer(), 'utf8');
  await fs.writeFile(join(SAMPLES_DIR, 'p6_schedule.xml'), buildXml(), 'utf8');
  await buildExcel(join(SAMPLES_DIR, 'schedule.xlsx'));
  await buildCsvSet();
  // eslint-disable-next-line no-console
  console.log(`Sample files written to ${SAMPLES_DIR}`);
}

void main();
