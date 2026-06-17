import { Injectable, Logger, Optional } from '@nestjs/common';

import { ClaudeService } from '../claude/claude.service';
import { LlmCouncilService } from '../claude/llm-council.service';
import { DomainKey, DomainReference, referencesFor } from './domain-references';

export interface AnalysisResult {
  enabled: boolean;
  domain: DomainKey;
  language: 'en' | 'ar';
  narrative: string;
  citations: string[];
  sources: Array<{ id: string; title: string; author: string; reference: string; url?: string; cited: boolean }>;
  model: string | null;
  disclaimer: string;
  /** Present when the narrative was produced by the LLM Council (multi-member). */
  council?: {
    agreement: number;
    confidence: number;
    consensusStance: 'agree' | 'disagree' | 'uncertain';
    members: number;
    dissent: string;
  };
}

/**
 * AiAnalysisService — the cross-module AI narration layer (Mr. Ayham,
 * 2026-06-12: "all modules AI-supported … with real scientific evidence from
 * books or domain websites"). Any module hands it a DETERMINISTIC context
 * (the numbers/findings it already computed) + a domain; the service asks
 * Claude to analyse and ground the narrative in the REAL domain references,
 * citing them via `[SOURCE: id]`. We then map the citations back to the
 * bibliography so the UI shows exactly which sources were used.
 *
 * Safety contract: the AI NEVER computes the figures (deterministic-first) and
 * NEVER invents sources — only the supplied bibliography is citeable. When no
 * Claude key is configured the service returns a graceful, honest result
 * (no fabricated narrative) listing the relevant references for manual review.
 */
