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
    doc.setTitle(`Sigma PMO Report — ${input.projectName} (${input.month}) — ${input.audience.toUpperCase()}`);
    doc.setAuthor('Sigma PMO');
    doc.setSubject(`Periodic narrative — ${input.audience}`);
    doc.setCreator('Sigma PMO');
    doc.setProducer('pdf-lib');

    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvObl = await doc.embedFont(StandardFonts.HelveticaOblique);

    this.drawCoverPage(doc, helv, helvBold, helvObl, input);
    this.drawNarrativePages(doc, helv, helvBold, input);
    this.drawCitationsPage(doc, helv, helvBold, input);

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
      `Persona ${input.personaSlug} v${input.personaVersion} · narrative source: ${input.narrativeSource}`,
      { x: 56, y: y - 40, font: helv, size: 9, color: this.inkMid },
    );
    page.drawText(
      `Citations attached: ${input.citations.length} · ${input.citations.length === 0 ? 'deterministic facts only' : 'sourced from curated registry'}`,
      { x: 56, y: y - 55, font: helv, size: 9, color: this.inkMid },
    );

    // Footer band.
    page.drawRectangle({ x: 0, y: 0, width, height: 30, color: this.canvas });
    page.drawRectangle({ x: 0, y: 30, width, height: 0.6, color: this.cardBorder });
    page.drawText(`Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, {
      x: 40, y: 12, font: helv, size: 8, color: this.inkSoft,
    });
    page.drawText('DRAFT — pending human approval (post-meeting plan §3.6)', {
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
      `Persona ${input.personaSlug} v${input.personaVersion} · narrative source: ${input.narrativeSource}`,
      { x: 40, y: 42, font: helv, size: 8, color: this.inkMid },
    );
    page.drawText('DRAFT — not for distribution until a human approves (post-meeting plan §3.6).', {
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
