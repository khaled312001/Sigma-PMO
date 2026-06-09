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
  /** Calendar month, `YYYY-MM`. */
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
    doc.setTitle(`Monthly Report — ${input.projectName} (${input.month}) — ${input.audience.toUpperCase()}`);
    doc.setAuthor('Sigma PMO');
    doc.setSubject(`Monthly narrative — ${input.audience}`);
    doc.setCreator('Sigma PMO Wave 2');
    doc.setProducer('pdf-lib');

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

    this.drawCoverPage(doc, helv, helvBold, input);
    this.drawNarrativePages(doc, helv, helvBold, input);
    this.drawCitationsPage(doc, helv, helvBold, input);

    const bytes = await doc.save();
    const relativePath = join('monthly-reports', input.month, `${reportId}.pdf`);
    const absolutePath = join(this.storageDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    this.logger.log(`Rendered monthly PDF ${reportId} → ${relativePath} (${bytes.byteLength} bytes)`);
    return { storedPath: relativePath, byteSize: bytes.byteLength };
  }

  /** Absolute path on disk for a previously-rendered report. */
  resolveAbsolutePath(relativePath: string): string {
    return resolve(this.storageDir, relativePath);
  }

  // ───────────────────────── internals ─────────────────────────

  private drawCoverPage(
    doc: PDFDocument,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
  ): void {
    const page = doc.addPage([595, 842]); // A4 portrait, points.
    const { width, height } = page.getSize();

    // Title band
    page.drawRectangle({
      x: 0,
      y: height - 110,
      width,
      height: 110,
      color: rgb(0.15, 0.15, 0.2),
    });
    page.drawText('SIGMA PMO', {
      x: 40,
      y: height - 50,
      font: helvBold,
      size: 14,
      color: rgb(1, 1, 1),
    });
    page.drawText('Monthly Narrative Report', {
      x: 40,
      y: height - 85,
      font: helvBold,
      size: 22,
      color: rgb(1, 1, 1),
    });

    // Project + month + audience block
    let y = height - 160;
    const drawLabelValue = (label: string, value: string): void => {
      page.drawText(label, { x: 40, y, font: helvBold, size: 10, color: rgb(0.35, 0.35, 0.4) });
      page.drawText(value, { x: 200, y, font: helv, size: 11, color: rgb(0.05, 0.05, 0.1) });
      y -= 20;
    };
    drawLabelValue('Project', this.safeAscii(input.projectName));
    drawLabelValue('Project key', input.projectBusinessKey);
    drawLabelValue('Reporting month', input.month);
    drawLabelValue('Audience', input.audience.toUpperCase());
    drawLabelValue('Narrative source', input.narrativeSource);
    drawLabelValue('Persona', `${input.personaSlug} v${input.personaVersion}`);

    // Key figures box
    y -= 20;
    page.drawText('Key figures', { x: 40, y, font: helvBold, size: 13, color: rgb(0.1, 0.1, 0.15) });
    y -= 24;
    const m = input.metricsSummary;
    const figures: Array<[string, string]> = [
      ['Activities tracked', `${m.activityCount}`],
      ['Alerts (total)', `${m.alertCount}`],
      ['Critical alerts', `${m.criticalAlertCount}`],
      ['Warning alerts', `${m.warningAlertCount}`],
      ['Data confidence', `${(m.confidenceAverage * 100).toFixed(1)}%`],
      ['Schedule delta (actual − planned)', m.scheduleDeltaPp === null ? 'n/a' : `${m.scheduleDeltaPp.toFixed(1)} pp`],
      ['BoQ total', m.boqTotalDisplay ?? 'n/a'],
    ];
    for (const [label, value] of figures) {
      page.drawText(label, { x: 60, y, font: helv, size: 10, color: rgb(0.2, 0.2, 0.25) });
      page.drawText(value, { x: 360, y, font: helvBold, size: 10, color: rgb(0.05, 0.05, 0.1) });
      y -= 16;
    }

    // Generation timestamp footer
    page.drawText(
      `Generated ${new Date().toISOString()} — Sigma PMO Wave 2`,
      { x: 40, y: 30, font: helv, size: 8, color: rgb(0.4, 0.4, 0.45) },
    );
  }

  private drawNarrativePages(
    doc: PDFDocument,
    helv: import('pdf-lib').PDFFont,
    helvBold: import('pdf-lib').PDFFont,
    input: MonthlyReportPdfInput,
  ): void {
    const lines = this.wrapNarrative(input.narrative, helv, 11, 515);
    const pageHeight = 842;
    const topMargin = 60;
    const bottomMargin = 60;
    const lineHeight = 16;
    const linesPerPage = Math.floor((pageHeight - topMargin - bottomMargin) / lineHeight);

    let cursor = 0;
    let pageNumber = 1;
    while (cursor < lines.length) {
      const page = doc.addPage([595, 842]);
      page.drawText(`Monthly Narrative — ${input.audience.toUpperCase()} — p.${pageNumber}`, {
        x: 40,
        y: pageHeight - 35,
        font: helvBold,
        size: 9,
        color: rgb(0.35, 0.35, 0.4),
      });
      let y = pageHeight - topMargin;
      const sliceEnd = Math.min(cursor + linesPerPage, lines.length);
      for (let i = cursor; i < sliceEnd; i += 1) {
        const line = lines[i];
        const isHeading = line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ');
        const text = isHeading ? line.replace(/^#+\s*/, '') : line;
        page.drawText(this.safeAscii(text), {
          x: 40,
          y,
          font: isHeading ? helvBold : helv,
          size: isHeading ? 12 : 11,
          color: rgb(0.05, 0.05, 0.1),
        });
        y -= lineHeight;
      }
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
    const page = doc.addPage([595, 842]);
    const { height } = page.getSize();
    page.drawText('Sources cited', {
      x: 40,
      y: height - 60,
      font: helvBold,
      size: 16,
      color: rgb(0.05, 0.05, 0.1),
    });
    page.drawText(
      'Every professional claim in this report is grounded in one of the Sigma PMO curated sources below.',
      { x: 40, y: height - 90, font: helv, size: 10, color: rgb(0.3, 0.3, 0.35) },
    );

    let y = height - 130;
    if (input.citations.length === 0) {
      page.drawText('(deterministic narrative — no external sources cited)', {
        x: 40,
        y,
        font: helv,
        size: 10,
        color: rgb(0.5, 0.2, 0.2),
      });
    } else {
      for (const id of input.citations) {
        page.drawText(`• [SOURCE: ${id}]`, { x: 60, y, font: helv, size: 11, color: rgb(0.05, 0.05, 0.1) });
        y -= 18;
      }
    }

    page.drawText(
      `Persona ${input.personaSlug} v${input.personaVersion} — narrative source: ${input.narrativeSource}`,
      { x: 40, y: 50, font: helv, size: 8, color: rgb(0.4, 0.4, 0.45) },
    );
    page.drawText(
      'DRAFT — not for distribution until a human approves (post-meeting plan §3.6).',
      { x: 40, y: 35, font: helvBold, size: 8, color: rgb(0.6, 0.1, 0.1) },
    );
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
    let out = '';
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x100) {
        out += ch;
      } else {
        out += '?';
      }
    }
    return out;
  }
}
