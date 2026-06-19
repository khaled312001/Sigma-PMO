/**
 * Scalable Evidence Memory / Dispute Data Room (Mr. Ayham, 2026-06-19).
 *
 * Real-world dispute / claim / completed-project analysis ingests HUNDREDS of
 * files (contracts, addenda, correspondence, minutes, daily reports, schedules,
 * drawings, RFIs, NCRs, approvals, claims, BoQ, payment certificates, media).
 * Sigma must NOT cap input at a fixed, non-exceedable size — capacity is driven
 * by a processing MODE and is RAISABLE on demand per room by an admin (audited).
 *
 * The dispute layer never relies on a single request's context window: files are
 * indexed → extracted → CHUNKED (source preserved) → analysed per-file (map) →
 * timelined → conflict/gap-checked (reduce over compact item summaries) →
 * assembled. Every finding links back to its original source so the system can
 * return to the exact document/page/paragraph behind each conclusion.
 */

export type EvidenceMode = 'standard' | 'extended' | 'dispute_intensive' | 'completed_project';
export type EvidenceKind = 'standard' | 'dispute' | 'claim' | 'completed_project';

export type EvidenceCategory =
  | 'contract' | 'addendum' | 'correspondence' | 'minutes' | 'daily_report' | 'schedule'
  | 'drawing' | 'rfi' | 'ncr' | 'approval' | 'claim' | 'boq' | 'payment_cert'
  | 'image' | 'video' | 'other';

export type EvidenceItemType = 'fact' | 'event' | 'conflict' | 'gap' | 'strength' | 'weakness' | 'claim_point';

export interface EvidenceLimits {
  /** Max files a room may hold. */
  maxFiles: number;
  /** Max total bytes across the room. */
  maxBytes: number;
  /** Max bytes for a single file. */
  maxBytesPerFile: number;
  /** Characters per analysable chunk. */
  chunkChars: number;
  /** Files processed per background tick (keeps large rooms incremental). */
  filesPerTick: number;
  /** Analysis depth — drives how aggressively the AI extracts + cross-checks. */
  depth: 'shallow' | 'standard' | 'deep';
}

const MB = 1024 * 1024;

/** Mode → default capacity. These are DEFAULTS, not hard ceilings — an admin can
 * raise any of them per room (see `EvidenceService.raiseLimit`). */
export const MODE_LIMITS: Record<EvidenceMode, EvidenceLimits> = {
  standard:          { maxFiles: 25,   maxBytes: 50 * MB,    maxBytesPerFile: 15 * MB,  chunkChars: 6000, filesPerTick: 5, depth: 'shallow' },
  extended:          { maxFiles: 200,  maxBytes: 500 * MB,   maxBytesPerFile: 50 * MB,  chunkChars: 8000, filesPerTick: 8, depth: 'standard' },
  dispute_intensive: { maxFiles: 1000, maxBytes: 5000 * MB,  maxBytesPerFile: 200 * MB, chunkChars: 8000, filesPerTick: 10, depth: 'deep' },
  completed_project: { maxFiles: 2000, maxBytes: 10000 * MB, maxBytesPerFile: 200 * MB, chunkChars: 8000, filesPerTick: 10, depth: 'deep' },
};

export const DEFAULT_MODE_FOR_KIND: Record<EvidenceKind, EvidenceMode> = {
  standard: 'standard',
  dispute: 'dispute_intensive',
  claim: 'dispute_intensive',
  completed_project: 'completed_project',
};

export const ALL_CATEGORIES: EvidenceCategory[] = [
  'contract', 'addendum', 'correspondence', 'minutes', 'daily_report', 'schedule',
  'drawing', 'rfi', 'ncr', 'approval', 'claim', 'boq', 'payment_cert', 'image', 'video', 'other',
];

/** Categories a dispute/claim/completed-project data room is normally expected to
 * contain — used to flag GAPS (expected-but-absent evidence). */
export const EXPECTED_FOR_KIND: Record<EvidenceKind, EvidenceCategory[]> = {
  standard: [],
  dispute: ['contract', 'correspondence', 'claim', 'schedule', 'minutes'],
  claim: ['contract', 'correspondence', 'claim', 'schedule', 'payment_cert', 'rfi'],
  completed_project: ['contract', 'schedule', 'daily_report', 'payment_cert', 'minutes', 'boq'],
};

