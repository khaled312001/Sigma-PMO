import { Injectable } from '@nestjs/common';

/**
 * The outcome of a deterministic classification pass over one record's text.
 */
export interface ClassificationResult {
  /** Best-guess record type (matches a ProjectRecordType / 'other'). */
  recordType: string;
  /** Confidence the suggested type is right, 0..1 (keyword-density heuristic). */
  confidence: number;
  /** Free-form tags merged onto details.tags (delay/eot/cost-impact/…). */
  tags: string[];
}

interface TypeRule {
  recordType: string;
  /** Any of these (word-boundary) keyword patterns flags the type. */
  patterns: RegExp[];
}

interface TagRule {
  tag: string;
  patterns: RegExp[];
}

/**
 * ClassificationService — the deterministic Repository-intelligence classifier
 * (Agent-D mission §4). NO LLM: a transparent keyword/regex matcher so a
 * reviewer can always see WHY a record was tagged. Two passes:
 *
 *  1. `suggestType` — maps the title (+ optional body) to the most likely
 *     record family (rfi / ncr / cost-report / submittal / change-request /…)
 *     by keyword density, plus a tag set (delay, eot, cost-impact, safety, …)
 *     that survives even when the type stays generic.
 *  2. tags merge — on record creation / re-classify we MERGE the suggested
 *     tags onto any user-supplied `details.tags`, never overwrite them.
 *
 * Extending the taxonomy is a new row in TYPE_RULES / TAG_RULES, never a schema
 * change — same discipline as the Sigma Rule Library + Assumption Library.
 */
@Injectable()
export class ClassificationService {
  /** Word-boundary helper so 'eot' does not match 'promote'. */
  private static kw(...words: string[]): RegExp[] {
    return words.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  }

  private static readonly TYPE_RULES: TypeRule[] = [
    { recordType: 'rfi', patterns: ClassificationService.kw('rfi', 'request for information', 'clarification') },
    { recordType: 'ncr', patterns: ClassificationService.kw('ncr', 'non-conformance', 'nonconformance', 'non conformance', 'defect') },
    { recordType: 'submittal', patterns: ClassificationService.kw('submittal', 'material approval', 'shop drawing', 'method statement') },
    { recordType: 'change-request', patterns: ClassificationService.kw('change request', 'variation', 'variation order', 'vo', 'change order') },
    { recordType: 'cost-report', patterns: ClassificationService.kw('invoice', 'payment', 'ipc', 'interim payment', 'cost report', 'valuation') },
    { recordType: 'procurement-log', patterns: ClassificationService.kw('purchase order', 'procurement', 'lpo', 'material order', 'delivery note') },
    { recordType: 'resource-log', patterns: ClassificationService.kw('manpower', 'labour', 'labor histogram', 'resource', 'plant log') },
    { recordType: 'site-photo', patterns: ClassificationService.kw('site photo', 'progress photo', 'photograph') },
  ];

  private static readonly TAG_RULES: TagRule[] = [
    { tag: 'delay', patterns: ClassificationService.kw('delay', 'late', 'overdue', 'slippage') },
    { tag: 'eot', patterns: ClassificationService.kw('eot', 'extension of time', 'time extension') },
    { tag: 'cost-impact', patterns: ClassificationService.kw('cost impact', 'additional cost', 'claim', 'compensation') },
    { tag: 'safety', patterns: ClassificationService.kw('safety', 'hse', 'incident', 'accident', 'near miss') },
    { tag: 'quality', patterns: ClassificationService.kw('quality', 'defect', 'rework', 'snag') },
    { tag: 'urgent', patterns: ClassificationService.kw('urgent', 'immediate', 'critical', 'asap') },
    { tag: 'contractual', patterns: ClassificationService.kw('fidic', 'clause', 'sub-clause', 'condition precedent', 'notice') },
    { tag: 'design', patterns: ClassificationService.kw('design', 'drawing', 'specification', 'spec') },
  ];

  /**
   * Suggest a record type + tags from a title and optional body. Deterministic
   * and side-effect-free — callers decide whether to apply the result.
   */
  suggestType(title: string, body?: string | null): ClassificationResult {
    const haystack = `${title ?? ''}\n${body ?? ''}`;

    let bestType = 'other';
    let bestHits = 0;
    for (const rule of ClassificationService.TYPE_RULES) {
      const hits = rule.patterns.reduce((n, p) => (p.test(haystack) ? n + 1 : n), 0);
      if (hits > bestHits) {
        bestHits = hits;
        bestType = rule.recordType;
      }
    }

    const tags: string[] = [];
    for (const rule of ClassificationService.TAG_RULES) {
      if (rule.patterns.some((p) => p.test(haystack))) tags.push(rule.tag);
    }

    // Confidence: scaled by how many distinct keywords fired (capped at 0.95;
    // 0.3 floor when at least one fired). 'other' with no hits = 0.
    const confidence = bestHits === 0 ? 0 : Math.min(0.95, 0.3 + bestHits * 0.25);
    return { recordType: bestType, confidence, tags };
  }

  /**
   * Merge suggested tags onto existing user tags WITHOUT overwriting — the
   * union, de-duplicated, user order preserved first.
   */
  mergeTags(existing: unknown, suggested: string[]): string[] {
    const userTags = Array.isArray(existing) ? existing.filter((t): t is string => typeof t === 'string') : [];
    const out = [...userTags];
    for (const t of suggested) if (!out.includes(t)) out.push(t);
    return out;
  }
}
