'use client';

import { useMemo } from 'react';

import { useI18n } from '../lib/i18n';
import { ConfidenceBar, Pill, SeverityBadge } from './ui';
import {
  IconActivity,
  IconAlertCritical,
  IconAlertWarning,
  IconCheck,
  IconClock,
  IconDatabase,
  IconList,
  IconReview,
} from './Icons';

/**
 * Renders the deterministic executive summary as structured cards instead
 * of raw lines. Parses the line format produced by SummaryService into a
 * lightweight AST then maps each section to a dedicated layout: stat tiles
 * for schedule status, severity-coloured grid for alerts, severity-badged
 * cards for critical findings, blockquote for the latest report.
 *
 * Forces dir="ltr" inside numeric cells + section bodies so colon-separated
 * values, percentages, and dates read correctly even in Arabic pages.
 */
export function SummaryView({ text, confidence }: { text: string; confidence?: number | null }) {
  const { t, lang } = useI18n();
  const parsed = useMemo(() => parse(text), [text]);

  const sectionTitle = (rawTitle: string): string => {
    const k = rawTitle.toLowerCase();
    if (k.startsWith('schedule')) return t('summaryView.sections.schedule');
    if (k.startsWith('alert'))    return t('summaryView.sections.alerts');
    if (k.startsWith('critical')) return t('summaryView.sections.criticalFindings');
    if (k.startsWith('reporting'))return t('summaryView.sections.reporting');
    return rawTitle;
  };

  return (
    <div className="space-y-4">
      {parsed.meta.length > 0 && (
        <MetaRow items={parsed.meta} t={t} lang={lang} />
      )}

      {parsed.sections.map((s, i) => {
        const tone = sectionTone(s.title);
        const Icon = sectionIcon(s.title);
        const k = s.title.toLowerCase();
        return (
          <section
            key={i}
            className={`overflow-hidden rounded-xl border ${tone.border} bg-slate-950/40`}
          >
            <header className={`flex items-center gap-2 border-b ${tone.borderSoft} ${tone.headerBg} px-4 py-2.5`}>
              <div className={`grid h-6 w-6 place-items-center rounded-md ${tone.iconBg}`}>
                <Icon className={`h-3.5 w-3.5 ${tone.iconColor}`} />
              </div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                {sectionTitle(s.title)}
              </h3>
            </header>

            <div className="p-4">
              {k.startsWith('schedule') ? (
                <ScheduleStatus items={s.items} t={t} />
              ) : k.startsWith('alert') ? (
                <AlertsBlock items={s.items} t={t} />
              ) : k.startsWith('critical') ? (
                <CriticalFindings items={s.items} />
              ) : k.startsWith('reporting') ? (
                <ReportingBlock items={s.items} t={t} />
              ) : (
                <GenericList items={s.items} />
              )}
            </div>
          </section>
        );
      })}

      {(parsed.trailing.length > 0 || confidence != null) && (
        <ConfidenceFooter
          trailing={parsed.trailing}
          confidence={confidence ?? extractConfidence(parsed.trailing)}
          t={t}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Parser
// ---------------------------------------------------------------------------

interface ParsedSummary {
  meta: Array<{ label: string; value: string }>;
  sections: Array<{ title: string; items: string[] }>;
  trailing: Array<{ label: string; value: string }>;
}

const KNOWN_SECTION_HEADERS = ['schedule status', 'alerts', 'critical findings', 'reporting'];

function parse(text: string): ParsedSummary {
  const meta: ParsedSummary['meta'] = [];
  const sections: ParsedSummary['sections'] = [];
  const trailing: ParsedSummary['trailing'] = [];

  let current: ParsedSummary['sections'][number] | null = null;
  let inMeta = true;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') continue;

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch && current) {
      current.items.push(bulletMatch[1].replace(/\.$/, '').trim());
      continue;
    }

    const headerCandidate = line.trim().replace(/:$/, '').toLowerCase();
    if (KNOWN_SECTION_HEADERS.includes(headerCandidate)) {
      inMeta = false;
      current = { title: line.trim().replace(/:$/, ''), items: [] };
      sections.push(current);
      continue;
    }

    const colon = line.indexOf(':');
    if (colon > 0) {
      const item = { label: line.slice(0, colon).trim(), value: line.slice(colon + 1).replace(/\.$/, '').trim() };
      if (inMeta) meta.push(item);
      else if (current) current.items.push(line.replace(/\.$/, '').trim());
      else trailing.push(item);
    } else if (current) {
      current.items.push(line.trim());
    }
  }
  return { meta, sections, trailing };
}

// ---------------------------------------------------------------------------
//  Section renderers
// ---------------------------------------------------------------------------

function MetaRow({
  items, t, lang,
}: {
  items: Array<{ label: string; value: string }>;
  t: (k: string) => string;
  lang: 'en' | 'ar';
}) {
  const labelMap: Record<string, string> = {
    project: t('summaryView.labels.project'),
    'reporting period': t('summaryView.labels.reportingPeriod'),
    'schedule data date': t('summaryView.labels.dataDate'),
    'planned duration': t('summaryView.labels.plannedDuration'),
  };
  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {labelMap[it.label.toLowerCase()] ?? it.label}
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-100" dir={lang === 'ar' && /^[a-zA-Z0-9]/.test(it.value) ? 'ltr' : undefined}>
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ScheduleStatus({ items, t }: { items: string[]; t: (k: string) => string }) {
  // Activities line: "Activities: 8 (completed 2, in progress 2, not started 4)"
  // Progress line:   "Avg planned progress: X% vs actual Y% (delta Zpp)"
  const counts = (() => {
    for (const item of items) {
      const m = item.match(/Activities:\s*(\d+)\s*\(completed\s*(\d+),\s*in progress\s*(\d+),\s*not started\s*(\d+)\)/i);
      if (m) return { total: +m[1], completed: +m[2], inProgress: +m[3], notStarted: +m[4] };
    }
    return null;
  })();
  const progress = (() => {
    for (const item of items) {
      const m = item.match(/Avg planned progress:\s*([\d.]+)%\s*vs actual\s*([\d.]+)%\s*\(delta\s*(-?[\d.]+)pp\)/i);
      if (m) return { planned: +m[1], actual: +m[2], delta: +m[3] };
    }
    return null;
  })();
  return (
    <div className="space-y-3">
      {counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('summaryView.labels.activitiesTotal')} value={counts.total} tone="slate" />
          <Stat label={t('summaryView.labels.completed')}        value={counts.completed} tone="emerald" />
          <Stat label={t('summaryView.labels.inProgress')}       value={counts.inProgress} tone="sky" />
          <Stat label={t('summaryView.labels.notStarted')}       value={counts.notStarted} tone="slate" />
        </div>
      )}
      {progress && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
          <span><span className="text-slate-500">{t('summaryView.labels.planned')}:</span> <strong className="text-slate-100 tabular-nums">{progress.planned.toFixed(1)}%</strong></span>
          <span><span className="text-slate-500">{t('summaryView.labels.actual')}:</span> <strong className="text-slate-100 tabular-nums">{progress.actual.toFixed(1)}%</strong></span>
          <Pill tone={progress.delta >= 0 ? 'emerald' : 'rose'}>{t('summaryView.labels.delta')} {progress.delta >= 0 ? '+' : ''}{progress.delta.toFixed(1)}pp</Pill>
        </div>
      )}
      {!counts && !progress && <GenericList items={items} />}
    </div>
  );
}

