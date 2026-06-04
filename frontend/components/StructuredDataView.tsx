'use client';

import { useState } from 'react';

import { useI18n } from '../lib/i18n';
import { JsonView } from './JsonView';
import {
  IconActivity,
  IconDatabase,
  IconEvidence,
  IconFolder,
  IconList,
  IconReview,
  IconUpload,
  IconUsers,
} from './Icons';

/**
 * Renders the rawSourceSnippets evidence payload as structured entity
 * cards instead of one long JSON dump. Each top-level key
 * (project / activity / sourceFile / ...) becomes its own card showing
 * field=value pairs in a clean two-column grid, so the reviewer can scan
 * fast and the audit chain reads as a real entity inspector rather than
 * a wall of JSON.
 *
 * A "Raw JSON" toggle keeps the JsonView available for power users who
 * want to see the unstructured shape (eg fields the structured view
 * dropped for being object-valued).
 */
export function StructuredDataView({ data }: { data: Record<string, unknown> | unknown }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'structured' | 'raw'>('structured');

  // If data isn't a plain object, just fall back to JsonView.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <JsonView data={data} title={t('evidence.rawSnippets')} maxHeight="28rem" defaultDepth={2} />;
  }

  const entries = Object.entries(data as Record<string, unknown>);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-0.5 text-[11px] font-semibold uppercase tracking-wider" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'structured'}
          onClick={() => setMode('structured')}
          className={`rounded-full px-3 py-1 transition ${mode === 'structured' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {t('evidence.structured')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'raw'}
          onClick={() => setMode('raw')}
          className={`rounded-full px-3 py-1 transition ${mode === 'raw' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {t('evidence.rawJson')}
        </button>
      </div>

      {mode === 'raw' ? (
        <JsonView data={data} title={t('evidence.rawSnippets')} maxHeight="28rem" defaultDepth={2} />
      ) : (
        <div className="space-y-3">
          {entries.map(([key, value]) => (
            <EntityCard key={key} entityKey={key} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EntityCard({ entityKey, value }: { entityKey: string; value: unknown }) {
  const { t } = useI18n();
  const tone = entityTone(entityKey);
  const Icon = entityIcon(entityKey);
  const label = entityLabel(entityKey, t);

  // Non-object values: still show as a card with a single value.
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return (
      <section className={`overflow-hidden rounded-xl border ${tone.border} bg-slate-950/40`}>
        <header className={`flex items-center gap-2 border-b ${tone.borderSoft} ${tone.headerBg} px-4 py-2`}>
          <div className={`grid h-6 w-6 place-items-center rounded-md ${tone.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${tone.iconColor}`} />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">{label}</h4>
        </header>
        <div className="p-3">
          <JsonView data={value} defaultDepth={3} maxHeight="14rem" />
        </div>
      </section>
    );
  }

  const fields = Object.entries(value as Record<string, unknown>);

  return (
    <section className={`overflow-hidden rounded-xl border ${tone.border} bg-slate-950/40`}>
      <header className={`flex items-center justify-between gap-2 border-b ${tone.borderSoft} ${tone.headerBg} px-4 py-2`}>
        <div className="flex items-center gap-2">
          <div className={`grid h-6 w-6 place-items-center rounded-md ${tone.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${tone.iconColor}`} />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">{label}</h4>
        </div>
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 tabular-nums" dir="ltr">
          {fields.length}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <FieldRow key={k} k={k} v={v} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function FieldRow({ k, v }: { k: string; v: unknown }) {
  // Nested object/array → render inline as small JsonView (sub-tree).
  if (v && typeof v === 'object') {
    return (
      <div className="col-span-1 sm:col-span-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500" dir="ltr">{humanize(k)}</p>
        <JsonView data={v} defaultDepth={2} maxHeight="14rem" />
      </div>
    );
  }

  const display = v === null || v === undefined || v === ''
    ? <span className="text-slate-500">—</span>
    : <span dir="auto">{String(v)}</span>;

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500" dir="ltr">{humanize(k)}</p>
      <p className="mt-0.5 truncate text-sm text-slate-100 tabular-nums" dir={typeof v === 'string' && /^[A-Za-z0-9]/.test(v) ? 'ltr' : undefined}>
        {display}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Tone, icon, label
// ---------------------------------------------------------------------------

interface ToneSpec {
  border: string;
  borderSoft: string;
  headerBg: string;
  iconBg: string;
  iconColor: string;
}

function entityTone(key: string): ToneSpec {
  const k = key.toLowerCase();
  if (k.startsWith('project')) return tone('sky');
  if (k.startsWith('activity')) return tone('emerald');
  if (k.startsWith('resource')) return tone('violet');
  if (k.startsWith('assignment')) return tone('fuchsia');
  if (k.startsWith('report')) return tone('amber');
  if (k.startsWith('source')) return tone('rose');
  if (k.startsWith('ingestion')) return tone('slate');
  return tone('slate');
}

function tone(c: 'sky' | 'emerald' | 'violet' | 'fuchsia' | 'amber' | 'rose' | 'slate'): ToneSpec {
  const palettes: Record<typeof c, ToneSpec> = {
    sky:      { border: 'border-sky-500/30',      borderSoft: 'border-sky-500/15',     headerBg: 'bg-sky-500/10',     iconBg: 'bg-sky-500/15 ring-1 ring-sky-500/40',         iconColor: 'text-sky-300' },
    emerald:  { border: 'border-emerald-500/30',  borderSoft: 'border-emerald-500/15', headerBg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500/15 ring-1 ring-emerald-500/40', iconColor: 'text-emerald-300' },
    violet:   { border: 'border-violet-500/30',   borderSoft: 'border-violet-500/15',  headerBg: 'bg-violet-500/10',  iconBg: 'bg-violet-500/15 ring-1 ring-violet-500/40',   iconColor: 'text-violet-300' },
    fuchsia:  { border: 'border-fuchsia-500/30',  borderSoft: 'border-fuchsia-500/15', headerBg: 'bg-fuchsia-500/10', iconBg: 'bg-fuchsia-500/15 ring-1 ring-fuchsia-500/40', iconColor: 'text-fuchsia-300' },
    amber:    { border: 'border-amber-500/30',    borderSoft: 'border-amber-500/15',   headerBg: 'bg-amber-500/10',   iconBg: 'bg-amber-500/15 ring-1 ring-amber-500/40',     iconColor: 'text-amber-300' },
    rose:     { border: 'border-rose-500/30',     borderSoft: 'border-rose-500/15',    headerBg: 'bg-rose-500/10',    iconBg: 'bg-rose-500/15 ring-1 ring-rose-500/40',       iconColor: 'text-rose-300' },
    slate:    { border: 'border-slate-700',       borderSoft: 'border-slate-800',      headerBg: 'bg-slate-900/60',   iconBg: 'bg-slate-800 ring-1 ring-slate-700',           iconColor: 'text-slate-300' },
  };
  return palettes[c];
}

function entityIcon(key: string) {
  const k = key.toLowerCase();
  if (k.startsWith('project')) return IconFolder;
  if (k.startsWith('activity')) return IconActivity;
  if (k.startsWith('resource')) return IconUsers;
  if (k.startsWith('assignment')) return IconList;
  if (k.startsWith('report')) return IconReview;
  if (k.startsWith('source')) return IconEvidence;
  if (k.startsWith('ingestion')) return IconUpload;
  return IconDatabase;
}

function entityLabel(key: string, t: (k: string) => string): string {
  const k = key.toLowerCase();
  if (k.startsWith('project')) return t('evidence.entityProject');
  if (k.startsWith('activity')) return t('evidence.entityActivity');
  if (k.startsWith('resource')) return t('evidence.entityResource');
  if (k.startsWith('assignment')) return t('evidence.entityAssignment');
  if (k.startsWith('report')) return t('evidence.entityReport');
  if (k.startsWith('source')) return t('evidence.entitySourceFile');
  if (k.startsWith('ingestion')) return t('evidence.entityIngestionRun');
  return humanize(key);
}

function humanize(k: string): string {
  // "businessKey" → "Business key"; "WBSCode" → "WBS code";
  // "PlannedFinishDate" → "Planned finish date"
  return k
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
