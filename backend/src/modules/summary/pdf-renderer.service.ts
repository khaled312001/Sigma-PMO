import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { AppConfiguration } from '../../config/configuration';

/** What the caller asks the renderer to draw. */
export interface MonthlyReportPdfInput {
  /** Project name as it should appear in the title block. */
  projectName: string;
  /** Project businessKey (printed alongside name for traceability). */
  projectBusinessKey: string;
  /** Calendar period label (YYYY-MM, YYYY-Www, or YYYY-MM-DD). */
  month: string;
  /** `owner` | `pd` | `contractor`. Drives the cover label. */
  audience: string;
  /** The persona-authored prose body (Markdown — rendered as plain text). */
  narrative: string;
  /** Deterministic facts surfaced on the cover page. */
  metricsSummary: MetricsSummary;
  /** Source ids harvested from the persona response. Printed in the footer. */
  citations: string[];
  /** Persona slug + version, printed in the footer for audit. */
  personaSlug: string;
  personaVersion: number;
  /** `deterministic` or `llm`. Printed in the footer. */
  narrativeSource: string;
  /**
   * Full metrics blob (`MonthlyReport.metrics`). The renderer pulls deep
   * detail from this for the schedule / alerts / decisions / financial /
   * risk analysis pages — anything the cover MetricsSummary can't carry.
   */
  fullMetrics?: Record<string, unknown>;
}

/** Compact fact bundle the PDF cover lists in the "key figures" box. */
export interface MetricsSummary {
  activityCount: number;
  alertCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  /** Average data confidence in [0, 1] — printed as percentage. */
  confidenceAverage: number;
  /** BoQ total — already-formatted currency string ("AED 12,345,678"). */
  boqTotalDisplay: string | null;
  /** Schedule delta in percentage points (actual − planned), or null. */
  scheduleDeltaPp: number | null;
}

export interface PdfRenderResult {
  storedPath: string;
  byteSize: number;
}

/**
 * Render the persisted monthly narrative to PDF using `pdf-lib`.
 *
 * Wave 2 is intentionally a basic layout:
 *  - StandardFonts (Helvetica) on every page. pdf-lib's StandardFonts do NOT
 *    cover Arabic glyphs — Wave 3 will embed a UAE-formal Arabic font
 *    (the Tajawal TTF the front-end already ships) and add real RTL
 *    bidi shaping. For Wave 2 the body is laid out left-aligned and any
 *    Arabic characters that StandardFonts can't draw are replaced with a
 *    tofu marker (`?`) by pdf-lib's encoder, so the PDF still opens cleanly.
 *    The truth-of-record stays the persisted `narrative` text — the PDF is
 *    a rendering, not the canonical record.
 *  - One cover page (project name + month + audience + key figures), then
 *    body pages wrapped at a fixed column width, then a footer with persona
 *    audit + citations.
 *  - File is written under `${storageDir}/monthly-reports/${month}/${id}.pdf`.
 *    Directories are created on demand.
 *
 * The service is pure rendering: it does not persist anything to the
 * database. `MonthlyReportService` stamps the returned `storedPath` onto
 * the `MonthlyReport.pdfStoredPath` column itself.
 */
@Injectable()
export class PdfRendererService {
  private readonly logger = new Logger(PdfRendererService.name);

  /** Absolute path to the storage root. Resolved once at construction. */
  private readonly storageDir: string;

  constructor(config: ConfigService<AppConfiguration, true>) {
    const cfg = config.get('storageDir', { infer: true });
    this.storageDir = resolve(cfg ?? '../data/storage');
  }

