import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { MonthlyReport } from '../canonical/entities';
import { GenerateMonthlyReportDto } from './dto/generate-monthly-report.dto';
import { GeneratePeriodicReportDto } from './dto/generate-periodic-report.dto';
import { MonthlyReportService, PeriodicCadence } from './monthly-report.service';

/**
 * Monthly Narrative Report endpoints (post-meeting plan §3.6, §5).
 *
 * All three routes are gated on `canGenerateSummary` — the same capability
 * that protects the weekly Executive Summary. Contractor role does NOT
 * carry this capability today (per `roles.enum.ts`); Wave 3 will add a
 * narrower `canViewOwnMonthlyReport` for the contractor slice.
 *
 * The `/pdf` endpoint streams the rendered file. The renderer is lazy
 * (re-rendering on every call) by design — a future cycle can add a
 * checksum-based cache once Al Ayham signs off the Wave-2 layout.
 */
@Controller('reports/monthly')
export class MonthlyReportController {
  constructor(private readonly service: MonthlyReportService) {}

  @Post('generate')
  @HttpCode(200)
  @RequiresCapability('canGenerateSummary')
  generate(@Body() body: GenerateMonthlyReportDto): Promise<MonthlyReport> {
    return this.service.generateMonthly({
      projectKey: body.projectKey,
      monthIso: body.monthIso,
      audience: body.audience,
      narrativeType: body.narrativeType,
      authoredBy: body.authoredBy ?? null,
    });
  }

  /**
   * Cadence-aware generation (Wave 4). Same pipeline as monthly, just with
   * a daily / weekly window. Daily is the lightest tier; weekly + monthly
   * stay on the audience-tier policy.
   */
  @Post('periodic/generate')
  @HttpCode(200)
  @RequiresCapability('canGenerateSummary')
  generatePeriodic(@Body() body: GeneratePeriodicReportDto): Promise<MonthlyReport> {
    return this.service.generatePeriodic({
      projectKey: body.projectKey,
      cadence: body.cadence,
      periodKey: body.periodKey,
      audience: body.audience,
      authoredBy: body.authoredBy ?? null,
    });
  }

  @Get()
  @RequiresCapability('canRead')
  list(
    @Query('projectKey') projectKey: string,
    @Query('month') month?: string,
    @Query('cadence') cadence?: string,
    @Query('periodKey') periodKey?: string,
  ): Promise<MonthlyReport[]> {
    if (!projectKey) {
      throw new NotFoundException('projectKey query parameter is required');
    }
    const c = cadence as PeriodicCadence | undefined;
    return this.service.list(projectKey, month, c, periodKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  getById(@Param('id') id: string): Promise<MonthlyReport> {
    return this.service.getById(id);
  }

  /**
   * Lazy-render + stream the PDF. The DB row is updated with `pdfStoredPath`
   * the first time so subsequent reads can skip re-rendering — but we
   * always call `renderPdf` here, because Wave 2 wants the rendered file to
   * track the persisted narrative even if a later cycle edits it in place.
   */
  @Get(':id/pdf')
  @RequiresCapability('canRead')
  async pdf(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const language: 'ar' | 'en' = lang === 'en' ? 'en' : 'ar';
    const { row, absolutePath } = await this.service.renderPdf(id, language);
    let size: number | null = null;
    try {
      const s = await stat(absolutePath);
      size = s.size;
    } catch {
      throw new NotFoundException(`Rendered PDF for monthly report ${id} not found on disk`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    const cadenceTag = row.cadence ?? 'monthly';
    const periodTag = row.periodKey ?? row.month;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${cadenceTag}-${row.projectBusinessKey}-${periodTag}-${row.audience}-${language}.pdf"`,
    );
    if (size !== null) res.setHeader('Content-Length', String(size));
    createReadStream(absolutePath).pipe(res);
  }
}
