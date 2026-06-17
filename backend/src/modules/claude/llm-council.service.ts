import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfiguration } from '../../config/configuration';
import { ClaudeService } from './claude.service';

/** One council member's independent opinion. */
export interface CouncilMemberOpinion {
  lens: string;
  title: string;
  stance: 'agree' | 'disagree' | 'uncertain';
  confidence: number; // 0–100
  opinion: string;
  citations: string[];
  model: string;
}

/** The council's synthesized adjudication. */
export interface CouncilVerdict {
  enabled: boolean;
  question: string;
  /** The chair's consensus narrative. */
  verdict: string;
  /** 0–100 — chair confidence in the consensus. */
  confidence: number;
  /** 0–100 — how aligned the members were (share on the majority stance). */
  agreement: number;
  /** Majority stance across members. */
  consensusStance: 'agree' | 'disagree' | 'uncertain';
  members: CouncilMemberOpinion[];
  /** Notable dissent the chair flagged (empty when unanimous). */
  dissent: string;
  citations: string[];
  model: string | null;
  disclaimer: string;
}

/**
 * The deliberation lenses. Each member receives the SAME question + context but
 * a distinct reviewing posture, so the council surfaces disagreement instead of
 * one model's blind spot. Council size picks the first N of these.
 */
const LENSES: Array<{ key: string; title: string; focus: string }> = [
  {
    key: 'evidence',
    title: 'Evidence & Correctness',
    focus:
      'You are the EVIDENCE & CORRECTNESS reviewer. Judge strictly whether the claim is supported by the supplied deterministic data and the cited references. Call out any leap not backed by the numbers or a source.',
  },
  {
    key: 'skeptic',
    title: 'Adversarial Skeptic',
    focus:
      'You are the ADVERSARIAL SKEPTIC. Actively try to REFUTE the claim. State the strongest counter-argument, the data that would overturn it, and default to a cautious stance when evidence is thin.',
  },
  {
    key: 'governance',
    title: 'Governance, Contract & Risk',
    focus:
      'You are the GOVERNANCE, CONTRACT & RISK reviewer. Weigh the FIDIC / PMI / contractual and risk implications, escalation exposure, and what a governance board would need before acting.',
  },
  {
    key: 'pragmatist',
    title: 'Pragmatic Decision',
    focus:
      'You are the PRAGMATIC DECISION reviewer. Focus on the decision the owner must take next, the trade-offs, and whether the recommendation is actionable and proportionate.',
  },
];

/**
 * LlmCouncilService — the "LLM Council" Mr. Ayham asked about (2026-06-17 voice
 * note). Instead of a single model pass, the platform can adjudicate a piece of
 * information through a COUNCIL: N independent member passes, each with a
 * distinct reviewing lens, deliberate in parallel; then a CHAIR pass synthesizes
 * a consensus verdict, reports how aligned the members were (agreement), an
 * overall confidence, and surfaces dissent. This raises the reliability of an AI
 * judgement and makes disagreement explicit rather than hidden.
 *
 * Discipline (unchanged from the rest of the platform):
 *  - Deterministic-first — the council JUDGES/narrates supplied figures; it never
 *    recomputes or invents a number.
 *  - `[SOURCE: id]` citation grounding — only the supplied bibliography is citeable.
 *  - Advisory + human-approval — the verdict is for review, never auto-actioned.
 *  - Degrades honestly — when no Claude key is configured it returns a disabled
 *    verdict, not a fabricated consensus.
 */
@Injectable()
export class LlmCouncilService {
  private readonly logger = new Logger(LlmCouncilService.name);
  private readonly defaultSize: number;
  private readonly defaultEnabled: boolean;

  constructor(
    private readonly claude: ClaudeService,
    configService: ConfigService<AppConfiguration, true>,
  ) {
    const cfg = configService.get('anthropic', { infer: true });
    this.defaultEnabled = cfg?.councilEnabled ?? false;
    this.defaultSize = Math.min(LENSES.length, Math.max(2, cfg?.councilSize ?? 3));
  }

  /** Council is available only when the underlying Claude service is enabled. */
  isEnabled(): boolean {
    return this.claude.isEnabled();
  }

  /** Whether council mode is the configured default for adjudications. */
  isDefaultMode(): boolean {
    return this.defaultEnabled && this.claude.isEnabled();
  }

