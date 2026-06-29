import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { ClashItem } from '../canonical/entities';
import { ClashDetail } from './clash-ingestion.service';

/** Page geometry — A4 portrait, 595 x 842 pt (mirrors `LetterPdfService`). */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;

/** Label column width — values flow to the right of this offset. */
const LABEL_WIDTH = 170;
const LINE_HEIGHT = 16;

/**
 * `ClashPdfService` — renders one clash-detail (Req R4, Mr. Ayham acceptance:
 * "تقرير Clash Detail واضح" + "إمكانية تصدير PDF") to an A4 PDF.
 *
 * The PDF is the printable twin of the `/clashes/[id]` detail surface: every
 * acceptance field is laid out as a labelled row under sectioned headings so a
 * reviewer can trace a clash on paper without opening the app —
 *
 *  - **Identification**: clashRef, model A id, model B id, disciplines, severity.
 *  - **Geometry**: element GUID A / B, world X/Y/Z, grid location, penetration mm.
 *  - **Schedule & responsibility**: linked CPM/P6 activity key(s), responsible party.
 *  - **Impact**: time + cost impact taken from the chosen option (or, when no
 *    option is decided yet, from the first proposed option) — cost numbers are
 *    BoQ-sourced per the `revit-clash-analyst` rule, so a `null` AED line is
 *    rendered as "— (not in BoQ)" rather than inventing a number.
 *  - **Evidence**: snapshot image path + Autodesk Viewer URN (the "viewer half").
 *  - **Decision audit**: decidedBy / decidedAt when the clash has been resolved.
 *
 * Like `LetterPdfService` we use the bundled `Helvetica` Standard fonts so the
 * module never reaches out to a font file at runtime (ADR-0011 forbids new
 * external assets until the Computer Use review lands). Labels are English —
 * the on-screen detail view carries the Arabic mirror.
 *
 * The service is deterministic + side-effect free (it neither reads the DB nor
 * the storage layer), which keeps it cheap to unit-test: feed it a populated
 * `ClashDetail`, assert the returned `Buffer` is a non-empty `%PDF`.
 */
@Injectable()
export class ClashPdfService {
  private readonly logger = new Logger(ClashPdfService.name);

