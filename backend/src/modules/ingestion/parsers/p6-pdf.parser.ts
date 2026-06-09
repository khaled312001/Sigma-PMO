import { Injectable, Logger } from '@nestjs/common';

import { SourceType } from '../../../common/enums';
import { emptyDataset, RawDataset, RawRecord, SourceParser } from './parser.interface';

/**
 * P6PdfParser — parses Primavera P6 Activity Table PDF exports.
 *
 * The reference programmes lodged in this repo (`Critical Path.pdf`,
 * `Base Line Program 2.pdf`) are P6's default PDF output: a tabular
 * activity list with the columns:
 *
 *    Activity ID | Activity Name | Orig. Dur. | Start | Finish | Total Float
 *
 * (Some exports also include Late Start / Late Finish — supported.)
 *
 * Rows fall into three shapes:
 *
 *    1. Activity rows         e.g. `Rabdan-BP-88  Issuance of Building Permit  1  29-May-23  29-May-23  0`
 *    2. WBS group headers     name doubled (P6 prints "X X" where X is the WBS name) — captured but
 *                              not turned into activities; we record them as wbsCode hints.
 *    3. Milestones            `Rabdan-ML-01  Project Commencement Date  0  29-May-23  0`  (no finish col)
 *
 * Approach: extract text with `pdf-parse`, walk line-by-line, regex-match
 * the activity-row shape. Activity IDs in real P6 outputs are dash-separated
 * alphanumerics; we treat the first whitespace-separated token whose final
 * segment matches `\d+` or an A-numeric code as the Activity ID and pull
 * the trailing numeric columns from the end.
 *
 * Output goes into `dataset.activities` as canonical-raw records the
 * Normalizer can consume. Project metadata (start / finish / name) is
 * inferred from the root row (the one whose name appears twice and whose
 * Total Float is 0 across the entire programme).
 */
@Injectable()
export class P6PdfParser implements SourceParser {
  private readonly logger = new Logger(P6PdfParser.name);
  readonly name = 'p6_pdf';
  readonly sourceType = SourceType.P6_PDF;

  supports(filename: string, buffer: Buffer): boolean {
    if (!filename.toLowerCase().endsWith('.pdf')) return false;
    // Sanity check the magic header so renamed files don't slip through.
    return buffer.length > 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }

  async parse(filename: string, buffer: Buffer): Promise<RawDataset> {
    const dataset = emptyDataset(this.sourceType, this.name);
    // Late import — pdf-parse pulls in heavy deps and we only want them
    // loaded when an actual PDF is ingested.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    const projectKey = deriveProjectKey(filename);
    const projectName = deriveProjectName(text) ?? filename.replace(/\.pdf$/i, '');
    const projectRow: RawRecord = {
      businessKey: projectKey,
      name: projectName,
      status: 'active',
      __raw: { filename, source: 'p6_pdf' },
    };

    const activities: RawRecord[] = [];
    let lastWbs: string | null = null;
    let earliestStart: Date | null = null;
    let latestFinish: Date | null = null;

    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      // Header / column-title lines.
      if (/^Activity ID Activity Name/i.test(line)) continue;
      if (/^Orig\.?\s*Dur\.?/i.test(line)) continue;
      if (/^Late ?Start Late ?Finish/i.test(line)) continue;
      if (/^T\s*otal Float$/i.test(line)) continue;

      const parsed = matchActivityRow(line);
      if (parsed) {
        const { activityId, name, duration, plannedStart, plannedFinish, totalFloat, isMilestone } = parsed;
        activities.push({
          businessKey: activityId,
          projectKey,
          wbsCode: lastWbs,
          name,
          activityType: isMilestone ? 'milestone' : 'task',
          status: 'not-started',
          plannedStart: toIsoDate(plannedStart),
          plannedFinish: toIsoDate(plannedFinish ?? plannedStart),
          plannedDurationDays: duration,
          remainingDurationDays: duration,
          plannedPctComplete: 0,
          actualPctComplete: 0,
          __raw: { sourceLine: line, totalFloatDays: totalFloat },
        } as RawRecord);

        const s = parseDate(plannedStart);
        const f = parseDate(plannedFinish ?? plannedStart);
        if (s && (!earliestStart || s < earliestStart)) earliestStart = s;
        if (f && (!latestFinish || f > latestFinish)) latestFinish = f;
        continue;
      }

      const wbsHeader = matchWbsHeader(line);
      if (wbsHeader) {
        lastWbs = wbsHeader;
        continue;
      }
    }

    if (earliestStart) projectRow.plannedStart = toIsoDate(formatDmy(earliestStart));
    if (latestFinish) projectRow.plannedFinish = toIsoDate(formatDmy(latestFinish));

