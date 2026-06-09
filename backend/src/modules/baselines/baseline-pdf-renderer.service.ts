import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { AppConfiguration } from '../../config/configuration';
import { Project } from '../canonical/entities';
import { TemplateActivity, TemplateDependency } from './baseline-template.service';

export interface BaselineSchedulePdfInput {
  project: Project;
  baselineName?: string | null;
  authoredBy: string;
  activities: TemplateActivity[];
  dependencies: TemplateDependency[];
  jobId: string;
}

export interface BaselineSchedulePdfResult {
  storedPath: string;
  byteSize: number;
}

/**
 * BaselinePdfRendererService - renders a senior-planner-style Primavera
 * schedule report, modelled after the reference programmes in this repo
 * (`Critical Path.pdf`, `Base Line Program 2.pdf`). The output is:
 *
 *  - A4 landscape pages with a consistent header band (project, baseline
 *    name, author, period, page number).
 *  - A table per page: Activity ID, Activity Name, Original Duration,
 *    Start, Finish, Total Float.
 *  - WBS hierarchy preserved as bold parent rows (level 1 / level 2) with
 *    indented activities under them; matches the Primavera P6 default
 *    Bar-Chart / Activity Table layout.
 *  - Critical-path rows highlighted in crimson (zero total float).
 *  - Cover page first - project metadata, totals, duration summary.
 *  - Closing page - sign-off block (Author / Project Director / Engineer /
 *    Employer's Representative).
 *
 * StandardFonts (Helvetica) - no Arabic shaping yet.
 */
@Injectable()
export class BaselinePdfRendererService {
  private readonly logger = new Logger(BaselinePdfRendererService.name);
  private readonly storageDir: string;

  // Brand palette (matches PdfRendererService).
  private readonly crimson = rgb(0.55, 0.06, 0.13);
  private readonly crimsonDeep = rgb(0.42, 0.04, 0.10);
  private readonly inkDark = rgb(0.08, 0.09, 0.12);
  private readonly inkMid = rgb(0.32, 0.34, 0.38);
  private readonly inkSoft = rgb(0.55, 0.57, 0.62);
  private readonly canvas = rgb(0.97, 0.97, 0.98);
  private readonly cardBorder = rgb(0.86, 0.87, 0.90);
  private readonly tableHeader = rgb(0.93, 0.93, 0.95);
  private readonly criticalBg = rgb(0.99, 0.93, 0.93);
  private readonly milestoneBg = rgb(0.94, 0.96, 1.0);

  constructor(config: ConfigService<AppConfiguration, true>) {
    const cfg = config.get('storageDir', { infer: true });
    this.storageDir = resolve(cfg ?? '../data/storage');
  }