  /**
   * Adjudicate a claim/question through the council.
   *  - `bibliography`: the ONLY citeable sources, as "[id] title — author, ref" lines.
   *  - `members`: council size (clamped to 2..LENSES.length); defaults to config.
   *  - `chairModelTier`: optional stronger tier for the synthesizing chair.
   */
  async adjudicate(input: {
    question: string;
    context: string;
    bibliography?: string;
    language?: 'en' | 'ar';
    members?: number;
    chairModelTier?: string;
  }): Promise<CouncilVerdict> {
    const language = input.language ?? 'en';
    if (!this.claude.isEnabled()) {
      return this.disabledVerdict(input.question, language);
    }
    const size = Math.min(LENSES.length, Math.max(2, input.members ?? this.defaultSize));
    const lenses = LENSES.slice(0, size);

    const memberResults = await Promise.all(
      lenses.map((lens) => this.runMember(lens, input.question, input.context, input.bibliography, language)),
    );
    const members = memberResults.filter((m): m is CouncilMemberOpinion => m !== null);
    if (members.length === 0) {
      return this.disabledVerdict(input.question, language, 'All council members failed to respond this run.');
    }

    const consensusStance = majorityStance(members);
    const agreement = Math.round(
      (members.filter((m) => m.stance === consensusStance).length / members.length) * 100,
    );

    const chair = await this.runChair(input.question, members, input.bibliography, language, input.chairModelTier);

    const citations = unique([...members.flatMap((m) => m.citations), ...chair.citations]);
    this.logger.log(
      `LLM Council adjudicated "${truncate(input.question, 60)}": ${members.length} members, ` +
        `stance=${consensusStance}, agreement=${agreement}%, confidence=${chair.confidence}%.`,
    );

    return {
      enabled: true,
      question: input.question,
      verdict: chair.verdict,
      confidence: chair.confidence,
      agreement,
      consensusStance,
      members,
      dissent: chair.dissent,
      citations,
      model: chair.model,
      disclaimer:
        language === 'ar'
          ? 'حُكم استرشادي صادر عن مجلس نماذج (Council) يستند إلى أرقام محسوبة حتمياً ومصادر حقيقية — للمراجعة البشرية، وليس قراراً نهائياً.'
          : 'Advisory verdict from an LLM Council grounded in deterministic figures and real sources — for human review, not a final decision.',
    };
  }

  // ───────────────────────── internals ─────────────────────────

