import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Alert,
  ConfidenceScore,
  GovernanceDecision,
  IngestionRun,
  RuleEvaluation,
  SourceFile,
} from '../canonical/entities';

/**
 * The full traceability chain for one governance decision, ordered from the
 * decision back to its raw source bytes:
 *
 *   decision → alert → ruleEvaluation → ingestionRun → sourceFile → confidence
 *
 * Every hop answers the governance question "where did this come from, and how
 * much do we trust it?" deterministically — no LLM, just repository joins.
 */
export interface DecisionTrace {
  decision: {
    id: string;
    responsibleParty: string;
    escalationLevel: string;
    fidicClause: string | null;
    rationale: string;
    createdAt: string;
  };
  alert: {
    id: string;
    code: string;
    severity: string;
    summary: string;
    createdAt: string;
  } | null;
  ruleEvaluation: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    alertCount: number;
  } | null;
  ingestionRun: {
    id: string;
    parser: string;
    status: string;
    finishedAt: string | null;
  } | null;
  sourceFile: {
    id: string;
    filename: string;
    contentSha256: string;
    byteSize: number;
  } | null;
  confidence: {
    overall: number;
    completeness: number;
    consistency: number;
    sourceReliability: number;
  } | null;
}

/**
 * GovernanceTraceService — assembles the {@link DecisionTrace} for a decision
 * id. Distinct from `EvidenceService` (which traces an *alert* to its canonical
 * rows): this traces a *decision* through the rule-evaluation and ingestion
 * provenance so the decisions/approval UI can render the evidence path.
 */
@Injectable()
export class GovernanceTraceService {
  constructor(
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(RuleEvaluation) private readonly evaluations: Repository<RuleEvaluation>,
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    @InjectRepository(ConfidenceScore) private readonly confidences: Repository<ConfidenceScore>,
  ) {}

  async forDecision(decisionId: string): Promise<DecisionTrace> {
    const decision = await this.decisions.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found`);

    const alert = await this.alerts.findOne({ where: { id: decision.alertId } });

    const [evaluation, run, sourceFile, confidence] = await Promise.all([
      alert?.ruleEvaluationId
        ? this.evaluations.findOne({ where: { id: alert.ruleEvaluationId } })
        : Promise.resolve(null),
      alert?.ingestionRunId
        ? this.runs.findOne({ where: { id: alert.ingestionRunId } })
        : Promise.resolve(null),
      alert?.sourceFileId
        ? this.sourceFiles.findOne({ where: { id: alert.sourceFileId } })
        : Promise.resolve(null),
      alert?.ingestionRunId
        ? this.confidences.findOne({ where: { ingestionRunId: alert.ingestionRunId } })
        : Promise.resolve(null),
    ]);

    return {
      decision: {
        id: decision.id,
        responsibleParty: decision.responsibleParty,
        escalationLevel: decision.escalationLevel,
        fidicClause: decision.fidicClause,
        rationale: decision.rationale,
        createdAt: decision.createdAt.toISOString(),
      },
      alert: alert
        ? {
            id: alert.id,
            code: alert.code,
            severity: alert.severity,
            summary: alert.summary,
            createdAt: alert.createdAt.toISOString(),
          }
        : null,
      ruleEvaluation: evaluation
        ? {
            id: evaluation.id,
            status: evaluation.status,
            startedAt: evaluation.startedAt.toISOString(),
            finishedAt: evaluation.finishedAt ? evaluation.finishedAt.toISOString() : null,
            alertCount: evaluation.alertCount,
          }
        : null,
      ingestionRun: run
        ? {
            id: run.id,
            parser: run.parser,
            status: run.status,
            finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
          }
        : null,
      sourceFile: sourceFile
        ? {
            id: sourceFile.id,
            filename: sourceFile.filename,
            contentSha256: sourceFile.contentSha256,
            byteSize: sourceFile.byteSize,
          }
        : null,
      confidence: confidence
        ? {
            overall: confidence.overall,
            completeness: confidence.completeness,
            consistency: confidence.consistency,
            sourceReliability: confidence.sourceReliability,
          }
        : null,
    };
  }
}