const EXT_CATEGORY: Array<[RegExp, EvidenceCategory]> = [
  [/contract|agreement|fidic/i, 'contract'],
  [/addend|amend|variation|vo[-_ ]/i, 'addendum'],
  [/letter|email|corresp|notice/i, 'correspondence'],
  [/minute|mom|meeting/i, 'minutes'],
  [/daily|dpr|site[-_ ]?report|weekly/i, 'daily_report'],
  [/schedul|programme|program|baseline|\.xer$|p6|primavera/i, 'schedule'],
  [/drawing|dwg|\.rvt$|\.ifc$|\.nwd$|plan|layout/i, 'drawing'],
  [/rfi/i, 'rfi'],
  [/ncr|non[-_ ]?conformance/i, 'ncr'],
  [/approv|submittal|sign[-_ ]?off/i, 'approval'],
  [/claim|eot|prolongation|disrupt/i, 'claim'],
  [/boq|bill[-_ ]?of[-_ ]?quant|\.boq$/i, 'boq'],
  [/payment|ipc|certificate|valuation|invoice/i, 'payment_cert'],
  [/\.(png|jpe?g|gif|webp|bmp|tiff?)$/i, 'image'],
  [/\.(mp4|mov|avi|mkv|webm)$/i, 'video'],
];

/** Heuristic category from a filename — refined later by the AI per file. */
export function categoryFromName(name: string): EvidenceCategory {
  for (const [re, cat] of EXT_CATEGORY) if (re.test(name)) return cat;
  return 'other';
}

export interface Chunk { index: number; page: number | null; paragraph: number; text: string }

/**
 * Split extracted text into analysable chunks of ~`chunkChars`, preserving the
 * SOURCE position (page when known via form-feed/page markers, and a running
 * paragraph index) so every downstream finding can cite file + page + paragraph.
 */
export function chunkText(text: string, chunkChars: number): Chunk[] {
  const chunks: Chunk[] = [];
  if (!text?.trim()) return chunks;
  // Page boundaries: form-feed (\f) or explicit "Page N" markers from extractors.
  const pages = text.split(/\f|\n(?=\s*(?:page|صفحة)\s+\d+\b)/i);
  let paragraph = 0;
  let chunkIndex = 0;
  pages.forEach((pageText, pi) => {
    const page = pages.length > 1 ? pi + 1 : null;
    const paras = pageText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buf = '';
    let bufStartPara = paragraph;
    const flush = () => {
      if (buf.trim()) {
        chunks.push({ index: chunkIndex++, page, paragraph: bufStartPara, text: buf.trim() });
      }
      buf = '';
      bufStartPara = paragraph;
    };
    for (const para of paras) {
      paragraph += 1;
      if (buf.length + para.length + 2 > chunkChars && buf) flush();
      buf += (buf ? '\n\n' : '') + para;
    }
    flush();
  });
  return chunks;
}

/** AI prompt — per-file MAP step: extract source-linked evidence items. */
export const EXTRACT_ITEMS_SYSTEM = `You are Sigma PMO's dispute-evidence analyst. You receive ONE source document's text (in chunks, each tagged [chunk i | page p | para q]). Extract every distinct, decision-useful item of evidence for a construction dispute/claim/completed-project analysis, and link each to where it came from. A HUMAN reviews everything before commit.

Return STRICT JSON only:
{
  "category": "<contract|addendum|correspondence|minutes|daily_report|schedule|drawing|rfi|ncr|approval|claim|boq|payment_cert|image|video|other>",
  "docNumber": "<document/reference number or null>",
  "party": "<issuing party/company or null>",
  "docDate": "<yyyy-mm-dd or null>",
  "items": [
    {
      "type": "<fact|event|claim_point|strength|weakness>",
      "layer": "<project-data|planning|commercial|risk|claims|governance|procurement|qs|daily-reporting|compliance|approvals|stakeholders>",
      "label": "<short title>",
      "value": "<the precise fact/event/figure/quote>",
      "effectiveDate": "<yyyy-mm-dd or null>",
      "confidence": <0..1>,
      "sourceChunk": <the chunk index this came from>
    }
  ]
}
Rules: cite the EXACT sourceChunk for every item. Prefer events with dates (they build the chronology). Never invent facts not in the text. Keep values verbatim where possible.`;

/** AI prompt — REDUCE step over compact item summaries: conflicts + gaps + assessment. */
export const ANALYZE_ROOM_SYSTEM = `You are Sigma PMO's dispute analyst performing the cross-document REDUCE over an evidence repository. You receive a COMPACT list of already-extracted, source-linked items (id, type, label, value, date, file). Do NOT invent new facts — only relate the items given.

Return STRICT JSON only:
{
  "conflicts": [ { "label": "<the contradiction>", "explanation": "<why these contradict>", "itemIds": ["<id>", "<id>"] } ],
  "gaps": [ { "label": "<missing/expected evidence>", "explanation": "<why it matters>" } ],
  "strengths": [ "<a point that strengthens the case>" ],
  "weaknesses": [ "<a point that weakens the case>" ],
  "summary": "<2-4 sentence neutral case summary grounded only in the items>"
}`;
