/**
 * GovernanceStatusBadge — the 4-tier Green/Yellow/Orange/Red governance status
 * (Mr. Ayham's status categories, 2026-06-11). The L8-consolidation analog of
 * the 3-tier {@link SeverityBadge}: severity is a per-finding signal, this is
 * the rolled-up authoritative health of a hierarchy node.
 */
export type GovernanceStatus = 'green' | 'yellow' | 'orange' | 'red';

const STATUS_STYLE: Record<GovernanceStatus, string> = {
  green:  'bg-emerald-600 text-white ring-emerald-700',
  yellow: 'bg-amber-400 text-amber-950 ring-amber-500',
  orange: 'bg-orange-500 text-white ring-orange-600',
  red:    'bg-red-600 text-white ring-red-700',
};

const STATUS_LABEL: Record<GovernanceStatus, string> = {
  green: 'Green',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
};

export function GovernanceStatusBadge({
  status,
  size = 'md',
  showLabel = true,
}: {
  status: GovernanceStatus | string | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-600">
        <span className="h-2 w-2 rounded-full bg-slate-500" />
        {showLabel && 'Not computed'}
      </span>
    );
  }
  const key = (status as GovernanceStatus) in STATUS_STYLE ? (status as GovernanceStatus) : 'green';
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider ring-1 shadow-sm ${pad} ${STATUS_STYLE[key]}`}
      title={`Governance status: ${STATUS_LABEL[key]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
      {showLabel && STATUS_LABEL[key]}
    </span>
  );
}

/** A small status dot only (for dense tree rows). */
export function GovernanceStatusDot({ status }: { status: GovernanceStatus | string | null | undefined }) {
  const map: Record<string, string> = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-slate-900 ${map[status ?? ''] ?? 'bg-slate-600'}`} />;
}
