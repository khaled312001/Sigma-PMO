import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceType } from '../../common/enums';
import { SourceFile } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { LetterDrafterService } from '../letters/letter-drafter.service';
import { Letter } from '../letters/letter.entity';
import { SourcesService } from '../sources/sources.service';
import { StorageService } from '../ingestion/storage/storage.service';
import {
  OrgChartFinding,
  OrgChartReview,
  OrgChartReviewStatus,
} from './org-chart-review.entity';
import { OrgChartRow, parseOrgChartExcelAsync } from './org-chart-parser';

/** Persona slug Wave 3 pins for org-chart compliance reviews. */
export const PMI_PERSONA_SLUG = 'pmi-orgchart-analyst';

/** Compliance-trigger code the FIDIC drafter receives when we cascade to a letter. */
export const PMI_TRIGGER_CODE = 'pmi.org-chart-non-compliance';

/** Severity rank for sorting / "blocks letter" decisions. */
const SEVERITY_RANK: Record<OrgChartFinding['severity'], number> = {
  'missing-role': 4,
  'unclear-line': 3,
  'under-staffed': 2,
  'over-staffed': 1,
};

/**
 * Wave 3 PMI org-chart compliance reviewer (post-meeting plan §3.5, ADR-0010 §3).
 *
 * Pipeline:
 *   1. Caller hands us the Excel bytes + projectKey.
 *   2. We archive the bytes (StorageService) and write a SourceFile row so
 *      the evidence chain (ADR-0005) extends.
 *   3. The parser produces structured `OrgChartRow[]`.
 *   4. We hand the structured rows to the `pmi-orgchart-analyst` persona via
 *      ClaudeService — the persona returns a JSON findings array.
 *   5. Citations are validated against SourceRegistry (ADR-0020). Reviews
 *      with no valid citations are rejected.
 *   6. An `OrgChartReview` row is persisted in `pending-review`.
 *
 * Subsequent call: `draftComplianceLetter(reviewId)` cascades the findings
 * into the existing FIDIC LetterDrafter to produce a ready-to-send
 * compliance letter — never auto-sent (ADR-0018).
 *
 * Deterministic fallback when `ClaudeService.isEnabled() === false`:
 * we synthesise a single placeholder finding citing `pmbok-7` so the
 * persistence shape stays uniform and the citation gate is never bypassed.
 */
@Injectable()
export class OrgChartComplianceService {
  private readonly logger = new Logger(OrgChartComplianceService.name);

  constructor(
    @InjectRepository(OrgChartReview)
    private readonly reviews: Repository<OrgChartReview>,
    @InjectRepository(SourceFile)
    private readonly sourceFiles: Repository<SourceFile>,
    private readonly claude: ClaudeService,
    private readonly sources: SourcesService,
    private readonly letterDrafter: LetterDrafterService,
    private readonly storage: StorageService,
  ) {}

  /** Decode + archive + parse + persona-review + persist. */
  async ingestAndReview(input: {
    projectKey: string;
    filename: string;
    buffer: Buffer;
  }): Promise<OrgChartReview> {
    if (!input.projectKey) throw new BadRequestException('projectKey is required');
    if (!input.filename) throw new BadRequestException('filename is required');
    if (input.buffer.length === 0) throw new BadRequestException('Empty file');

    // Archive + SourceFile audit row.
    const sha256 = this.storage.sha256(input.buffer);
    const storedPath = await this.storage.archive(input.filename, input.buffer, sha256);
    const sourceFile: SourceFile = await this.sourceFiles.save(
      this.sourceFiles.create({
        filename: input.filename,
        contentSha256: sha256,
        storedPath,
        byteSize: input.buffer.length,
        sourceType: SourceType.EXCEL,
      }),
    );

    // Parse to structured rows.
    const rows = await parseOrgChartExcelAsync(input.buffer);

    // Persona-mediated review (or deterministic fallback).
    const { findings, citations } = await this.runPersonaReview(input.projectKey, rows);

    const review = await this.reviews.save(
      this.reviews.create({
        projectBusinessKey: input.projectKey,
        sourceFileId: sourceFile.id,
        findings,
        citations,
        complianceLetterId: null,
        reviewedBy: null,
        reviewerNote: null,
        status: this.deriveStatus(findings),
      }),
    );

    this.logger.log(
      `OrgChart review ${review.id} for project ${input.projectKey}: ` +
        `${findings.length} finding(s); status=${review.status}; sourceFile=${sourceFile.id}`,
    );
    return review;
  }

  list(projectKey: string): Promise<OrgChartReview[]> {
    return this.reviews.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OrgChartReview> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException(`OrgChartReview ${id} not found`);
    return review;
  }

  /**
   * Cascade a finding-bearing review into a FIDIC-style compliance letter.
   * Idempotent on the review row — if a letter has already been drafted, we
   * return it instead of drafting a second one.
   */
  async draftComplianceLetter(reviewId: string): Promise<Letter> {
    const review = await this.findOne(reviewId);

    if (review.complianceLetterId) {
      // Letter already drafted; the caller can fetch it via Letters endpoint.
      // We surface as 400 so the UI shows a friendly "already drafted" path.
      throw new BadRequestException(
        `OrgChartReview ${reviewId} has already produced letter ${review.complianceLetterId}.`,
      );
    }

    if (review.findings.length === 0) {
      throw new BadRequestException(
        `OrgChartReview ${reviewId} has no findings — nothing to draft.`,
      );
    }
    if (review.findings.every((f) => f.severity === 'over-staffed')) {
      throw new BadRequestException(
        `OrgChartReview ${reviewId} only contains over-staffed findings — no compliance letter warranted.`,
      );
    }

    // Narrative: roll up the findings into a human-readable summary the FIDIC
    // persona can weave into a contractual reply.
    const narrative = this.buildNarrative(review.findings);

    const letter = await this.letterDrafter.draftComplianceLetter(
      review.projectBusinessKey,
      PMI_TRIGGER_CODE,
      {
        triggerCode: PMI_TRIGGER_CODE,
        narrative,
        facts: {
          orgChartReviewId: review.id,
          findingCount: review.findings.length,
          findingsBySeverity: this.countBySeverity(review.findings),
          findings: review.findings,
          citations: review.citations,
        },
      },
    );

    // Link letter back + advance status.
    review.complianceLetterId = letter.id;
    review.status = 'letter-drafted';
    await this.reviews.save(review);

    return letter;
  }

