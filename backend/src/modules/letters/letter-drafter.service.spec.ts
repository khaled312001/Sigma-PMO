import { Repository } from 'typeorm';

import { SourceFile } from '../canonical/entities';
import { ClaudeService, PersonaCallResult } from '../claude/claude.service';
import { Source } from '../sources/source.entity';
import { SourcesService } from '../sources/sources.service';
import {
  FIDIC_PERSONA_SLUG,
  LetterDrafterRejection,
  LetterDrafterService,
} from './letter-drafter.service';
import { Letter } from './letter.entity';

/**
 * In-memory `Letter` repository. The drafter only calls `create`/`save`/
 * `find`/`findOne` so we narrow the fake to that surface.
 */
function makeLetterRepo() {
  const store = new Map<string, Letter>();
  let counter = 1;
  return {
    store,
    create: jest.fn(<T extends Partial<Letter>>(init: T): Letter => ({ ...init }) as Letter),
    save: jest.fn(async (entity: Letter) => {
      if (!entity.id) entity.id = `letter-${counter++}`;
      if (!entity.createdAt) entity.createdAt = new Date();
      store.set(entity.id, entity);
      return entity;
    }),
    find: jest.fn(
      async ({ where }: { where?: Partial<Letter> }) => {
        const all = [...store.values()];
        if (where?.projectBusinessKey) {
          return all.filter((l) => l.projectBusinessKey === where.projectBusinessKey);
        }
        return all;
      },
    ),
    findOne: jest.fn(async ({ where }: { where: Partial<Letter> }) => {
      if (where.id) return store.get(where.id) ?? null;
      return null;
    }),
  };
}

/** `SourceFile` repository fake — the drafter only calls `findOne` on it. */
function makeSourceFileRepo() {
  const store = new Map<string, SourceFile>();
  return {
    store,
    findOne: jest.fn(async ({ where }: { where: Partial<SourceFile> }) => {
      if (where.id) return store.get(where.id) ?? null;
      return null;
    }),
  };
}

/**
 * Build a minimal `SourcesService` fake. The drafter only calls
 * `findByExternalId`, so we wire that single method against a Map.
 */
function makeSourcesService(knownExternalIds: string[]): SourcesService {
  const set = new Set(knownExternalIds);
  const fake = {
    findByExternalId: jest.fn(async (externalId: string) => {
      if (!set.has(externalId)) {
        const err = new Error(`No source with externalId ${externalId}`);
        (err as Error & { status?: number }).status = 404;
        throw err;
      }
      return { externalId, family: 'FIDIC' } as Source;
    }),
  };
  return fake as unknown as SourcesService;
}

/**
 * `ClaudeService` fake — accepts a canned `PersonaCallResult` and records
 * the slug + userMessage + context the drafter passed in. We do NOT extend
 * the real class because it pulls Anthropic SDK types we want isolated
 * from the test process.
 */
function makeClaudeService(result: PersonaCallResult) {
  const calls: Array<{ slug: string; userMessage: string; context?: string }> = [];
  const fake = {
    calls,
    isEnabled: jest.fn(() => true),
    callPersona: jest.fn(
      async (slug: string, userMessage: string, ctx?: { context?: string }) => {
        calls.push({ slug, userMessage, context: ctx?.context });
        return result;
      },
    ),
    extractCitations: jest.fn((s: string) => {
      const re = /\[SOURCE:\s*([A-Za-z0-9._:-]+)\s*\]/g;
      const seen = new Set<string>();
      for (const m of s.matchAll(re)) if (m[1]) seen.add(m[1]);
      return [...seen];
    }),
  };
  return fake as unknown as ClaudeService & typeof fake;
}