function AlertsBlock({ items, t }: { items: string[]; t: (k: string) => string }) {
  // First item: "Total 7; critical 3; warning 4"
  // Then per-code: "RESOURCE_UNDERUSE: 2"
  const totals = (() => {
    for (const item of items) {
      const m = item.match(/Total\s+(\d+);\s*critical\s+(\d+);\s*warning\s+(\d+)/i);
      if (m) return { total: +m[1], critical: +m[2], warning: +m[3] };
    }
    return null;
  })();
  const byCode: Array<{ code: string; count: number }> = [];
  for (const item of items) {
    const m = item.match(/^([A-Z_]+):\s*(\d+)$/);
    if (m) byCode.push({ code: m[1], count: +m[2] });
  }
  return (
    <div className="space-y-3">
      {totals && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t('summaryView.labels.total')}    value={totals.total}    tone="slate" />
          <Stat label={t('summaryView.labels.critical')} value={totals.critical} tone="rose" />
          <Stat label={t('summaryView.labels.warning')}  value={totals.warning}  tone="amber" />
        </div>
      )}
      {byCode.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('summaryView.labels.byRule')}</p>
          <div className="flex flex-wrap gap-1.5">
            {byCode.map((c) => (
              <span key={c.code} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-[11px]">
                <span className="font-mono text-slate-300" dir="ltr">{c.code}</span>
                <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 tabular-nums">{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CriticalFindings({ items }: { items: string[] }) {
  // "[DURATION_OVERRUN] Activity \"Bulk Excavation\" took 30 day(s) vs 20 planned (150%)"
  const parsed = items.map((it) => {
    const m = it.match(/^\[([A-Z_]+)\]\s+(.+)$/);
    if (m) return { code: m[1], text: m[2] };
    return { code: null, text: it };
  });
  return (
    <ul className="space-y-2">
      {parsed.map((p, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-rose-500/60 bg-slate-900/60 p-3">
          <div className="mt-0.5 shrink-0"><SeverityBadge severity="critical" /></div>
          <div className="min-w-0 flex-1">
            {p.code && <span className="me-2 inline-flex rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-sm" dir="ltr">{p.code}</span>}
            <span className="text-sm font-medium text-slate-50" dir="auto">{p.text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportingBlock({ items, t }: { items: string[]; t: (k: string) => string }) {
  const inWindow = (() => {
    for (const it of items) {
      const m = it.match(/Reports in window:\s*(\d+)/i);
      if (m) return +m[1];
    }
    return null;
  })();
  const latest = items.find((it) => /^Latest report/i.test(it));
  return (
    <div className="space-y-3">
      {inWindow != null && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">{t('summaryView.labels.reportsInWindow')}:</span>
          <strong className="rounded bg-slate-800/80 px-2 py-0.5 text-sm tabular-nums text-slate-100">{inWindow}</strong>
        </div>
      )}
      {latest && (
        <blockquote className="rounded-lg border-s-4 border-sky-500/60 bg-sky-500/5 px-4 py-3 text-sm text-slate-200">
          <span className="me-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            <IconClock className="h-3 w-3" /> {t('summaryView.labels.latestReport')}
          </span>
          <span dir="auto">{latest.replace(/^Latest report\s*/i, '')}</span>
        </blockquote>
      )}
    </div>
  );
}

function GenericList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm text-slate-200">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-slate-500" />
          <span dir="auto">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function ConfidenceFooter({
  trailing, confidence, t,
}: { trailing: Array<{ label: string; value: string }>; confidence: number | null; t: (k: string) => string }) {
  return (
    <div className="space-y-2">
      {trailing.length > 0 && trailing.filter((it) => !/data confidence/i.test(it.label)).map((it, i) => (
        <p key={i} className="text-xs text-slate-400">
          <span className="text-slate-500">{it.label}:</span> <span className="text-slate-200">{it.value}</span>
        </p>
      ))}
      {confidence != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
              <IconCheck className="h-3.5 w-3.5 text-emerald-300" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">{t('summaryView.labels.confidence')}</span>
          </div>
          <div className="flex-1 min-w-[160px]"><ConfidenceBar value={confidence} /></div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractConfidence(trailing: Array<{ label: string; value: string }>): number | null {
  for (const it of trailing) {
    if (/confidence/i.test(it.label)) {
      const m = it.value.match(/([\d.]+)\s*%/);
      if (m) return Number(m[1]) / 100;
    }
  }
  return null;
}

interface ToneSpec {
  border: string;
  borderSoft: string;
  headerBg: string;
  iconBg: string;
  iconColor: string;
}

function sectionTone(title: string): ToneSpec {
  // Section tones — `headerBg` keeps a tinted ribbon header; the BODY drops
  // the tint and uses the neutral surface so child pills/badges remain
  // legible against it. Borders and icons keep the accent colour.
  const k = title.toLowerCase();
  if (k.startsWith('critical')) {
    return {
      border: 'border-rose-500/60',
      borderSoft: 'border-rose-500/30',
      headerBg: 'bg-rose-500/30 text-rose-50',
      iconBg: 'bg-rose-600 ring-1 ring-rose-700 text-white',
      iconColor: 'text-white',
    };
  }
  if (k.startsWith('alert')) {
    return {
      border: 'border-amber-500/60',
      borderSoft: 'border-amber-500/30',
      headerBg: 'bg-amber-500/30 text-amber-50',
      iconBg: 'bg-amber-500 ring-1 ring-amber-600 text-amber-950',
      iconColor: 'text-amber-950',
    };
  }
  if (k.startsWith('schedule')) {
    return {
      border: 'border-sky-500/60',
      borderSoft: 'border-sky-500/30',
      headerBg: 'bg-sky-500/30 text-sky-50',
      iconBg: 'bg-sky-600 ring-1 ring-sky-700 text-white',
      iconColor: 'text-white',
    };
  }
  if (k.startsWith('reporting')) {
    return {
      border: 'border-violet-500/60',
      borderSoft: 'border-violet-500/30',
      headerBg: 'bg-violet-500/30 text-violet-50',
      iconBg: 'bg-violet-600 ring-1 ring-violet-700 text-white',
      iconColor: 'text-white',
    };
  }
  return {
    border: 'border-slate-700',
    borderSoft: 'border-slate-800',
    headerBg: 'bg-slate-800',
    iconBg: 'bg-slate-700 ring-1 ring-slate-600',
    iconColor: 'text-slate-100',
  };
}

function sectionIcon(title: string) {
  const k = title.toLowerCase();
  if (k.startsWith('critical')) return IconAlertCritical;
  if (k.startsWith('alert'))    return IconAlertWarning;
  if (k.startsWith('schedule')) return IconActivity;
  if (k.startsWith('reporting'))return IconDatabase;
  return IconList;
}

// ---------------------------------------------------------------------------
//  Stat tile
// ---------------------------------------------------------------------------

function Stat({
  label, value, tone,
}: { label: string; value: number | string; tone: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky' }) {
  const valueTone: Record<string, string> = {
    slate:   'text-slate-100',
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
    amber:   'text-amber-300',
    sky:     'text-sky-300',
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${valueTone[tone]}`}>{value}</p>
    </div>
  );
}