  private async runMember(
    lens: { key: string; title: string; focus: string },
    question: string,
    context: string,
    bibliography: string | undefined,
    language: 'en' | 'ar',
  ): Promise<CouncilMemberOpinion | null> {
    const system = this.memberSystem(lens.focus, bibliography, language);
    const prompt =
      `QUESTION TO ADJUDICATE:\n${question}\n\n` +
      `DETERMINISTIC CONTEXT (already computed — do not recompute):\n${context}\n\n` +
      'Give your independent opinion in 4–7 sentences, citing sources as [SOURCE: id]. ' +
      'Then, on the FINAL line only, output exactly: STANCE: agree|disagree|uncertain | CONFIDENCE: <0-100>';
    try {
      const res = await this.claude.callText({ system, prompt, maxTokens: 700, temperature: 0.35 });
      return {
        lens: lens.key,
        title: lens.title,
        stance: parseStance(res.content),
        confidence: parseConfidence(res.content),
        opinion: stripControlLine(res.content),
        citations: res.citations,
        model: res.model,
      };
    } catch (err) {
      this.logger.warn(`Council member "${lens.key}" failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async runChair(
    question: string,
    members: CouncilMemberOpinion[],
    bibliography: string | undefined,
    language: 'en' | 'ar',
    chairModelTier?: string,
  ): Promise<{ verdict: string; confidence: number; dissent: string; citations: string[]; model: string }> {
    const panel = members
      .map(
        (m, i) =>
          `MEMBER ${i + 1} — ${m.title} [stance: ${m.stance}, confidence: ${m.confidence}]\n${m.opinion}`,
      )
      .join('\n\n');
    const system = this.chairSystem(bibliography, language);
    const prompt =
      `QUESTION:\n${question}\n\nCOUNCIL MEMBER OPINIONS:\n${panel}\n\n` +
      'Synthesize a single consensus verdict (4–8 sentences) that weighs the members fairly, ' +
      'keeps every claim grounded with [SOURCE: id], and explicitly notes any material dissent. ' +
      'Then output two final lines exactly:\nDISSENT: <one line, or "none">\nCONSENSUS_CONFIDENCE: <0-100>';
    try {
      const res = await this.claude.callText({
        system,
        prompt,
        maxTokens: 1100,
        temperature: 0.25,
        modelTier: chairModelTier,
      });
      return {
        verdict: stripControlLine(res.content),
        confidence: parseConfidence(res.content, /CONSENSUS_CONFIDENCE:\s*(\d{1,3})/i, members),
        dissent: parseDissent(res.content),
        citations: res.citations,
        model: res.model,
      };
    } catch (err) {
      this.logger.warn(`Council chair failed: ${(err as Error).message}`);
      // Fall back to a deterministic merge of the member opinions.
      return {
        verdict: members.map((m) => `• ${m.title}: ${m.opinion}`).join('\n'),
        confidence: Math.round(members.reduce((s, m) => s + m.confidence, 0) / members.length),
        dissent: language === 'ar' ? 'تعذّر تجميع المجلس هذه المرة.' : 'Chair synthesis unavailable this run.',
        citations: [],
        model: members[0]?.model ?? 'unknown',
      };
    }
  }

  private memberSystem(focus: string, bibliography: string | undefined, language: 'en' | 'ar'): string {
    return (
      'You are one expert member of an adjudication council for the Sigma PMO governance platform. ' +
      `${focus} ` +
      'You receive DETERMINISTIC figures the platform already computed — never recompute or change a number. ' +
      'Cite every substantive claim with [SOURCE: id] using only the bibliography below; never invent a source. ' +
      `${langRule(language)}` +
      (bibliography ? `\n\nBIBLIOGRAPHY (cite by id):\n${bibliography}` : '')
    );
  }

  private chairSystem(bibliography: string | undefined, language: 'en' | 'ar'): string {
    return (
      'You are the CHAIR of an adjudication council for the Sigma PMO governance platform. ' +
      'You receive the independent opinions of the council members and must synthesize ONE consensus verdict. ' +
      'Weigh disagreement honestly, never recompute figures, and ground every claim with [SOURCE: id] using only ' +
      `the bibliography below. ${langRule(language)}` +
      (bibliography ? `\n\nBIBLIOGRAPHY (cite by id):\n${bibliography}` : '')
    );
  }

  private disabledVerdict(question: string, language: 'en' | 'ar', extra?: string): CouncilVerdict {
    return {
      enabled: false,
      question,
      verdict:
        (language === 'ar'
          ? 'مجلس النماذج غير مُفعّل: لم يُضَف مفتاح Claude بعد (يُضاف من إعدادات النظام). تبقى الأرقام محسوبة حتمياً.'
          : 'LLM Council is not enabled: no Claude key configured (add one in Admin → Settings). The figures remain deterministic.') +
        (extra ? ` ${extra}` : ''),
      confidence: 0,
      agreement: 0,
      consensusStance: 'uncertain',
      members: [],
      dissent: '',
      citations: [],
      model: null,
      disclaimer:
        language === 'ar'
          ? 'استرشادي فقط — الأرقام حتمية؛ ويتطلّب المجلس مفتاحاً مُهيّأً.'
          : 'Advisory only — figures are deterministic; the council requires a configured key.',
    };
  }
}

// ───────────────────────── pure helpers ─────────────────────────

function langRule(language: 'en' | 'ar'): string {
  return language === 'ar'
    ? 'Write in professional Arabic, keeping standard English technical terms (NPV, IRR, DSCR, EOT, FIDIC…) inline.'
    : 'Write in professional English.';
}

function parseStance(text: string): 'agree' | 'disagree' | 'uncertain' {
  const m = /STANCE:\s*(agree|disagree|uncertain)/i.exec(text);
  return (m?.[1]?.toLowerCase() as 'agree' | 'disagree' | 'uncertain') ?? 'uncertain';
}

function parseConfidence(
  text: string,
  re: RegExp = /CONFIDENCE:\s*(\d{1,3})/i,
  fallbackMembers?: CouncilMemberOpinion[],
): number {
  const m = re.exec(text);
  if (m?.[1]) return clamp(Number.parseInt(m[1], 10));
  if (fallbackMembers && fallbackMembers.length) {
    return Math.round(fallbackMembers.reduce((s, x) => s + x.confidence, 0) / fallbackMembers.length);
  }
  return 50;
}

function parseDissent(text: string): string {
  const m = /DISSENT:\s*(.+)/i.exec(text);
  const v = m?.[1]?.trim() ?? '';
  return /^none$|^لا يوجد$/i.test(v) ? '' : v;
}

/** Remove the trailing STANCE/CONFIDENCE/DISSENT control lines from displayed prose. */
function stripControlLine(text: string): string {
  return text
    .replace(/^\s*(STANCE|CONFIDENCE|CONSENSUS_CONFIDENCE|AGREEMENT|DISSENT):.*$/gim, '')
    .trim();
}

function majorityStance(members: CouncilMemberOpinion[]): 'agree' | 'disagree' | 'uncertain' {
  const tally: Record<string, number> = { agree: 0, disagree: 0, uncertain: 0 };
  for (const m of members) tally[m.stance] += 1;
  return (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as
    | 'agree'
    | 'disagree'
    | 'uncertain') ?? 'uncertain';
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
}
function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
