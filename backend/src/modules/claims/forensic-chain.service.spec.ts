import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';

import { Claim, ClaimEvidenceLink, ContractClauseRule, Letter, Project } from '../canonical/entities';
import { ContractRulesService } from '../contract-rules/contract-rules.service';
import { EvidenceFile } from '../evidence/evidence-file.entity';
import { EvidenceItem } from '../evidence/evidence-item.entity';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { ClaimsExtrasService } from './claims-extras.service';
import { EntitlementService } from './entitlement.service';
import { ForensicDelayService } from './forensic-delay.service';

/** A real ContractRulesService — only its pure evaluate() is exercised (no I/O). */
function contractRules(): ContractRulesService {
  return new ContractRulesService(repo([]) as never, repo([]) as never);
}

function repo<T extends ObjectLiteral>(rows: T[] = [], one: T | null = null): Repository<T> {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => one),
  } as unknown as Repository<T>;
}

describe('ClaimsExtrasService.forensicChain — the forensic evidence chain', () => {
  const claim = {
    id: 'claim-1', projectBusinessKey: 'P-1000', title: 'EOT for foundations',
    type: 'eot', basis: 'Employer-instructed variation delayed the works substantially.',
    estimatedDays: 21, estimatedAmount: '120000.00', responsibleParty: 'client',
    fidicClause: 'Sub-Clause 20.1 [1999]', evidenceRefs: ['alert-1'], createdAt: new Date('2026-03-01'),
  } as unknown as Claim;

  const project = { id: 'proj-uuid', businessKey: 'P-1000', name: 'Tower A', isCurrent: true } as unknown as Project;

  const link = {
    id: 'cel-1', claimId: 'claim-1', linkType: 'letter', targetTable: 'letter', targetId: 'L-7',
    note: 'Notice of claim', sourceRef: { fileId: 'F-1', page: 2, paragraph: 3, sha256: 'abc' },
  } as unknown as ClaimEvidenceLink;

  const room = { id: 'room-1', projectBusinessKey: 'P-1000' } as unknown as EvidenceRoom;
  const file = { id: 'F-9', roomId: 'room-1', fileName: 'daily-2026-02.pdf', category: 'daily_report', sha256: 'def' } as unknown as EvidenceFile;
  const item = {
    id: 'EI-1', roomId: 'room-1', label: 'Site at standstill 12 Feb', value: 'No works recorded',
    sourceRefs: [{ fileId: 'F-9', fileName: 'daily-2026-02.pdf', page: 1, paragraph: 0 }],
  } as unknown as EvidenceItem;

  const clauseRule = {
    id: 'CR-1', projectBusinessKey: 'P-1000', isCurrent: true, clauseRef: 'Sub-Clause 20.1',
    ruleType: 'time_bar', daysToAct: 28, consequence: 'Claim time-barred if notice not given in 28 days', title: 'Notice of Claim',
  } as unknown as ContractClauseRule;

  function build() {
    const forensic = {
      analyse: jest.fn(async () => ({ projectKey: 'P-1000', entitlement: { strength: 'strong', supportedEotDays: 21 } })),
    } as unknown as ForensicDelayService;

    return new ClaimsExtrasService(
      repo([], project),                 // projects
      repo([claim], claim),              // claims
      repo([]),                          // alerts
      repo([]),                          // letters
      repo([link]),                      // evidenceLinks
      repo([clauseRule]),                // clauseRules
      repo([room]),                      // evidenceRooms
      repo([item]),                      // evidenceItems
      repo([file]),                      // evidenceFiles
      new EntitlementService(),          // entitlement
      forensic,                          // forensic
      contractRules(),                   // contractRules
    );
  }

  it('throws NotFound when the claim does not exist', async () => {
    const svc = new ClaimsExtrasService(
      repo([], null), repo([], null), repo([]), repo([]), repo([]), repo([]), repo([]), repo([]), repo([]),
      new EntitlementService(), { analyse: jest.fn() } as unknown as ForensicDelayService, contractRules(),
    );
    await expect(svc.forensicChain('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assembles claim → forensic delay → entitlement → FIDIC verdict → evidence legs', async () => {
    const svc = build();
    const chain = await svc.forensicChain('claim-1');
    expect(chain.claimId).toBe('claim-1');
    expect(chain.forensicDelay).toBeDefined();
    expect(chain.entitlement).toBeDefined();
    // FIDIC clause verdict matches the active clause rule by normalized ref.
    expect(chain.fidicClauseVerdict.rule?.id).toBe('CR-1');
    expect(chain.fidicClauseVerdict.note).toContain('28 day');
  });

  it('groups cited evidence by chain leg, source-ref\'d', async () => {
    const svc = build();
    const chain = await svc.forensicChain('claim-1');
    const byLeg = Object.fromEntries(chain.legs.map((l) => [l.linkType, l.items]));
    // The explicit link lands on the letter leg with its page/paragraph/sha256.
    expect(byLeg.letter).toHaveLength(1);
    expect(byLeg.letter[0]).toMatchObject({ source: 'link', page: 2, paragraph: 3, sha256: 'abc' });
    // The evidence-room item maps from its file category (daily_report) to that leg.
    expect(byLeg.daily_report).toHaveLength(1);
    expect(byLeg.daily_report[0]).toMatchObject({ source: 'evidence_item', fileName: 'daily-2026-02.pdf', sha256: 'def' });
  });

  it('claimPackage now carries the evidenceChain too', async () => {
    const svc = build();
    const pkg = await svc.claimPackage('claim-1');
    expect(Array.isArray(pkg.evidenceChain)).toBe(true);
    expect(pkg.evidenceChain.some((l) => l.linkType === 'letter')).toBe(true);
  });
});

describe('ClaimsExtrasService.createLink — the cited-evidence write-path', () => {
  const claim = { id: 'claim-1', projectBusinessKey: 'P-1000' } as unknown as Claim;

  function build(existingLink: ClaimEvidenceLink | null = null) {
    const saved: ClaimEvidenceLink[] = [];
    const linksRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => existingLink),
      create: jest.fn((init: Partial<ClaimEvidenceLink>) => ({ ...init }) as ClaimEvidenceLink),
      save: jest.fn(async (l: ClaimEvidenceLink) => {
        l.id = 'cel-new';
        saved.push(l);
        return l;
      }),
    } as unknown as Repository<ClaimEvidenceLink>;

    const svc = new ClaimsExtrasService(
      repo([], null),       // projects
      repo([claim], claim), // claims
      repo([]),             // alerts
      repo([]),             // letters
      linksRepo,            // evidenceLinks
      repo([]),             // clauseRules
      repo([]),             // evidenceRooms
      repo([]),             // evidenceItems
      repo([]),             // evidenceFiles
      new EntitlementService(),
      { analyse: jest.fn() } as unknown as ForensicDelayService,
      contractRules(),
    );
    return { svc, saved, linksRepo };
  }

  it('persists a ClaimEvidenceLink with linkType, target and sourceRef', async () => {
    const { svc, saved } = build();
    const link = await svc.createLink('claim-1', {
      linkType: 'letter',
      targetTable: 'letter',
      targetId: 'L-7',
      sourceRef: { fileId: 'F-1', page: 2, paragraph: 3, sha256: 'abc' },
      note: 'Notice of claim',
    });
    expect(saved).toHaveLength(1);
    expect(link.linkType).toBe('letter');
    expect(link.targetId).toBe('L-7');
    expect(link.sourceRef).toMatchObject({ fileId: 'F-1', page: 2, sha256: 'abc' });
  });

  it('is idempotent on (linkType, targetTable, targetId)', async () => {
    const existing = { id: 'cel-1', claimId: 'claim-1', linkType: 'letter', targetTable: 'letter', targetId: 'L-7' } as unknown as ClaimEvidenceLink;
    const { svc, saved } = build(existing);
    const link = await svc.createLink('claim-1', { linkType: 'letter', targetTable: 'letter', targetId: 'L-7' });
    expect(link.id).toBe('cel-1');
    expect(saved).toHaveLength(0); // no new row written
  });

  it('rejects a missing linkType', async () => {
    const { svc } = build();
    await expect(
      svc.createLink('claim-1', { linkType: '', targetTable: 'letter', targetId: 'L-7' }),
    ).rejects.toThrow(/linkType/);
  });
});
