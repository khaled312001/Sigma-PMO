import { ClassificationService } from './classification.service';

/**
 * Unit spec for the deterministic Repository-intelligence classifier. Pure
 * function — no DB, no LLM — so the assertions are exact.
 */
describe('ClassificationService', () => {
  const svc = new ClassificationService();

  it('maps an RFI title to the rfi type', () => {
    const r = svc.suggestType('RFI-014 — request for information on slab rebar');
    expect(r.recordType).toBe('rfi');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('maps a non-conformance to ncr', () => {
    expect(svc.suggestType('NCR-003 non-conformance: concrete cover defect').recordType).toBe('ncr');
  });

  it('maps an invoice / payment to cost-report', () => {
    expect(svc.suggestType('Interim Payment Certificate IPC-07 invoice').recordType).toBe('cost-report');
  });

  it('tags delay + eot regardless of type', () => {
    const r = svc.suggestType('Notice of delay and extension of time (EoT) request');
    expect(r.tags).toEqual(expect.arrayContaining(['delay', 'eot']));
  });

  it('does not match eot inside an unrelated word (word-boundary)', () => {
    const r = svc.suggestType('Promote the milestone schedule');
    expect(r.tags).not.toContain('eot');
  });

  it('falls back to other with zero confidence on no keywords', () => {
    const r = svc.suggestType('Weekly site walkaround notes');
    expect(r.recordType).toBe('other');
    expect(r.confidence).toBe(0);
  });

  it('merges suggested tags onto user tags without overwriting', () => {
    expect(svc.mergeTags(['client-priority'], ['delay', 'client-priority'])).toEqual(['client-priority', 'delay']);
  });

  it('treats a non-array existing tags value as empty', () => {
    expect(svc.mergeTags(undefined, ['safety'])).toEqual(['safety']);
    expect(svc.mergeTags('not-an-array', ['safety'])).toEqual(['safety']);
  });
});
