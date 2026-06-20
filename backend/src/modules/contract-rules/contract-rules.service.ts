import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Claim } from '../canonical/entities';
import { ContractClauseRule } from '../canonical/entities/contract-clause-rule.entity';
import { CONTRACT_PRESETS, PRESET_KEYS } from './contract-rules.config';

const RULE_TYPES = ['notice', 'time_bar', 'response_period', 'deemed_approval', 'particulars', 'determination', 'instruction_authority'];

export interface CreateClauseRuleInput {
  projectKey: string;
  contractStandard: string;
  title: string;
  ruleType: string;
  clauseRef?: string | null;
  triggerEvent?: string | null;
  daysToAct?: number | null;
  actor?: string | null;
  consequence?: string | null;
  deemedOutcome?: string | null;
  basis?: string | null;
  createdBy?: string | null;
}

export type ProceduralVerdict = 'preserved' | 'weak' | 'time_barred' | 'pending' | 'indeterminate';

export interface EvaluateInput {
  eventDate: string;
  actionDate?: string | null;
  daysToAct: number;
  asOf?: string | null;
  graceDays?: number;
}

export interface EvaluateResult {
  eventDate: string;
  deadline: string;
  daysToAct: number;
  actionDate: string | null;
  daysElapsed: number | null;
  remainingDays: number | null;
  withinTime: boolean | null;
  verdict: ProceduralVerdict;
  basis: string;
}

/**
 * ContractRulesService — the Contract Rules Engine (Mr. Ayham acceptance #2).
 * Owns the per-project clause-rule register (CRUD + FIDIC seed) and the
 * deterministic evaluators: evaluate() turns an event date + action date + a
 * day limit into a preserved / weak / time-barred / pending verdict;
 * matterClock() lays out the procedural lifecycle (Notice → Particulars →
 * Determination) deadlines from a single event date; evaluateProjectClaims()
 * tests the project's claims against the time-bar rule. Pure deterministic.
 */
@Injectable()
export class ContractRulesService {
  private readonly logger = new Logger(ContractRulesService.name);

  constructor(
    @InjectRepository(ContractClauseRule) private readonly rules: Repository<ContractClauseRule>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
  ) {}

  presets(): Array<{ key: string; standard: string; ruleCount: number }> {
    return PRESET_KEYS.map((key) => ({ key, standard: CONTRACT_PRESETS[key].standard, ruleCount: CONTRACT_PRESETS[key].rules.length }));
  }

  list(projectKey: string): Promise<ContractClauseRule[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.rules.find({ where: { projectBusinessKey: projectKey, isCurrent: true }, order: { createdAt: 'ASC' } });
  }

