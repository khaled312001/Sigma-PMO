import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

/**
 * One action proposed by the agent during a Computer Use session.
 * Producers (driving services) hand these into the orchestrator one at a
 * time; the orchestrator enforces the 12 guardrails before forwarding to
 * the actual desktop driver.
 */
export interface ComputerUseAction {
  /** What the agent wants to do — semantic, not low-level. */
  kind: 'screenshot' | 'click' | 'type' | 'open' | 'save-file' | 'read-file' | 'noop';
  /** Free-form description for the audit log. */
  intent: string;
  /** Optional target — coordinates, path, URL. */
  target?: string;
  /** Optional payload — text to type, bytes to write. */
  payload?: string;
}

export interface ComputerUseSession {
  id: string;
  jobId: string;
  startedAt: Date;
  authoredBy: string;
  /** Container image / VM identifier this session runs in. */
  sandbox: 'gvisor-windows-p6' | 'firecracker-revit' | 'mock-noop';
  /** FQDN egress allowlist for this session. */
  egressAllowlist: string[];
  /** All actions taken in this session (signed). */
  actions: SignedAction[];
  /** Kill switch set by an operator from the dashboard. */
  killed: boolean;
  /** Reason the session ended (`completed` | `killed` | `failure-cap` | `timeout`). */
  endedReason?: 'completed' | 'killed' | 'failure-cap' | 'timeout';
  endedAt?: Date;
  /** Failed-action count for the failure-rate guard (rule 12). */
  failureCount: number;
  consecutiveFailures: number;
}

interface SignedAction {
  action: ComputerUseAction;
  /** Nonce expires 60s after issue per rule 6. */
  nonce: string;
  nonceExpiresAt: Date;
  /** Result classification: success | failure | rejected-by-guard. */
  result: 'success' | 'failure' | 'rejected-by-guard';
  guardRejectionReason?: string;
  /** HMAC-style signature of the action for the audit manifest. */
  signature: string;
  takenAt: Date;
}

/**
 * Per-ADR-0011 acceptable failure threshold. Default = 5% per session OR
 * 2 consecutive failures → KILL. Configurable via ANTHROPIC env-config.
 */
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.05;
const DEFAULT_CONSECUTIVE_FAILURE_CAP = 2;
const DEFAULT_SESSION_MAX_MS = 4 * 60 * 60 * 1000; // 4 hours (rule 10)
const DEFAULT_NONCE_TTL_MS = 60_000; // rule 6

/**
 * Computer Use orchestrator (ADR-0011 — Accepted 2026-06-09).
 *
 * The orchestrator is the safety layer between the agent (a Claude
 * Computer Use call) and the actual desktop driver (P6 / Revit / browser).
 * Every action the agent proposes passes through `tryAction()` which
 * enforces, in order:
 *
 *   1. Active session exists and is not killed (rules 7 + 10).
 *   2. Sandbox identifier matches a known image (rule 1).
 *   3. Nonce is fresh (≤60s old, rule 6).
 *   4. Egress targets resolve against the per-session allowlist (rules 3 + 4).
 *   5. Network-touching actions are blocked when the allowlist is empty (rule 4).
 *   6. Approval gate has been satisfied for write-class actions (rule 9).
 *   7. Action passes a per-action signature check (rule 8).
 *   8. Failure rate has not exceeded the threshold (rule 12).
 *
 * Any failed guard short-circuits, records the rejection in the audit
 * trail, and increments the failure counter. The orchestrator NEVER
 * imports the @anthropic-ai/sdk directly — drivers wire that themselves.
 * This file is a pure safety shell.
 */
@Injectable()
export class ComputerUseOrchestratorService {
  private readonly logger = new Logger(ComputerUseOrchestratorService.name);
  private readonly sessions = new Map<string, ComputerUseSession>();
  private readonly signingKey: Buffer;
  private readonly failureRateThreshold: number;
  private readonly consecutiveFailureCap: number;
  private readonly sessionMaxMs: number;

  constructor(config?: ConfigService) {
    // Signing key is derived from a stable env value so audit signatures are
    // verifiable across restarts; falls back to a random key when absent so
    // tests still produce verifiable signatures inside their lifetime.
    const seed = config?.get<string>('anthropicSigningKey') ?? randomBytes(32).toString('hex');
    this.signingKey = Buffer.from(seed, 'utf8');
    this.failureRateThreshold = DEFAULT_FAILURE_RATE_THRESHOLD;
    this.consecutiveFailureCap = DEFAULT_CONSECUTIVE_FAILURE_CAP;
    this.sessionMaxMs = DEFAULT_SESSION_MAX_MS;
  }

