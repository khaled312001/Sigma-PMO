import { DataSource, EntityManager, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { BoqItem, ClashItem } from '../canonical/entities';
import { BoqIngestionService } from '../boq/boq-ingestion.service';
import { ClaudeService, PersonaCallResult } from '../claude/claude.service';
import { OutboxService } from '../outbox/outbox.service';
import { ClashIngestionService } from './clash-ingestion.service';
import {
  CLASH_ANALYST_PERSONA_SLUG,
  CLASH_OPTIONS_PROPOSED_EVENT_TYPE,
  ClashSolutionProposer,
} from './clash-solution-proposer.service';

/**
 * In-memory ClashItem repository fake. Mirrors the slice of TypeORM the
 * service actually calls (`findOne`, `save`). Shape stays identical to the
 * fake used by `clash-ingestion.service.spec.ts` so a reader can recognise
 * the contract at a glance.
 */
function makeClashRepo(initial: ClashItem[] = []) {
  const store = new Map<string, ClashItem>();
  for (const c of initial) store.set(c.id, c);
  return {
    store,
    findOne: jest.fn(async ({ where }: { where: Partial<ClashItem> }) => {
      if (where.id) return store.get(where.id) ?? null;
      return null;
    }),
    save: jest.fn(async (entity: ClashItem) => {
      store.set(entity.id, entity);
      return entity;
    }),
  };
}

/** In-memory BoqItem repository fake (unused by the test paths today). */
function makeBoqItemRepo() {
  const store = new Map<string, BoqItem>();
  return {
    store,
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
  };
}

/**
 * DataSource fake whose `transaction(cb)` runs the callback with an
 * EntityManager-shaped object that routes `getRepository(ClashItem)` to the
 * same in-memory ClashItem repo the service holds directly. This is the
 * minimum surface ClashSolutionProposer relies on.
 */
function makeDataSource(repos: {
  clashes: ReturnType<typeof makeClashRepo>;
}): DataSource {
  const route = (entity: unknown) => {
    if (entity === ClashItem) return repos.clashes;
    throw new Error(`Unmocked entity in test: ${(entity as { name?: string })?.name ?? entity}`);
  };
  const fakeManager = {
    getRepository: jest.fn(route),
  } as unknown as EntityManager;
  return {
    transaction: jest.fn(async <T>(cb: (mgr: EntityManager) => Promise<T>): Promise<T> => {
      return cb(fakeManager);
    }),
  } as unknown as DataSource;
}

/**
 * Outbox fake. Captures every push so the test can assert event type,
 * namespace, transactional manager presence, and the `aiEnabled` flag in
 * the payload (the fallback path sets it to false).
 */
function makeOutbox() {
  const pushes: Array<{
    layer: string;
    eventType: string;
    payload: Record<string, unknown>;
    correlationId: string | null | undefined;
    hadManager: boolean;
  }> = [];
  let idCounter = 1;
  const fake = {
    pushes,
    push: jest.fn(async (layer, eventType, payload, manager, options) => {
      pushes.push({
        layer: String(layer),
        eventType,
        payload,
        correlationId: options?.correlationId,
        hadManager: manager !== undefined && manager !== null,
      });
      return { id: `evt-${idCounter++}` };
    }),
  };
  return fake as unknown as OutboxService & typeof fake;
}

/**
 * ClaudeService fake. `isEnabled()` is parameterised; `callPersona` returns
 * the canned `PersonaCallResult` the test supplies. Captures every call so
 * we can assert the slug + context shape.
 */
function makeClaudeService(opts: {
  enabled: boolean;
  callResult?: PersonaCallResult;
}) {
  const calls: Array<{ slug: string; userQuery: string; context: unknown }> = [];
  const fake = {
    calls,
    isEnabled: jest.fn(() => opts.enabled),
    callPersona: jest.fn(async (slug: string, userQuery: string, context: unknown) => {
      calls.push({ slug, userQuery, context });
      if (!opts.callResult) {
        throw new Error('callPersona invoked without a canned result');
      }
      return opts.callResult;
    }),
  };
  return fake as unknown as ClaudeService & typeof fake;
}

/** BoqIngestionService fake — returns either a `{ boq, items }` shape or 404. */
function makeBoqIngestion(items: BoqItem[] | null) {
  const fake = {
    getCurrent: jest.fn(async () => {
      if (items === null) {
        const err: Error & { status?: number } = new Error('No current BoQ');
        err.status = 404;
        throw err;
      }
      return { boq: {} as never, items };
    }),
  };
  return fake as unknown as BoqIngestionService & typeof fake;
}

/** Minimal ClashIngestionService fake — the proposer never calls into it
 *  today, but the constructor signature requires it so the DI graph stays
 *  honest. Wave 3 may want to write back to the ingestion side; until then
 *  the service is read-only on this dep. */
function makeClashIngestion() {
  return {} as unknown as ClashIngestionService;
}

/** Build a `ClashItem` with sensible defaults. */
function makeClash(overrides: Partial<ClashItem> = {}): ClashItem {
  return {
    id: 'clash-1',
    createdAt: new Date(),
    projectBusinessKey: 'P-1',
    sourceFileId: 'sf-1',
    clashRef: 'Clash-001',
    disciplinesInvolved: ['mechanical', 'electrical'],
    severity: 'critical',
    description: 'Duct DC-101 vs Cable Tray CT-22 at A-3 (72.5 mm)',
    proposedOptions: null,
    chosenOptionIndex: null,
    decidedBy: null,
    decidedAt: null,
    ...overrides,
  } as ClashItem;
}

/** Build a canned `PersonaCallResult`. */
function makePersonaCallResult(
  responseJson: object,
  overrides: Partial<PersonaCallResult> = {},
): PersonaCallResult {
  return {
    content: JSON.stringify(responseJson),
    citations: ['fidic-red-2017'],
    tokensIn: 1200,
    tokensOut: 450,
    cached: false,
    personaSlug: CLASH_ANALYST_PERSONA_SLUG,
    personaVersion: 1,
    model: 'claude-sonnet-4-5',
    stopReason: 'end_turn',
    ...overrides,
  };
}

describe('ClashSolutionProposer', () => {
  let clashes: ReturnType<typeof makeClashRepo>;
  let boqItems: ReturnType<typeof makeBoqItemRepo>;
  let dataSource: DataSource;
  let outbox: ReturnType<typeof makeOutbox>;
  let boqIngestion: ReturnType<typeof makeBoqIngestion>;

  function buildService(opts: {
    claude: ClaudeService;
    clashRows?: ClashItem[];
  }) {
    clashes = makeClashRepo(opts.clashRows ?? [makeClash()]);
    boqItems = makeBoqItemRepo();
    dataSource = makeDataSource({ clashes });
    outbox = makeOutbox();
    boqIngestion = makeBoqIngestion([]);
    // Project/Activity repos: empty by default — the schedule-context
    // gatherer degrades to the honest "no dated activities" note, which is
    // exactly the Wave-2 behaviour these specs were written against.
    const emptyRepo = { findOne: jest.fn(async () => null), find: jest.fn(async () => []) };
    return new ClashSolutionProposer(
      dataSource,
      clashes as unknown as Repository<ClashItem>,
      boqItems as unknown as Repository<BoqItem>,
      emptyRepo as unknown as Repository<import('../canonical/entities').Project>,
      emptyRepo as unknown as Repository<import('../canonical/entities').Activity>,
      opts.claude,
      makeClashIngestion(),
      boqIngestion,
      outbox,
    );
  }

  it('rejects a blank clashId', async () => {
    const claude = makeClaudeService({ enabled: true });
    const service = buildService({ claude });
    await expect(service.proposeSolutions('')).rejects.toThrow(/clashId is required/);
  });

  it('throws 404 when no clash matches the id', async () => {
    const claude = makeClaudeService({ enabled: true });
    const service = buildService({ claude, clashRows: [] });
    await expect(service.proposeSolutions('missing')).rejects.toThrow(/No clash item/);
  });

  describe('AI-enabled path', () => {
    const canonicalResponse = {
      clashId: 'Clash-001',
      options: [
        {
          label: 'A',
          summary_ar: 'إعادة توجيه مسار الكابلات للأعلى',
          timeImpactDays: 5,
          costImpactAED: 18500,
          costNote: 'BoQ line 2.4',
          scopeImpact: 'Electrical re-route in zone A-3',
          responsibleDiscipline: 'ELEC',
          affectedDisciplines: ['MECH'],
        },
        {
          label: 'B',
          summary_ar: 'تخفيض ارتفاع مجرى الهواء',
          timeImpactDays: 3,
          costImpactAED: 9200,
          costNote: 'BoQ line 3.1',
          scopeImpact: 'Mechanical duct shortened',
          responsibleDiscipline: 'MECH',
          affectedDisciplines: ['ARCH'],
        },
        {
          label: 'C',
          summary_ar: 'تنسيق متعدد التخصصات بلا أثر زمني',
          timeImpactDays: 0,
          costImpactAED: null,
          costNote: 'بند غير مُدرَج — تنسيق فقط',
          scopeImpact: 'Multi-discipline coordination, no design change',
          responsibleDiscipline: 'ARCH',
          affectedDisciplines: ['MECH', 'ELEC'],
        },
      ],
    };

    it('persists the three options + pushes the outbox event', async () => {
      const claude = makeClaudeService({
        enabled: true,
        callResult: makePersonaCallResult(canonicalResponse),
      });
      const service = buildService({ claude });

      const outcome = await service.proposeSolutions('clash-1');

      // Persisted on the row.
      const persisted = clashes.store.get('clash-1');
      expect(persisted?.proposedOptions).toHaveLength(3);
      expect(persisted?.proposedOptions?.[0]).toEqual({
        label: 'A',
        timeImpactDays: 5,
        costImpactAED: 18500,
        scopeImpact: 'Electrical re-route in zone A-3',
      });
      expect(persisted?.proposedOptions?.[2]).toEqual({
        label: 'C',
        timeImpactDays: 0,
        costImpactAED: null,
        scopeImpact: 'Multi-discipline coordination, no design change',
      });

      // Outcome shape — aiEnabled true + persona slug + citations.
      expect(outcome.aiEnabled).toBe(true);
      expect(outcome.personaSlug).toBe(CLASH_ANALYST_PERSONA_SLUG);
      expect(outcome.personaVersion).toBe(1);
      expect(outcome.citations).toEqual(['fidic-red-2017']);
      expect(outcome.options).toHaveLength(3);
      expect(outcome.outboxEventId).toMatch(/^evt-/);

      // Outbox push: engineering namespace, transactional manager present,
      // payload carries aiEnabled true + citations + severity.
      expect(outbox.pushes).toHaveLength(1);
      const push = outbox.pushes[0];
      expect(push.layer).toBe(Layer.ENGINEERING);
      expect(push.eventType).toBe(CLASH_OPTIONS_PROPOSED_EVENT_TYPE);
      expect(push.hadManager).toBe(true);
      expect(push.correlationId).toBe('clash-1');
      expect(push.payload).toMatchObject({
        clashId: 'clash-1',
        clashRef: 'Clash-001',
        projectBusinessKey: 'P-1',
        aiEnabled: true,
        personaSlug: CLASH_ANALYST_PERSONA_SLUG,
        personaVersion: 1,
        citations: ['fidic-red-2017'],
        optionCount: 3,
        severity: 'critical',
      });

      // Persona called once with the right slug + context shape.
      expect(claude.callPersona).toHaveBeenCalledTimes(1);
      const call = claude.callPersona.mock.calls[0];
      expect(call[0]).toBe(CLASH_ANALYST_PERSONA_SLUG);
      expect(typeof call[1]).toBe('string');
      expect(call[2]).toMatchObject({ context: expect.stringContaining('Clash Record') });
      // The context must include the clash description so the persona has
      // ground truth.
      expect((call[2] as { context: string }).context).toContain('Duct DC-101');
    });

    it('accepts a bare-array response (no envelope)', async () => {
      const claude = makeClaudeService({
        enabled: true,
        callResult: makePersonaCallResult(canonicalResponse.options as unknown as object),
      });
      const service = buildService({ claude });
      const outcome = await service.proposeSolutions('clash-1');
      expect(outcome.options).toHaveLength(3);
      expect(outcome.options[0].label).toBe('A');
    });

    it('strips an accidental ```json fence around the response', async () => {
      const fenced: PersonaCallResult = makePersonaCallResult(canonicalResponse, {
        content: '```json\n' + JSON.stringify(canonicalResponse) + '\n```',
      });
      const claude = makeClaudeService({ enabled: true, callResult: fenced });
      const service = buildService({ claude });
      const outcome = await service.proposeSolutions('clash-1');
      expect(outcome.options).toHaveLength(3);
    });

    it('throws when the persona returns invalid JSON', async () => {
      const broken = makePersonaCallResult(canonicalResponse, {
        content: 'sorry, I cannot do that.',
      });
      const claude = makeClaudeService({ enabled: true, callResult: broken });
      const service = buildService({ claude });
      await expect(service.proposeSolutions('clash-1')).rejects.toThrow(
        /not valid JSON/,
      );
      // No outbox push if parse failed.
      expect(outbox.pushes).toHaveLength(0);
      // No persisted options.
      expect(clashes.store.get('clash-1')?.proposedOptions).toBeNull();
    });

    it('throws when the persona returns an empty options array', async () => {
      const empty = makePersonaCallResult({ clashId: 'Clash-001', options: [] });
      const claude = makeClaudeService({ enabled: true, callResult: empty });
      const service = buildService({ claude });
      await expect(service.proposeSolutions('clash-1')).rejects.toThrow(
        /no options array/,
      );
    });
  });

  describe('AI-offline fallback path', () => {
    it('writes three deterministic placeholder options with aiEnabled=false', async () => {
      const claude = makeClaudeService({ enabled: false });
      const service = buildService({ claude });

      const outcome = await service.proposeSolutions('clash-1');

      // Claude was NEVER called — fallback short-circuited before any SDK reach.
      expect(claude.callPersona).not.toHaveBeenCalled();

      // Outcome flags + persona fields null.
      expect(outcome.aiEnabled).toBe(false);
      expect(outcome.personaSlug).toBeNull();
      expect(outcome.personaVersion).toBeNull();
      expect(outcome.citations).toEqual([]);
      expect(outcome.options).toHaveLength(3);

      // Every option is honestly labelled as a placeholder, every number is 0/null.
      for (const opt of outcome.options) {
        expect(opt.label).toContain('AI offline');
        expect(opt.label).toContain('operator must propose');
        expect(opt.timeImpactDays).toBe(0);
        expect(opt.costImpactAED).toBeNull();
        expect(opt.scopeImpact).toBe('pending operator review');
      }

      // Persisted on the row.
      const persisted = clashes.store.get('clash-1');
      expect(persisted?.proposedOptions).toHaveLength(3);
      expect(persisted?.proposedOptions?.[0].label).toContain('AI offline');

      // Outbox push still fires so downstream layers can react; payload
      // carries aiEnabled=false so the consumer knows to skip its own AI
      // follow-ups.
      expect(outbox.pushes).toHaveLength(1);
      const push = outbox.pushes[0];
      expect(push.layer).toBe(Layer.ENGINEERING);
      expect(push.eventType).toBe(CLASH_OPTIONS_PROPOSED_EVENT_TYPE);
      expect(push.hadManager).toBe(true);
      expect(push.correlationId).toBe('clash-1');
      expect(push.payload).toMatchObject({
        clashId: 'clash-1',
        clashRef: 'Clash-001',
        projectBusinessKey: 'P-1',
        aiEnabled: false,
        personaSlug: null,
        personaVersion: null,
        citations: [],
        optionCount: 3,
        severity: 'critical',
      });
    });
  });
});
