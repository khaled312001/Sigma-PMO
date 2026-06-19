import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AgentExecution, ConfidenceScore } from '../canonical/entities';
import { OutboxService } from '../outbox/outbox.service';
import {
  Agent,
  AgentDescriptor,
  AgentRunContext,
  AgentProcessResult,
} from './agent-contract.interface';

/**
 * Dependencies every agent needs for the audit + outbox machinery. Subclasses
 * pass these to `super()` so a layer "becomes an agent" by extending one class
 * and implementing two methods (`describe()` + `process()`).
 */
export interface BaseAgentDeps {
  executions: Repository<AgentExecution>;
  confidences: Repository<ConfidenceScore>;
  outbox: OutboxService;
}

/**
 * BaseAgentService — the standardized Processing-Logic + Audit-Trail engine
 * shared by every L0–L8 agent (Mr. Ayham's "each Agent an independent service
 * with a common operating model").
 *
 * Template method `run()`:
 *   1. open an `AgentExecution` audit row (status=running),
 *   2. call the subclass `process()` (the layer's actual logic),
 *   3. persist the produced `ConfidenceScore` (reuse — no new shape),
 *   4. emit the agent's Outbox events (cross-layer Outputs),
 *   5. close the audit row (completed / failed) with confidence + escalation +
 *      governance status stamped on it.
 *
 * The subclass never touches audit/outbox plumbing — it just returns an
 * `AgentProcessResult`. This guarantees EVERY agent is uniformly traceable.
 */
export abstract class BaseAgentService implements Agent {
  protected readonly logger: Logger;

  constructor(protected readonly deps: BaseAgentDeps) {
    this.logger = new Logger(this.constructor.name);
  }

  /** The static contract description (Objective/Inputs/Outputs/RuleRefs). */
  abstract describe(): AgentDescriptor;

  /** The layer's actual processing logic. Audit/outbox handled by `run()`. */
  protected abstract process(ctx: AgentRunContext): Promise<AgentProcessResult>;

  descriptor(): AgentDescriptor {
    return this.describe();
  }

  async run(ctx: AgentRunContext): Promise<AgentExecution> {
    const d = this.describe();
    const startedAt = new Date();

    let exec = await this.deps.executions.save(
      this.deps.executions.create({
        agentKey: d.agentKey,
        agentLayer: d.layer,
        personaSlug: d.personaSlug ?? null,
        personaVersion: null,
        nodeType: ctx.nodeType ?? null,
        nodeBusinessKey: ctx.nodeBusinessKey ?? ctx.projectKey ?? null,
        lifecyclePhase: ctx.lifecyclePhase ?? null,
        inputRefs: (ctx.params as Record<string, unknown>) ?? {},
        outputRefs: null,
        confidenceScoreId: null,
        confidenceOverall: null,
        escalationLevel: null,
        governanceStatus: null,
        status: 'running',
        failureReason: null,
        correlationId: ctx.correlationId ?? null,
        startedAt,
        finishedAt: null,
      }),
    );

    try {
      const result = await this.process(ctx);

      // Persist the confidence the run produced, reusing ConfidenceScore.
      let confidenceScoreId = result.confidenceScoreId ?? null;
      let confidenceOverall: number | null = null;
      if (result.confidence) {
        confidenceOverall = result.confidence.overall;
        if (!confidenceScoreId) {
          const score = await this.deps.confidences.save(
            this.deps.confidences.create({
              // Agent-run confidence is keyed on the execution id. The execution
              // id is itself a UUID (globally unique, never collides with a real
              // IngestionRun id), so we store it directly — a prefixed value like
              // `agent:<execId>` is 42 chars and overflows the char(36) column,
              // failing the INSERT under MySQL strict mode (the run path 500s).
              ingestionRunId: exec.id,
              completeness: result.confidence.completeness ?? result.confidence.overall,
              consistency: result.confidence.consistency ?? result.confidence.overall,
              sourceReliability:
                result.confidence.sourceReliability ?? result.confidence.overall,
              overall: result.confidence.overall,
              breakdown: result.confidence.breakdown ?? {},
            }),
          );
          confidenceScoreId = score.id;
        }
      }

      // Emit the cross-layer Outbox events (each must satisfy reserved prefixes).
      for (const ev of result.outboxEvents ?? []) {
        await this.deps.outbox.push(d.layer, ev.eventType, ev.payload, undefined, {
          correlationId: ctx.correlationId ?? null,
        });
      }

      exec.status = 'completed';
      exec.outputRefs = result.outputRefs ?? null;
      exec.confidenceScoreId = confidenceScoreId;
      exec.confidenceOverall = confidenceOverall;
      exec.escalationLevel = result.escalationLevel ?? null;
      exec.governanceStatus = result.governanceStatus ?? null;
      exec.finishedAt = new Date();
      exec = await this.deps.executions.save(exec);
      this.logger.log(
        `${d.agentKey} completed for ${exec.nodeBusinessKey ?? '(no node)'}: ${result.summary ?? 'ok'}`,
      );
      return exec;
    } catch (err) {
      exec.status = 'failed';
      exec.failureReason = (err as Error).message?.slice(0, 2000) ?? 'unknown error';
      exec.finishedAt = new Date();
      exec = await this.deps.executions.save(exec);
      this.logger.warn(`${d.agentKey} failed: ${exec.failureReason}`);
      throw err;
    }
  }
}
