import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { Letter } from './letter.entity';

/** Page geometry — A4 portrait, 595 x 842 pt. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;

/** Two columns of usable width per A4 page. */
const COLUMN_GAP = 18;

/**
 * `LetterPdfService` — Wave 2 PDF stub for the approved FIDIC letter.
 *
 * Stub contract:
 *  - Renders a single-page letterhead with the project key, subject,
 *    Sub-Clause reference, deadline, citations footer, and a side-by-side
 *    Arabic (right column, RTL hint) + English (left column, LTR) body.
 *  - Uses the bundled `Helvetica` / `Helvetica-Bold` Standard fonts so the
 *    module never reaches out to a font file at runtime. Arabic text is
 *    embedded as Unicode codepoints — `Helvetica` does NOT render Arabic
 *    glyphs (the result will show .notdef boxes for Arabic letters). This
 *    is **deliberate for Wave 2**: ADR-0011 forbids new external assets
 *    until the Computer Use review lands; Wave 3 will swap in a Tajawal
 *    subset (already on the frontend per the latest commit) once the asset
 *    provenance review is signed off.
 *  - Returns the encoded `Buffer` — caller (the controller) sets headers.
 *
 * What it does NOT do:
 *  - Embed external fonts.
 *  - Reshape Arabic glyphs (the visual order will look wrong for Arabic).
 *  - Auto-paginate. Bodies are truncated to the column extent. Wave 3 adds
 *    real text flow + page breaks.
 *  - Sign the PDF (digital signatures land with the Sigma signature
 *    appliance, gated alongside Computer Use).
 *
 * The stub is enough to verify the approval-gate end-to-end: a reviewer
 * approves → PDF downloads → contains the expected metadata + citation
 * footer for audit.
 */
@Injectable()
export class LetterPdfService {
  private readonly logger = new Logger(LetterPdfService.name);

  /**
   * Render `letter` to PDF bytes. Always returns a non-empty `Buffer` — even
   * if the bodies are empty we emit the letterhead + citation footer so the
   * artefact is never zero-byte.
   */
  async render(letter: Letter): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(letter.subject || `Letter ${letter.id}`);
    doc.setAuthor('Sigma PMO');
    doc.setProducer('Sigma PMO LetterPdfService (Wave 2 stub)');
    doc.setCreator('Sigma PMO LetterPdfService');
    doc.setCreationDate(new Date());

    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    this.drawLetterhead(page, fontBold, fontRegular, letter);
    this.drawBilingualBody(page, fontRegular, letter);
    this.drawCitationFooter(page, fontRegular, fontBold, letter);