@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    private readonly claude: ClaudeService,
    @Optional() private readonly council?: LlmCouncilService,
  ) {}

  isEnabled(): boolean {
    return this.claude.isEnabled();
  }

  async analyse(input: {
    domain: DomainKey;
    title: string;
    context: Record<string, unknown> | string;
    language?: 'en' | 'ar';
    /** Force LLM-Council deliberation; defaults to the configured council mode. */
    council?: boolean;
  }): Promise<AnalysisResult> {
    const language = input.language ?? 'en';
    const refs = referencesFor(input.domain);
    const contextText = typeof input.context === 'string' ? input.context : JSON.stringify(input.context, null, 2);

    if (!this.claude.isEnabled()) {
      return {
        enabled: false,
        domain: input.domain,
        language,
        narrative: language === 'ar'
          ? 'تحليل الذكاء الاصطناعي غير مُفعّل: لم يُضَف مفتاح Claude بعد (يُضاف من إعدادات النظام). فيما يلي المصادر العلمية ذات الصلة للمراجعة اليدوية، والأرقام محسوبة حتمياً بالفعل أعلاه.'
          : 'AI analysis is not enabled: no Claude key configured (add one in Admin → Settings). The relevant scientific references are listed below for manual review; the figures above are already computed deterministically.',
        citations: [],
        sources: refs.map((r) => ({ id: r.id, title: r.title, author: r.author, reference: r.reference, url: r.url, cited: false })),
        model: null,
        disclaimer: 'Advisory only — figures are deterministic; AI narration requires a configured key.',
      };
    }

    // LLM Council mode (Mr. Ayham, 2026-06-17): deliberate the deterministic
    // findings through a multi-member council instead of a single pass.
    const useCouncil = (input.council ?? this.council?.isDefaultMode() ?? false) && !!this.council;
    if (useCouncil && this.council) {
      try {
        const v = await this.council.adjudicate({
          question: `${input.title} — are the platform's deterministic findings sound and well-governed, and what should the owner do next?`,
          context: contextText,
          bibliography: this.buildBibliography(refs),
          language,
        });
        const cited = new Set(v.citations);
        this.logger.log(
          `AI council analysis (${input.domain}, ${language}): ${v.members.length} members, ` +
            `agreement=${v.agreement}%, confidence=${v.confidence}%.`,
        );
        return {
          enabled: true, domain: input.domain, language,
          narrative: v.verdict, citations: v.citations,
          sources: refs.map((r) => ({ id: r.id, title: r.title, author: r.author, reference: r.reference, url: r.url, cited: cited.has(r.id) })),
          model: v.model, disclaimer: v.disclaimer,
          council: { agreement: v.agreement, confidence: v.confidence, consensusStance: v.consensusStance, members: v.members.length, dissent: v.dissent },
        };
      } catch (err) {
        this.logger.warn(`Council analysis failed for ${input.domain}, falling back to single pass: ${(err as Error).message}`);
        // fall through to single-pass below
      }
    }

    const system = this.buildSystem(refs, language);
    const prompt = this.buildPrompt(input.title, contextText, language);

    try {
      const res = await this.claude.callText({ system, prompt, maxTokens: 1600, temperature: 0.3 });
      const citedIds = new Set(res.citations);
      this.logger.log(`AI analysis (${input.domain}, ${language}): ${res.tokensOut} tokens, ${res.citations.length} citation(s).`);
      return {
        enabled: true,
        domain: input.domain,
        language,
        narrative: res.content,
        citations: res.citations,
        sources: refs.map((r) => ({ id: r.id, title: r.title, author: r.author, reference: r.reference, url: r.url, cited: citedIds.has(r.id) })),
        model: res.model,
        disclaimer: language === 'ar'
          ? 'تحليل استرشادي يستند إلى أرقام محسوبة حتمياً ومصادر علمية حقيقية — للمراجعة البشرية، وليس قراراً نهائياً.'
          : 'Advisory analysis grounded in deterministic figures and real scientific sources — for human review, not a final decision.',
      };
    } catch (err) {
      this.logger.warn(`AI analysis failed for ${input.domain}: ${(err as Error).message}`);
      return {
        enabled: true, domain: input.domain, language,
        narrative: language === 'ar' ? `تعذّر إجراء تحليل الذكاء الاصطناعي: ${(err as Error).message}` : `AI analysis failed: ${(err as Error).message}`,
        citations: [], sources: refs.map((r) => ({ id: r.id, title: r.title, author: r.author, reference: r.reference, url: r.url, cited: false })),
        model: null, disclaimer: 'Analysis unavailable this run; figures remain deterministic.',
      };
    }
  }

  /** The citeable bibliography for a domain, one "[id] title — author, ref" per line. */
  private buildBibliography(refs: DomainReference[]): string {
    return refs.map((r) => `[${r.id}] ${r.title} — ${r.author}, ${r.reference}${r.url ? ` (${r.url})` : ''}`).join('\n');
  }

  private buildSystem(refs: DomainReference[], language: 'en' | 'ar'): string {
    const bib = this.buildBibliography(refs);
    const langRule = language === 'ar'
      ? 'Write the analysis in professional Arabic, keeping standard English technical terms (NPV, IRR, BOQ, NRM, DSCR…) inline.'
      : 'Write the analysis in professional English.';
    return (
      'You are a senior construction cost, procurement and investment governance analyst for the Sigma PMO platform. ' +
      'You receive DETERMINISTIC figures that the platform already computed — never recompute or change a number; ' +
      'explain, interpret and advise on them. Ground every substantive claim in the provided reference library and ' +
      'cite it inline using the marker [SOURCE: id] with the exact id from the library. Do NOT cite any source not in ' +
      'the library, and do not invent figures. Be concise, governance-oriented, and end with clear recommended actions. ' +
      `${langRule}\n\nREFERENCE LIBRARY (cite by id):\n${bib}`
    );
  }

  private buildPrompt(title: string, contextText: string, language: 'en' | 'ar'): string {
    const ask = language === 'ar'
      ? 'حلّل ما يلي بإيجاز: ماذا تعني الأرقام؟ أين المخاطر الحوكمية؟ ما الإجراءات الموصى بها؟ استشهد بالمصادر بصيغة [SOURCE: id].'
      : 'Analyse the following briefly: what do the numbers mean, where are the governance risks, and what actions are recommended? Cite sources as [SOURCE: id].';
    return `Subject: ${title}\n\nDeterministic context (already computed by the platform):\n${contextText}\n\n${ask}`;
  }
}
