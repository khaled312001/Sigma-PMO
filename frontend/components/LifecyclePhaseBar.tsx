/**
 * LifecyclePhaseBar — the governance lifecycle stepper (Mr. Ayham's lifecycle-
 * driven governance: Initiation → Planning → Execution → Monitoring & Control →
 * Closure). Highlights the current phase; the same five phases apply across
 * projects, programs, portfolios and enterprise governance.
 */
export const LIFECYCLE_PHASES = [
  { key: 'initiation', label: 'Initiation' },
  { key: 'planning', label: 'Planning' },
  { key: 'execution', label: 'Execution' },
  { key: 'monitoring_control', label: 'Monitoring & Control' },
  { key: 'closure', label: 'Closure' },
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number]['key'];

export function LifecyclePhaseBar({
  current,
  onSelect,
}: {
  current?: string | null;
  onSelect?: (phase: LifecyclePhase) => void;
}) {
  const currentIdx = LIFECYCLE_PHASES.findIndex((p) => p.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Governance lifecycle">
      {LIFECYCLE_PHASES.map((p, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const active = i === currentIdx;
        const Tag = onSelect ? 'button' : 'div';
        return (
          <Tag
            key={p.key}
            {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(p.key) } : {})}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] transition ${
              active
                ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/60'
                : done
                  ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 ring-1 ring-slate-700'
            } ${onSelect ? 'hover:ring-slate-500' : ''}`}
          >
            <span className={`grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold ${
              active ? 'bg-sky-400 text-sky-950' : done ? 'bg-emerald-400 text-emerald-950' : 'bg-slate-700 text-slate-300'
            }`}>{i + 1}</span>
            {p.label}
          </Tag>
        );
      })}
    </div>
  );
}
