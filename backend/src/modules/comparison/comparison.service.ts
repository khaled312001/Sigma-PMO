import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ComparisonTaskKind,
  ComparisonVerdict,
  OutputComparison,
} from '../canonical/entities/output-comparison.entity';

const TASK_KINDS: ComparisonTaskKind[] = [
  'baseline',
  'clash-resolution',
  'letter-draft',
  'monthly-report',
];

const DECIDED_VERDICTS: ComparisonVerdict[] = [
  'ai-correct',
  'human-correct',
  'both-merit',
];

export interface CreateComparisonInput {
  projectBusinessKey: string;
  taskKind: string;
  title: string;
  aiOutputId: string;
  aiSummary: string;
  humanOutputId?: string | null;
  humanSummary: string;
}

/**
 * AI-vs-Human output comparison (correction-plan §2.10).
 *
 * Pure CRUD + a verdict state machine — there is deliberately NO AI in
 * this module. The whole point of the surface is that a HUMAN project
 * director reads both outputs and records which was closer to correct;
 * automating the judgement would defeat the measurement.
 */
@Injectable()
export class ComparisonService {
  constructor(
    @InjectRepository(OutputComparison)
    private readonly comparisons: Repository<OutputComparison>,
  ) {}

  async create(input: CreateComparisonInput): Promise<OutputComparison> {
    if (!TASK_KINDS.includes(input.taskKind as ComparisonTaskKind)) {
      throw new BadRequestException(
        `taskKind must be one of: ${TASK_KINDS.join(', ')}`,
      );
    }
    for (const field of ['title', 'aiOutputId', 'aiSummary', 'humanSummary'] as const) {
      if (!input[field]?.trim()) {
        throw new BadRequestException(`${field} is required`);
      }
    }
    return this.comparisons.save(
      this.comparisons.create({
        projectBusinessKey: input.projectBusinessKey,
        taskKind: input.taskKind,
        title: input.title.trim(),
        aiOutputId: input.aiOutputId.trim(),
        aiSummary: input.aiSummary.trim(),
        humanOutputId: input.humanOutputId?.trim() || null,
        humanSummary: input.humanSummary.trim(),
        reconciliation: null,
        verdict: 'pending',
        decidedBy: null,
        decidedAt: null,
      }),
    );
  }

  list(projectBusinessKey: string): Promise<OutputComparison[]> {
    return this.comparisons.find({
      where: { projectBusinessKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<OutputComparison> {
    const row = await this.comparisons.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No comparison with id ${id}`);
    return row;
  }

  /**
   * Record (or revise) the director's verdict. Reconciliation notes are
   * optional but encouraged — they are the explainable half of the
   * training signal.
   */
  async recordVerdict(
    id: string,
    verdict: string,
    decidedBy: string,
    reconciliation?: string | null,
  ): Promise<OutputComparison> {
    if (!DECIDED_VERDICTS.includes(verdict as ComparisonVerdict)) {
      throw new BadRequestException(
        `verdict must be one of: ${DECIDED_VERDICTS.join(', ')}`,
      );
    }
    if (!decidedBy?.trim()) {
      throw new BadRequestException('decidedBy is required');
    }
    const row = await this.getById(id);
    row.verdict = verdict;
    row.decidedBy = decidedBy.trim();
    row.decidedAt = new Date();
    if (reconciliation !== undefined) {
      row.reconciliation = reconciliation?.trim() || null;
    }
    return this.comparisons.save(row);
  }
}