/** Convenience: build a canned PersonaCallResult with one JSON envelope. */
function cannedJsonResult(
  overrides: Partial<{
    applicableSubClause: string;
    bookEdition: string;
    deadlineDays: number | string;
    draftReplyAr: string;
    draftReplyEn: string;
    subject: string;
    citations: string[];
  }> = {},
): PersonaCallResult {
  const payload = {
    applicableSubClause: overrides.applicableSubClause ?? 'Sub-Clause 20.1',
    bookEdition: overrides.bookEdition ?? '1999',
    deadlineDays: overrides.deadlineDays ?? 28,
    draftReplyAr:
      overrides.draftReplyAr ??
      'بالعربية: نرفض المطالبة الواردة من المقاول وفقاً للبند 20.1 من الكتاب الأحمر.',
    draftReplyEn:
      overrides.draftReplyEn ??
      'We reject the contractor claim per Sub-Clause 20.1 of the Red Book.',
    subject: overrides.subject ?? 'Reply to EOT Notice — Sub-Clause 20.1',
    contradictions: [],
    missingInputs: [],
    confidence: 0.9,
  };
  const jsonBlock = '```json\n' + JSON.stringify(payload) + '\n```';
  const citationLine =
    overrides.citations !== undefined
      ? overrides.citations.map((id) => `[SOURCE: ${id}]`).join(' ')
      : '[SOURCE: fidic-red-1999] [SOURCE: aace-rp-29r-03]';
  const content = `${jsonBlock}\n\n${citationLine}`;
  return {
    content,
    citations:
      overrides.citations !== undefined
        ? overrides.citations
        : ['fidic-red-1999', 'aace-rp-29r-03'],
    tokensIn: 1200,
    tokensOut: 380,
    cached: false,
    personaSlug: FIDIC_PERSONA_SLUG,
    personaVersion: 1,
    model: 'claude-sonnet-4-5',
    stopReason: 'end_turn',
  };
}

