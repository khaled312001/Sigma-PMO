'use client';

/**
 * /knowledge — the L0 Knowledge & Rules Engine (Mr. Ayham's Layer 0).
 * Tabs: Sigma Rule Library · Standards registry · Governance frameworks ·
 * Lessons Learned. Every intelligence layer references this engine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconBook, IconRefresh, IconSearch } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';

interface RuleEntry { code: string; title: string; description: string; references: string[]; defaultSeverity: string }
interface SourceEntry { id: string; externalId: string; title?: string; kind?: string }
interface FrameworkEntry { id: string; projectKey: string | null; version: number }
interface LessonEntry { id: string; title: string; content: string; category: string; standardRef: string | null; projectBusinessKey: string | null }

interface SearchHit { kind: 'rule' | 'source' | 'framework' | 'lesson'; id: string; title: string; snippet: string }
interface SearchResponse { query: string; retrievalMode: string; roadmap: string; total: number; hits: SearchHit[] }

interface BenchmarkTypeEntry {
  type: string; label: string; costPerSqmBua: number; annualRevenueYieldPct: number;
  opexPctOfRevenue: number; hurdleIrrPct: number; terminalValueMultiple: number; sectorRiskScore: number;
}
interface LocationFactorEntry { location: string; costFactor: number; marketStrength: number; countryRisk: number }
interface ReferenceTaxonomy { family: string; sources: { externalId: string; title: string; year: number; verification: string }[] }
interface BenchmarksResponse {
  version: string; costBenchmarks: BenchmarkTypeEntry[];
  locationFactors: LocationFactorEntry[]; referenceTaxonomies: ReferenceTaxonomy[];
}

type Tab = 'rules' | 'sources' | 'frameworks' | 'lessons' | 'benchmarks';

const KIND_TONE: Record<SearchHit['kind'], 'sky' | 'violet' | 'amber' | 'emerald'> = {
  rule: 'amber', source: 'sky', framework: 'violet', lesson: 'emerald',
};
// Arabic group headers for the unified search results (plural form).
const KIND_LABEL_AR: Record<SearchHit['kind'], string> = {
  rule: 'القواعد', source: 'المعايير', framework: 'الأطر', lesson: 'الدروس',
};

export default function KnowledgePageRoute() {
  return (
    <AuthGate surface="Knowledge & Rules">
      <KnowledgePage />
    </AuthGate>
  );
}

function KnowledgePage() {
  const toast = useToast();
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const { me } = useMe();
  const caps = me?.user?.role ? CAPABILITIES[me.user.role] : null;
  const canEdit = !!caps?.canEditPolicy;

  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<RuleEntry[] | null>(null);
  const [sources, setSources] = useState<SourceEntry[] | null>(null);
  const [frameworks, setFrameworks] = useState<FrameworkEntry[] | null>(null);
  const [lessons, setLessons] = useState<LessonEntry[] | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Debounced unified search.
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s, f, l, b] = await Promise.all([
        api<RuleEntry[]>('/knowledge/rules'),
        api<SourceEntry[]>('/knowledge/sources'),
        api<FrameworkEntry[]>('/knowledge/frameworks'),
        api<LessonEntry[]>('/knowledge/lessons'),
        api<BenchmarksResponse>('/knowledge/benchmarks'),
      ]);
      setRules(r); setSources(s); setFrameworks(f); setLessons(l); setBenchmarks(b);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Debounce the search query → /knowledge/search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim();
    if (!term) { setSearch(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setSearch(await api<SearchResponse>(`/knowledge/search?q=${encodeURIComponent(term)}`));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const groupedHits = useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    for (const h of search?.hits ?? []) (g[h.kind] = g[h.kind] ?? []).push(h);
    return g;
  }, [search]);

  const counts = {
    rules: rules?.length ?? 0,
    sources: sources?.length ?? 0,
    frameworks: frameworks?.length ?? 0,
    lessons: lessons?.length ?? 0,
    benchmarks: benchmarks?.costBenchmarks.length ?? 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'الطبقة 0 · الأساس' : 'Layer 0 · Foundation'}
        title={isAr ? 'محرّك المعرفة والقواعد' : 'Knowledge & Rules Engine'}
        description={
          isAr
            ? 'الأساس الذي ترجع إليه كل طبقات الذكاء: مكتبة قواعد سيجما، وسجلّ المعايير المنسّق ' +
              '(FIDIC · PMI/PMBOK · ISO · AACE · Primavera)، وأطر الحوكمة وإجراءات التشغيل المعيارية، ' +
              'ومستودع الدروس المستفادة — قابل للتوسّع إلى معايير جديدة دون إعادة تصميم.'
            : 'The foundation every intelligence layer references: the Sigma Rule Library, the curated ' +
              'standards registry (FIDIC · PMI/PMBOK · ISO · AACE · Primavera), governance frameworks & SOPs, ' +
              'and the Lessons Learned repository — extensible to new standards without redesign.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}</Button>
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
                <IconBook className="h-3.5 w-3.5" /> {isAr ? 'تسجيل درس' : 'Record lesson'}
              </Button>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {/* Unified L0 keyword search (rules · standards · frameworks · lessons). */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-500">
              <IconSearch className="h-4 w-4" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? 'ابحث في قاعدة المعرفة — القواعد، المعايير، الأطر، الدروس…' : 'Search the knowledge base — rules, standards, frameworks, lessons…'}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 ps-9 pe-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
            {isAr ? 'استرجاع بالكلمات المفتاحية إصدار 1 — خارطة طريق RAG' : 'Keyword retrieval v1 — RAG roadmap'}
          </span>
        </div>

        {query.trim() && (
          <div className="mt-3 border-t border-slate-800 pt-3">
            {searching ? (
              <p className="text-sm text-slate-400">{isAr ? 'جارٍ البحث…' : 'Searching…'}</p>
            ) : (search?.total ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">{isAr ? `لا توجد نتائج لـ «${query.trim()}».` : `No matches for “${query.trim()}”.`}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500">{isAr ? `${search?.total} نتيجة عبر قاعدة معرفة الطبقة 0.` : `${search?.total} match(es) across the L0 knowledge base.`}</p>
                {(['rule', 'source', 'framework', 'lesson'] as const).map((kind) =>
                  (groupedHits[kind] ?? []).length === 0 ? null : (
                    <div key={kind} className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? KIND_LABEL_AR[kind] : `${kind}s`}</p>
                      {(groupedHits[kind] ?? []).map((h) => (
                        <div key={`${h.kind}-${h.id}`} className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill tone={KIND_TONE[h.kind]}>{isAr ? KIND_LABEL_AR[h.kind] : h.kind}</Pill>
                            <span className="font-mono text-[10px] text-slate-500" dir="ltr">{h.id}</span>
                            <span className="text-sm font-medium text-slate-100">{h.title}</span>
                          </div>
                          {h.snippet && <p className="mt-1 text-[13px] text-slate-300">{h.snippet}</p>}
                        </div>
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {canEdit && showForm && (
        <RecordLessonForm onCancel={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load(); }} toast={toast} isAr={isAr} />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(['rules', 'sources', 'frameworks', 'lessons', 'benchmarks'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize transition ${
              tab === k ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
            }`}
          >
            {isAr
              ? (k === 'rules' ? 'مكتبة قواعد سيجما' : k === 'sources' ? 'المعايير' : k === 'frameworks' ? 'الأطر' : k === 'lessons' ? 'الدروس المستفادة' : 'المقاييس المرجعية')
              : (k === 'rules' ? 'Sigma Rule Library' : k === 'sources' ? 'Standards' : k === 'benchmarks' ? 'Benchmarks' : k)}
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
        <Card title={`${isAr ? 'سجلّ المعايير' : 'Standards registry'} (${counts.sources})`}>
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
        <Card title={`${isAr ? 'أطر الحوكمة وإجراءات التشغيل المعيارية' : 'Governance frameworks & SOPs'} (${counts.frameworks})`}>
          {counts.frameworks === 0 ? (
            <p className="text-sm text-slate-500">{isAr ? 'لم تُصَغ أي سياسات حوكمة بعد. استخدم ‎/admin/policy‎ لإضافة واحدة.' : 'No governance policies authored yet. Use /admin/policy to add one.'}</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-200">
              {(frameworks ?? []).map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <Pill tone="violet">v{f.version}</Pill>
                  <span>{f.projectKey ? `${isAr ? 'المشروع' : 'Project'} ${f.projectKey}` : (isAr ? 'سياسة افتراضية عامة' : 'Global default policy')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'lessons' && (
        <div className="space-y-2">
          {counts.lessons === 0 ? (
            <EmptyState icon={<IconBook className="h-8 w-8" />} title={isAr ? 'لم تُسجَّل أي دروس بعد' : 'No lessons recorded yet'} description={canEdit ? (isAr ? 'سجّل أول درس — فهو يُغذّي كل طبقة ترجع إلى الطبقة 0.' : 'Record the first lesson — it informs every layer that references L0.') : (isAr ? 'تظهر الدروس هنا بمجرّد أن يسجّلها فريق الحوكمة.' : 'Lessons appear here once the governance team records them.')} />
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

      {tab === 'benchmarks' && (
        <BenchmarksTab benchmarks={benchmarks} isAr={isAr} />
      )}
    </div>
  );
}

function BenchmarksTab({ benchmarks, isAr }: { benchmarks: BenchmarksResponse | null; isAr: boolean }) {
  if (!benchmarks) return <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-300">{isAr ? 'مقاييس مرجعية لتكاليف وعوائد القطاع يستند إليها محرّك الجدوى في تحليله.' : 'Industry cost & return benchmarks the feasibility engine reasons against.'}</span>
        <Pill tone="violet">{benchmarks.version}</Pill>
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/40 px-2 py-0.5 text-[11px] text-slate-400">
          {isAr ? 'حتمي · يُلتقَط كصورة على كل تقييم' : 'Deterministic · snapshotted onto every assessment'}
        </span>
      </div>

      <Card title={`${isAr ? 'مقاييس التكلفة المرجعية حسب نوع المشروع' : 'Cost benchmarks per project type'} (${benchmarks.costBenchmarks.length})`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{isAr ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'التكلفة / م² مسطّح (AED)' : 'Cost / m² BUA (AED)'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'العائد السنوي' : 'Annual yield'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'التشغيل ٪ من الإيراد' : 'Opex % rev'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'عتبة IRR' : 'Hurdle IRR'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'مضاعف الخروج ×' : 'Exit ×'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'المخاطر' : 'Risk'}</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.costBenchmarks.map((b) => (
                <tr key={b.type} className="border-b border-slate-800/50 last:border-b-0">
                  <td className="px-4 py-2 text-slate-100">{b.label}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-200" dir="ltr">{b.costPerSqmBua > 0 ? b.costPerSqmBua.toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{pct(b.annualRevenueYieldPct)}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{pct(b.opexPctOfRevenue)}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{pct(b.hurdleIrrPct)}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{b.terminalValueMultiple}×</td>
                  <td className="px-4 py-2 text-end"><Pill tone={b.sectorRiskScore >= 4 ? 'rose' : b.sectorRiskScore === 3 ? 'amber' : 'emerald'}>{b.sectorRiskScore}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${isAr ? 'معاملات الموقع' : 'Location factors'} (${benchmarks.locationFactors.length})`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{isAr ? 'الموقع' : 'Location'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'معامل التكلفة' : 'Cost factor'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'قوة السوق' : 'Market strength'}</th>
                <th className="px-4 py-2 text-end">{isAr ? 'مخاطر الدولة' : 'Country risk'}</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.locationFactors.map((f) => (
                <tr key={f.location} className="border-b border-slate-800/50 last:border-b-0">
                  <td className="px-4 py-2 capitalize text-slate-100">{f.location}</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{f.costFactor.toFixed(2)}×</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{f.marketStrength}/5</td>
                  <td className="px-4 py-2 text-end font-mono text-slate-300" dir="ltr">{f.countryRisk}/5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {benchmarks.referenceTaxonomies.map((t) => (
          <Card key={t.family} title={`${t.family} (${t.sources.length})`}>
            {t.sources.length === 0 ? (
              <p className="text-sm text-slate-500">{isAr ? 'لا توجد مصادر في هذه العائلة.' : 'No sources in this family.'}</p>
            ) : (
              <ul className="space-y-1.5">
                {t.sources.map((s) => (
                  <li key={s.externalId} className="flex items-start gap-2 text-[13px]">
                    <Pill tone={s.verification === 'confirmed' ? 'emerald' : 'amber'}>{s.year}</Pill>
                    <span className="text-slate-200">{s.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecordLessonForm({
  onCancel, onSaved, toast, isAr,
}: {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
  isAr: boolean;
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
      toast.success(isAr ? 'تم تسجيل الدرس' : 'Lesson recorded');
      await onSaved();
    } catch (e) {
      toast.error(isAr ? 'فشل الحفظ' : 'Save failed', (e as Error).message);
    } finally { setBusy(false); }
  };
  const CATEGORY_LABEL_AR: Record<string, string> = {
    governance: 'الحوكمة', schedule: 'الجدول الزمني', cost: 'التكلفة', claims: 'المطالبات', risk: 'المخاطر', quality: 'الجودة',
  };
  return (
    <Card title={isAr ? 'تسجيل درس مستفاد' : 'Record a lesson learned'}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? 'العنوان' : 'Title'}</label><input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? 'الفئة' : 'Category'}</label>
          <select className={cls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {['governance', 'schedule', 'cost', 'claims', 'risk', 'quality'].map((c) => <option key={c} value={c}>{isAr ? CATEGORY_LABEL_AR[c] : c}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? 'المرجع المعياري (اختياري)' : 'Standard reference (optional)'}</label><input className={cls} value={standardRef} onChange={(e) => setStandardRef(e.target.value)} placeholder={isAr ? 'مثال: FIDIC 20.1' : 'e.g. FIDIC 20.1'} /></div>
        <div className="sm:col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? 'المحتوى' : 'Content'}</label><textarea className={cls} rows={3} value={content} onChange={(e) => setContent(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
        <Button variant="primary" size="sm" disabled={busy || !title.trim() || !content.trim()} onClick={submit}>{busy ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ الدرس' : 'Save lesson')}</Button>
      </div>
    </Card>
  );
}
