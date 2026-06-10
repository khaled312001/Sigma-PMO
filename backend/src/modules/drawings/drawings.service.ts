import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceType } from '../../common/enums';
import { DrawingPackage, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';

/**
 * DrawingsService — phase-1 drawings ingestion (correction-plan §2.7).
 *
 * Accepts PDF drawing sets, archives the bytes immutably (SHA-256), and
 * extracts the lightweight features the drawing-driven baseline generator
 * needs:
 *
 *  - page count
 *  - sheet titles (best-effort from the text layer)
 *  - floor hints — regex over "FLOOR / LEVEL / طابق / دور" markers
 *  - discipline hints — ARCH / STR / MEP / ELE / PLB keyword scan
 *  - a bounded text excerpt the planner persona can ground on
 *
 * Honesty contract: PDF extraction is lossy. The summary records what WAS
 * detected, never invents what wasn't — when the text layer is empty
 * (scanned drawings) the summary says so and the baseline generator falls
 * back to asking the persona for the generic template flow.
 *
 * IFC (structured, phase 2) and DWG/RVT (phase 3, needs licensed tooling)
 * extend the same DrawingPackage row.
 */
@Injectable()
export class DrawingsService {
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    @InjectRepository(DrawingPackage) private readonly packages: Repository<DrawingPackage>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    private readonly storage: StorageService,
  ) {}

  /** Ingest one PDF drawing set. */
  async ingestPdf(input: {
    projectKey: string;
    filename: string;
    buffer: Buffer;
    uploadedBy: string | null;
  }): Promise<DrawingPackage> {
    if (!input.projectKey) throw new BadRequestException('projectKey is required');
    if (!input.filename.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Phase 1 accepts .pdf drawing sets only (IFC/DWG/RVT follow).');
    }
    if (input.buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new BadRequestException('File does not look like a PDF (missing %PDF header).');
    }

    // Immutable archive first — evidence chain before anything else.
    const sha256 = this.storage.sha256(input.buffer);
    const storedPath = await this.storage.archive(input.filename, input.buffer, sha256);
    const sourceFile = await this.sourceFiles.save(
      this.sourceFiles.create({
        filename: input.filename,
        contentSha256: sha256,
        storedPath,
        byteSize: input.buffer.length,
        sourceType: SourceType.P6_PDF, // drawing PDFs share the pdf source type
      }),
    );

    const summary = await this.extractPdfFeatures(input.buffer);

    const row = await this.packages.save(
      this.packages.create({
        projectBusinessKey: input.projectKey,
        sourceFileId: sourceFile.id,
        filename: input.filename,
        format: 'pdf',
        summary,
        uploadedBy: input.uploadedBy,
      }),
    );
    this.logger.log(
      `Drawing package ${row.id} ingested for ${input.projectKey}: ` +
        `${summary.pageCount} page(s), ${(summary.floorHints as string[]).length} floor hint(s), ` +
        `${(summary.disciplineHints as string[]).length} discipline hint(s).`,
    );
    return row;
  }

  /** Packages for one project, newest first. */
  list(projectKey: string): Promise<DrawingPackage[]> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    return this.packages.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<DrawingPackage> {
    const row = await this.packages.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No drawing package with id ${id}`);
    return row;
  }

  // ───────────────────────── internals ─────────────────────────

  /** Best-effort PDF feature extraction (see class doc for the honesty contract). */
  private async extractPdfFeatures(buffer: Buffer): Promise<Record<string, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
    let text = '';
    let pageCount = 0;
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text ?? '';
      pageCount = parsed.numpages;
    } catch (err) {
      return {
        pageCount: 0,
        sheetTitles: [],
        floorHints: [],
        disciplineHints: [],
        textExcerpt: '',
        extractionNote: `PDF text extraction failed (${(err as Error).message}) — likely a scanned set; the baseline generator will use the generic template flow.`,
      };
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0);

    // Sheet titles: drawing sets typically repeat short ALL-CAPS title rows.
    const sheetTitles = [
      ...new Set(
        lines.filter(
          (l) => l.length >= 6 && l.length <= 60 && /^[A-Z0-9 \-–_/().&]+$/.test(l) && /[A-Z]{3}/.test(l),
        ),
      ),
    ].slice(0, 30);

    // Floor hints (English + Arabic markers).
    const floorRe = /\b(GROUND FLOOR|FIRST FLOOR|SECOND FLOOR|THIRD FLOOR|BASEMENT|ROOF|LEVEL\s*\d+|G\+\d+|الطابق|الدور|بدروم|سطح)\b/gi;
    const floorHints = [...new Set([...text.matchAll(floorRe)].map((m) => m[0].toUpperCase()))].slice(0, 20);

    // Discipline hints.
    const disciplines: string[] = [];
    if (/\b(ARCH|ARCHITECT|معماري)\b/i.test(text)) disciplines.push('architectural');
    if (/\b(STR|STRUCT|إنشائي)\b/i.test(text)) disciplines.push('structural');
    if (/\b(MEP|MECH|HVAC|ميكانيك)\b/i.test(text)) disciplines.push('mechanical');
    if (/\b(ELE|ELEC|كهرباء)\b/i.test(text)) disciplines.push('electrical');
    if (/\b(PLB|PLUMB|DRAIN|صحي)\b/i.test(text)) disciplines.push('plumbing');
    if (/\b(FF|FIRE|إطفاء|حريق)\b/i.test(text)) disciplines.push('fire-fighting');

    return {
      pageCount,
      sheetTitles,
      floorHints,
      disciplineHints: disciplines,
      textExcerpt: text.slice(0, 4000),
      extractionNote:
        text.trim().length === 0
          ? 'Text layer empty — likely a scanned set; features above are unavailable.'
          : null,
    };
  }
}