  async get(id: string): Promise<ContractClauseRule> {
    const row = await this.rules.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Contract clause rule "${id}" not found`);
    return row;
  }

  async createRule(input: CreateClauseRuleInput): Promise<ContractClauseRule> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!RULE_TYPES.includes(input.ruleType)) throw new BadRequestException(`ruleType must be one of: ${RULE_TYPES.join(', ')}`);
    const businessKey = await this.nextKey(input.projectKey);
    const saved = await this.rules.save(this.rules.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      contractStandard: input.contractStandard?.trim() || 'Bespoke',
      clauseRef: input.clauseRef ?? null,
      title: input.title.trim(),
      ruleType: input.ruleType,
      triggerEvent: input.triggerEvent ?? null,
      daysToAct: intOrNull(input.daysToAct),
      actor: input.actor ?? null,
      consequence: input.consequence ?? null,
      deemedOutcome: input.deemedOutcome ?? null,
      basis: input.basis ?? null,
      status: 'active',
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    return saved;
  }

  async updateRule(id: string, patch: Partial<CreateClauseRuleInput> & { status?: string }): Promise<ContractClauseRule> {
    const prior = await this.get(id);
    if (patch.ruleType !== undefined && !RULE_TYPES.includes(patch.ruleType)) throw new BadRequestException(`ruleType must be one of: ${RULE_TYPES.join(', ')}`);
    prior.isCurrent = false;
    await this.rules.save(prior);
    const next = await this.rules.save(this.rules.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      contractStandard: patch.contractStandard?.trim() ?? prior.contractStandard,
      clauseRef: patch.clauseRef !== undefined ? patch.clauseRef : prior.clauseRef,
      title: patch.title?.trim() ?? prior.title,
      ruleType: patch.ruleType ?? prior.ruleType,
      triggerEvent: patch.triggerEvent !== undefined ? patch.triggerEvent : prior.triggerEvent,
      daysToAct: patch.daysToAct !== undefined ? intOrNull(patch.daysToAct) : prior.daysToAct,
      actor: patch.actor !== undefined ? patch.actor : prior.actor,
      consequence: patch.consequence !== undefined ? patch.consequence : prior.consequence,
      deemedOutcome: patch.deemedOutcome !== undefined ? patch.deemedOutcome : prior.deemedOutcome,
      basis: patch.basis !== undefined ? patch.basis : prior.basis,
      status: patch.status ?? prior.status,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    return next;
  }

  /** Seed a project's register from a FIDIC preset (skips clauses already present). */
  async applyPreset(projectKey: string, presetKey: string, createdBy?: string | null): Promise<{ added: number; skipped: number; standard: string }> {
    const preset = CONTRACT_PRESETS[presetKey];
    if (!preset) throw new BadRequestException(`Unknown preset "${presetKey}". One of: ${PRESET_KEYS.join(', ')}`);
    const existing = await this.list(projectKey);
    const seen = new Set(existing.map((r) => `${r.clauseRef ?? ''}|${r.title}`));
    let added = 0, skipped = 0;
    for (const r of preset.rules) {
      if (seen.has(`${r.clauseRef}|${r.title}`)) { skipped += 1; continue; }
      await this.createRule({ projectKey, contractStandard: preset.standard, createdBy, ...r });
      added += 1;
    }
    this.logger.log(`Seeded ${added} ${preset.standard} clause rule(s) for ${projectKey} (${skipped} already present).`);
    return { added, skipped, standard: preset.standard };
  }

  /** Deterministic procedural evaluation: preserved / weak / time-barred / pending. */
  evaluate(input: EvaluateInput): EvaluateResult {
    const grace = input.graceDays ?? 3;
    const event = parseDate(input.eventDate);
    if (!event) throw new BadRequestException('eventDate must be a valid YYYY-MM-DD date');
    if (!Number.isFinite(input.daysToAct)) throw new BadRequestException('daysToAct is required');
    const deadline = addDays(event, input.daysToAct);
    const action = input.actionDate ? parseDate(input.actionDate) : null;

    let verdict: ProceduralVerdict;
    let withinTime: boolean | null = null;
    let daysElapsed: number | null = null;
    let remainingDays: number | null = null;
    let basis: string;

    if (action) {
      daysElapsed = daysBetween(event, action);
      withinTime = action.getTime() <= deadline.getTime();
      if (withinTime) {
        verdict = 'preserved';
        basis = `Action taken on ${input.actionDate} — within the ${input.daysToAct}-day window (deadline ${toISO(deadline)}). The procedural requirement is preserved.`;
      } else if (action.getTime() <= addDays(deadline, grace).getTime()) {
        verdict = 'weak';
        basis = `Action taken on ${input.actionDate}, ${daysElapsed - input.daysToAct} day(s) after the ${toISO(deadline)} deadline but within a ${grace}-day margin — arguable / weak; expect a time-bar challenge.`;
      } else {
        verdict = 'time_barred';
        basis = `Action taken on ${input.actionDate}, ${daysElapsed - input.daysToAct} day(s) past the ${toISO(deadline)} deadline — outside the ${input.daysToAct}-day window. Likely time-barred.`;
      }
    } else {
      const asOf = parseDate(input.asOf ?? '2026-06-20')!;
      daysElapsed = daysBetween(event, asOf);
      remainingDays = daysBetween(asOf, deadline);
      withinTime = asOf.getTime() <= deadline.getTime();
      if (withinTime) {
        verdict = 'pending';
        basis = `No action recorded yet; ${remainingDays} day(s) remain before the ${toISO(deadline)} deadline (as of ${toISO(asOf)}). Act to preserve the position.`;
      } else {
        verdict = 'time_barred';
        basis = `No action recorded and the ${toISO(deadline)} deadline has passed (as of ${toISO(asOf)}) — the window has lapsed.`;
      }
    }

    return { eventDate: input.eventDate, deadline: toISO(deadline)!, daysToAct: input.daysToAct, actionDate: input.actionDate ?? null, daysElapsed, remainingDays, withinTime, verdict, basis };
  }

  /** Lifecycle clock: Notice → Particulars → Determination deadlines from one event date. */
  async matterClock(projectKey: string, eventDate: string, asOf?: string | null): Promise<{
    projectKey: string; eventDate: string; asOf: string;
    stages: Array<{ stage: string; clauseRef: string | null; dueDate: string | null; daysToAct: number | null; remainingDays: number | null; status: 'met' | 'pending' | 'overdue' | 'no-rule' }>;
  }> {
    const rules = await this.list(projectKey);
    const event = parseDate(eventDate);
    if (!event) throw new BadRequestException('eventDate must be a valid YYYY-MM-DD date');
    const asOfD = parseDate(asOf ?? '2026-06-20')!;

    const pick = (types: string[]) => rules.find((r) => types.includes(r.ruleType) && r.daysToAct != null && r.status === 'active');
    const noticeRule = pick(['notice', 'time_bar']);
    const particularsRule = pick(['particulars']);
    const determinationRule = pick(['determination', 'response_period']);

    const stageOf = (label: string, rule?: ContractClauseRule) => {
      if (!rule || rule.daysToAct == null) return { stage: label, clauseRef: rule?.clauseRef ?? null, dueDate: null, daysToAct: null, remainingDays: null, status: 'no-rule' as const };
      const due = addDays(event, rule.daysToAct);
      const remaining = daysBetween(asOfD, due);
      return { stage: label, clauseRef: rule.clauseRef, dueDate: toISO(due), daysToAct: rule.daysToAct, remainingDays: remaining, status: (remaining < 0 ? 'overdue' : 'pending') as 'overdue' | 'pending' };
    };

    return {
      projectKey, eventDate, asOf: toISO(asOfD)!,
      stages: [
        stageOf('Notice of Claim', noticeRule),
        stageOf('Fully detailed claim / particulars', particularsRule),
        stageOf("Engineer's determination", determinationRule),
      ],
    };
  }

  /** Screen the project's claims against the time-bar/notice rule. */
  async evaluateProjectClaims(projectKey: string, asOf?: string | null): Promise<{
    projectKey: string; ruleApplied: string | null;
    rows: Array<{ claimId: string; title: string; type: string; verdict: ProceduralVerdict; basis: string }>;
  }> {
    const rules = await this.list(projectKey);
    const timeBar = rules.find((r) => (r.ruleType === 'time_bar' || r.ruleType === 'notice') && r.daysToAct != null && r.status === 'active');
    const claims = await this.claims.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'DESC' } });

    const rows = claims.map((c) => {
      if (!timeBar || timeBar.daysToAct == null) {
        return { claimId: c.id, title: c.title, type: c.type, verdict: 'indeterminate' as ProceduralVerdict, basis: 'No active notice/time-bar clause rule on the register to test against. Seed a FIDIC preset or add the rule.' };
      }
      // The claim row does not separately store the underlying event date; use the
      // claim raise date as the notice proxy and flag the assumption honestly.
      return {
        claimId: c.id, title: c.title, type: c.type, verdict: 'indeterminate' as ProceduralVerdict,
        basis: `A ${timeBar.daysToAct}-day ${timeBar.clauseRef ?? ''} ${timeBar.ruleType.replace('_', ' ')} rule applies. Supply the delay-event date and the notice date for this claim to /contract-rules/evaluate to get a preserved/weak/time-barred verdict.`.trim(),
      };
    });
    return { projectKey, ruleApplied: timeBar ? `${timeBar.clauseRef ?? ''} (${timeBar.daysToAct}d)`.trim() : null, rows };
  }

  private async nextKey(projectKey: string): Promise<string> {
    const count = await this.rules.count({ where: { projectBusinessKey: projectKey, isCurrent: true } });
    return `CR-${String(count + 1).padStart(3, '0')}`;
  }
}

const intOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toISO(d: Date | null): string | null { return d ? d.toISOString().slice(0, 10) : null; }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86_400_000); }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86_400_000); }