describe('LetterDrafterService', () => {
  let letters: ReturnType<typeof makeLetterRepo>;
  let sourceFiles: ReturnType<typeof makeSourceFileRepo>;
  let claude: ReturnType<typeof makeClaudeService>;
  let sources: SourcesService;
  let service: LetterDrafterService;

  beforeEach(() => {
    letters = makeLetterRepo();
    sourceFiles = makeSourceFileRepo();
    claude = makeClaudeService(cannedJsonResult());
    sources = makeSourcesService(['fidic-red-1999', 'fidic-red-2017', 'aace-rp-29r-03']);
    service = new LetterDrafterService(
      letters as unknown as Repository<Letter>,
      sourceFiles as unknown as Repository<SourceFile>,
      claude,
      sources,
    );
  });

  describe('draftFromIncoming', () => {
    it('requires letterSourceFileId and projectKey', async () => {
      await expect(service.draftFromIncoming('', 'P-1')).rejects.toThrow(
        /letterSourceFileId/,
      );
      await expect(service.draftFromIncoming('sf-1', '')).rejects.toThrow(/projectKey/);
    });

    it('throws NotFound when the source file id does not resolve', async () => {
      await expect(service.draftFromIncoming('missing', 'P-1')).rejects.toThrow(
        /No source file/,
      );
    });

    it('persists a draft Letter with the parsed FIDIC clause, deadline, and citations', async () => {
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'contractor-letter.pdf',
        storedPath: '', // empty → drafter uses placeholder, exercise the fallback
      } as SourceFile);

      const letter = await service.draftFromIncoming('sf-1', 'P-1');

      // ClaudeService was called with the FIDIC persona slug.
      expect(claude.callPersona).toHaveBeenCalledTimes(1);
      const call = claude.calls[0];
      expect(call.slug).toBe(FIDIC_PERSONA_SLUG);
      // The context wraps the incoming letter in the safe envelope.
      expect(call.context).toMatch(/<untrusted_contractor_letter/);
      expect(call.context).toMatch(/<\/untrusted_contractor_letter>/);

      // The persisted Letter row matches the parsed JSON envelope.
      expect(letter.id).toMatch(/^letter-/);
      expect(letter.status).toBe('draft');
      expect(letter.projectBusinessKey).toBe('P-1');
      expect(letter.incomingLetterSourceFileId).toBe('sf-1');
      expect(letter.trigger).toBe('incoming-letter');
      expect(letter.fidicClauseRef).toBe('Sub-Clause 20.1 [1999]');
      expect(letter.deadlineDays).toBe(28);
      expect(letter.bodyAr).toMatch(/الكتاب الأحمر/);
      expect(letter.bodyEn).toMatch(/Red Book/);
      // Citations are the deduplicated, validated subset of the persona response.
      expect(letter.citations).toEqual(['fidic-red-1999', 'aace-rp-29r-03']);
    });

    it('rejects with missing-citations when the persona returns zero [SOURCE: id] markers', async () => {
      claude = makeClaudeService(cannedJsonResult({ citations: [] }));
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'incoming.pdf',
        storedPath: '',
      } as SourceFile);

      await expect(service.draftFromIncoming('sf-1', 'P-1')).rejects.toMatchObject({
        code: 'missing-citations',
      });
      // No letter was persisted.
      expect(letters.store.size).toBe(0);
    });

    it('rejects with unknown-citation when the persona fabricates a source id', async () => {
      claude = makeClaudeService(
        cannedJsonResult({ citations: ['fidic-red-1999', 'not-a-real-source'] }),
      );
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'incoming.pdf',
        storedPath: '',
      } as SourceFile);

      await expect(service.draftFromIncoming('sf-1', 'P-1')).rejects.toMatchObject({
        code: 'unknown-citation',
      });
      expect(letters.store.size).toBe(0);
    });

    it('parses TBD pending data into a null deadline rather than zero', async () => {
      claude = makeClaudeService(
        cannedJsonResult({ deadlineDays: 'TBD pending data' as unknown as number }),
      );
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'incoming.pdf',
        storedPath: '',
      } as SourceFile);
      const letter = await service.draftFromIncoming('sf-1', 'P-1');
      expect(letter.deadlineDays).toBeNull();
    });

    it('rejects unparseable-response when the persona returns an empty body', async () => {
      const empty: PersonaCallResult = {
        content: '   ',
        citations: ['fidic-red-1999'],
        tokensIn: 10,
        tokensOut: 0,
        cached: false,
        personaSlug: FIDIC_PERSONA_SLUG,
        personaVersion: 1,
        model: 'claude-sonnet-4-5',
        stopReason: 'end_turn',
      };
      claude = makeClaudeService(empty);
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'incoming.pdf',
        storedPath: '',
      } as SourceFile);
      await expect(service.draftFromIncoming('sf-1', 'P-1')).rejects.toMatchObject({
        code: 'unparseable-response',
      });
    });

    it('falls back to marker parsing when the response is not JSON', async () => {
      const markerResponse: PersonaCallResult = {
        content:
          'Subject: Notice of EOT Refusal\n' +
          'Sub-Clause: 20.1 [1999]\n' +
          'Deadline: 28 days\n\n' +
          'بالعربية:\nنرفض الطلب وفقاً للبند 20.1.\n\n' +
          'In English:\nWe refuse the claim per Sub-Clause 20.1.\n\n' +
          '[SOURCE: fidic-red-1999]',
        citations: ['fidic-red-1999'],
        tokensIn: 100,
        tokensOut: 50,
        cached: false,
        personaSlug: FIDIC_PERSONA_SLUG,
        personaVersion: 1,
        model: 'claude-sonnet-4-5',
        stopReason: 'end_turn',
      };
      claude = makeClaudeService(markerResponse);
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'incoming.pdf',
        storedPath: '',
      } as SourceFile);
      const letter = await service.draftFromIncoming('sf-1', 'P-1');
      expect(letter.subject).toBe('Notice of EOT Refusal');
      expect(letter.fidicClauseRef).toBe('20.1 [1999]');
      expect(letter.deadlineDays).toBe(28);
      expect(letter.bodyAr).toMatch(/نرفض الطلب/);
      expect(letter.bodyEn).toMatch(/refuse the claim/);
    });
  });

  describe('draftComplianceLetter', () => {
    it('requires projectKey, trigger and narrative', async () => {
      await expect(
        service.draftComplianceLetter('', 'pmi.org-chart', {
          triggerCode: 'pmi.org-chart',
          narrative: 'x',
        }),
      ).rejects.toThrow(/projectKey/);
      await expect(
        service.draftComplianceLetter('P-1', '', {
          triggerCode: '',
          narrative: 'x',
        }),
      ).rejects.toThrow(/complianceTrigger/);
      await expect(
        service.draftComplianceLetter('P-1', 'pmi.org-chart', {
          triggerCode: 'pmi.org-chart',
          narrative: '',
        }),
      ).rejects.toThrow(/narrative/);
    });

    it('persists a compliance draft without an incomingLetterSourceFileId', async () => {
      const letter = await service.draftComplianceLetter(
        'P-2',
        'pmi.org-chart-non-compliance',
        {
          triggerCode: 'pmi.org-chart-non-compliance',
          narrative: 'QA/QC Manager role unfilled for 14 days; PMI PMBOK-7 stakeholder domain.',
          facts: { vacantSince: '2026-05-25', roleSlug: 'qa-qc-manager' },
        },
      );

      expect(letter.trigger).toBe('compliance-flag');
      expect(letter.incomingLetterSourceFileId).toBeNull();
      expect(letter.projectBusinessKey).toBe('P-2');
      expect(letter.status).toBe('draft');
      expect(letter.citations.length).toBeGreaterThan(0);
      // Context envelope is a compliance trigger, not an incoming letter.
      const ctx = claude.calls[0].context!;
      expect(ctx).toMatch(/<compliance_trigger/);
      expect(ctx).toMatch(/pmi.org-chart-non-compliance/);
      // The facts JSON makes it into the envelope.
      expect(ctx).toMatch(/qa-qc-manager/);
    });

    it('still enforces the citation gate on compliance drafts', async () => {
      claude = makeClaudeService(cannedJsonResult({ citations: [] }));
      service = new LetterDrafterService(
        letters as unknown as Repository<Letter>,
        sourceFiles as unknown as Repository<SourceFile>,
        claude,
        sources,
      );
      await expect(
        service.draftComplianceLetter('P-1', 'pmi.x', {
          triggerCode: 'pmi.x',
          narrative: 'something',
        }),
      ).rejects.toBeInstanceOf(LetterDrafterRejection);
    });
  });

  describe('listByProject + getById', () => {
    it('returns only letters for the requested project', async () => {
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'a.pdf',
        storedPath: '',
      } as SourceFile);
      sourceFiles.store.set('sf-2', {
        id: 'sf-2',
        filename: 'b.pdf',
        storedPath: '',
      } as SourceFile);
      await service.draftFromIncoming('sf-1', 'P-A');
      await service.draftFromIncoming('sf-2', 'P-B');

      const onlyA = await service.listByProject('P-A');
      expect(onlyA).toHaveLength(1);
      expect(onlyA[0].projectBusinessKey).toBe('P-A');
    });

    it('getById throws NotFound for an unknown id', async () => {
      await expect(service.getById('does-not-exist')).rejects.toThrow(/No letter/);
    });
  });

  describe('approve', () => {
    it('flips draft → approved and is idempotent on a second call', async () => {
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'a.pdf',
        storedPath: '',
      } as SourceFile);
      const draft = await service.draftFromIncoming('sf-1', 'P-1');
      expect(draft.status).toBe('draft');

      const approved = await service.approve(draft.id);
      expect(approved.status).toBe('approved');

      const again = await service.approve(draft.id);
      expect(again.status).toBe('approved');
    });

    it('refuses to re-approve a sent letter', async () => {
      sourceFiles.store.set('sf-1', {
        id: 'sf-1',
        filename: 'a.pdf',
        storedPath: '',
      } as SourceFile);
      const draft = await service.draftFromIncoming('sf-1', 'P-1');
      // Simulate sent state (Wave 2 has no send route — manual flip for the test).
      draft.status = 'sent';
      letters.store.set(draft.id, draft);
      await expect(service.approve(draft.id)).rejects.toThrow(/already sent/);
    });
  });
});