    dataset.projects.push(projectRow);
    dataset.activities.push(...activities);
    dataset.meta = {
      pageCount: parsed.numpages,
      activityCount: activities.length,
      wbsHeadersSeen: lines.filter((l) => matchWbsHeader(l.trim())).length,
      sniff: 'primavera-activity-table-pdf',
    };
    this.logger.log(
      `Parsed P6 PDF "${filename}": ${activities.length} activities across ${parsed.numpages} page(s).`,
    );
    return dataset;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Row matchers
// ──────────────────────────────────────────────────────────────────────

interface ActivityParse {
  activityId: string;
  name: string;
  duration: number;
  plannedStart: string;
  plannedFinish: string | null;
  totalFloat: number;
  isMilestone: boolean;
}

/**
 * Activity row matcher.
 *
 * The Primavera PDF emits the columns in fixed order, but the activity
 * NAME can contain almost anything (including dashes, parentheses, slashes,
 * and spaces). So we anchor on the END of the line — the rightmost two or
 * three tokens are dates + a float number — and back-derive Activity ID
 * from the LEFTMOST token.
 *
 * Date format used in the references: `DD-MMM-YY`  (e.g. `29-May-23`).
 */
function matchActivityRow(line: string): ActivityParse | null {
  // Tokens stripped to the rightmost three or four "data" tokens.
  // Look for: <duration> <start-date> [<finish-date>] <float>
  const dateRe = /\d{1,2}-[A-Za-z]{3}-\d{2}/;
  const dateMatches = [...line.matchAll(new RegExp(dateRe, 'g'))].map((m) => m[0]);
  if (dateMatches.length === 0) return null;

  // Must start with an activity ID — alphanumeric with at least one dash or
  // a strict prefix. Reject lines that look like running prose or the
  // generic running header.
  const firstTokenMatch = /^([A-Za-z][A-Za-z0-9_\-]{2,})\s+/.exec(line);
  if (!firstTokenMatch) return null;
  const activityId = firstTokenMatch[1];
  // The activity-id token must contain a dash to look like a P6 ID.
  if (!activityId.includes('-')) return null;

  // Find the trailing number AFTER the last date — that's the total float.
  const lastDate = dateMatches[dateMatches.length - 1];
  const lastDateIdx = line.lastIndexOf(lastDate) + lastDate.length;
  const afterLastDate = line.slice(lastDateIdx).trim();
  const floatMatch = /^(\d+)/.exec(afterLastDate);
  if (!floatMatch) return null;
  const totalFloat = parseInt(floatMatch[1], 10);

  // Trim the body to between the activity ID and the first date.
  const firstDate = dateMatches[0];
  const firstDateIdx = line.indexOf(firstDate);
  const between = line.slice(firstTokenMatch[0].length, firstDateIdx).trim();

  // Duration is the LAST integer token in `between`.
  const durTokens = [...between.matchAll(/\b(\d+(?:\.\d+)?)\b/g)];
  if (durTokens.length === 0) return null;
  const lastDur = durTokens[durTokens.length - 1];
  const duration = parseFloat(lastDur[1]);
  const name = between.slice(0, between.lastIndexOf(lastDur[0])).trim();
  if (!name) return null;

  const plannedStart = firstDate;
  const plannedFinish = dateMatches.length >= 2 ? dateMatches[1] : null;
  const isMilestone = duration === 0;

  return {
    activityId,
    name,
    duration,
    plannedStart,
    plannedFinish,
    totalFloat,
    isMilestone,
  };
}

/**
 * WBS header detector. The Primavera export prints WBS names DOUBLED
 * (e.g. "Milestones Milestones"). We capture those as the current WBS
 * context so subsequent activity rows can attach to them.
 */
function matchWbsHeader(line: string): string | null {
  const m = /^([A-Z][A-Za-z0-9 \-\/&,()]{2,60})\s+\1\b/.exec(line);
  if (m) return m[1].trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Date / key helpers
// ──────────────────────────────────────────────────────────────────────

function parseDate(dmy: string): Date | null {
  if (!dmy) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(dmy);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthIdx = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
  if (monthIdx < 0) return null;
  const yy = parseInt(m[3], 10);
  // Two-digit year — assume 2000-2099 always (Primavera convention).
  const year = 2000 + yy;
  return new Date(Date.UTC(year, monthIdx, day));
}

function toIsoDate(dmy: string | null): string | null {
  if (!dmy) return null;
  const d = parseDate(dmy);
  return d ? d.toISOString().slice(0, 10) : null;
}

function formatDmy(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear() - 2000).padStart(2, '0');
  return `${day}-${mon[0].toUpperCase()}${mon.slice(1)}-${yy}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function deriveProjectKey(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
  return `P-PDF-${base.slice(0, 24)}`;
}

function deriveProjectName(text: string): string | null {
  // The first line of the PDF text usually contains the column headers.
  // The PROJECT NAME row is the doubled-name line whose duration spans the
  // entire programme — look for the longest "X X 366 …" style line.
  const lines = text.split(/\r?\n/).slice(0, 60).map((l) => l.replace(/\s+/g, ' ').trim());
  for (const l of lines) {
    const m = /^([A-Z][A-Za-z0-9 \-&()'\/,]{8,80})\s+\1\b/.exec(l);
    if (m) return m[1].trim();
  }
  return null;
}
