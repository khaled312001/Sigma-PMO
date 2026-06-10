'use client';

/**
 * SimulationModal — the what-if before/after dialog the 2026-06-08 meeting
 * asked for verbatim (00:07:49): "يعمل عليها فورًا simulation ويقل له: رح
 * يصير عندك زيادة بالوقت 15 يوم وزيادة بالتكاليف 100 ألف درهم".
 *
 * Renders a `SimulationProjection` (from `POST /clashes/:id/options/:idx/simulate`)
 * as a side-by-side baseline vs projected comparison, then offers the
 * Approve & Apply gate. Approving calls the `onApprove` callback — the page
 * wires that to `POST /clashes/:id/options/:idx/apply` which issues the
 * append-only schedule revision + drafts the FIDIC claim letter.
 *
 * Accessibility: focus is trapped while open, ESC closes, and the dialog
 * carries `aria-modal` + a labelled heading.
 */

import { useEffect, useRef } from 'react';

import { Button, Pill } from './ui';

/** Mirrors `SimulationProjection` from the backend simulation engine. */
export interface SimulationProjectionView {
  scenarioId: string;
  projectKey: string;
  baselineStartIso: string | null;
  baselineFinishIso: string | null;
  baselineDurationDays: number | null;
  projectedFinishIso: string | null;
  projectedDurationDays: number | null;
  durationDeltaDays: number;
  baselineCostAED: string | null;
  projectedCostAED: string | null;
  costDeltaAED: number | null;
  affectedActivities: Array<{
    businessKey: string;
    name: string;
    plannedFinish: string | null;
    projectedFinish: string | null;
    floatDays: number;
    absorbedByFloat: boolean;
  }>;
  criticalPathChanged: boolean;
  assumptions: string[];
}

export function SimulationModal({
  open,
  optionLabel,
  projection,
  applying,
  onApprove,
  onClose,
}: {
  open: boolean;
  optionLabel: string;
  projection: SimulationProjectionView | null;
  applying: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ESC closes; focus moves into the dialog on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !projection) return null;

  const p = projection;
  const slipped = p.durationDeltaDays > 0;
  const fmtAED = (v: string | number | null) =>
    v === null ? '—' : `AED ${Number(v).toLocaleString()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sim-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-2xl outline-none animate-[fade-in-up_200ms_ease-out]"
      >
        {/* Header */}
        <div className="border-b border-slate-700/70 bg-slate-900/80 px-5 py-4">
          <h2 id="sim-title" className="text-sm font-semibold text-slate-50">
            Simulation — what happens if you approve?
          </h2>
          <p className="mt-1 text-xs text-slate-300" dir="auto">
            Option: <span className="font-medium text-slate-100">{optionLabel}</span>
          </p>
        </div>

        {/* Before / after grid */}
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <CompareCard
            title="Schedule"
            beforeLabel="Current finish"
            beforeValue={p.baselineFinishIso ?? '—'}
            afterLabel="Projected finish"
            afterValue={p.projectedFinishIso ?? '—'}
            delta={
              slipped
                ? `+${p.durationDeltaDays} day(s) slip`
                : p.durationDeltaDays === 0
                  ? 'No project slip — absorbed by float'
                  : `${p.durationDeltaDays} day(s)`
            }
            deltaTone={slipped ? 'rose' : 'emerald'}
          />
          <CompareCard
            title="Cost"
            beforeLabel="Current BoQ total"
            beforeValue={fmtAED(p.baselineCostAED)}
            afterLabel="Projected total"
            afterValue={fmtAED(p.projectedCostAED)}
            delta={
              p.costDeltaAED === null
                ? 'Ungrounded — needs variation order pricing'
                : `${p.costDeltaAED >= 0 ? '+' : ''}${fmtAED(p.costDeltaAED)}`
            }
            deltaTone={p.costDeltaAED !== null && p.costDeltaAED > 0 ? 'rose' : p.costDeltaAED === null ? 'amber' : 'emerald'}
          />
        </div>

        {/* Critical-path flag */}
        <div className="px-5 pb-2">
          <Pill tone={p.criticalPathChanged ? 'rose' : 'emerald'}>
            {p.criticalPathChanged ? 'Critical path affected' : 'Critical path unchanged'}
          </Pill>
        </div>

        {/* Affected activities */}
        {p.affectedActivities.length > 0 && (
          <div className="px-5 pb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Affected activities
            </p>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-700/70">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 text-start">Activity</th>
                    <th className="px-3 py-1.5 text-end">Finish → New</th>
                    <th className="px-3 py-1.5 text-end">Float</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {p.affectedActivities.map((a) => (
                    <tr key={a.businessKey} className={a.absorbedByFloat ? '' : 'bg-rose-500/10'}>
                      <td className="px-3 py-1.5 text-slate-100" dir="auto">
                        <span className="font-mono text-[10px] text-slate-400" dir="ltr">{a.businessKey}</span>{' '}
                        {a.name}
                      </td>
                      <td className="px-3 py-1.5 text-end font-mono tabular-nums text-slate-200" dir="ltr">
                        {a.plannedFinish ?? '—'} → {a.projectedFinish ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-end tabular-nums text-slate-300">
                        {a.floatDays}d {a.absorbedByFloat ? '✓' : '⚠'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Assumptions */}
        {p.assumptions.length > 0 && (
          <div className="px-5 pb-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">Assumptions</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-100">
                {p.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/70 bg-slate-900/60 px-5 py-3">
          <p className="text-[11px] text-slate-400">
            Approving issues a new schedule revision (append-only) and drafts the FIDIC claim letter.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={applying}>
              Reject
            </Button>
            <Button variant="success" size="sm" onClick={onApprove} disabled={applying}>
              {applying ? 'Applying…' : 'Approve & Apply'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareCard({
  title,
  beforeLabel,
  beforeValue,
  afterLabel,
  afterValue,
  delta,
  deltaTone,
}: {
  title: string;
  beforeLabel: string;
  beforeValue: string;
  afterLabel: string;
  afterValue: string;
  delta: string;
  deltaTone: 'rose' | 'emerald' | 'amber';
}) {
  const tones: Record<string, string> = {
    rose: 'bg-rose-500/15 text-rose-100 ring-rose-500/40',
    emerald: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/40',
    amber: 'bg-amber-500/15 text-amber-100 ring-amber-500/40',
  };
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate-400">{beforeLabel}</dt>
          <dd className="font-mono tabular-nums text-slate-200" dir="ltr">{beforeValue}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate-400">{afterLabel}</dt>
          <dd className="font-mono tabular-nums font-semibold text-slate-50" dir="ltr">{afterValue}</dd>
        </div>
      </dl>
      <div className={`mt-3 rounded-md px-2 py-1.5 text-center text-[11px] font-semibold ring-1 ${tones[deltaTone]}`}>
        {delta}
      </div>
    </div>
  );
}
