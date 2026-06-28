import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

import { CANONICAL_RAW_KEYS } from './parsers/parser.interface';

/**
 * Builds the OFFICIAL data template (audit 2026-06-28): a single multi-sheet
 * Excel workbook with one sheet per canonical entity — Projects, Activities,
 * Resources, Assignments, Reports — whose headers come straight from
 * CANONICAL_RAW_KEYS (so the template never drifts from the parser), plus a
 * README sheet documenting the chain and a couple of worked sample rows so the
 * file ingests successfully out of the box.
 */
@Injectable()
export class TemplateService {
  private readonly samples: Record<string, Record<string, string | number>[]> = {
    project: [
      { businessKey: 'P-1000', name: 'Hospital Tower — Phase 1', status: 'active', clientName: 'Ministry of Health', currency: 'SAR', dataDate: '2026-06-01', plannedStart: '2026-01-01', plannedFinish: '2027-06-30', budgetAtCompletion: 48000000 },
    ],
    activity: [
      { businessKey: 'A-1001', projectKey: 'P-1000', wbsCode: '1.1', name: 'Site mobilisation', activityType: 'Task', status: 'completed', plannedStart: '2026-01-01', plannedFinish: '2026-01-20', actualStart: '2026-01-01', actualFinish: '2026-01-22', plannedDurationDays: 20, plannedPctComplete: 100, actualPctComplete: 100, budgetedCost: 500000, actualCost: 540000 },
      { businessKey: 'A-1002', projectKey: 'P-1000', wbsCode: '1.2', name: 'Excavation', activityType: 'Task', status: 'in_progress', plannedStart: '2026-01-21', plannedFinish: '2026-03-15', plannedDurationDays: 54, plannedPctComplete: 60, actualPctComplete: 45, budgetedCost: 2200000, actualCost: 1100000 },
    ],
    resource: [
      { businessKey: 'R-100', projectKey: 'P-1000', name: 'Excavator', resourceType: 'Equipment', unitOfMeasure: 'hours', maxUnitsPerDay: 8, standardRate: 350 },
    ],
    assignment: [
      { businessKey: 'AS-1', activityKey: 'A-1002', resourceKey: 'R-100', plannedUnits: 432, actualUnits: 200, plannedCost: 151200, actualCost: 70000 },
    ],
    report: [
      { businessKey: 'RP-1', projectKey: 'P-1000', reportType: 'weekly', reportDate: '2026-06-01', periodStart: '2026-05-26', periodEnd: '2026-06-01', submittedBy: 'Site Engineer', reportedPctComplete: 38, narrative: 'Excavation behind plan by ~10 days due to rock.' },
    ],
  };

  async buildWorkbook(): Promise<Buffer> {
    const wb = new Workbook();
    wb.creator = 'Sigma PMO';
    wb.created = new Date('2026-06-28T00:00:00Z');

    const readme = wb.addWorksheet('README');
    readme.getColumn(1).width = 110;
    const lines = [
      'Sigma PMO — Official Data Template',
      '',
      'How to use:',
      '  1. Fill the sheets below. Each sheet maps to one entity. The header row names are the exact field keys the platform expects.',
      '  2. Keys link the data together: activity.projectKey = project.businessKey; assignment.activityKey = activity.businessKey;',
      '     assignment.resourceKey = resource.businessKey; resource/report.projectKey = project.businessKey.',
      '  3. Dates use ISO format YYYY-MM-DD. Numbers are plain (no thousands separators).',
      '  4. Upload this .xlsx on the Input page. Empty files (zero records) are rejected with a clear message.',
      '',
      'Required minimum: at least the Projects sheet + the Activities sheet, linked by projectKey.',
      'The sample rows already in each sheet ingest successfully — replace them with your data.',
      '',
      'Data chain after ingestion: file -> activities/records -> alerts -> decisions -> evidence -> approvals -> executive/governance dashboards.',
    ];
    lines.forEach((l) => readme.addRow([l]));
    readme.getRow(1).font = { bold: true, size: 14 };

    const sheets: [string, readonly string[], string][] = [
      ['Projects', CANONICAL_RAW_KEYS.project, 'project'],
      ['Activities', CANONICAL_RAW_KEYS.activity, 'activity'],
      ['Resources', CANONICAL_RAW_KEYS.resource, 'resource'],
      ['Assignments', CANONICAL_RAW_KEYS.assignment, 'assignment'],
      ['Reports', CANONICAL_RAW_KEYS.report, 'report'],
    ];
    for (const [title, keys, sampleKey] of sheets) {
      const ws = wb.addWorksheet(title);
      ws.addRow([...keys]);
      const header = ws.getRow(1);
      header.font = { bold: true };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
      for (const sample of this.samples[sampleKey] ?? []) {
        ws.addRow(keys.map((k) => sample[k] ?? ''));
      }
      keys.forEach((_, i) => { ws.getColumn(i + 1).width = Math.max(14, keys[i].length + 2); });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