  // ---- internals -----------------------------------------------------------

  private async runPersonaReview(
    projectKey: string,
    rows: OrgChartRow[],
  ): Promise<{ findings: OrgChartFinding[]; citations: string[] }> {
    if (!this.claude.isEnabled()) {
      // Deterministic fallback: emit a single placeholder finding citing pmbok-7
      // so the citation gate (ADR-0020) is never bypassed even in offline dev.
      const fallback: OrgChartFinding = {
        role: 'org-chart-fallback',
        label: 'AI offline — manual PMI review required',
        processGroup: 'Planning',
        severity: 'unclear-line',
        issue:
          'ClaudeService is disabled (no ANTHROPIC_API_KEY). A senior PMO ' +
          'reviewer must inspect the org chart manually against PMBOK 7 process groups.',
        recommendation:
          'Run the org-chart audit in a deployment with Anthropic credentials, ' +
          'or hand the file to a PMP-certified reviewer.',
        citationIds: ['pmbok-7'],
      };
      return { findings: [fallback], citations: ['pmbok-7'] };
    }

    const userMessage =
      `Review the contractor's submitted organisation chart for project "${projectKey}" against PMBOK process-group requirements. ` +
      `For each issue, return a JSON object on its own line with fields: role, label, processGroup, severity, issue, recommendation, citationIds (array of source ids from the Source Registry — at least one citation per finding from pmbok-6 or pmbok-7). ` +
      `If everything is compliant, return a single object with severity="over-staffed" and label="No findings". ` +
      `Wrap your structured output between <findings> and </findings> tags. Every claim must carry a [SOURCE: pmbok-N] marker.`;

    const personaContext = `<org_chart project="${projectKey}" row_count="${rows.length}">\n` +
      JSON.stringify(rows, null, 2) +
      `\n</org_chart>`;

    const result = await this.claude.callPersona(PMI_PERSONA_SLUG, userMessage, {
      context: personaContext,
    });

    const findings = this.parsePersonaFindings(result.content);
    const citations = await this.validateCitations(result.citations);

    if (findings.length === 0) {
      throw new BadRequestException(
        'pmi-orgchart-analyst response did not contain any parseable findings.',
      );
    }
    if (citations.length === 0) {
      throw new BadRequestException(
        'pmi-orgchart-analyst response did not cite any valid SourceRegistry id.',
      );
    }
    return { findings, citations };
  }

  private parsePersonaFindings(content: string): OrgChartFinding[] {
    // Persona is instructed to wrap output in <findings>…</findings>. Be lenient.
    const match = content.match(/<findings>([\s\S]*?)<\/findings>/i);
    const body = match ? match[1] : content;

    // Two acceptable shapes:
    //   (a) JSON array
    //   (b) one JSON object per line (NDJSON-style)
    const trimmed = body.trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Try NDJSON fallback
      const objects: unknown[] = [];
      for (const line of trimmed.split('\n')) {
        const s = line.trim();
        if (s.length === 0) continue;
        try {
          objects.push(JSON.parse(s));
        } catch {
          /* skip non-JSON line */
        }
      }
      parsed = objects;
    }
    if (!Array.isArray(parsed)) parsed = [parsed];

    const findings: OrgChartFinding[] = [];
    for (const raw of parsed as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Partial<OrgChartFinding>;
      if (!r.role || !r.label || !r.severity) continue;
      findings.push({
        role: String(r.role),
        label: String(r.label),
        processGroup: String(r.processGroup ?? 'Planning'),
        severity: SEVERITY_RANK[r.severity as OrgChartFinding['severity']]
          ? (r.severity as OrgChartFinding['severity'])
          : 'unclear-line',
        issue: String(r.issue ?? ''),
        recommendation: String(r.recommendation ?? ''),
        citationIds: Array.isArray(r.citationIds) ? r.citationIds.map(String) : [],
      });
    }
    return findings;
  }

  private async validateCitations(rawCitations: string[]): Promise<string[]> {
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const c of rawCitations) {
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const source = await this.sources.findByExternalId(c).catch(() => null);
      if (source) valid.push(c);
    }
    return valid;
  }

  private buildNarrative(findings: OrgChartFinding[]): string {
    const sorted = [...findings].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );
    const lines: string[] = [];
    lines.push(
      `PMI/PMBOK governance review of the contractor's submitted organisation chart identified ${findings.length} finding(s):`,
    );
    for (const f of sorted) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.label} (${f.processGroup}). ${f.issue}`);
      if (f.recommendation) lines.push(`  Recommendation: ${f.recommendation}`);
    }
    lines.push('');
    lines.push('Please respond with a corrected organisation chart addressing each finding above.');
    return lines.join('\n');
  }

  private deriveStatus(findings: OrgChartFinding[]): OrgChartReviewStatus {
    if (findings.length === 0) return 'compliant';
    const hasReal = findings.some((f) => f.severity !== 'over-staffed');
    return hasReal ? 'pending-review' : 'compliant';
  }

  private countBySeverity(findings: OrgChartFinding[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1;
    return out;
  }
}
