'use client';

import { AlertRecord } from '../lib/api';

/** Consistent page header used by every route. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-800/70 pb-4">
      <div>
        {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Card with optional title row. */
export function Card({
  title,
  hint,
  actions,
  children,
  padded = true,
  className = '',
}: {
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-700 bg-slate-900/85 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-800/70 px-5 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {hint && <p className="text-xs text-slate-400">{hint}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

/** Severity pill — single source of truth for alert/decision colour.
 *  Opacity bumped so the badge reads against tinted parent surfaces
 *  (e.g. the rose-tinted "Critical findings" ribbon) instead of vanishing. */
export function SeverityBadge({ severity }: { severity: AlertRecord['severity'] }) {
  const map: Record<AlertRecord['severity'], string> = {
    critical: 'bg-red-600 text-white ring-red-700',
    warning:  'bg-amber-500 text-amber-950 ring-amber-600',
    info:     'bg-sky-600 text-white ring-sky-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 shadow-sm ${map[severity]}`}>
      {severity}
    </span>
  );
}

/** Generic label pill — opacity bumped (was /10 → /30+border) so it stands
 *  out on tinted backgrounds. Text uses light-mode-friendly weights. */
export function Pill({ children, tone = 'slate', className = '' }: { children: React.ReactNode; tone?: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'; className?: string }) {
  const tones: Record<string, string> = {
    slate:   'bg-slate-700 text-slate-100 ring-slate-600',
    sky:     'bg-sky-500/30 text-sky-100 ring-sky-400/70',
    emerald: 'bg-emerald-500/30 text-emerald-100 ring-emerald-400/70',
    amber:   'bg-amber-500/35 text-amber-50 ring-amber-400/70',
    rose:    'bg-rose-500/35 text-rose-50 ring-rose-400/70',
    violet:  'bg-violet-500/30 text-violet-100 ring-violet-400/70',
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]} ${className}`}>{children}</span>;
}

/** Confidence bar with deterministic colour. */
export function ConfidenceBar({ value, width = 96 }: { value: number | null | undefined; width?: number }) {
  if (value === null || value === undefined) return <span className="text-xs text-slate-500">—</span>;
  const color = value >= 0.9 ? 'bg-emerald-500' : value >= 0.75 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" style={{ width }}>
        <div className={`h-full ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-300">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

/** Primary / secondary / destructive button. */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  onClick,
  type = 'button',
  children,
  className = '',
  title,
}: {
  variant?: 'primary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-sky-600 text-white hover:bg-sky-500',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500',
    danger:  'bg-red-600 text-white hover:bg-red-500',
    ghost:   'border border-slate-700 text-slate-200 hover:border-slate-500 hover:text-slate-50',
  };
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-2 text-sm',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Empty state with icon slot + helper text. */
export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-500">{icon}</div>}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline error banner. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-500 bg-red-500/25 px-4 py-3 text-sm font-medium text-red-50 shadow-sm">{message}</div>;
}