    const bytes = await doc.save();
    this.logger.debug(
      `Rendered letter ${letter.id} → ${bytes.byteLength} bytes (subject="${letter.subject}")`,
    );
    return Buffer.from(bytes);
  }

  // ───────────────────────── internals ─────────────────────────

  private drawLetterhead(
    page: PDFPage,
    bold: PDFFont,
    regular: PDFFont,
    letter: Letter,
  ): void {
    let y = A4_HEIGHT - MARGIN;
    page.drawText('SIGMA PMO  |  Governance Letter', {
      x: MARGIN,
      y,
      size: 16,
      font: bold,
      color: rgb(0.15, 0.15, 0.2),
    });
    y -= 22;
    page.drawText(`Project: ${letter.projectBusinessKey}`, {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
    });
    y -= 14;
    page.drawText(`Status: ${letter.status.toUpperCase()}`, {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
    });
    y -= 14;
    if (letter.fidicClauseRef) {
      page.drawText(`FIDIC Sub-Clause: ${letter.fidicClauseRef}`, {
        x: MARGIN,
        y,
        size: 11,
        font: regular,
      });
      y -= 14;
    }
    if (letter.deadlineDays != null) {
      page.drawText(`Response deadline: ${letter.deadlineDays} day(s)`, {
        x: MARGIN,
        y,
        size: 11,
        font: regular,
      });
    } else {
      page.drawText('Response deadline: TBD pending data', {
        x: MARGIN,
        y,
        size: 11,
        font: regular,
      });
    }
    y -= 22;
    page.drawText(`Subject — ${letter.subject || 'Draft Reply'}`, {
      x: MARGIN,
      y,
      size: 13,
      font: bold,
    });

    // Horizontal rule below the letterhead.
    page.drawLine({
      start: { x: MARGIN, y: y - 10 },
      end: { x: A4_WIDTH - MARGIN, y: y - 10 },
      thickness: 0.8,
      color: rgb(0.6, 0.6, 0.65),
    });
  }

  /**
   * Two-column body: English (LTR, left) + Arabic (RTL hint, right). Arabic
   * is right-aligned by drawing each line offset by its measured width —
   * pdf-lib does not provide a built-in alignment mode.
   */
  private drawBilingualBody(page: PDFPage, regular: PDFFont, letter: Letter): void {
    const top = A4_HEIGHT - MARGIN - 130;
    const bottom = MARGIN + 80; // leave 80pt for the citation footer
    const innerWidth = (A4_WIDTH - 2 * MARGIN - COLUMN_GAP) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + innerWidth + COLUMN_GAP;

    // English column header.
    page.drawText('English (mirror)', {
      x: leftX,
      y: top,
      size: 10,
      font: regular,
      color: rgb(0.35, 0.35, 0.4),
    });
    // Arabic column header — right-aligned within its column.
    const arabicHeader = '(النص الرسمي) العربية';
    const arabicHeaderWidth = regular.widthOfTextAtSize(arabicHeader, 10);
    page.drawText(arabicHeader, {
      x: rightX + innerWidth - arabicHeaderWidth,
      y: top,
      size: 10,
      font: regular,
      color: rgb(0.35, 0.35, 0.4),
    });

    this.drawWrappedColumn(
      page,
      regular,
      letter.bodyEn,
      leftX,
      top - 18,
      bottom,
      innerWidth,
      11,
      'left',
    );
    this.drawWrappedColumn(
      page,
      regular,
      letter.bodyAr,
      rightX,
      top - 18,
      bottom,
      innerWidth,
      11,
      'right',
    );
  }

  /**
   * Word-wrap a block of text inside a column. Truncates at the bottom of
   * the column rather than paginating (Wave 2 stub). `align` controls the
   * x-offset per line so the Arabic column can be right-aligned.
   */
  private drawWrappedColumn(
    page: PDFPage,
    font: PDFFont,
    text: string,
    x: number,
    yTop: number,
    yBottom: number,
    width: number,
    size: number,
    align: 'left' | 'right',
  ): void {
    if (!text) return;
    const lineHeight = size * 1.35;
    let y = yTop;
    for (const paragraph of text.split(/\r?\n/)) {
      const lines = this.wrapLine(paragraph, font, size, width);
      for (const line of lines) {
        if (y < yBottom) return; // truncate
        const lineWidth = font.widthOfTextAtSize(line, size);
        const drawX = align === 'right' ? x + (width - lineWidth) : x;
        page.drawText(line, { x: drawX, y, size, font });
        y -= lineHeight;
      }
      // Paragraph spacer.
      y -= lineHeight * 0.3;
    }
  }

  /** Greedy word wrap — split on whitespace, keep adding until width exceeds. */
  private wrapLine(line: string, font: PDFFont, size: number, width: number): string[] {
    if (!line.trim()) return [''];
    const words = line.split(/\s+/);
    const out: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    return out;
  }

  /**
   * Mandatory citation footer (post-meeting plan §3.3 rule 5). Lists every
   * `Source.externalId` the persona cited so an Engineer reading the PDF can
   * trace each claim back to the curated reference.
   */
  private drawCitationFooter(
    page: PDFPage,
    regular: PDFFont,
    bold: PDFFont,
    letter: Letter,
  ): void {
    const y = MARGIN + 40;
    page.drawLine({
      start: { x: MARGIN, y: y + 22 },
      end: { x: A4_WIDTH - MARGIN, y: y + 22 },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.65),
    });
    page.drawText('Citations', {
      x: MARGIN,
      y: y + 8,
      size: 10,
      font: bold,
      color: rgb(0.35, 0.35, 0.4),
    });
    const list =
      letter.citations && letter.citations.length > 0
        ? letter.citations.join(', ')
        : '(no citations on file — letter should not have been persisted)';
    page.drawText(list, {
      x: MARGIN,
      y: y - 8,
      size: 9,
      font: regular,
    });
    page.drawText(
      `Generated ${new Date().toISOString()}  |  Letter id: ${letter.id}`,
      {
        x: MARGIN,
        y: y - 24,
        size: 8,
        font: regular,
        color: rgb(0.4, 0.4, 0.45),
      },
    );
  }
}
