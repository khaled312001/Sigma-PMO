import { Injectable } from '@nestjs/common';

/** Minimal alert shape the delay analysis reads. */
export interface DelaySignal {
  id: string;
  code: string;
  severity: string;
  context: Record<string, unknown>;
}

export interface DelayEvent {
  alertId: string;
  activityKey: string | null;
  delayDays: number;
  cause: string;
}

/**
 * DelayAnalysisService — pure forensic delay extraction (Mr. Ayham's L6 delay
 * analysis). The deterministic windows are the source of truth: we read the
 * planned-vs-actual numbers the rule engine already pinned onto each
 * SCHEDULE_FINISH_SLIPPED / DURATION_OVERRUN alert and derive the day-impact.
 * No LLM — an LLM may later narrate, never compute, the delay.
 */
@Injectable()
export class DelayAnalysisService {
  fromAlerts(alerts: DelaySignal[]): DelayEvent[] {
    const events: DelayEvent[] = [];
    for (const a of alerts) {
      if (a.code !== 'SCHEDULE_FINISH_SLIPPED' && a.code !== 'DURATION_OVERRUN') continue;
      const delayDays = this.extractDelayDays(a.context);
      if (delayDays <= 0) continue;
      events.push({
        alertId: a.id,
        activityKey: (a.context['activityKey'] as string) ?? (a.context['businessKey'] as string) ?? null,
        delayDays,
        cause: a.code === 'SCHEDULE_FINISH_SLIPPED' ? 'Forecast finish later than approved baseline' : 'Activity duration overrun',
      });
    }
    return events;
  }

  /** Total day-impact across the window (sum of independent slips, capped). */
  totalDelay(events: DelayEvent[]): number {
    return events.reduce((s, e) => s + e.delayDays, 0);
  }

  private extractDelayDays(ctx: Record<string, unknown>): number {
    // Rule engine pins context like { plannedFinish, actualFinish, deltaDays } or
    // { plannedDurationDays, actualDurationDays }. Read whichever is present.
    const direct = num(ctx['deltaDays']) || num(ctx['delayDays']) || num(ctx['slipDays']);
    if (direct > 0) return Math.round(direct);
    const planned = num(ctx['plannedDurationDays']);
    const actual = num(ctx['actualDurationDays']);
    if (planned > 0 && actual > planned) return Math.round(actual - planned);
    return 0;
  }
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