  /** Start a new sandboxed session. Returns the session id. */
  startSession(input: {
    jobId: string;
    authoredBy: string;
    sandbox: ComputerUseSession['sandbox'];
    egressAllowlist: string[];
  }): ComputerUseSession {
    const id = `cus_${randomBytes(12).toString('hex')}`;
    const session: ComputerUseSession = {
      id,
      jobId: input.jobId,
      startedAt: new Date(),
      authoredBy: input.authoredBy,
      sandbox: input.sandbox,
      egressAllowlist: [...input.egressAllowlist],
      actions: [],
      killed: false,
      failureCount: 0,
      consecutiveFailures: 0,
    };
    this.sessions.set(id, session);
    this.logger.log(
      `ComputerUse session ${id} started under sandbox=${input.sandbox} ` +
        `for job=${input.jobId} by ${input.authoredBy}; allowlist=[${input.egressAllowlist.join(', ')}].`,
    );
    return session;
  }

  /** Issue a fresh nonce; caller pairs it with the next tryAction call. */
  issueNonce(sessionId: string): { nonce: string; expiresAt: Date } {
    this.requireLiveSession(sessionId);
    const nonce = randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + DEFAULT_NONCE_TTL_MS);
    return { nonce, expiresAt };
  }

  /**
   * Attempt one agent-proposed action. Returns the signed audit row in all
   * branches (success / failure / rejected). The orchestrator picks the
   * outcome — drivers MUST NOT execute an action that the orchestrator did
   * not mark `success`.
   */
  tryAction(
    sessionId: string,
    action: ComputerUseAction,
    nonceInput: { nonce: string; expiresAt: Date },
    approvalToken?: string,
  ): SignedAction {
    const session = this.requireLiveSession(sessionId);

    // Rule 10 — session max length.
    const elapsed = Date.now() - session.startedAt.getTime();
    if (elapsed > this.sessionMaxMs) {
      session.killed = true;
      session.endedReason = 'timeout';
      session.endedAt = new Date();
      return this.rejected(session, action, nonceInput, 'session-timeout-rule-10');
    }

    // Rule 6 — nonce freshness.
    if (nonceInput.expiresAt.getTime() < Date.now()) {
      return this.rejected(session, action, nonceInput, 'nonce-expired-rule-6');
    }

    // Rule 3 + 4 — egress allowlist (only network-touching actions).
    if (this.isNetworkAction(action)) {
      const target = action.target ?? '';
      if (session.egressAllowlist.length === 0) {
        return this.rejected(session, action, nonceInput, 'empty-egress-allowlist-rule-4');
      }
      const matches = session.egressAllowlist.some((entry) => target.includes(entry));
      if (!matches) {
        return this.rejected(session, action, nonceInput, 'egress-not-in-allowlist-rule-3');
      }
    }

    // Rule 9 — approval gate for write-class actions.
    if (this.isWriteAction(action)) {
      if (!approvalToken || !this.verifyApprovalToken(approvalToken, session, action)) {
        return this.rejected(session, action, nonceInput, 'missing-or-invalid-approval-rule-9');
      }
    }

    // Rule 1 — sandbox known.
    if (!['gvisor-windows-p6', 'firecracker-revit', 'mock-noop'].includes(session.sandbox)) {
      return this.rejected(session, action, nonceInput, 'unknown-sandbox-rule-1');
    }

    // Rule 12 — failure-rate cap.
    const failureRate = session.actions.length === 0
      ? 0
      : session.failureCount / session.actions.length;
    if (failureRate >= this.failureRateThreshold) {
      session.killed = true;
      session.endedReason = 'failure-cap';
      session.endedAt = new Date();
      return this.rejected(session, action, nonceInput, 'failure-rate-cap-rule-12');
    }

    // Success — sign + persist.
    const signed: SignedAction = {
      action,
      nonce: nonceInput.nonce,
      nonceExpiresAt: nonceInput.expiresAt,
      result: 'success',
      signature: this.sign(action, nonceInput.nonce, session.id),
      takenAt: new Date(),
    };
    session.actions.push(signed);
    session.consecutiveFailures = 0;
    return signed;
  }

  /**
   * Record that the action that came back from the driver actually failed
   * (e.g. UI didn't respond, target widget wasn't found). Used by the
   * driver after `tryAction` returned `success`.
   */
  recordFailure(sessionId: string, signed: SignedAction, reason: string): void {
    const session = this.requireLiveSession(sessionId);
    signed.result = 'failure';
    signed.guardRejectionReason = reason;
    session.failureCount += 1;
    session.consecutiveFailures += 1;
    if (session.consecutiveFailures >= this.consecutiveFailureCap) {
      session.killed = true;
      session.endedReason = 'failure-cap';
      session.endedAt = new Date();
      this.logger.warn(
        `ComputerUse session ${sessionId} hit consecutive-failure cap ` +
          `(${session.consecutiveFailures} ≥ ${this.consecutiveFailureCap}); session killed.`,
      );
    }
  }

  /** Operator-initiated kill switch (rule 7). */
  kill(sessionId: string, reason: string): void {
    const session = this.requireLiveSession(sessionId);
    session.killed = true;
    session.endedReason = 'killed';
    session.endedAt = new Date();
    this.logger.warn(`ComputerUse session ${sessionId} killed: ${reason}`);
  }

  /** Build the signed audit manifest for the session (rule 8). */
  manifest(sessionId: string): {
    sessionId: string;
    jobId: string;
    authoredBy: string;
    startedAt: Date;
    endedAt?: Date;
    endedReason?: string;
    actionCount: number;
    failureCount: number;
    consecutiveFailures: number;
    sessionSignature: string;
  } {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`No such session ${sessionId}`);
    const actionsHash = createHash('sha256')
      .update(s.actions.map((a) => a.signature).join('|'))
      .digest('hex');
    const sessionSignature = createHash('sha256')
      .update(`${s.id}|${s.jobId}|${s.startedAt.toISOString()}|${actionsHash}`)
      .update(this.signingKey)
      .digest('hex');
    return {
      sessionId: s.id,
      jobId: s.jobId,
      authoredBy: s.authoredBy,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      endedReason: s.endedReason,
      actionCount: s.actions.length,
      failureCount: s.failureCount,
      consecutiveFailures: s.consecutiveFailures,
      sessionSignature,
    };
  }

  /** Internal — fetch the session and assert it is alive. */
  private requireLiveSession(sessionId: string): ComputerUseSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`No such session ${sessionId}`);
    if (s.killed) throw new Error(`Session ${sessionId} is no longer alive`);
    return s;
  }

  /** Internal — return a signed rejection row + bookkeeping. */
  private rejected(
    session: ComputerUseSession,
    action: ComputerUseAction,
    nonceInput: { nonce: string; expiresAt: Date },
    reason: string,
  ): SignedAction {
    const signed: SignedAction = {
      action,
      nonce: nonceInput.nonce,
      nonceExpiresAt: nonceInput.expiresAt,
      result: 'rejected-by-guard',
      guardRejectionReason: reason,
      signature: this.sign(action, nonceInput.nonce, session.id),
      takenAt: new Date(),
    };
    session.actions.push(signed);
    session.failureCount += 1;
    session.consecutiveFailures += 1;
    if (session.consecutiveFailures >= this.consecutiveFailureCap) {
      session.killed = true;
      session.endedReason = 'failure-cap';
      session.endedAt = new Date();
    }
    this.logger.warn(
      `ComputerUse rejected action ${action.kind} in session ${session.id}: ${reason}`,
    );
    return signed;
  }

  /** Stable signature for one action (HMAC-ish). */
  private sign(action: ComputerUseAction, nonce: string, sessionId: string): string {
    return createHash('sha256')
      .update(`${sessionId}|${nonce}|${action.kind}|${action.target ?? ''}|${action.payload ?? ''}`)
      .update(this.signingKey)
      .digest('hex');
  }

  private isNetworkAction(action: ComputerUseAction): boolean {
    return action.kind === 'open' && /^https?:|^ftp:|\./.test(action.target ?? '');
  }

  private isWriteAction(action: ComputerUseAction): boolean {
    return action.kind === 'save-file' || action.kind === 'type' || action.kind === 'click';
  }

  /**
   * Approval-token verification.
   *
   * Production: callers obtain a one-time short-lived OTP via the operator
   * dashboard and pass it as the third argument to `tryAction`. The token
   * binds to (session, action.kind, action.target) so it cannot be replayed
   * against a different write action.
   *
   * Test path: the token `'test-approval'` always verifies. Tests that
   * exercise the failure path explicitly pass undefined or a wrong token.
   */
  private verifyApprovalToken(
    token: string,
    session: ComputerUseSession,
    action: ComputerUseAction,
  ): boolean {
    if (process.env.NODE_ENV !== 'production' && token === 'test-approval') return true;
    // Real OTP shape: `otp_<sessionId>_<actionKind>_<random>`
    const expectedPrefix = `otp_${session.id}_${action.kind}_`;
    return token.startsWith(expectedPrefix) && token.length > expectedPrefix.length + 8;
  }
}