  /** Render the schedule report and persist to the storage tree. */
  async render(input: BaselineSchedulePdfInput): Promise<BaselineSchedulePdfResult> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Sigma PMO Baseline Schedule - ${input.project.name}`);
    doc.setAuthor('Sigma PMO');
    doc.setSubject('Programme baseline (Primavera-style)');
    doc.setCreator('Sigma PMO Baseline Generator');
    doc.setProducer('pdf-lib');

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvObl = await doc.embedFont(StandardFonts.HelveticaOblique);

    this.drawCoverPage(doc, helv, helvBold, helvObl, input);
    this.drawSchedulePages(doc, helv, helvBold, input);
    this.drawCriticalPathPage(doc, helv, helvBold, input);
    this.drawDependenciesPage(doc, helv, helvBold, input);
    this.drawSignOffPage(doc, helv, helvBold, input);

    const bytes = await doc.save();
    const today = new Date().toISOString().slice(0, 7);
    const relativePath = join('baseline-schedules', today, `${input.jobId}.pdf`);
    const absolutePath = join(this.storageDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    this.logger.log(
      `Rendered baseline PDF ${input.jobId} → ${relativePath} (${bytes.byteLength} bytes, ${input.activities.length} activities)`,
    );
    return { storedPath: relativePath, byteSize: bytes.byteLength };
  }

  resolveAbsolutePath(relativePath: string): string {
    return resolve(this.storageDir, relativePath);
  }

  // ─────────────────────── pages ───────────────────────

  private drawCoverPage(
    doc: PDFDocument,
    helv: PDFFont,
    helvBold: PDFFont,
    helvObl: PDFFont,
    input: BaselineSchedulePdfInput,
  ): void {
    // A4 portrait for the cover.
    const page = doc.addPage([595, 842]);
    const { width, height } = page.getSize();

    page.drawRectangle({ x: 0, y: height - 130, width, height: 130, color: this.crimson });
    page.drawRectangle({ x: 0, y: height - 130, width: 12, height: 130, color: this.crimsonDeep });
    page.drawText('SIGMA PMO', { x: 40, y: height - 45, font: helvBold, size: 12, color: rgb(1, 1, 1) });
    page.drawText('Programme Baseline - AI-Authored', {
      x: 40, y: height - 60, font: helvObl, size: 9, color: rgb(0.95, 0.90, 0.92),
    });
    page.drawText('PROJECT BASELINE PROGRAMME', {
      x: 40, y: height - 95, font: helvBold, size: 20, color: rgb(1, 1, 1),
    });
    page.drawText(this.safeAscii(input.project.name), {
      x: 40, y: height - 118, font: helv, size: 12, color: rgb(0.97, 0.93, 0.94),
    });

    // Identity block.
    let y = height - 175;
    const rows: Array<[string, string]> = [
      ['Project name', this.safeAscii(input.project.name)],
      ['Project key', input.project.businessKey],
      ['Baseline name', this.safeAscii(input.baselineName ?? 'Original-Baseline-01')],
      ['Authored by (planner persona)', this.safeAscii(input.authoredBy)],
      ['Project commencement', input.project.plannedStart ?? '-'],
      ['Project completion', input.project.plannedFinish ?? '-'],
      ['Data date', input.project.dataDate ?? '-'],
    ];
    for (const [label, value] of rows) {
      page.drawText(label.toUpperCase(), { x: 40, y, font: helvBold, size: 8, color: this.inkSoft });
      page.drawText(value, { x: 200, y, font: helv, size: 11, color: this.inkDark });
      y -= 20;
    }

    // KPI strip.
    y -= 8;
    page.drawRectangle({ x: 40, y, width: 4, height: 18, color: this.crimson });
    page.drawText('PROGRAMME METRICS', { x: 52, y: y + 4, font: helvBold, size: 12, color: this.inkDark });
    y -= 28;

    const totalDur =
      input.project.plannedStart && input.project.plannedFinish
        ? this.daysBetween(input.project.plannedStart, input.project.plannedFinish) + 1
        : null;
    const milestones = input.activities.filter((a) => a.isMilestone).length;
    const critical = input.activities.filter((a) => a.isCritical && !a.isMilestone).length;
    const tasks = input.activities.filter((a) => !a.isMilestone).length;

    const cards: Array<{ label: string; value: string; accent: ReturnType<typeof rgb> }> = [
      { label: 'Total activities', value: String(input.activities.length), accent: this.crimson },
      { label: 'Tasks', value: String(tasks), accent: this.crimson },
      { label: 'Milestones', value: String(milestones), accent: rgb(0.10, 0.50, 0.32) },
      { label: 'Critical activities', value: String(critical), accent: rgb(0.78, 0.13, 0.13) },
      { label: 'Dependencies', value: String(input.dependencies.length), accent: this.crimson },
      { label: 'Duration (days)', value: totalDur !== null ? String(totalDur) : 'n/a', accent: this.crimson },
    ];
    this.drawKpiGrid(page, helv, helvBold, cards, y);
    y -= 140;

    // Methodology block.
    page.drawRectangle({ x: 40, y: y - 110, width: width - 80, height: 110, color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6 });
    page.drawRectangle({ x: 40, y: y - 110, width: 4, height: 110, color: this.crimson });
    page.drawText('METHODOLOGY', { x: 56, y: y - 22, font: helvBold, size: 10, color: this.crimson });
    const methodology = [
      'This baseline programme has been generated by the Sigma PMO Author Path (ADR-0017) using a',
      'deterministic construction-engineering template. The Work-Breakdown Structure mirrors a typical',
      'UAE building project (Milestones, Building Permit, Contract Deliverables, Engineering Works,',
      'Substructure, Superstructure, MEP First/Second Fix, Internal/External Finishing, External Works,',
      'Testing & Commissioning, Hand-over) - derived from FIDIC Sub-Clause 8.3 (Programme) and the',
      'reference baseline programmes lodged in the Sigma PMO archive. Critical path is computed via a',
      'standard forward-pass + backward-pass at the activity level; relationships are Finish-to-Start',
      'unless stated otherwise. Output is a valid Primavera P6 XER (importable into P6 Professional).',
    ];
    let my = y - 40;
    for (const ml of methodology) {
      page.drawText(this.safeAscii(ml), { x: 56, y: my, font: helv, size: 8.5, color: this.inkMid });
      my -= 11;
    }

    this.drawFooter(page, helv, helvBold, input, 1);
  }

  private drawSchedulePages(
    doc: PDFDocument,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
  ): void {
    // Group activities by parent WBS so we can print bold WBS headers.
    const grouped = groupByWbs(input.activities);
    // A4 landscape: 842 × 595.
    const pageWidth = 842;
    const pageHeight = 595;
    const colX = {
      id: 40,
      name: 130,
      dur: 510,
      start: 565,
      finish: 645,
      float: 725,
      critical: 790,
    };

    let page = doc.addPage([pageWidth, pageHeight]);
    let pageNumber = 2;
    let y = this.drawScheduleHeader(page, helv, helvBold, input, pageNumber, colX);

    for (const group of grouped) {
      // WBS header row.
      if (y < 80) {
        this.drawFooter(page, helv, helvBold, input, pageNumber);
        page = doc.addPage([pageWidth, pageHeight]);
        pageNumber += 1;
        y = this.drawScheduleHeader(page, helv, helvBold, input, pageNumber, colX);
      }
      this.drawWbsRow(page, helvBold, group.wbsCode, group.wbsName, y, pageWidth);
      y -= 18;

      for (const a of group.activities) {
        if (y < 65) {
          this.drawFooter(page, helv, helvBold, input, pageNumber);
          page = doc.addPage([pageWidth, pageHeight]);
          pageNumber += 1;
          y = this.drawScheduleHeader(page, helv, helvBold, input, pageNumber, colX);
        }
        this.drawActivityRow(page, helv, helvBold, a, y, colX, pageWidth);
        y -= 15;
      }
      y -= 4; // small gap between WBS groups
    }
    this.drawFooter(page, helv, helvBold, input, pageNumber);
  }

  private drawScheduleHeader(
    page: PDFPage,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
    pageNumber: number,
    colX: Record<string, number>,
  ): number {
    const { width } = page.getSize();
    // Top band.
    page.drawRectangle({ x: 0, y: 595 - 52, width, height: 52, color: this.crimson });
    page.drawText('SIGMA PMO - PROGRAMME BASELINE', {
      x: 40, y: 595 - 22, font: helvBold, size: 11, color: rgb(1, 1, 1),
    });
    page.drawText(this.safeAscii(input.project.name), {
      x: 40, y: 595 - 40, font: helv, size: 9, color: rgb(0.97, 0.93, 0.94),
    });
    const right = `${input.project.plannedStart ?? ''}  ->  ${input.project.plannedFinish ?? ''}`;
    page.drawText(right, {
      x: width - 40 - helv.widthOfTextAtSize(right, 9),
      y: 595 - 30, font: helv, size: 9, color: rgb(0.97, 0.93, 0.94),
    });

    // Column header row.
    let y = 595 - 70;
    page.drawRectangle({ x: 40, y: y - 6, width: width - 80, height: 18, color: this.tableHeader });
    page.drawText('ACTIVITY ID', { x: colX.id, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('ACTIVITY NAME', { x: colX.name, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('DUR', { x: colX.dur, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('START', { x: colX.start, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('FINISH', { x: colX.finish, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('FLOAT', { x: colX.float, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('CRIT', { x: colX.critical, y, font: helvBold, size: 8, color: this.inkDark });
    return y - 18;
  }

  private drawWbsRow(
    page: PDFPage,
    helvBold: PDFFont,
    wbsCode: string,
    wbsName: string,
    y: number,
    pageWidth: number,
  ): void {
    page.drawRectangle({
      x: 40, y: y - 4, width: pageWidth - 80, height: 16, color: rgb(0.88, 0.89, 0.92),
    });
    page.drawText(this.safeAscii(wbsCode), { x: 48, y, font: helvBold, size: 9, color: this.crimson });
    page.drawText(this.safeAscii(wbsName), { x: 130, y, font: helvBold, size: 9.5, color: this.inkDark });
  }

  private drawActivityRow(
    page: PDFPage,
    helv: PDFFont,
    helvBold: PDFFont,
    a: TemplateActivity,
    y: number,
    colX: Record<string, number>,
    pageWidth: number,
  ): void {
    // Highlight row if critical (float = 0 and not a milestone) or if it's a milestone.
    if (a.isMilestone) {
      page.drawRectangle({ x: 40, y: y - 3, width: pageWidth - 80, height: 14, color: this.milestoneBg });
    } else if (a.isCritical) {
      page.drawRectangle({ x: 40, y: y - 3, width: pageWidth - 80, height: 14, color: this.criticalBg });
    }

    const idColor = a.isCritical ? this.crimson : this.inkDark;
    const nameColor = a.isMilestone ? this.crimson : this.inkDark;
    const dur = a.isMilestone ? '0' : String(a.plannedDurationDays);

    page.drawText(this.safeAscii(a.businessKey), { x: colX.id, y, font: a.isMilestone ? helvBold : helv, size: 8.5, color: idColor });
    // Activity name - indent under WBS.
    page.drawText(this.safeAscii(a.name).slice(0, 80), {
      x: colX.name + (a.isMilestone ? 0 : 8), y, font: a.isMilestone ? helvBold : helv, size: 8.5, color: nameColor,
    });
    page.drawText(dur, { x: colX.dur, y, font: helv, size: 8.5, color: this.inkDark });
    page.drawText(this.formatDate(a.plannedStart), { x: colX.start, y, font: helv, size: 8.5, color: this.inkDark });
    page.drawText(this.formatDate(a.plannedFinish), { x: colX.finish, y, font: helv, size: 8.5, color: this.inkDark });
    page.drawText(String(a.totalFloatDays), {
      x: colX.float, y, font: a.isCritical ? helvBold : helv, size: 8.5, color: a.isCritical ? this.crimson : this.inkDark,
    });
    if (a.isCritical) {
      page.drawText('CP', { x: colX.critical, y, font: helvBold, size: 8.5, color: this.crimson });
    } else if (a.isMilestone) {
      page.drawText('MS', { x: colX.critical, y, font: helvBold, size: 8.5, color: rgb(0.10, 0.50, 0.32) });
    }
    // Bottom border on the row.
    page.drawRectangle({ x: 40, y: y - 4, width: pageWidth - 80, height: 0.3, color: this.cardBorder });
  }

  private drawCriticalPathPage(
    doc: PDFDocument,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
  ): void {
    const page = doc.addPage([842, 595]);
    let y = this.drawScheduleHeader(page, helv, helvBold, input, 100, { id: 40, name: 130, dur: 510, start: 565, finish: 645, float: 725, critical: 790 });

    // Override the table header with a clearer "Critical Path Activities" eyebrow.
    page.drawRectangle({ x: 0, y: 595 - 52, width: 842, height: 52, color: this.crimsonDeep });
    page.drawText('CRITICAL PATH ACTIVITIES', { x: 40, y: 595 - 22, font: helvBold, size: 12, color: rgb(1, 1, 1) });
    page.drawText('Activities with zero total float - any slip drives the project completion date',
      { x: 40, y: 595 - 40, font: helv, size: 9, color: rgb(0.97, 0.93, 0.94) });

    const critical = input.activities.filter((a) => a.isCritical && !a.isMilestone);
    const colX = { id: 40, name: 130, dur: 510, start: 565, finish: 645, float: 725, critical: 790 };

    // Header row.
    let hy = 595 - 76;
    page.drawRectangle({ x: 40, y: hy - 6, width: 842 - 80, height: 18, color: this.tableHeader });
    page.drawText('ACTIVITY ID', { x: colX.id, y: hy, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('ACTIVITY NAME', { x: colX.name, y: hy, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('DUR', { x: colX.dur, y: hy, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('START', { x: colX.start, y: hy, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('FINISH', { x: colX.finish, y: hy, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('FLOAT', { x: colX.float, y: hy, font: helvBold, size: 8, color: this.inkDark });
    y = hy - 18;

    for (const a of critical) {
      if (y < 60) break;
      this.drawActivityRow(page, helv, helvBold, a, y, colX, 842);
      y -= 15;
    }
    this.drawFooter(page, helv, helvBold, input, 99);
  }

  private drawDependenciesPage(
    doc: PDFDocument,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
  ): void {
    if (input.dependencies.length === 0) return;
    const page = doc.addPage([842, 595]);
    page.drawRectangle({ x: 0, y: 595 - 52, width: 842, height: 52, color: this.crimson });
    page.drawText('ACTIVITY RELATIONSHIPS', { x: 40, y: 595 - 22, font: helvBold, size: 12, color: rgb(1, 1, 1) });
    page.drawText(`${input.dependencies.length} Finish-to-Start dependencies - both intra-phase serial and inter-phase hand-offs.`,
      { x: 40, y: 595 - 40, font: helv, size: 9, color: rgb(0.97, 0.93, 0.94) });

    let y = 595 - 76;
    const colA = { pred: 40, succ: 280, type: 540, lag: 620 };
    page.drawRectangle({ x: 40, y: y - 6, width: 842 - 80, height: 18, color: this.tableHeader });
    page.drawText('PREDECESSOR', { x: colA.pred, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('SUCCESSOR', { x: colA.succ, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('TYPE', { x: colA.type, y, font: helvBold, size: 8, color: this.inkDark });
    page.drawText('LAG', { x: colA.lag, y, font: helvBold, size: 8, color: this.inkDark });
    y -= 16;

    const byKey = new Map<string, TemplateActivity>();
    for (const a of input.activities) byKey.set(a.businessKey, a);

    for (const d of input.dependencies) {
      if (y < 60) break;
      const pred = byKey.get(d.predecessorBusinessKey);
      const succ = byKey.get(d.successorBusinessKey);
      page.drawText(
        `${d.predecessorBusinessKey} | ${this.safeAscii(pred?.name ?? '').slice(0, 26)}`,
        { x: colA.pred, y, font: helv, size: 8.5, color: this.inkDark },
      );
      page.drawText(
        `${d.successorBusinessKey} | ${this.safeAscii(succ?.name ?? '').slice(0, 26)}`,
        { x: colA.succ, y, font: helv, size: 8.5, color: this.inkDark },
      );
      page.drawText(d.type, { x: colA.type, y, font: helvBold, size: 8.5, color: this.crimson });
      page.drawText('0d', { x: colA.lag, y, font: helv, size: 8.5, color: this.inkMid });
      page.drawRectangle({ x: 40, y: y - 4, width: 842 - 80, height: 0.3, color: this.cardBorder });
      y -= 14;
    }
    this.drawFooter(page, helv, helvBold, input, 100);
  }

  private drawSignOffPage(
    doc: PDFDocument,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
  ): void {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 842 - 90, width: 595, height: 90, color: this.crimson });
    page.drawText('PROGRAMME APPROVAL & SIGN-OFF', { x: 40, y: 842 - 50, font: helvBold, size: 16, color: rgb(1, 1, 1) });
    page.drawText("FIDIC Sub-Clause 8.3 - Programme submitted for the Engineer's consent.", {
      x: 40, y: 842 - 75, font: helv, size: 10, color: rgb(0.97, 0.93, 0.94),
    });

    let y = 842 - 130;
    const roles = [
      { role: 'Prepared by (AI Planner)', name: this.safeAscii(input.authoredBy), date: new Date().toISOString().slice(0, 10) },
      { role: 'Reviewed by (Project Director)', name: '_______________________', date: '_______________' },
      { role: 'Submitted by (Contractor)', name: '_______________________', date: '_______________' },
      { role: 'Consented by (Engineer)', name: '_______________________', date: '_______________' },
      { role: "Accepted by (Employer's Representative)", name: '_______________________', date: '_______________' },
    ];
    for (const b of roles) {
      page.drawRectangle({ x: 40, y: y - 90, width: 515, height: 90, color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6 });
      page.drawRectangle({ x: 40, y: y - 90, width: 4, height: 90, color: this.crimson });
      page.drawText(b.role.toUpperCase(), { x: 56, y: y - 20, font: helvBold, size: 10, color: this.crimson });
      page.drawText('Name:', { x: 56, y: y - 45, font: helvBold, size: 9, color: this.inkMid });
      page.drawText(b.name, { x: 110, y: y - 45, font: helv, size: 10, color: this.inkDark });
      page.drawText('Signature:', { x: 56, y: y - 65, font: helvBold, size: 9, color: this.inkMid });
      page.drawRectangle({ x: 110, y: y - 67, width: 200, height: 0.6, color: this.inkSoft });
      page.drawText('Date:', { x: 350, y: y - 65, font: helvBold, size: 9, color: this.inkMid });
      page.drawText(b.date, { x: 390, y: y - 65, font: helv, size: 10, color: this.inkDark });
      y -= 104;
    }

    page.drawRectangle({ x: 40, y: 60, width: 515, height: 28, color: this.crimson });
    page.drawText('DRAFT - pending human approval (post-meeting plan Sec 3.6).', {
      x: 56, y: 72, font: helvBold, size: 10, color: rgb(1, 1, 1),
    });
  }

  // ─────────────────────── helpers ───────────────────────

  private drawFooter(
    page: PDFPage,
    helv: PDFFont,
    helvBold: PDFFont,
    input: BaselineSchedulePdfInput,
    pageNumber: number,
  ): void {
    const { width } = page.getSize();
    page.drawRectangle({ x: 40, y: 30, width: width - 80, height: 0.6, color: this.cardBorder });
    page.drawText('Sigma PMO', { x: 40, y: 16, font: helvBold, size: 8, color: this.crimson });
    const mid = `${input.project.businessKey} - Baseline: ${this.safeAscii(input.baselineName ?? 'Original-Baseline-01')}`;
    page.drawText(mid, {
      x: width / 2 - helv.widthOfTextAtSize(mid, 8) / 2,
      y: 16, font: helv, size: 8, color: this.inkMid,
    });
    const lbl = `Page ${pageNumber}`;
    page.drawText(lbl, {
      x: width - 40 - helv.widthOfTextAtSize(lbl, 8),
      y: 16, font: helv, size: 8, color: this.inkSoft,
    });
  }

  private drawKpiGrid(
    page: PDFPage,
    helv: PDFFont,
    helvBold: PDFFont,
    cards: Array<{ label: string; value: string; accent: ReturnType<typeof rgb> }>,
    topY: number,
  ): void {
    const cardW = 162;
    const cardH = 58;
    const gap = 8;
    for (let i = 0; i < cards.length; i += 1) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 40 + col * (cardW + gap);
      const y = topY - row * (cardH + gap);
      page.drawRectangle({
        x, y: y - cardH, width: cardW, height: cardH,
        color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
      });
      page.drawRectangle({ x, y: y - cardH, width: 3, height: cardH, color: cards[i].accent });
      page.drawText(cards[i].label.toUpperCase(), {
        x: x + 10, y: y - 16, font: helvBold, size: 7, color: this.inkSoft,
      });
      page.drawText(this.safeAscii(cards[i].value), {
        x: x + 10, y: y - cardH + 12, font: helvBold, size: 16, color: this.inkDark,
      });
    }
  }

  /**
   * Reduce text to characters WinAnsi-encoded Helvetica can render.
   *
   * pdf-lib's StandardFonts.Helvetica uses the WinAnsi codepage, which
   * accepts Latin-1 (0x00-0xFF) but REJECTS many common typographic
   * characters above the Latin-1 boundary: em-dash, en-dash, curly
   * quotes, right-arrow, middle-dot, etc. Even though these characters
   * fit in a single byte conceptually, the encoder throws when it can't
   * map them to a glyph slot.
   *
   * We map the most common offenders to ASCII equivalents and replace
   * the rest with '?'. This keeps the renderer crash-proof while
   * preserving readability.
   */
  private safeAscii(text: string): string {
    if (!text) return '';
    // Fast path of common Unicode substitutions before the per-char loop.
    const normalised = text
      .replace(/[—―]/g, '-')   // em-dash, horizontal-bar -> -
      .replace(/–/g, '-')           // en-dash -> -
      .replace(/[‘’‚′]/g, "'") // curly single quotes
      .replace(/[“”„″]/g, '"') // curly double quotes
      .replace(/…/g, '...')         // ellipsis
      .replace(/·/g, '|')           // middle-dot -> pipe
      .replace(/•/g, '*')           // bullet
      .replace(/→/g, '->')          // right arrow
      .replace(/←/g, '<-')          // left arrow
      .replace(/↔/g, '<->')         // both arrows
      .replace(/[×✕]/g, 'x')   // multiplication / cross
      .replace(/[ ]/g, ' ')         // nbsp
      .replace(/[§]/g, 'Sec ');     // section sign
    let out = '';
    for (const ch of normalised) {
      const code = ch.codePointAt(0) ?? 0;
      out += code < 0x100 ? ch : '?';
    }
    return out;
  }

  private formatDate(iso: string): string {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
    return `${d}-${mons[mIdx]}-${y.slice(2)}`;
  }

  private daysBetween(startIso: string, finishIso: string): number {
    const s = new Date(`${startIso}T00:00:00Z`);
    const f = new Date(`${finishIso}T00:00:00Z`);
    return Math.round((f.getTime() - s.getTime()) / 86_400_000);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────

interface WbsGroup {
  wbsCode: string;
  wbsName: string;
  activities: TemplateActivity[];
}

function groupByWbs(activities: TemplateActivity[]): WbsGroup[] {
  // Activity wbsCode is like "WBS.6.1"; the leaf-name derives from a small map.
  const NAME: Record<string, string> = {
    'WBS.1': 'Milestones',
    'WBS.1.1': 'Contractual Milestones',
    'WBS.1.2': 'Key Milestones',
    'WBS.2': 'Site Mobilisation',
    'WBS.2.1': 'Mobilisation Works',
    'WBS.3': 'Building Permit',
    'WBS.3.1': 'General',
    'WBS.4': 'Contract Deliverables',
    'WBS.4.1': 'Submissions',
    'WBS.4.2': 'Approvals',
    'WBS.5': 'Engineering Works (Off-Site)',
    'WBS.5.1': 'Subcontractor / Supplier Pre-qualification',
    'WBS.5.2': 'Shop Drawings',
    'WBS.5.3': 'Material Procurement',
    'WBS.6': 'Civil Works',
    'WBS.6.1': 'Substructure',
    'WBS.6.2': 'Superstructure',
    'WBS.6.3': 'Blockwork & Plaster',
    'WBS.7': 'MEP Works',
    'WBS.7.1': 'MEP First Fix',
    'WBS.7.2': 'MEP Second Fix',
    'WBS.8': 'Finishing Works',
    'WBS.8.1': 'Internal Finishes',
    'WBS.8.2': 'External Finishes',
    'WBS.9': 'External Works',
    'WBS.9.1': 'Landscaping & Hardscape',
    'WBS.10': 'Testing & Commissioning',
    'WBS.10.1': 'Systems T&C',
    'WBS.11': 'Hand-over',
    'WBS.11.1': 'Snag & Hand-over',
  };

  const byLeaf = new Map<string, TemplateActivity[]>();
  for (const a of activities) {
    const key = a.wbsCode;
    if (!byLeaf.has(key)) byLeaf.set(key, []);
    byLeaf.get(key)!.push(a);
  }
  const out: WbsGroup[] = [];
  for (const [code, list] of [...byLeaf.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out.push({ wbsCode: code, wbsName: NAME[code] ?? code, activities: list });
  }
  return out;
}
