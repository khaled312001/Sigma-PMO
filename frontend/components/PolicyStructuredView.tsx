'use client';

import { useI18n } from '../lib/i18n';
import {
  IconActivity,
  IconAlertCritical,
  IconAlertWarning,
  IconCheck,
  IconInfo,
  IconList,
  IconShield,
  IconUsers,
} from './Icons';
import { Pill } from './ui';

/**
 * Read-only structured view of the governance policy JSON. Splits the
 * config object into five visual sections — Accountability, FIDIC mapping,
 * PMI/PMBOK mapping, Escalation tiers, Intervention library — each rendered
 * as a colour-coded card so the reviewer can scan FIDIC clauses and
 * recommended interventions without parsing JSON in their head.
 *
 * Editing happens through the Raw JSON tab on the parent admin page. This
 * component just makes the existing data approachable.
 */

interface FidicMapping { clause: string; notice: string; deadlineDays: number | null }
interface EscalationTier { ageDays: number; level: 'L1' | 'L2' | 'L3'; notify: string[] }

export function PolicyStructuredView({ config }: { config: unknown }) {
  const { t } = useI18n();

  if (!config || typeof config !== 'object') {
    return <p className="text-sm text-slate-400">—</p>;
  }
  const c = config as Record<string, unknown>;
  const accountability = c.accountability as Record<string, string> | undefined;
  const fidic = c.fidic as Record<string, FidicMapping> | undefined;
  const pmi = c.pmi as Record<string, string> | undefined;
  const escalation = c.escalation as Record<'critical' | 'warning' | 'info', EscalationTier> | undefined;
  const intervention = c.intervention as Record<string, string[]> | undefined;

  return (
    <div className="space-y-5">
      {accountability && (
        <Section
          title={t('admin.policy.sections.accountability')}
          hint={t('admin.policy.sections.accountabilityHint')}
          tone={tones.sky}
          icon={IconShield}
        >
          <AccountabilityTable data={accountability} t={t} />
        </Section>
      )}

      {fidic && (
        <Section
          title={t('admin.policy.sections.fidic')}
          hint={t('admin.policy.sections.fidicHint')}
          tone={tones.amber}
          icon={IconActivity}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Object.entries(fidic).map(([code, mapping]) => (
              <FidicCard key={code} code={code} mapping={mapping} t={t} />
            ))}
          </div>
        </Section>
      )}

      {pmi && (
        <Section
          title={t('admin.policy.sections.pmi')}
          hint={t('admin.policy.sections.pmiHint')}
          tone={tones.violet}
          icon={IconInfo}
        >
          <PmiTable data={pmi} t={t} />
        </Section>
      )}

      {escalation && (
        <Section
          title={t('admin.policy.sections.escalation')}
          hint={t('admin.policy.sections.escalationHint')}
          tone={tones.rose}
          icon={IconAlertCritical}
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {(['critical', 'warning', 'info'] as const).map((sev) => (
              <EscalationCard key={sev} severity={sev} tier={escalation[sev]} t={t} />
            ))}
          </div>
        </Section>
      )}

      {intervention && (
        <Section
          title={t('admin.policy.sections.intervention')}
          hint={t('admin.policy.sections.interventionHint')}
          tone={tones.emerald}
          icon={IconList}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Object.entries(intervention).map(([code, items]) => (
              <InterventionCard key={code} code={code} items={items} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ToneSpec { border: string; headerBg: string; iconBg: string; iconColor: string; chipBg: string; chipText: string }
const tones = {
  sky:     { border: 'border-sky-500/30',     headerBg: 'bg-sky-500/10',     iconBg: 'bg-sky-500/15 ring-1 ring-sky-500/40',         iconColor: 'text-sky-300',     chipBg: 'bg-sky-500/15',     chipText: 'text-sky-200' } as ToneSpec,
  amber:   { border: 'border-amber-500/30',   headerBg: 'bg-amber-500/10',   iconBg: 'bg-amber-500/15 ring-1 ring-amber-500/40',     iconColor: 'text-amber-300',   chipBg: 'bg-amber-500/15',   chipText: 'text-amber-200' } as ToneSpec,
  rose:    { border: 'border-rose-500/30',    headerBg: 'bg-rose-500/10',    iconBg: 'bg-rose-500/15 ring-1 ring-rose-500/40',       iconColor: 'text-rose-300',    chipBg: 'bg-rose-500/15',    chipText: 'text-rose-200' } as ToneSpec,
  emerald: { border: 'border-emerald-500/30', headerBg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500/15 ring-1 ring-emerald-500/40', iconColor: 'text-emerald-300', chipBg: 'bg-emerald-500/15', chipText: 'text-emerald-200' } as ToneSpec,
  violet:  { border: 'border-violet-500/30',  headerBg: 'bg-violet-500/10',  iconBg: 'bg-violet-500/15 ring-1 ring-violet-500/40',   iconColor: 'text-violet-300',  chipBg: 'bg-violet-500/15',  chipText: 'text-violet-200' } as ToneSpec,
} as const;

function Section({
  title, hint, tone, icon: Icon, children,
}: {
  title: string; hint?: string; tone: ToneSpec;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border ${tone.border} bg-slate-950/40`}>
      <header className={`flex items-start gap-3 border-b ${tone.border} ${tone.headerBg} px-4 py-2.5`}>
        <div className={`mt-0.5 grid h-7 w-7 place-items-center rounded-md ${tone.iconBg}`}>
          <Icon className={`h-4 w-4 ${tone.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const PARTY_TONE: Record<string, 'slate' | 'sky' | 'emerald' | 'amber'> = {
  contractor: 'amber',
  consultant: 'sky',
  client: 'emerald',
  shared: 'slate',
};

function AccountabilityTable({ data, t }: { data: Record<string, string>; t: (k: string) => string }) {
  void t;
  const entries = Object.entries(data);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([code, party], i) => (
            <tr key={code} className={`${i % 2 === 1 ? 'bg-slate-900/30' : ''} border-b border-slate-800/70 last:border-b-0`}>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-300" dir="ltr">{code}</td>
              <td className="px-3 py-2 text-end">
                <Pill tone={PARTY_TONE[party] ?? 'slate'}>{party}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FidicCard({ code, mapping, t }: { code: string; mapping: FidicMapping; t: (k: string) => string }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 bg-slate-900/40 px-3 py-1.5">
        <code className="font-mono text-[10px] text-slate-300" dir="ltr">{code}</code>
        {mapping.deadlineDays != null ? (
          <Pill tone="amber">{mapping.deadlineDays}{t('admin.policy.labels.days')}</Pill>
        ) : (
          <span className="text-[10px] text-slate-500">{t('admin.policy.labels.noDeadline')}</span>
        )}
      </header>
      <div className="space-y-1.5 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('admin.policy.labels.clause')}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-100" dir="ltr">{mapping.clause}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('admin.policy.labels.notice')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-300" dir="auto">{mapping.notice}</p>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function PmiTable({ data, t }: { data: Record<string, string>; t: (k: string) => string }) {
  void t;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(data).map(([code, process], i) => (
            <tr key={code} className={`${i % 2 === 1 ? 'bg-slate-900/30' : ''} border-b border-slate-800/70 last:border-b-0`}>
              <td className="w-44 px-3 py-2 font-mono text-[11px] text-slate-300 align-top" dir="ltr">{code}</td>
              <td className="px-3 py-2 text-xs text-slate-200" dir="auto">{process}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EscalationCard({
  severity, tier, t,
}: { severity: 'critical' | 'warning' | 'info'; tier: EscalationTier; t: (k: string) => string }) {
  const sev = {
    critical: { border: 'border-rose-500/40',   bg: 'bg-rose-500/5',   icon: IconAlertCritical, color: 'text-rose-300',  label: t('common.severity.critical') },
    warning:  { border: 'border-amber-500/40',  bg: 'bg-amber-500/5',  icon: IconAlertWarning,  color: 'text-amber-300', label: t('common.severity.warning') },
    info:     { border: 'border-sky-500/40',    bg: 'bg-sky-500/5',    icon: IconInfo,          color: 'text-sky-300',   label: t('common.severity.info') },
  }[severity];
  const SevIcon = sev.icon;
  return (
    <article className={`overflow-hidden rounded-lg border ${sev.border} ${sev.bg}`}>
      <header className="flex items-center gap-2 border-b border-current/10 px-3 py-2">
        <SevIcon className={`h-3.5 w-3.5 ${sev.color}`} />
        <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${sev.color}`}>{sev.label}</p>
        <Pill tone="slate" className="ms-auto">{tier.level}</Pill>
      </header>
      <div className="space-y-2 px-3 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{t('admin.policy.labels.ageDays')}:</span>
          <strong className="font-mono tabular-nums text-slate-100">{tier.ageDays}{t('admin.policy.labels.days')}</strong>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('admin.policy.labels.notify')}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {tier.notify.map((n) => <Pill key={n} tone={PARTY_TONE[n] ?? 'slate'}>{n}</Pill>)}
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function InterventionCard({ code, items }: { code: string; items: string[] }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800/70 bg-slate-900/40 px-3 py-1.5">
        <code className="font-mono text-[10px] text-slate-300" dir="ltr">{code}</code>
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-slate-400">{items.length}</span>
      </header>
      <ul className="space-y-1.5 px-3 py-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-200">
            <div className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm bg-emerald-500/15 ring-1 ring-emerald-500/40">
              <IconCheck className="h-2 w-2 text-emerald-300" />
            </div>
            <span dir="auto">{it}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Unused export to keep IconUsers around if future versions surface party
// rosters here. Silences the linter without changing visual output.
void IconUsers;
