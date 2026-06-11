'use client';

/**
 * /knowledge — the L0 Knowledge & Rules Engine (Mr. Ayham's Layer 0).
 * Tabs: Sigma Rule Library · Standards registry · Governance frameworks ·
 * Lessons Learned. Every intelligence layer references this engine.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconBook, IconRefresh } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';

interface RuleEntry { code: string; title: string; description: string; references: string[]; defaultSeverity: string }
interface SourceEntry { id: string; externalId: string; title?: string; kind?: string }
interface FrameworkEntry { id: string; projectKey: string | null; version: number }
interface LessonEntry { id: string; title: string; content: string; category: string; standardRef: string | null; projectBusinessKey: string | null }

type Tab = 'rules' | 'sources' | 'frameworks' | 'lessons';

export default function KnowledgePageRoute() {
  return (
    <AuthGate surface="Knowledge & Rules">
      <KnowledgePage />
    </AuthGate>
  );
}

function KnowledgePage() {
  const toast = useToast();
  const { me } = useMe();
  const caps = me?.user?.role ? CAPABILITIES[me.user.role] : null;
  const canEdit = !!caps?.canEditPolicy;

  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<RuleEntry[] | null>(null);
  const [sources, setSources] = useState<SourceEntry[] | null>(null);
  const [frameworks, setFrameworks] = useState<FrameworkEntry[] | null>(null);
  const [lessons, setLessons] = useState<LessonEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s, f, l] = await Promise.all([
        api<RuleEntry[]>('/knowledge/rules'),
        api<SourceEntry[]>('/knowledge/sources'),
        api<FrameworkEntry[]>('/knowledge/frameworks'),
        api<LessonEntry[]>('/knowledge/lessons'),
      ]);
      setRules(r); setSources(s); setFrameworks(f); setLessons(l);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = {
    rules: rules?.length ?? 0,
    sources: sources?.length ?? 0,
    frameworks: frameworks?.length ?? 0,
    lessons: lessons?.length ?? 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 0 · Foundation"
        title="Knowledge & Rules Engine"
        description={
          'The foundation every intelligence layer references: the Sigma Rule Library, the curated ' +
          'standards registry (FIDIC · PMI/PMBOK · ISO · AACE · Primavera), governance frameworks & SOPs, ' +
          'and the Lessons Learned repository — extensible to new standards without redesign.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
                <IconBook className="h-3.5 w-3.5" /> Record lesson
              </Button>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {canEdit && showForm && (
        <RecordLessonForm onCancel={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load(); }} toast={toast} />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(['rules', 'sources', 'frameworks', 'lessons'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize transition ${
              tab === k ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
            }`}
          >
            {k === 'rules' ? 'Sigma Rule Library' : k === 'sources' ? 'Standards' : k}
            <span className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[9px] text-slate-400">{counts[k]}</span>
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-2">
          {(rules ?? []).map((r) => (
            <Card key={r.code}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-200" dir="ltr">{r.code}</span>
                <Pill tone={r.defaultSeverity === 'critical' ? 'rose' : r.defaultSeverity === 'warning' ? 'amber' : 'sky'}>{r.defaultSeverity}</Pill>
                <span className="text-sm font-medium text-slate-100">{r.title}</span>
              </div>
              <p className="mt-1 text-sm text-slate-300">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.references.map((ref) => <Pill key={ref} tone="slate">{ref}</Pill>)}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'sources' && (
        <Card title={`Standards registry (${counts.sources})`}>
          <div className="flex flex-wrap gap-1.5">
            {(sources ?? []).map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-[11px] text-slate-100 ring-1 ring-slate-700" dir="ltr">
                <IconBook className="h-3 w-3 opacity-70" /> {s.externalId}
              </span>
            ))}
          </div>
        </Card>
      )}

      {tab === 'frameworks' && (
        <Card title={`Governance frameworks & SOPs (${counts.frameworks})`}>
          {counts.frameworks === 0 ? (
            <p className="text-sm text-slate-500">No governance policies authored yet. Use /admin/policy to add one.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-200">
              {(frameworks ?? []).map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <Pill tone="violet">v{f.version}</Pill>
                  <span>{f.projectKey ? `Project ${f.projectKey}` : 'Global default policy'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'lessons' && (
        <div className="space-y-2">
          {counts.lessons === 0 ? (
            <EmptyState icon={<IconBook className="h-8 w-8" />} title="No lessons recorded yet" description={canEdit ? 'Record the first lesson — it informs every layer that references L0.' : 'Lessons appear here once the governance team records them.'} />
          ) : (
            (lessons ?? []).map((l) => (
              <Card key={l.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="emerald">{l.category}</Pill>
                  {l.standardRef && <Pill tone="slate">{l.standardRef}</Pill>}
                  {l.projectBusinessKey && <span className="font-mono text-[10px] text-slate-500" dir="ltr">{l.projectBusinessKey}</span>}
                  <span className="text-sm font-medium text-slate-100">{l.title}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{l.content}</p>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RecordLessonForm({
  onCancel, onSaved, toast,
}: {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('governance');
  const [standardRef, setStandardRef] = useState('');
  const [busy, setBusy] = useState(false);
  const cls = 'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await api('/knowledge/lessons', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category, standardRef: standardRef.trim() || null }),
      });
      toast.success('Lesson recorded');
      await onSaved();
    } catch (e) {
      toast.error('Save failed', (e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Card title="Record a lesson learned">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Title</label><input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Category</label>
          <select className={cls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {['governance', 'schedule', 'cost', 'claims', 'risk', 'quality'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Standard reference (optional)</label><input className={cls} value={standardRef} onChange={(e) => setStandardRef(e.target.value)} placeholder="e.g. FIDIC 20.1" /></div>
        <div className="sm:col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Content</label><textarea className={cls} rows={3} value={content} onChange={(e) => setContent(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={busy || !title.trim() || !content.trim()} onClick={submit}>{busy ? 'Saving…' : 'Save lesson'}</Button>
      </div>
    </Card>
  );
}
