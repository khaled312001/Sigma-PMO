import { ComputerUseOrchestratorService } from './computer-use-orchestrator.service';

describe('ComputerUseOrchestratorService', () => {
  let svc: ComputerUseOrchestratorService;

  beforeEach(() => {
    svc = new ComputerUseOrchestratorService();
  });

  function startMockSession() {
    return svc.startSession({
      jobId: 'job-1',
      authoredBy: 'planner-p6-25yr',
      sandbox: 'mock-noop',
      egressAllowlist: ['api.anthropic.com'],
    });
  }

  it('starts a session and issues fresh nonces', () => {
    const s = startMockSession();
    expect(s.id).toMatch(/^cus_/);
    const nonce = svc.issueNonce(s.id);
    expect(nonce.nonce).toHaveLength(24);
    expect(nonce.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts a read-only action with a fresh nonce and returns a signed row', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    const signed = svc.tryAction(
      s.id,
      { kind: 'screenshot', intent: 'capture P6 grid' },
      nonce,
    );
    expect(signed.result).toBe('success');
    expect(signed.signature).toHaveLength(64);
  });

  it('rejects an action whose nonce has expired (rule 6)', () => {
    const s = startMockSession();
    const expired = { nonce: 'aaaa', expiresAt: new Date(Date.now() - 1000) };
    const signed = svc.tryAction(
      s.id,
      { kind: 'screenshot', intent: 'capture' },
      expired,
    );
    expect(signed.result).toBe('rejected-by-guard');
    expect(signed.guardRejectionReason).toContain('nonce-expired');
  });

  it('rejects a write action without an approval token (rule 9)', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    const signed = svc.tryAction(
      s.id,
      { kind: 'save-file', intent: 'write XER', target: 'baseline.xer', payload: '...' },
      nonce,
    );
    expect(signed.result).toBe('rejected-by-guard');
    expect(signed.guardRejectionReason).toContain('approval');
  });

  it('accepts a write action with a valid approval token', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    const signed = svc.tryAction(
      s.id,
      { kind: 'save-file', intent: 'write XER', target: 'baseline.xer', payload: '...' },
      nonce,
      'test-approval',
    );
    expect(signed.result).toBe('success');
  });

  it('rejects a network action whose target is not in the allowlist (rule 3)', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    const signed = svc.tryAction(
      s.id,
      { kind: 'open', intent: 'fetch external', target: 'https://evil.example.com/data' },
      nonce,
    );
    expect(signed.result).toBe('rejected-by-guard');
    expect(signed.guardRejectionReason).toContain('egress');
  });

  it('accepts a network action whose target matches the allowlist', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    const signed = svc.tryAction(
      s.id,
      { kind: 'open', intent: 'call anthropic', target: 'https://api.anthropic.com/v1/messages' },
      nonce,
    );
    expect(signed.result).toBe('success');
  });

  it('honours the operator kill switch (rule 7)', () => {
    const s = startMockSession();
    svc.kill(s.id, 'operator clicked stop');
    const nonce = { nonce: 'x', expiresAt: new Date(Date.now() + 60000) };
    expect(() =>
      svc.tryAction(s.id, { kind: 'screenshot', intent: 'after kill' }, nonce),
    ).toThrow(/no longer alive/);
  });

  it('kills the session when consecutive failures hit the cap (rule 12)', () => {
    const s = startMockSession();
    const nonce1 = svc.issueNonce(s.id);
    svc.tryAction(s.id, { kind: 'screenshot', intent: 'a' }, nonce1); // success → resets consecutive
    const signed1 = svc.tryAction(
      s.id,
      { kind: 'save-file', intent: 'no-approval', target: 'f', payload: 'p' },
      svc.issueNonce(s.id),
    );
    expect(signed1.result).toBe('rejected-by-guard');
    const signed2 = svc.tryAction(
      s.id,
      { kind: 'save-file', intent: 'still-no-approval', target: 'f', payload: 'p' },
      svc.issueNonce(s.id),
    );
    expect(signed2.result).toBe('rejected-by-guard');
    // After two consecutive failures the session should be killed.
    expect(() => svc.issueNonce(s.id)).toThrow(/no longer alive/);
  });

  it('produces a signed manifest for audit', () => {
    const s = startMockSession();
    const nonce = svc.issueNonce(s.id);
    svc.tryAction(s.id, { kind: 'screenshot', intent: 'a' }, nonce);
    const mf = svc.manifest(s.id);
    expect(mf.sessionId).toBe(s.id);
    expect(mf.actionCount).toBe(1);
    expect(mf.sessionSignature).toHaveLength(64);
  });
});