  /**
   * Render `detail` to PDF bytes. Always returns a non-empty `Buffer` — even a
   * clash with every optional column null still emits the section scaffold so
   * the artefact is never zero-byte.
   */
  async render(detail: ClashDetail): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Clash ${detail.clashRef}`);
    doc.setAuthor('Sigma PMO');
    doc.setProducer('Sigma PMO ClashPdfService');
    doc.setCreator('Sigma PMO ClashPdfService');
    doc.setCreationDate(new Date());

    const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const ctx: RenderCtx = { page, bold: fontBold, regular: fontRegular, y: A4_HEIGHT - MARGIN };

    this.drawHeader(ctx, detail);
    this.drawIdentification(ctx, detail);
    this.drawGeometry(ctx, detail);
    this.drawSchedule(ctx, detail);
    this.drawImpact(ctx, detail);
    this.drawEvidence(ctx, detail);
    this.drawDecisionAudit(ctx, detail);
    this.drawFooter(ctx.page, fontRegular, detail);

    const bytes = await doc.save();
    this.logger.debug(
      `Rendered clash ${detail.id} (${detail.clashRef}) → ${bytes.byteLength} bytes`,
    );
    return Buffer.from(bytes);
  }

  // ───────────────────────── sections ─────────────────────────

  private drawHeader(ctx: RenderCtx, d: ClashDetail): void {
    ctx.page.drawText('SIGMA PMO  |  Clash Detail Report', {
      x: MARGIN,
      y: ctx.y,
      size: 16,
      font: ctx.bold,
      color: rgb(0.15, 0.15, 0.2),
    });
    ctx.y -= 22;
    ctx.page.drawText(`Clash ${d.clashRef}`, {
      x: MARGIN,
      y: ctx.y,
      size: 13,
      font: ctx.bold,
      color: rgb(0.2, 0.2, 0.25),
    });
    ctx.y -= 16;
    ctx.page.drawText(`Project: ${d.projectBusinessKey}`, {
      x: MARGIN,
      y: ctx.y,
      size: 10,
      font: ctx.regular,
      color: rgb(0.35, 0.35, 0.4),
    });
    ctx.y -= 8;
    this.rule(ctx);
  }

  private drawIdentification(ctx: RenderCtx, d: ClashDetail): void {
    const vs = (d.viewState ?? {}) as { modelAId?: unknown; modelBId?: unknown };
    const modelA = d.detail.modelA ?? str(vs.modelAId);
    const modelB = d.detail.modelB ?? str(vs.modelBId);
    this.sectionTitle(ctx, 'Identification');
    this.row(ctx, 'Clash reference', d.clashRef);
    this.row(ctx, 'Model A', modelA ?? '—');
    this.row(ctx, 'Model B', modelB ?? '—');
    this.row(ctx, 'Disciplines', d.detail.disciplinesInvolved.join(', ') || '—');
    this.row(ctx, 'Severity', d.detail.severity ?? '—');
    this.row(ctx, 'Description', d.description ?? '—');
  }

  private drawGeometry(ctx: RenderCtx, d: ClashDetail): void {
    this.sectionTitle(ctx, 'Geometry');
    this.row(ctx, 'Element GUID A', d.detail.elementGuidA ?? '—');
    this.row(ctx, 'Element GUID B', d.detail.elementGuidB ?? '—');
    const loc = d.detail.location;
    this.row(ctx, 'Location X', loc ? num(loc.x) : '—');
    this.row(ctx, 'Location Y', loc ? num(loc.y) : '—');
    this.row(ctx, 'Location Z', loc ? num(loc.z) : '—');
    this.row(ctx, 'Grid location', d.detail.gridLocation ?? '—');
    this.row(
      ctx,
      'Penetration / distance',
      d.detail.penetrationMm != null ? `${num(d.detail.penetrationMm)} mm` : '—',
    );
  }

  private drawSchedule(ctx: RenderCtx, d: ClashDetail): void {
    this.sectionTitle(ctx, 'Schedule & responsibility');
    this.row(
      ctx,
      'Linked activity (CPM/P6)',
      d.detail.linkedActivityKeys.length > 0 ? d.detail.linkedActivityKeys.join(', ') : '—',
    );
    this.row(ctx, 'Responsible party', d.detail.responsibleParty ?? '—');
  }

  private drawImpact(ctx: RenderCtx, d: ClashDetail): void {
    this.sectionTitle(ctx, 'Impact');
    const opt = chosenOrFirstOption(d);
    if (!opt) {
      this.row(ctx, 'Resolution option', '— (no options proposed yet)');
      this.row(ctx, 'Time impact', '—');
      this.row(ctx, 'Cost impact', '—');
      return;
    }
    const chosen = d.chosenOptionIndex != null;
    this.row(ctx, 'Resolution option', `${opt.label}${chosen ? ' (chosen)' : ' (proposed)'}`);
    this.row(ctx, 'Time impact', `${opt.timeImpactDays >= 0 ? '+' : ''}${opt.timeImpactDays} day(s)`);
    this.row(
      ctx,
      'Cost impact',
      opt.costImpactAED == null ? '— (not in BoQ)' : `AED ${opt.costImpactAED.toLocaleString()}`,
    );
    if (opt.scopeImpact) this.row(ctx, 'Scope impact', opt.scopeImpact);
  }

  private drawEvidence(ctx: RenderCtx, d: ClashDetail): void {
    this.sectionTitle(ctx, 'Evidence');
    this.row(ctx, 'Snapshot image', d.detail.snapshotImagePath ?? '—');
    this.row(ctx, 'Viewer URN', d.detail.viewUrn ?? '—');
  }

  private drawDecisionAudit(ctx: RenderCtx, d: ClashDetail): void {
    this.sectionTitle(ctx, 'Decision audit');
    this.row(ctx, 'Decided by', d.decidedBy ?? '— (not decided)');
    this.row(ctx, 'Decided at', d.decidedAt ? new Date(d.decidedAt).toISOString() : '—');
  }

  private drawFooter(page: PDFPage, regular: PDFFont, d: ClashDetail): void {
    const y = MARGIN;
    page.drawLine({
      start: { x: MARGIN, y: y + 16 },
      end: { x: A4_WIDTH - MARGIN, y: y + 16 },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.65),
    });
    page.drawText(`Generated ${new Date().toISOString()}  |  Clash id: ${d.id}`, {
      x: MARGIN,
      y,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.4, 0.45),
    });
  }

  // ───────────────────────── primitives ─────────────────────────

  /** Section heading + underline; advances the cursor below it. */
  private sectionTitle(ctx: RenderCtx, title: string): void {
    ctx.y -= 14;
    ctx.page.drawText(title, {
      x: MARGIN,
      y: ctx.y,
      size: 11,
      font: ctx.bold,
      color: rgb(0.2, 0.3, 0.5),
    });
    ctx.y -= 4;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: A4_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.4,
      color: rgb(0.75, 0.78, 0.85),
    });
    ctx.y -= LINE_HEIGHT;
  }

  /**
   * One labelled detail row: bold label in the left column, value to the
   * right. Long values wrap onto continuation lines aligned with the value
   * column so the GUIDs / descriptions never run off the page edge.
   */
  private row(ctx: RenderCtx, label: string, value: string): void {
    ctx.page.drawText(`${label}:`, {
      x: MARGIN,
      y: ctx.y,
      size: 9,
      font: ctx.bold,
      color: rgb(0.35, 0.35, 0.4),
    });
    const valueX = MARGIN + LABEL_WIDTH;
    const valueWidth = A4_WIDTH - MARGIN - valueX;
    const lines = wrap(value, ctx.regular, 9, valueWidth);
    for (const line of lines) {
      ctx.page.drawText(line, { x: valueX, y: ctx.y, size: 9, font: ctx.regular });
      ctx.y -= LINE_HEIGHT;
    }
  }

  private rule(ctx: RenderCtx): void {
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: A4_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.8,
      color: rgb(0.6, 0.6, 0.65),
    });
    ctx.y -= 6;
  }
}

/** Mutable render cursor threaded through the section drawers. */
interface RenderCtx {
  page: PDFPage;
  bold: PDFFont;
  regular: PDFFont;
  y: number;
}

/** One element of `ClashItem.proposedOptions` (the persisted option shape). */
type ClashOption = NonNullable<ClashItem['proposedOptions']>[number];

/**
 * The option that drives the Impact section: the chosen one when decided,
 * otherwise the first proposed option so a still-open clash still shows the
 * persona's leading recommendation. Returns `undefined` when nothing is
 * proposed yet.
 */
function chosenOrFirstOption(d: ClashItem): ClashOption | undefined {
  const options = d.proposedOptions ?? [];
  if (d.chosenOptionIndex != null && options[d.chosenOptionIndex]) {
    return options[d.chosenOptionIndex];
  }
  return options[0];
}

/** Render a number compactly (trim trailing zeros from doubles). */
function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** Coerce an opaque viewState value to a printable string (or null). */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Greedy word-wrap (same algorithm as `LetterPdfService.wrapLine`). */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  if (!text) return ['—'];
  const words = String(text).split(/\s+/);
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
  return out.length > 0 ? out : ['—'];
}