  /**
   * Render `input` and persist the PDF on disk.
   *
   * @param reportId The `MonthlyReport.id` — used as the filename so a row
   *                 in the DB maps 1:1 to a file on disk without a lookup.
   */
  async render(reportId: string, input: MonthlyReportPdfInput): Promise<PdfRenderResult> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Sigma PMO Report — ${input.projectName} (${input.month}) — ${input.audience.toUpperCase()}`);
    doc.setAuthor('Sigma PMO');
    doc.setSubject(`Periodic narrative — ${input.audience}`);
    doc.setCreator('Sigma PMO');
    doc.setProducer('pdf-lib');

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvObl = await doc.embedFont(StandardFonts.HelveticaOblique);

    const ctx: RenderCtx = { doc, helv, helvBold, helvObl, input };

    // 1. Cover page (project + audience + KPI grid + audit chain).
    this.drawCoverPage(doc, helv, helvBold, helvObl, input);

    // 2. Table of Contents — sets reader expectations.
    this.drawTocPage(ctx);

    // 3. Executive Verdict — first 1-2 paragraphs of the narrative, big.
    this.drawExecutiveVerdictPage(ctx);

    // 4. Schedule Performance Analysis — planned vs actual, variance,
    //    progress bands, status text.
    this.drawSchedulePerformancePage(ctx);

    // 5. Alerts Inventory — by severity + by rule code, with FIDIC clauses.
    this.drawAlertsInventoryPage(ctx);

    // 6. Governance Decisions Log — counts + level breakdown + commentary.
    this.drawDecisionsPage(ctx);

    // 7. Financial Position (BoQ).
    this.drawFinancialPage(ctx);

    // 8. Risk Register (derived from alert patterns).
    this.drawRiskRegisterPage(ctx);

    // 9. Engineer's Recommendations — concrete actions with owners + dates.
    this.drawRecommendationsPage(ctx);

    // 10. Full narrative (the persona's prose; deterministic if Claude off).
    this.drawNarrativePages(doc, helv, helvBold, input);

    // 11. Sources & evidence chain.
    this.drawCitationsPage(doc, helv, helvBold, input);

    // 12. Sign-off block — author / reviewer / approver.
    this.drawSignOffPage(ctx);

    const bytes = await doc.save();
    const relativePath = join('monthly-reports', input.month, `${reportId}.pdf`);
    const absolutePath = join(this.storageDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    this.logger.log(`Rendered periodic PDF ${reportId} → ${relativePath} (${bytes.byteLength} bytes)`);
    return { storedPath: relativePath, byteSize: bytes.byteLength };
  }

  /** Absolute path on disk for a previously-rendered report. */
  resolveAbsolutePath(relativePath: string): string {
    return resolve(this.storageDir, relativePath);
  }

  // ───────────────────────── internals ─────────────────────────

  // ── Brand palette (matches the front-end formal UAE identity) ──
  private readonly crimson = rgb(0.55, 0.06, 0.13);
  private readonly crimsonDeep = rgb(0.42, 0.04, 0.10);
  private readonly inkDark = rgb(0.08, 0.09, 0.12);
  private readonly inkMid = rgb(0.32, 0.34, 0.38);
  private readonly inkSoft = rgb(0.55, 0.57, 0.62);
  private readonly canvas = rgb(0.97, 0.97, 0.98);
  private readonly cardBorder = rgb(0.86, 0.87, 0.90);
  private readonly criticalAccent = rgb(0.78, 0.13, 0.13);
  private readonly warningAccent = rgb(0.85, 0.53, 0.10);
  private readonly successAccent = rgb(0.10, 0.50, 0.32);
  private readonly tableHeaderBg = rgb(0.93, 0.93, 0.95);

  // ───────────────────────── senior-planner depth ─────────────────────────
  // Each "drawXyzPage" lays out one A4 portrait page with a consistent
  // header band, section title with crimson rule, body content, and a
  // footer carrying the page number + brand mark.

  private drawSectionHeader(
    page: import('pdf-lib').PDFPage,
    helvBold: import('pdf-lib').PDFFont,
    helv: import('pdf-lib').PDFFont,
    sectionNumber: string,
    title: string,
    subtitle: string,
  ): number {
    const { width } = page.getSize();
    const top = 842;
    // Thin top rule + section eyebrow.
    page.drawRectangle({ x: 40, y: top - 35, width: width - 80, height: 1, color: this.crimson });
    page.drawText(`SECTION ${sectionNumber}`, {
      x: 40, y: top - 28, font: helvBold, size: 8, color: this.crimson,
    });
    // Title.
    page.drawText(this.safeAscii(title), {
      x: 40, y: top - 60, font: helvBold, size: 18, color: this.inkDark,
    });
    page.drawText(this.safeAscii(subtitle), {
      x: 40, y: top - 78, font: helv, size: 9.5, color: this.inkMid,
    });
    return top - 100;
  }

  private drawSectionFooter(
    page: import('pdf-lib').PDFPage,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
    pageNumber: number,
  ): void {
    const { width } = page.getSize();
    page.drawRectangle({ x: 40, y: 38, width: width - 80, height: 0.6, color: this.cardBorder });
    page.drawText('Sigma PMO', { x: 40, y: 24, font: helvBold, size: 8, color: this.crimson });
    page.drawText(this.safeAscii(input.projectName), {
      x: width / 2 - helv.widthOfTextAtSize(this.safeAscii(input.projectName), 8) / 2,
      y: 24, font: helv, size: 8, color: this.inkMid,
    });
    const lbl = `Page ${pageNumber}`;
    page.drawText(lbl, {
      x: width - 40 - helv.widthOfTextAtSize(lbl, 8),
      y: 24, font: helv, size: 8, color: this.inkSoft,
    });
  }

  // ── Table of Contents ──────────────────────────────────────────────────

  private drawTocPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '00', 'Contents', 'Senior-planner reporting structure — every section anchored in canonical project facts');

    const rows: Array<[string, string]> = [
      ['01', 'Executive Verdict — three-line bottom line, in plain language'],
      ['02', 'Schedule Performance Analysis — planned vs actual, variance, critical path posture'],
      ['03', 'Alerts Inventory — by severity, by rule code, with FIDIC clause references'],
      ['04', 'Governance Decisions Log — issued in the reporting window'],
      ['05', 'Financial Position — Bill of Quantities, currency, version'],
      ['06', 'Risk Register — pattern-derived top risks with impact / likelihood'],
      ['07', 'Engineer’s Recommendations — concrete actions, owners, timelines'],
      ['08', 'Full Narrative — persona-authored prose body'],
      ['09', 'Sources & Evidence Chain — every claim grounded in the curated registry'],
      ['10', 'Sign-off — author / reviewer / approver block'],
    ];
    for (const [n, title] of rows) {
      page.drawText(n, { x: 50, y, font: helvBold, size: 11, color: this.crimson });
      page.drawText(this.safeAscii(title), {
        x: 92, y, font: helv, size: 11, color: this.inkDark,
      });
      y -= 22;
    }

    // Methodology box at the bottom — sets tone for the depth.
    const boxTop = y - 16;
    page.drawRectangle({ x: 40, y: boxTop - 90, width: 595 - 80, height: 90, color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6 });
    page.drawRectangle({ x: 40, y: boxTop - 90, width: 4, height: 90, color: this.crimson });
    page.drawText('METHODOLOGY', { x: 56, y: boxTop - 22, font: helvBold, size: 9, color: this.crimson });
    const methodologyLines = [
      'Every figure in this report is read from the canonical, append-only data model — no human-typed',
      'numbers and no derived caches. Schedule deltas use the activity’s last data-date snapshot;',
      'alert severities follow the Sigma rule-engine threshold policy; FIDIC clauses are pulled from the',
      'governance policy active at issue time. The persona narrative paraphrases these facts and is',
      'required to attach a [SOURCE: id] marker for every professional claim. Citations are filtered',
      'against the Sigma Source Registry — unknown markers are dropped before this PDF is rendered.',
    ];
    let mline = boxTop - 40;
    for (const ml of methodologyLines) {
      page.drawText(this.safeAscii(ml), { x: 56, y: mline, font: helv, size: 8.5, color: this.inkMid });
      mline -= 12;
    }

    this.drawSectionFooter(page, helv, helvBold, input, 2);
  }

  // ── Executive Verdict ──────────────────────────────────────────────────

  private drawExecutiveVerdictPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '01', 'Executive Verdict', 'The bottom line, before the analysis. Read this if nothing else.');

    // Pull the first 1-2 paragraphs of the narrative (post-heading) as the verdict.
    const verdict = extractExecutiveVerdict(input.narrative);
    const lines = this.wrapNarrative(verdict, helv, 13, 515);
    for (const ln of lines) {
      if (y < 130) break;
      page.drawText(this.safeAscii(ln), {
        x: 40, y, font: helv, size: 13, color: this.inkDark,
      });
      y -= 20;
    }

    // Stoplight banner at the bottom — derived from schedule delta.
    const m = input.metricsSummary;
    const stoplight =
      m.criticalAlertCount > 0 ? { color: this.criticalAccent, label: 'RED — IMMEDIATE INTERVENTION REQUIRED' } :
      m.warningAlertCount > 2 || (m.scheduleDeltaPp !== null && m.scheduleDeltaPp < -3) ? { color: this.warningAccent, label: 'AMBER — CLOSE MANAGEMENT ATTENTION' } :
      { color: this.successAccent, label: 'GREEN — PERFORMING WITHIN TOLERANCE' };
    page.drawRectangle({ x: 40, y: 70, width: 595 - 80, height: 36, color: stoplight.color });
    page.drawText(stoplight.label, {
      x: 56, y: 84, font: helvBold, size: 13, color: rgb(1, 1, 1),
    });

    this.drawSectionFooter(page, helv, helvBold, input, 3);
  }

  // ── Schedule Performance Analysis ─────────────────────────────────────

  private drawSchedulePerformancePage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '02', 'Schedule Performance Analysis', 'Planned vs Actual progress, variance, and critical-path posture.');

    const full = input.fullMetrics ?? {};
    const planned = num(full.plannedAverage);
    const actual = num(full.actualAverage);
    const delta = num(full.scheduleDeltaPp);
    const activityCount = num(full.activityCount) ?? input.metricsSummary.activityCount;

    // KPI strip: planned %, actual %, delta pp, activity count.
    const cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }> = [
      { label: 'Planned progress', value: planned !== null ? `${(planned * 100).toFixed(1)}%` : 'n/a', accent: this.crimson },
      { label: 'Actual progress', value: actual !== null ? `${(actual * 100).toFixed(1)}%` : 'n/a', accent: actual !== null && planned !== null && actual >= planned ? this.successAccent : this.warningAccent },
      { label: 'Variance (Actual − Planned)', value: delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp` : 'n/a', accent: delta !== null && delta >= 0 ? this.successAccent : this.criticalAccent },
      { label: 'Activities tracked', value: String(activityCount), accent: this.crimson },
    ];
    this.drawKpiStrip(page, helv, helvBold, cards, y - 60);
    y -= 80;

    // Planned vs actual bar chart (simple horizontal bars).
    page.drawRectangle({ x: 40, y: y - 4, width: 4, height: 16, color: this.crimson });
    page.drawText('PROGRESS BARS', { x: 52, y: y, font: helvBold, size: 11, color: this.inkDark });
    y -= 26;
    this.drawProgressBar(page, helv, helvBold, 'Planned', planned ?? 0, this.crimson, y);
    y -= 30;
    this.drawProgressBar(page, helv, helvBold, 'Actual', actual ?? 0, actual !== null && planned !== null && actual >= planned ? this.successAccent : this.warningAccent, y);
    y -= 40;

    // Engineering interpretation paragraph.
    page.drawRectangle({ x: 40, y: y - 4, width: 4, height: 16, color: this.crimson });
    page.drawText('INTERPRETATION', { x: 52, y: y, font: helvBold, size: 11, color: this.inkDark });
    y -= 24;

    const interpretation = composeScheduleInterpretation(planned, actual, delta, activityCount);
    for (const para of interpretation) {
      const wrapped = this.wrapNarrative(para, helv, 10.5, 515);
      for (const ln of wrapped) {
        if (y < 80) break;
        page.drawText(this.safeAscii(ln), { x: 40, y, font: helv, size: 10.5, color: this.inkDark });
        y -= 15;
      }
      y -= 6;
    }

    this.drawSectionFooter(page, helv, helvBold, input, 4);
  }

  // ── Alerts Inventory ──────────────────────────────────────────────────

  private drawAlertsInventoryPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '03', 'Alerts Inventory', 'Open alerts in this reporting window, grouped by severity and by rule code.');

    const full = input.fullMetrics ?? {};
    const total = num(full.alertCount) ?? 0;
    const critical = num(full.criticalAlertCount) ?? 0;
    const warning = num(full.warningAlertCount) ?? 0;
    const info = Math.max(0, total - critical - warning);

    // Severity matrix as a small table.
    const cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }> = [
      { label: 'Total alerts', value: String(total), accent: this.crimson },
      { label: 'Critical', value: String(critical), accent: critical > 0 ? this.criticalAccent : this.successAccent },
      { label: 'Warning', value: String(warning), accent: warning > 0 ? this.warningAccent : this.successAccent },
      { label: 'Info', value: String(info), accent: this.crimson },
    ];
    this.drawKpiStrip(page, helv, helvBold, cards, y - 60);
    y -= 80;

    // By-rule-code table.
    page.drawRectangle({ x: 40, y: y - 4, width: 4, height: 16, color: this.crimson });
    page.drawText('BY RULE CODE', { x: 52, y: y, font: helvBold, size: 11, color: this.inkDark });
    y -= 24;

    const byCodeRaw = (full.alertsByCode ?? {}) as Record<string, unknown>;
    const byCode = Object.entries(byCodeRaw)
      .map(([code, v]) => ({ code, count: num(v) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    if (byCode.length === 0) {
      page.drawText('No alerts raised in this period — the project tripped no rule-engine thresholds.', {
        x: 40, y, font: helv, size: 10, color: this.inkMid,
      });
      y -= 24;
    } else {
      // Table header.
      page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 20, color: this.tableHeaderBg });
      page.drawText('RULE CODE', { x: 52, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('FIDIC REF', { x: 220, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('COUNT', { x: 410, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('SHARE', { x: 480, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      y -= 24;

      for (const r of byCode) {
        const fidic = fidicForRule(r.code);
        const share = total > 0 ? (r.count / total) * 100 : 0;
        page.drawText(this.safeAscii(r.code), { x: 52, y, font: helv, size: 10, color: this.inkDark });
        page.drawText(this.safeAscii(fidic), { x: 220, y, font: helv, size: 9.5, color: this.inkMid });
        page.drawText(String(r.count), { x: 410, y, font: helvBold, size: 10, color: this.inkDark });
        page.drawText(`${share.toFixed(0)}%`, { x: 480, y, font: helv, size: 10, color: this.inkMid });
        // thin underline
        page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 0.3, color: this.cardBorder });
        y -= 18;
        if (y < 90) break;
      }
    }

    this.drawSectionFooter(page, helv, helvBold, input, 5);
  }

  // ── Governance Decisions Log ──────────────────────────────────────────

  private drawDecisionsPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '04', 'Governance Decisions Log', 'Formal governance decisions issued in this reporting window.');

    const full = input.fullMetrics ?? {};
    const decisionCount = num(full.decisionCount) ?? 0;
    const byLevelRaw = (full.decisionsByLevel ?? {}) as Record<string, unknown>;
    const byLevel = Object.entries(byLevelRaw)
      .map(([level, v]) => ({ level, count: num(v) ?? 0 }))
      .sort((a, b) => b.count - a.count);

    const cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }> = [
      { label: 'Decisions issued', value: String(decisionCount), accent: this.crimson },
      { label: 'L1 (escalated)', value: String(byLevelRaw.L1 ?? 0), accent: this.criticalAccent },
      { label: 'L2 (managed)', value: String(byLevelRaw.L2 ?? 0), accent: this.warningAccent },
      { label: 'L3 (informational)', value: String(byLevelRaw.L3 ?? 0), accent: this.successAccent },
    ];
    this.drawKpiStrip(page, helv, helvBold, cards, y - 60);
    y -= 80;

    page.drawRectangle({ x: 40, y: y - 4, width: 4, height: 16, color: this.crimson });
    page.drawText('LEVEL BREAKDOWN', { x: 52, y: y, font: helvBold, size: 11, color: this.inkDark });
    y -= 24;

    if (byLevel.length === 0) {
      page.drawText('No governance decisions were issued in this window. This is consistent with a project', {
        x: 40, y, font: helv, size: 10.5, color: this.inkDark,
      });
      page.drawText('operating within tolerance and not requiring escalation to the governance layer.', {
        x: 40, y: y - 14, font: helv, size: 10.5, color: this.inkDark,
      });
      y -= 36;
    } else {
      for (const lv of byLevel) {
        const accent = lv.level === 'L1' ? this.criticalAccent : lv.level === 'L2' ? this.warningAccent : this.successAccent;
        page.drawRectangle({ x: 40, y: y - 6, width: 4, height: 16, color: accent });
        page.drawText(`${lv.level}: ${lv.count}`, {
          x: 52, y, font: helvBold, size: 11, color: this.inkDark,
        });
        page.drawText(decisionLevelImplication(lv.level), {
          x: 100, y, font: helv, size: 10, color: this.inkMid,
        });
        y -= 22;
      }
    }

    // Practitioner commentary block.
    y -= 8;
    page.drawRectangle({ x: 40, y: y - 80, width: 515, height: 80, color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6 });
    page.drawRectangle({ x: 40, y: y - 80, width: 4, height: 80, color: this.crimson });
    page.drawText('PRACTITIONER COMMENTARY', { x: 56, y: y - 16, font: helvBold, size: 9, color: this.crimson });
    const commentary = composeDecisionsCommentary(decisionCount, byLevelRaw);
    let cy = y - 32;
    for (const ln of commentary) {
      const wrapped = this.wrapNarrative(ln, helv, 9.5, 480);
      for (const w of wrapped) {
        page.drawText(this.safeAscii(w), { x: 56, y: cy, font: helv, size: 9.5, color: this.inkDark });
        cy -= 13;
      }
    }

    this.drawSectionFooter(page, helv, helvBold, input, 6);
  }

  // ── Financial Position ────────────────────────────────────────────────

  private drawFinancialPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '05', 'Financial Position', 'Bill of Quantities, currency, and version of the financial baseline.');

    const full = input.fullMetrics ?? {};
    const boqCurrency = (full.boqCurrency as string | null) ?? null;
    const boqTotalAmount = (full.boqTotalAmount as string | null) ?? null;
    const boqVersion = num(full.boqVersion);
    const m = input.metricsSummary;

    if (boqTotalAmount && boqCurrency) {
      const cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }> = [
        { label: 'BoQ total', value: m.boqTotalDisplay ?? `${boqCurrency} ${boqTotalAmount}`, accent: this.crimson },
        { label: 'Currency', value: boqCurrency, accent: this.crimson },
        { label: 'BoQ version', value: boqVersion !== null ? `v${boqVersion}` : 'n/a', accent: this.crimson },
        { label: 'Activities priced', value: String(num(full.activityCount) ?? 0), accent: this.crimson },
      ];
      this.drawKpiStrip(page, helv, helvBold, cards, y - 60);
      y -= 80;

      page.drawRectangle({ x: 40, y: y - 4, width: 4, height: 16, color: this.crimson });
      page.drawText('FINANCIAL INTERPRETATION', { x: 52, y: y, font: helvBold, size: 11, color: this.inkDark });
      y -= 24;

      const lines = [
        `The current Bill of Quantities reads ${m.boqTotalDisplay ?? `${boqCurrency} ${boqTotalAmount}`} at version ${boqVersion ?? 'n/a'}.`,
        'No variation orders are aggregated into this figure beyond what the current canonical BoQ row',
        'carries; cost-overrun rule alerts (if any) are surfaced in §03 — reconcile both views before',
        'closing the period. A version step (BoQ v→v+1) typically corresponds to a Sub-Clause 13.3',
        'value-engineering variation or a Sub-Clause 12.3 measured-quantity adjustment.',
      ];
      for (const ln of lines) {
        if (y < 80) break;
        page.drawText(this.safeAscii(ln), { x: 40, y, font: helv, size: 10, color: this.inkDark });
        y -= 14;
      }
    } else {
      page.drawText('No current Bill of Quantities is on file for this project.', {
        x: 40, y, font: helv, size: 11, color: this.inkDark,
      });
      y -= 20;
      page.drawText('Action: ingest the contract BoQ via /input before the next reporting window so the', {
        x: 40, y, font: helv, size: 10, color: this.inkMid,
      });
      y -= 14;
      page.drawText('financial section can carry quantitative claims rather than this caveat.', {
        x: 40, y, font: helv, size: 10, color: this.inkMid,
      });
    }

    this.drawSectionFooter(page, helv, helvBold, input, 7);
  }

  // ── Risk Register ─────────────────────────────────────────────────────

  private drawRiskRegisterPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '06', 'Risk Register', 'Pattern-derived risks. Ranked by inferred impact and likelihood from the alert + decision inventory.');

    const risks = deriveRiskRegister(input);
    if (risks.length === 0) {
      page.drawText('No structural risks rise above noise in this window — the alert + decision pattern', {
        x: 40, y, font: helv, size: 10.5, color: this.inkDark,
      });
      page.drawText('does not indicate a systemic concern. Continue routine surveillance.', {
        x: 40, y: y - 14, font: helv, size: 10.5, color: this.inkDark,
      });
    } else {
      // Header row.
      page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 20, color: this.tableHeaderBg });
      page.drawText('#', { x: 50, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('RISK', { x: 70, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('IMPACT', { x: 360, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('LIKELIHOOD', { x: 425, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      y -= 26;

      for (let i = 0; i < risks.length; i += 1) {
        const r = risks[i];
        const impactColor = r.impact === 'HIGH' ? this.criticalAccent : r.impact === 'MED' ? this.warningAccent : this.successAccent;
        const likeColor = r.likelihood === 'HIGH' ? this.criticalAccent : r.likelihood === 'MED' ? this.warningAccent : this.successAccent;
        page.drawText(String(i + 1), { x: 50, y, font: helvBold, size: 10, color: this.crimson });
        page.drawText(this.safeAscii(r.title), { x: 70, y, font: helv, size: 10, color: this.inkDark });
        // Wrap the rationale on a second line.
        const rationaleLines = this.wrapNarrative(r.rationale, helv, 9, 280);
        let ry = y - 12;
        for (const ln of rationaleLines.slice(0, 2)) {
          page.drawText(this.safeAscii(ln), { x: 70, y: ry, font: helv, size: 9, color: this.inkMid });
          ry -= 11;
        }
        // Impact + likelihood pills.
        this.drawTinyPill(page, helvBold, r.impact, 360, y, impactColor);
        this.drawTinyPill(page, helvBold, r.likelihood, 425, y, likeColor);
        y = ry - 8;
        page.drawRectangle({ x: 40, y: y + 4, width: 515, height: 0.4, color: this.cardBorder });
        if (y < 90) break;
      }
    }

    this.drawSectionFooter(page, helv, helvBold, input, 8);
  }

  // ── Engineer's Recommendations ────────────────────────────────────────

  private drawRecommendationsPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '07', 'Engineer’s Recommendations', 'Concrete actions with named owners and target dates. The closing-the-loop list.');

    const recs = deriveRecommendations(input);
    if (recs.length === 0) {
      page.drawText('The project is performing within tolerance; no escalated recommendations this period.', {
        x: 40, y, font: helv, size: 11, color: this.inkDark,
      });
      y -= 18;
      page.drawText('Routine actions only: continue the weekly progress capture cycle, maintain the BoQ', {
        x: 40, y, font: helv, size: 10, color: this.inkMid,
      });
      y -= 14;
      page.drawText('measurement cadence, and reissue the look-ahead each Tuesday.', {
        x: 40, y, font: helv, size: 10, color: this.inkMid,
      });
    } else {
      // Header.
      page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 20, color: this.tableHeaderBg });
      page.drawText('#', { x: 50, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('ACTION', { x: 70, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('OWNER', { x: 350, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      page.drawText('BY', { x: 470, y: y - 1, font: helvBold, size: 9, color: this.inkDark });
      y -= 24;

      for (let i = 0; i < recs.length; i += 1) {
        const r = recs[i];
        page.drawText(String(i + 1), { x: 50, y, font: helvBold, size: 10, color: this.crimson });
        // Action title.
        page.drawText(this.safeAscii(r.title), { x: 70, y, font: helvBold, size: 10, color: this.inkDark });
        // Rationale (small, second line).
        const rationale = this.wrapNarrative(r.rationale, helv, 9, 270);
        let ry = y - 12;
        for (const ln of rationale.slice(0, 2)) {
          page.drawText(this.safeAscii(ln), { x: 70, y: ry, font: helv, size: 9, color: this.inkMid });
          ry -= 11;
        }
        page.drawText(this.safeAscii(r.owner), { x: 350, y, font: helv, size: 10, color: this.inkDark });
        page.drawText(this.safeAscii(r.by), { x: 470, y, font: helv, size: 10, color: this.inkDark });
        y = ry - 8;
        page.drawRectangle({ x: 40, y: y + 4, width: 515, height: 0.4, color: this.cardBorder });
        if (y < 90) break;
      }
    }

    this.drawSectionFooter(page, helv, helvBold, input, 9);
  }

  // ── Sign-off ───────────────────────────────────────────────────────────

  private drawSignOffPage(ctx: RenderCtx): void {
    const { doc, helv, helvBold, input } = ctx;
    const page = doc.addPage([595, 842]);
    let y = this.drawSectionHeader(page, helvBold, helv, '10', 'Sign-off', 'Author / reviewer / approver block. Hand-signed where electronic signature is not available.');

    // Three signature blocks.
    const blocks: Array<{ role: string; name: string; date: string }> = [
      { role: 'Prepared by (Author)', name: input.personaSlug, date: '_______________' },
      { role: 'Reviewed by (Project Director)', name: '_______________________', date: '_______________' },
      { role: 'Approved by (Sigma Governance Layer)', name: '_______________________', date: '_______________' },
    ];

    for (const b of blocks) {
      page.drawRectangle({ x: 40, y: y - 100, width: 515, height: 100, color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6 });
      page.drawRectangle({ x: 40, y: y - 100, width: 4, height: 100, color: this.crimson });
      page.drawText(b.role.toUpperCase(), { x: 56, y: y - 22, font: helvBold, size: 10, color: this.crimson });
      page.drawText('Name:', { x: 56, y: y - 50, font: helvBold, size: 9, color: this.inkMid });
      page.drawText(this.safeAscii(b.name), { x: 110, y: y - 50, font: helv, size: 10, color: this.inkDark });
      page.drawText('Signature:', { x: 56, y: y - 70, font: helvBold, size: 9, color: this.inkMid });
      page.drawRectangle({ x: 110, y: y - 72, width: 200, height: 0.6, color: this.inkSoft });
      page.drawText('Date:', { x: 350, y: y - 70, font: helvBold, size: 9, color: this.inkMid });
      page.drawText(b.date, { x: 390, y: y - 70, font: helv, size: 10, color: this.inkDark });
      y -= 116;
    }

    // Closing watermark.
    page.drawRectangle({ x: 40, y: 80, width: 515, height: 28, color: this.crimson });
    page.drawText('SIGMA PMO - DRAFT pending human approval (post-meeting plan Sec 3.6).', {
      x: 56, y: 92, font: helvBold, size: 10, color: rgb(1, 1, 1),
    });

    this.drawSectionFooter(page, helv, helvBold, input, 12);
  }

  // ── Small drawing helpers used by the section pages ───────────────────

  private drawKpiStrip(
    page: import('pdf-lib').PDFPage,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }>,
    topY: number,
  ): void {
    const cardW = 122;
    const cardH = 58;
    const gap = 8;
    for (let i = 0; i < cards.length; i += 1) {
      const x = 40 + i * (cardW + gap);
      page.drawRectangle({
        x, y: topY - cardH, width: cardW, height: cardH,
        color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
      });
      page.drawRectangle({ x, y: topY - cardH, width: 3, height: cardH, color: cards[i].accent });
      page.drawText(this.safeAscii(cards[i].label).toUpperCase(), {
        x: x + 10, y: topY - 16, font: helvBold, size: 7, color: this.inkSoft,
      });
      const valueStr = this.safeAscii(cards[i].value);
      const valueSize = valueStr.length > 14 ? 11 : 16;
      page.drawText(valueStr, {
        x: x + 10, y: topY - cardH + 12, font: helvBold, size: valueSize, color: this.inkDark,
      });
    }
  }

  private drawProgressBar(
    page: import('pdf-lib').PDFPage,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    label: string,
    value: number,
    accent: import('pdf-lib').RGB,
    topY: number,
  ): void {
    const v = Math.max(0, Math.min(1, value));
    page.drawText(label, { x: 40, y: topY, font: helvBold, size: 10, color: this.inkDark });
    const barX = 110;
    const barW = 400;
    const barH = 12;
    page.drawRectangle({ x: barX, y: topY - 3, width: barW, height: barH, color: this.tableHeaderBg, borderColor: this.cardBorder, borderWidth: 0.4 });
    page.drawRectangle({ x: barX, y: topY - 3, width: barW * v, height: barH, color: accent });
    page.drawText(`${(v * 100).toFixed(1)}%`, {
      x: barX + barW + 8, y: topY, font: helvBold, size: 10, color: this.inkDark,
    });
  }

  private drawTinyPill(
    page: import('pdf-lib').PDFPage,
    helvBold: import('pdf-lib').PDFFont,
    text: string,
    x: number,
    y: number,
    accent: import('pdf-lib').RGB,
  ): void {
    const w = 50;
    const h = 14;
    page.drawRectangle({ x, y: y - 4, width: w, height: h, color: accent });
    page.drawText(text, { x: x + 6, y: y - 1, font: helvBold, size: 8, color: rgb(1, 1, 1) });
  }

  private drawCoverPage(
    doc: PDFDocument,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    helvObl: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
  ): void {
    const page = doc.addPage([595, 842]); // A4 portrait, points.
    const { width, height } = page.getSize();

    // Header band — crimson with crimson-deep slab on the left.
    page.drawRectangle({ x: 0, y: height - 130, width, height: 130, color: this.crimson });
    page.drawRectangle({ x: 0, y: height - 130, width: 12, height: 130, color: this.crimsonDeep });

    page.drawText('SIGMA PMO', {
      x: 40, y: height - 45, font: helvBold, size: 12, color: rgb(1, 1, 1),
    });
    page.drawText('Governance & Transformation Platform', {
      x: 40, y: height - 60, font: helvObl, size: 9, color: rgb(0.95, 0.90, 0.92),
    });

    const cadenceLabel = this.cadenceTitleFromMonthShape(input.month);
    page.drawText(`${cadenceLabel} Performance Report`, {
      x: 40, y: height - 95, font: helvBold, size: 22, color: rgb(1, 1, 1),
    });
    page.drawText(`${this.safeAscii(input.projectName)} • ${input.month}`, {
      x: 40, y: height - 118, font: helv, size: 11, color: rgb(0.97, 0.93, 0.94),
    });

    // Audience pill in the top-right.
    const pillText = input.audience.toUpperCase();
    const pillWidth = helvBold.widthOfTextAtSize(pillText, 10) + 28;
    page.drawRectangle({
      x: width - pillWidth - 30, y: height - 75, width: pillWidth, height: 22,
      color: rgb(1, 1, 1), borderColor: rgb(1, 1, 1), borderWidth: 0,
    });
    page.drawText(pillText, {
      x: width - pillWidth - 30 + 14, y: height - 69, font: helvBold, size: 10, color: this.crimson,
    });

    // Identity block — clean two-column key-value table.
    let y = height - 175;
    const rows: Array<[string, string]> = [
      ['Project', this.safeAscii(input.projectName)],
      ['Project key', input.projectBusinessKey],
      ['Reporting period', input.month],
      ['Audience', input.audience.toUpperCase()],
      ['Narrative source', input.narrativeSource],
      ['Persona', `${input.personaSlug} v${input.personaVersion}`],
    ];
    for (const [label, value] of rows) {
      page.drawText(label.toUpperCase(), { x: 40, y, font: helvBold, size: 8, color: this.inkSoft });
      page.drawText(value, { x: 165, y, font: helv, size: 11, color: this.inkDark });
      y -= 18;
    }

    // Section divider for "Key figures"
    y -= 14;
    page.drawRectangle({ x: 40, y, width: 4, height: 18, color: this.crimson });
    page.drawText('KEY FIGURES', { x: 52, y: y + 4, font: helvBold, size: 12, color: this.inkDark });
    y -= 24;

    // 4-column KPI grid (2 rows × 4 cards).
    const m = input.metricsSummary;
    const cards: Array<{ label: string; value: string; accent: import('pdf-lib').RGB }> = [
      { label: 'Activities tracked', value: `${m.activityCount}`, accent: this.crimson },
      {
        label: 'Critical alerts',
        value: `${m.criticalAlertCount}`,
        accent: m.criticalAlertCount > 0 ? this.criticalAccent : this.successAccent,
      },
      {
        label: 'Warning alerts',
        value: `${m.warningAlertCount}`,
        accent: m.warningAlertCount > 0 ? this.warningAccent : this.successAccent,
      },
      {
        label: 'Data confidence',
        value: `${(m.confidenceAverage * 100).toFixed(0)}%`,
        accent: m.confidenceAverage >= 0.75 ? this.successAccent : this.warningAccent,
      },
      { label: 'Alerts (total)', value: `${m.alertCount}`, accent: this.crimson },
      {
        label: 'Schedule delta',
        value: m.scheduleDeltaPp === null ? 'n/a' : `${m.scheduleDeltaPp.toFixed(1)} pp`,
        accent:
          m.scheduleDeltaPp === null
            ? this.inkMid
            : m.scheduleDeltaPp >= 0
              ? this.successAccent
              : this.criticalAccent,
      },
      { label: 'BoQ total', value: m.boqTotalDisplay ?? 'n/a', accent: this.crimson },
      { label: 'Confidence band', value: this.confidenceBand(m.confidenceAverage), accent: this.crimson },
    ];

    const cardW = 122;
    const cardH = 64;
    const gap = 8;
    const gridLeft = 40;
    for (let i = 0; i < cards.length; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cx = gridLeft + col * (cardW + gap);
      const cy = y - row * (cardH + gap);
      page.drawRectangle({
        x: cx, y: cy - cardH, width: cardW, height: cardH,
        color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
      });
      page.drawRectangle({
        x: cx, y: cy - cardH, width: 3, height: cardH, color: cards[i].accent,
      });
      page.drawText(cards[i].label.toUpperCase(), {
        x: cx + 10, y: cy - 18, font: helvBold, size: 7, color: this.inkSoft,
      });
      const valueStr = this.safeAscii(cards[i].value);
      const valueSize = valueStr.length > 12 ? 13 : 18;
      page.drawText(valueStr, {
        x: cx + 10, y: cy - cardH + 14, font: helvBold, size: valueSize, color: this.inkDark,
      });
    }
    y -= cardH * 2 + gap + 8;

    // Executive-verdict callout block.
    y -= 12;
    page.drawRectangle({
      x: 40, y: y - 70, width: width - 80, height: 70,
      color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
    });
    page.drawRectangle({ x: 40, y: y - 70, width: 4, height: 70, color: this.crimson });
    page.drawText('AUDIT CHAIN', { x: 56, y: y - 22, font: helvBold, size: 9, color: this.crimson });
    page.drawText(
      this.safeAscii(`Persona ${input.personaSlug} v${input.personaVersion} | narrative source: ${input.narrativeSource}`),
      { x: 56, y: y - 40, font: helv, size: 9, color: this.inkMid },
    );
    page.drawText(
      this.safeAscii(`Citations attached: ${input.citations.length} | ${input.citations.length === 0 ? 'deterministic facts only' : 'sourced from curated registry'}`),
      { x: 56, y: y - 55, font: helv, size: 9, color: this.inkMid },
    );

    // Footer band.
    page.drawRectangle({ x: 0, y: 0, width, height: 30, color: this.canvas });
    page.drawRectangle({ x: 0, y: 30, width, height: 0.6, color: this.cardBorder });
    page.drawText(`Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, {
      x: 40, y: 12, font: helv, size: 8, color: this.inkSoft,
    });
    page.drawText('DRAFT - pending human approval (post-meeting plan Sec 3.6)', {
      x: width - 290, y: 12, font: helvBold, size: 8, color: this.criticalAccent,
    });
  }

  private cadenceTitleFromMonthShape(periodLabel: string): string {
    if (/^\d{4}-W\d{2}$/.test(periodLabel)) return 'Weekly';
    if (/^\d{4}-\d{2}-\d{2}$/.test(periodLabel)) return 'Daily';
    return 'Monthly';
  }

  private confidenceBand(c: number): string {
    if (c >= 0.85) return 'HIGH';
    if (c >= 0.65) return 'MED';
    if (c > 0) return 'LOW';
    return 'N/A';
  }

  private drawNarrativePages(
    doc: PDFDocument,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
  ): void {
    const lines = this.wrapNarrative(input.narrative, helv, 11, 515);
    const pageWidth = 595;
    const pageHeight = 842;
    const topMargin = 70;
    const bottomMargin = 60;
    const lineHeight = 16;
    const linesPerPage = Math.floor((pageHeight - topMargin - bottomMargin) / lineHeight);

    let cursor = 0;
    let pageNumber = 1;
    const cadenceLabel = this.cadenceTitleFromMonthShape(input.month);
    while (cursor < lines.length) {
      const page = doc.addPage([pageWidth, pageHeight]);

      // Top band — thin crimson rule with the running header.
      page.drawRectangle({ x: 40, y: pageHeight - 38, width: pageWidth - 80, height: 1, color: this.crimson });
      page.drawText(`${cadenceLabel.toUpperCase()} PERFORMANCE REPORT — ${input.audience.toUpperCase()}`, {
        x: 40, y: pageHeight - 30, font: helvBold, size: 8, color: this.crimson,
      });
      page.drawText(this.safeAscii(input.projectName), {
        x: pageWidth - 40 - helv.widthOfTextAtSize(this.safeAscii(input.projectName), 8),
        y: pageHeight - 30, font: helv, size: 8, color: this.inkSoft,
      });

      let y = pageHeight - topMargin;
      const sliceEnd = Math.min(cursor + linesPerPage, lines.length);
      for (let i = cursor; i < sliceEnd; i += 1) {
        const line = lines[i];
        const h3 = line.startsWith('### ');
        const h2 = line.startsWith('## ');
        const h1 = line.startsWith('# ');
        const bullet = line.startsWith('- ') || line.startsWith('• ');
        const text = h1 ? line.slice(2) : h2 ? line.slice(3) : h3 ? line.slice(4) : line;

        if (h2 || h1) {
          // Section heading with accent rule.
          y -= 4;
          page.drawRectangle({ x: 40, y: y - 2, width: 4, height: 14, color: this.crimson });
          page.drawText(this.safeAscii(text), {
            x: 52, y, font: helvBold, size: 13, color: this.inkDark,
          });
          y -= lineHeight + 2;
          continue;
        }
        if (h3) {
          page.drawText(this.safeAscii(text), {
            x: 40, y, font: helvBold, size: 11, color: this.crimsonDeep,
          });
          y -= lineHeight;
          continue;
        }
        if (bullet) {
          page.drawCircle({ x: 46, y: y + 4, size: 1.5, color: this.crimson });
          page.drawText(this.safeAscii(text.replace(/^[-•]\s*/, '')), {
            x: 56, y, font: helv, size: 10.5, color: this.inkDark,
          });
          y -= lineHeight;
          continue;
        }
        page.drawText(this.safeAscii(text), {
          x: 40, y, font: helv, size: 10.5, color: this.inkDark,
        });
        y -= lineHeight;
      }

      // Footer with page number + brand mark.
      page.drawRectangle({ x: 40, y: 38, width: pageWidth - 80, height: 0.6, color: this.cardBorder });
      page.drawText('Sigma PMO', {
        x: 40, y: 24, font: helvBold, size: 8, color: this.crimson,
      });
      const pageLabel = `Page ${pageNumber}`;
      page.drawText(pageLabel, {
        x: pageWidth - 40 - helv.widthOfTextAtSize(pageLabel, 8),
        y: 24, font: helv, size: 8, color: this.inkSoft,
      });

      cursor = sliceEnd;
      pageNumber += 1;
    }
  }

  private drawCitationsPage(
    doc: PDFDocument,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
  ): void {
    const pageWidth = 595;
    const pageHeight = 842;
    const page = doc.addPage([pageWidth, pageHeight]);

    // Header band.
    page.drawRectangle({ x: 0, y: pageHeight - 90, width: pageWidth, height: 90, color: this.crimson });
    page.drawRectangle({ x: 0, y: pageHeight - 90, width: 12, height: 90, color: this.crimsonDeep });
    page.drawText('SOURCES & EVIDENCE CHAIN', {
      x: 40, y: pageHeight - 50, font: helvBold, size: 16, color: rgb(1, 1, 1),
    });
    page.drawText(
      'Every professional claim is grounded in the Sigma PMO curated source registry.',
      { x: 40, y: pageHeight - 75, font: helv, size: 10, color: rgb(0.97, 0.93, 0.94) },
    );

    let y = pageHeight - 130;
    if (input.citations.length === 0) {
      page.drawRectangle({
        x: 40, y: y - 50, width: pageWidth - 80, height: 60,
        color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
      });
      page.drawRectangle({ x: 40, y: y - 50, width: 4, height: 60, color: this.warningAccent });
      page.drawText('Deterministic narrative — no external citations attached', {
        x: 56, y: y - 20, font: helvBold, size: 11, color: this.inkDark,
      });
      page.drawText(
        'This report was assembled from canonical project facts only. The narrative is grounded in',
        { x: 56, y: y - 36, font: helv, size: 9, color: this.inkMid },
      );
      page.drawText('the same DB rows that drive every other Sigma PMO surface.', {
        x: 56, y: y - 48, font: helv, size: 9, color: this.inkMid,
      });
    } else {
      for (let i = 0; i < input.citations.length; i += 1) {
        const id = input.citations[i];
        const cardH = 32;
        page.drawRectangle({
          x: 40, y: y - cardH, width: pageWidth - 80, height: cardH,
          color: this.canvas, borderColor: this.cardBorder, borderWidth: 0.6,
        });
        page.drawRectangle({ x: 40, y: y - cardH, width: 3, height: cardH, color: this.crimson });
        page.drawText(`[${String(i + 1).padStart(2, '0')}]`, {
          x: 56, y: y - 20, font: helvBold, size: 10, color: this.crimson,
        });
        page.drawText(this.safeAscii(id), {
          x: 92, y: y - 20, font: helvBold, size: 11, color: this.inkDark,
        });
        y -= cardH + 6;
        if (y < 100) break;
      }
    }

    // Footer / audit trailer.
    page.drawRectangle({ x: 40, y: 70, width: pageWidth - 80, height: 0.6, color: this.cardBorder });
    page.drawText('AUDIT TRAIL', { x: 40, y: 56, font: helvBold, size: 8, color: this.crimson });
    page.drawText(
      this.safeAscii(`Persona ${input.personaSlug} v${input.personaVersion} | narrative source: ${input.narrativeSource}`),
      { x: 40, y: 42, font: helv, size: 8, color: this.inkMid },
    );
    page.drawText('DRAFT - not for distribution until a human approves (post-meeting plan Sec 3.6).', {
      x: 40, y: 24, font: helvBold, size: 8, color: this.criticalAccent,
    });
  }

  /**
   * Wrap the narrative into render-friendly lines. Hard line breaks in the
   * source are preserved; each paragraph is then word-wrapped at the column
   * width. Blank source lines become blank output lines so paragraph spacing
   * survives the layout.
   */
  private wrapNarrative(
    narrative: string,
    font: import('pdf-lib').PDFFont,
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const output: string[] = [];
    const paragraphs = narrative.split(/\r?\n/);
    for (const para of paragraphs) {
      if (para.trim().length === 0) {
        output.push('');
        continue;
      }
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        // pdf-lib needs the safe-ASCII version of the candidate to measure
        // — Arabic glyphs are not in StandardFonts so their width is
        // undefined behaviour. Wave 3 swaps in an Arabic-capable font.
        const width = font.widthOfTextAtSize(this.safeAscii(candidate), fontSize);
        if (width > maxWidth && line.length > 0) {
          output.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line.length > 0) output.push(line);
    }
    return output;
  }

  /**
   * Helvetica's WinAnsi encoding rejects characters outside its codepage.
   * Wave 2 strips them down to a placeholder so the document still renders
   * (the persisted narrative is the canonical record; the PDF is a view).
   * Wave 3 swaps in an Arabic font + RTL shaping and removes this fallback.
   */
  private safeAscii(text: string): string {
    if (!text) return '';
    // Normalise common Unicode typographic chars that WinAnsi rejects.
    const normalised = text
      .replace(/[—―–−‐]/g, '-')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/…/g, '...')
      .replace(/·/g, '|')
      .replace(/•/g, '*')
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/↔/g, '<->')
      .replace(/[×✕]/g, 'x')
      .replace(/[ ]/g, ' ')
      .replace(/[§]/g, 'Sec ')
      .replace(/[±]/g, '+/-');
    let out = '';
    for (const ch of normalised) {
      const code = ch.codePointAt(0) ?? 0;
      out += code < 0x100 ? ch : '?';
    }
    return out;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — derive engineering commentary and recommendations from the
// canonical metrics blob. These are the "30 years of experience" the user
// asked for: rules of thumb, plain-language interpretation, escalation
// thresholds, and FIDIC clause mappings that a senior planner would carry.
// ──────────────────────────────────────────────────────────────────────────

interface RenderCtx {
  doc: PDFDocument;
  helv: import('pdf-lib').PDFFont;
  helvBold: import('pdf-lib').PDFFont;
  helvObl: import('pdf-lib').PDFFont;
  input: MonthlyReportPdfInput;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** First 1-2 paragraphs of the narrative (post any leading heading). */
function extractExecutiveVerdict(narrative: string): string {
  if (!narrative) return '(no verdict — narrative empty)';
  const lines = narrative.split(/\r?\n/);
  const body: string[] = [];
  let started = false;
  let paragraphs = 0;
  for (const ln of lines) {
    if (/^#+\s/.test(ln)) {
      if (started) break;
      continue;
    }
    if (ln.trim().length === 0) {
      if (started) {
        paragraphs += 1;
        if (paragraphs >= 2) break;
        body.push('');
      }
      continue;
    }
    started = true;
    body.push(ln);
  }
  const out = body.join('\n').trim();
  return out.length > 0 ? out : narrative.slice(0, 600);
}

/**
 * Engineering interpretation paragraphs for schedule performance. The
 * thresholds reflect AACE / PMI rule-of-thumb practice for variance
 * communication: ±2pp = on track, ±5pp = recoverable, beyond ±5pp = formal
 * recovery plan required.
 */
function composeScheduleInterpretation(
  planned: number | null,
  actual: number | null,
  delta: number | null,
  activityCount: number,
): string[] {
  const paragraphs: string[] = [];

  if (activityCount === 0) {
    paragraphs.push(
      'No activities are present in the canonical schedule for this project — the planned-vs-actual ' +
        'reading cannot be computed. Action: ingest the Primavera P6 schedule (.xer or .xml) via the ' +
        '/input surface before the next reporting window. Without a canonical schedule the platform ' +
        'cannot calculate variance, identify the critical path, or surface schedule-driven alerts.',
    );
    return paragraphs;
  }

  if (planned === null || actual === null) {
    paragraphs.push(
      'Progress metrics are partially available. The activities present in the schedule do not all ' +
        'carry a planned-percent-complete or actual-percent-complete value at the current data date. ' +
        'Recommend a one-time data hygiene pass: verify the Primavera P6 export includes both ' +
        '`%Planned Complete` and `%Actual Complete` columns at the activity level.',
    );
    return paragraphs;
  }

  const deltaPct = delta ?? 0;
  if (Math.abs(deltaPct) <= 2) {
    paragraphs.push(
      `The project is tracking within ±2 percentage points of the baseline — actual progress ${(actual * 100).toFixed(1)}% ` +
        `versus planned ${(planned * 100).toFixed(1)}%. This is inside the noise band for a measured ` +
        'progress capture cycle and does not warrant escalation. Maintain the existing weekly look-ahead ' +
        'discipline and continue the data-date refresh on a Monday cadence so the variance signal stays ' +
        'reliable.',
    );
    paragraphs.push(
      'Engineering judgement: variances inside ±2pp commonly reflect measurement granularity rather than ' +
        'real-world slippage. Avoid issuing a recovery-plan request on a signal this small — the cost of ' +
        'the formal process (extension-of-time submissions, contractor notices, programme reissue) ' +
        'outweighs the value of the correction at this magnitude.',
    );
  } else if (deltaPct < 0 && deltaPct >= -5) {
    paragraphs.push(
      `Actual progress (${(actual * 100).toFixed(1)}%) is trailing planned (${(planned * 100).toFixed(1)}%) by ` +
        `${Math.abs(deltaPct).toFixed(1)} percentage points. This is inside the recoverable band: a 4-week ` +
        'look-ahead with resource intensification on the critical path is the standard response, and no ' +
        'formal notice-of-delay is yet warranted under FIDIC Sub-Clause 8.4.',
    );
    paragraphs.push(
      'Senior-planner action: identify the two or three activities with the largest individual planned-' +
        'vs-actual gap and request a written catch-up plan from the responsible foreman within ten ' +
        'working days. Track that catch-up plan on the next two weekly cycles. If the variance widens ' +
        'instead of closing, escalate per the next bullet.',
    );
  } else if (deltaPct < -5) {
    paragraphs.push(
      `Actual progress (${(actual * 100).toFixed(1)}%) is materially behind planned (${(planned * 100).toFixed(1)}%) — ` +
        `a ${Math.abs(deltaPct).toFixed(1)} percentage-point shortfall. This sits outside the recoverable ` +
        'band; a formal recovery plan is now required, and FIDIC Sub-Clause 8.4 entitlement to an ' +
        'extension of time should be assessed against the contractually-defined causes of delay.',
    );
    paragraphs.push(
      'Senior-planner action: issue a formal Programme of Recovery request to the contractor under ' +
        'Sub-Clause 8.7. Re-baseline only after the recovery plan is countersigned by the Engineer and ' +
        'the Employer’s Representative; never re-baseline silently as a way of erasing the variance. The ' +
        'original baseline remains the contractual yardstick until a formal variation is issued.',
    );
  } else if (deltaPct > 5) {
    paragraphs.push(
      `Actual progress (${(actual * 100).toFixed(1)}%) is leading planned (${(planned * 100).toFixed(1)}%) by ` +
        `${deltaPct.toFixed(1)} percentage points. Positive variance of this magnitude usually indicates ` +
        'either genuine acceleration or a measurement / earned-value misalignment. Spot-check the top three ' +
        'activities with the largest positive delta against site reality before celebrating; a planner ' +
        'over-claiming progress is the most common cause of a sudden positive swing of this size.',
    );
  } else {
    paragraphs.push(
      `Actual progress (${(actual * 100).toFixed(1)}%) is ahead of planned (${(planned * 100).toFixed(1)}%) by ` +
        `${deltaPct.toFixed(1)} percentage points — a measured positive variance that is consistent with the ` +
        'project’s recovery from the earlier slip. Continue the current cadence; verify the look-ahead still ' +
        'has buffer for the upcoming hand-over windows.',
    );
  }

  return paragraphs;
}

/**
 * Pull the FIDIC clause that the rule engine surfaces for a given rule code.
 * Falls back to a generic label when the mapping is not known to this
 * planner-side table. This is the human-friendly summary; the canonical
 * mapping lives in the governance policy.
 */
function fidicForRule(code: string): string {
  const map: Record<string, string> = {
    SCHEDULE_FINISH_SLIPPED: 'Sub-Clause 8.4 (EoT)',
    SCHEDULE_START_SLIPPED: 'Sub-Clause 8.4 (EoT)',
    DURATION_OVERRUN: 'Sub-Clause 8.4 (EoT)',
    COST_OVERRUN: 'Sub-Clause 13.3 (Variation)',
    RESOURCE_UNDERUSE: 'Sub-Clause 4.3 (Contractor’s Representative)',
    RESOURCE_OVERUSE: 'Sub-Clause 4.3 (Contractor’s Representative)',
    MILESTONE_MISSED: 'Sub-Clause 8.7 (Programme of Recovery)',
    QUALITY_FAILED: 'Sub-Clause 7.5 (Rejection)',
    SAFETY_INCIDENT: 'Sub-Clause 4.8 (Safety procedures)',
    BASELINE_DURATION_OUTLIER: 'Sub-Clause 8.3 (Programme)',
    CLASH_DETECTED: 'Sub-Clause 1.10 (Employer’s use of Contractor’s Documents)',
  };
  return map[code] ?? '— (no FIDIC mapping)';
}

/** Implication line printed next to a decision-level row. */
function decisionLevelImplication(level: string): string {
  switch (level) {
    case 'L1':
      return 'Escalated to Sigma governance layer; formal action required by the Employer’s Representative.';
    case 'L2':
      return 'Managed at project-director level; weekly progress required until closed.';
    case 'L3':
      return 'Informational; logged for the audit trail, no immediate action.';
    default:
      return '— ';
  }
}

/** Three short paragraphs of practitioner commentary about the decisions. */
function composeDecisionsCommentary(
  decisionCount: number,
  byLevelRaw: Record<string, unknown>,
): string[] {
  const lv1 = num(byLevelRaw.L1) ?? 0;
  const lv2 = num(byLevelRaw.L2) ?? 0;
  const lv3 = num(byLevelRaw.L3) ?? 0;
  const out: string[] = [];

  if (decisionCount === 0) {
    out.push(
      'No formal governance decisions were issued in this window. For an active construction project this is ' +
        'unusual and worth a sanity check: either the period was genuinely quiet (acceptable for a routine ' +
        'maintenance phase) or the rule engine is not seeing the underlying conditions because data is missing.',
    );
    return out;
  }

  if (lv1 > 0) {
    out.push(
      `${lv1} decision(s) escalated to L1 in this window. L1 decisions ride above the project ` +
        'director and bind the Employer’s Representative. Review each L1 entry against its underlying ' +
        'alert and confirm the responsible-party assignment matches the contractual hierarchy — ' +
        'mis-assigned L1 decisions are the most common cause of governance bottlenecks downstream.',
    );
  }
  if (lv2 > 0) {
    out.push(
      `${lv2} decision(s) at L2 — these are the project-director’s call but require weekly progress ` +
        'until closed. Standard cadence is to clear at least half of the L2 register in the following ' +
        'reporting window; a backlog accumulation here is an early warning that escalation discipline ' +
        'is slipping.',
    );
  }
  if (lv3 > 0) {
    out.push(
      `${lv3} decision(s) at L3 (informational). These do not bind action but they do bind the audit ` +
        'trail. Verify that each L3 row has a clean rationale field; over time, a high L3 count is what ' +
        'lets a senior planner reconstruct the period without reading every alert.',
    );
  }
  return out;
}

/**
 * Derive a top-3 risk register from the alert + decision pattern. This is a
 * deliberately simple ranking: a rule code firing many times this period is
 * treated as a structural risk, weighted up by severity.
 */
function deriveRiskRegister(input: MonthlyReportPdfInput): Array<{
  title: string;
  rationale: string;
  impact: 'HIGH' | 'MED' | 'LOW';
  likelihood: 'HIGH' | 'MED' | 'LOW';
}> {
  const full = input.fullMetrics ?? {};
  const byCode = (full.alertsByCode ?? {}) as Record<string, unknown>;
  const critical = num(full.criticalAlertCount) ?? 0;
  const warning = num(full.warningAlertCount) ?? 0;
  const entries = Object.entries(byCode)
    .map(([code, v]) => ({ code, count: num(v) ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const risks: Array<{ title: string; rationale: string; impact: 'HIGH' | 'MED' | 'LOW'; likelihood: 'HIGH' | 'MED' | 'LOW' }> = [];

  for (const e of entries.slice(0, 5)) {
    const impact: 'HIGH' | 'MED' | 'LOW' = e.code.startsWith('SAFETY')
      ? 'HIGH'
      : e.code.startsWith('SCHEDULE') || e.code.startsWith('MILESTONE') || e.code.startsWith('COST')
        ? 'HIGH'
        : 'MED';
    const likelihood: 'HIGH' | 'MED' | 'LOW' = e.count >= 5 ? 'HIGH' : e.count >= 2 ? 'MED' : 'LOW';
    risks.push({
      title: humaniseRuleCode(e.code),
      rationale: `Rule ${e.code} fired ${e.count} time(s) in the reporting window. ${riskNarrativeFor(e.code)}`,
      impact,
      likelihood,
    });
  }

  // If nothing surfaced from the by-code table but there are alerts, generic entry.
  if (risks.length === 0 && (critical > 0 || warning > 0)) {
    risks.push({
      title: 'Open alerts present without rule-code attribution',
      rationale: `${critical + warning} alert(s) are open but no rule-code breakdown is available. ` +
        'Data hygiene action: confirm the rule engine is stamping each alert with its source rule code so the next report can localise the risk.',
      impact: 'MED',
      likelihood: 'MED',
    });
  }

  return risks;
}

function humaniseRuleCode(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function riskNarrativeFor(code: string): string {
  if (code.startsWith('SCHEDULE')) return 'Repeated schedule slippage indicates a structural pacing issue rather than isolated activity drift.';
  if (code.startsWith('COST')) return 'Repeated cost overruns suggest a missed risk in the original estimate; spot-check the unit-rate basis.';
  if (code.startsWith('DURATION')) return 'Repeated duration overruns commonly indicate optimistic baselining; consider an AACE 25R-03 review.';
  if (code.startsWith('RESOURCE')) return 'Resource imbalance over several alerts suggests the crew loading on the schedule does not match site reality.';
  if (code.startsWith('MILESTONE')) return 'Missed milestones bind the contractual EoT entitlement clock; address before the next pay application.';
  if (code.startsWith('CLASH')) return 'Repeated clash detections indicate the design coordination process needs an explicit pre-issue review gate.';
  return 'Repeated occurrence of this rule code is itself the signal — investigate the underlying activity / cost / resource pattern.';
}

/**
 * Derive concrete engineer-style recommendations from the metrics. Each
 * recommendation has an action title, a one-line rationale, an owner, and a
 * by-when. Owners are role-named so the report can be issued without knowing
 * the current organisation chart.
 */
function deriveRecommendations(input: MonthlyReportPdfInput): Array<{
  title: string;
  rationale: string;
  owner: string;
  by: string;
}> {
  const full = input.fullMetrics ?? {};
  const recs: Array<{ title: string; rationale: string; owner: string; by: string }> = [];

  const planned = num(full.plannedAverage);
  const actual = num(full.actualAverage);
  const delta = num(full.scheduleDeltaPp);
  const critical = num(full.criticalAlertCount) ?? 0;
  const warning = num(full.warningAlertCount) ?? 0;
  const activityCount = num(full.activityCount) ?? 0;
  const decisionCount = num(full.decisionCount) ?? 0;
  const boqTotal = (full.boqTotalAmount as string | null) ?? null;

  if (activityCount === 0) {
    recs.push({
      title: 'Ingest the Primavera P6 schedule',
      rationale: 'No canonical activities are present — every downstream metric reads as n/a until the schedule is imported.',
      owner: 'Planning Engineer',
      by: 'Within 5 working days',
    });
  }

  if (delta !== null && delta < -5) {
    recs.push({
      title: 'Issue Programme of Recovery request',
      rationale: `Variance ${delta.toFixed(1)}pp exceeds the recoverable band; formal recovery is now required under FIDIC Sub-Clause 8.7.`,
      owner: 'Engineer / Employer’s Rep.',
      by: 'Within 10 working days',
    });
  } else if (delta !== null && delta < -2) {
    recs.push({
      title: 'Request 4-week catch-up plan from contractor',
      rationale: `Variance ${delta.toFixed(1)}pp is inside the recoverable band but warrants a written catch-up plan from the responsible foreman.`,
      owner: 'Project Director',
      by: 'Within 10 working days',
    });
  }

  if (critical > 0) {
    recs.push({
      title: 'Close all open Critical alerts in §03 inventory',
      rationale: `${critical} critical alert(s) are open. Each one must be either closed or escalated to a governance decision before the next reporting cycle.`,
      owner: 'Project Director',
      by: 'Before next reporting cycle',
    });
  }

  if (warning >= 4) {
    recs.push({
      title: 'Convene weekly warning-review meeting',
      rationale: `${warning} warning-level alerts are open. The recommended threshold for triggering a recurring weekly review is 4.`,
      owner: 'Planning Engineer + PD',
      by: 'Start next week',
    });
  }

  if (decisionCount === 0 && (critical > 0 || warning > 2)) {
    recs.push({
      title: 'Audit the governance escalation pipeline',
      rationale: 'Alerts are firing but no governance decisions have been issued in the window — the escalation chain may be missing an owner or threshold.',
      owner: 'Sigma Governance Layer',
      by: 'Within 7 working days',
    });
  }

  if (!boqTotal) {
    recs.push({
      title: 'Ingest the contract Bill of Quantities',
      rationale: 'No BoQ row is on file. Financial sections of this report cannot make quantitative claims until the BoQ is ingested.',
      owner: 'Quantity Surveyor',
      by: 'Within 10 working days',
    });
  }

  if (planned !== null && actual !== null && Math.abs(delta ?? 0) <= 2 && critical === 0) {
    recs.push({
      title: 'Maintain current cadence; refresh look-ahead',
      rationale: 'No corrective action required; routine surveillance continues. Reissue the 4-week look-ahead each Monday.',
      owner: 'Planning Engineer',
      by: 'Ongoing',
    });
  }

  return recs;
}
