'use client';

/**
 * `/journey` — the per-project governance journey / lifecycle dashboard
 * (Mr. Ayham acceptance, "the one screen that shows the whole journey of a
 * project"). It consumes the read-only `GET /journey/:projectKey` chain and
 * renders the 13 lifecycle stages, in order, as a vertical timeline:
 *
 *   opportunity → concept → feasibility → study → bim → boq → schedule →
 *   cost-ledger → contract → claims → site-evidence → report → decision
 *
 * Each stage shows a bilingual label, a present/absent state (green check when
 * present, muted when empty), the item count, and — when present — an
 * expandable list of the leg's items (id + the most human field + a few curated
 * status chips + the short journeyCorrelationId). Absent legs surface the API's
 * `note` (the reason the stage is empty) so an absence is recorded, not blank.
 *
 * The header carries a project switcher fed by the shared ProjectContext (the
 * same `sigma_project_key` the top-bar switcher persists), so the whole
 * governance journey can be demoed project-by-project from one screen.
 *
 * AuthGate contract: any authenticated user can view (the backend gates the
 * route on `canRead`, which every role holds).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { IconCheck, IconChevronRight, IconFolder, IconRefresh } from '../../components/Icons';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey, useProject } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';

// ─────────────────────────── types ───────────────────────────

/** Mirrors `JourneyLegDto` from the backend (documentation shape). */
interface JourneyLeg {
  leg: string;
  stage: string;
  label: string;
  present: boolean;
  count: number;
  note?: string;
  items: Array<Record<string, unknown>>;
}

/** Mirrors `JourneyResponseDto` — `GET /journey/:projectKey`. */
interface JourneyChain {
  projectKey: string;
  projectName: string | null;
  opportunityId: string | null;
  correlationIds: string[];
  legs: JourneyLeg[];
}

type PillTone = 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';

// ─────────────────────────── bilingual maps ───────────────────────────

/** Arabic labels per lifecycle stage (EN comes straight from the API leg). */
const STAGE_LABEL_AR: Record<string, string> = {
  opportunity: 'الفرصة الاستثمارية',
  concept: 'المخطط المبدئي / الاستلام',
  feasibility: 'دراسة الجدوى',
  study: 'أقسام دراسة الجدوى',
  bim: 'المخططات / BIM',
  boq: 'جدول الكميات',
  schedule: 'أنشطة الجدول الزمني',
  'cost-ledger': 'سجلّ تتبّع الكمية / التكلفة',
  contract: 'خطابات العقد',
  claims: 'المطالبات',
  'site-evidence': 'أدلّة الموقع (غرف + التقاطات)',
  report: 'التقارير الشهرية',
  decision: 'قرارات الحوكمة',
};

/** Arabic empty reasons per stage (EN comes from the leg's `note`). */
const EMPTY_NOTE_AR: Record<string, string> = {
  opportunity: 'لا توجد فرصة استثمارية مرتبطة بهذا المشروع بعد',
  concept: 'لم يُستلم مخطط مبدئي لهذا المشروع بعد',
  feasibility: 'لم تُجرَ دراسة جدوى لهذا المشروع بعد',
  study: 'لم تُكتب أقسام دراسة الجدوى لهذا المشروع بعد',
  bim: 'لم تُرفع مخططات أو نموذج BIM لهذا المشروع بعد',
  boq: 'لم يُسجّل جدول كميات لهذا المشروع بعد',
  schedule: 'لم تُستورد أنشطة الجدول الزمني لهذا المشروع بعد',
  'cost-ledger': 'لا توجد قيود في سجلّ التكلفة لهذا المشروع بعد',
  contract: 'لم تُسجّل خطابات عقد لهذا المشروع بعد',
  claims: 'لم تُرفع مطالبات لهذا المشروع بعد',
  'site-evidence': 'لم تُسجّل غرفة أدلّة أو التقاط ميداني لهذا المشروع بعد',
  report: 'لم تُنشأ تقارير شهرية لهذا المشروع بعد',
  decision: 'لم يُسجّل قرار حوكمة لهذا المشروع بعد',
};

/** Fields promoted to the item's headline, in priority order. */
const PRIMARY_KEYS = [
  'title', 'name', 'subject', 'filename', 'label', 'sectionKey',
  'responsibleParty', 'businessKey', 'subjectKey', 'code', 'kind',
];

/** Curated status/enum fields rendered as chips (value + short bilingual key). */
const CHIP_KEYS = [
  'stage', 'projectType', 'level', 'recommendation', 'riskRating', 'extractionStatus',
  'format', 'status', 'type', 'mediaKind', 'findingType', 'kind', 'source', 'dimension',
  'value', 'trigger', 'escalationLevel', 'audience', 'periodKey', 'fidicClause',
  'fidicClauseRef', 'wbsCode', 'totalAmount', 'currency', 'locationLabel',
];

const FIELD_LABEL: Record<string, [en: string, ar: string]> = {
  stage: ['stage', 'المرحلة'],
  projectType: ['type', 'النوع'],
  level: ['level', 'المستوى'],
  recommendation: ['rec', 'التوصية'],
  riskRating: ['risk', 'المخاطر'],
  extractionStatus: ['extract', 'الاستخراج'],
  format: ['format', 'الصيغة'],
  status: ['status', 'الحالة'],
  type: ['type', 'النوع'],
  mediaKind: ['media', 'الوسائط'],
  findingType: ['finding', 'النتيجة'],
  kind: ['kind', 'النوع'],
  source: ['source', 'المصدر'],
  dimension: ['dim', 'البُعد'],
  value: ['value', 'القيمة'],
  trigger: ['trigger', 'المُطلِق'],
  escalationLevel: ['escalation', 'التصعيد'],
  audience: ['audience', 'الجمهور'],
  periodKey: ['period', 'الفترة'],
  fidicClause: ['FIDIC', 'فيديك'],
  fidicClauseRef: ['FIDIC', 'فيديك'],
  wbsCode: ['WBS', 'WBS'],
  totalAmount: ['total', 'الإجمالي'],
  currency: ['ccy', 'العملة'],
  locationLabel: ['location', 'الموقع'],
  subjectKey: ['subject', 'الموضوع'],
  responsibleParty: ['party', 'الجهة'],
};

// ─────────────────────────── route ───────────────────────────

export default function JourneyRoute() {
  // Viewing is open to any authenticated user (backend gates on `canRead`).
  return (
    <AuthGate surface="Project Journey">
      <JourneyPage />
    </AuthGate>
  );
}

// ─────────────────────────── page ───────────────────────────

function JourneyPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const projectKey = useCurrentProjectKey();

  const [chain, setChain] = useState<JourneyChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!projectKey) { setChain(null); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api<JourneyChain>(`/journey/${encodeURIComponent(projectKey)}`);
      setChain(data);
    } catch (e) {
      const msg = (e as Error).message;
      setChain(null);
      setError(msg);
      toast.error(ar ? 'تعذّر تحميل رحلة المشروع' : 'Failed to load project journey', msg);
    } finally {
      setLoading(false);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const legs = chain?.legs ?? [];
  const presentCount = useMemo(() => legs.filter((l) => l.present).length, [legs]);
  const totalItems = useMemo(() => legs.reduce((s, l) => s + l.count, 0), [legs]);
  const presentStages = useMemo(() => legs.filter((l) => l.present).map((l) => l.stage), [legs]);
  const allOpen = presentStages.length > 0 && presentStages.every((s) => open.has(s));

  const toggle = (stage: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage); else next.add(stage);
      return next;
    });

  const labelFor = (leg: JourneyLeg) => (ar ? STAGE_LABEL_AR[leg.stage] ?? leg.label : leg.label);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Project Journey · /journey · ${projectKey || (ar ? 'لا يوجد مشروع' : 'no project')}`}
        title={ar ? 'رحلة حوكمة المشروع' : 'Project Governance Journey'}
        description={
          ar
            ? 'دورة حياة المشروع كاملة على شاشة واحدة — مُدخلات كل مرحلة ومُخرجاتها وأدلّتها واعتماداتها البشرية، من الفرصة الاستثمارية حتى قرار الحوكمة.'
            : 'The full lifecycle of a project on one screen — each stage’s inputs, outputs, evidence and human approvals, from investment opportunity to governance decision.'
        }
        actions={
          <>
            <ProjectSelect />
            {presentStages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(allOpen ? new Set() : new Set(presentStages))}
              >
                {allOpen ? (ar ? 'طيّ الكل' : 'Collapse all') : (ar ? 'توسيع الكل' : 'Expand all')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} />

      {!projectKey ? (
        <EmptyState
          icon={<IconFolder className="h-8 w-8" />}
          title={ar ? 'لا يوجد مشروع محدّد' : 'No project selected'}
          description={
            ar
              ? 'اختر مشروعاً من المبدّل أعلى الصفحة لعرض رحلة حوكمته الكاملة عبر الـ 13 مرحلة.'
              : 'Pick a project from the switcher above to see its full governance journey across the 13 lifecycle stages.'
          }
        />
      ) : !chain ? (
        loading ? (
          <SkeletonTimeline />
        ) : (
          <EmptyState
            title={ar ? 'تعذّر تحميل الرحلة' : 'Could not load the journey'}
            description={error ?? (ar ? 'لا توجد بيانات.' : 'No data available.')}
            action={<Button variant="ghost" size="sm" onClick={refresh}>{ar ? 'إعادة المحاولة' : 'Retry'}</Button>}
          />
        )
      ) : (
        <>
          {/* ── Summary strip ── */}
          <Card
            title={ar ? 'ملخّص الرحلة' : 'Journey summary'}
            hint={ar ? 'نظرة سريعة على اكتمال دورة حياة المشروع وروابط التتبّع.' : 'At-a-glance lifecycle completeness and traceability links.'}
            actions={<Pill tone="sky">{chain.projectName ?? chain.projectKey}</Pill>}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={ar ? 'مراحل مكتملة' : 'Stages present'} value={`${presentCount} / ${legs.length}`} tone="text-emerald-300" />
                <Stat label={ar ? 'إجمالي العناصر' : 'Total items'} value={totalItems.toLocaleString()} />
                <Stat label={ar ? 'معرّفات الربط' : 'Correlation IDs'} value={chain.correlationIds.length.toLocaleString()} />
                <Stat label={ar ? 'الفرصة' : 'Opportunity'} value={chain.opportunityId ? shortId(chain.opportunityId) : '—'} tone="text-sky-300" />
              </div>
              {/* Compact 13-segment progress of the whole lifecycle. */}
              <div className="flex flex-wrap gap-1.5">
                {legs.map((l, i) => (
                  <span
                    key={l.stage}
                    title={`${i + 1}. ${labelFor(l)}${l.present ? ` · ${l.count}` : ''}`}
                    className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold ring-1 ${
                      l.present
                        ? 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/50'
                        : 'bg-slate-800 text-slate-500 ring-slate-700'
                    }`}
                  >
                    {l.present ? '✓' : i + 1}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* ── Lifecycle timeline ── */}
          <ol className="relative">
            {legs.map((leg, i) => (
              <StageNode
                key={leg.stage}
                leg={leg}
                index={i}
                total={legs.length}
                open={open.has(leg.stage)}
                onToggle={() => toggle(leg.stage)}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── project switcher ───────────────────────────

/** Reuses the shared ProjectContext (persists `sigma_project_key`). */
function ProjectSelect() {
  const { projects, current, setCurrentByKey } = useProject();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  if (projects.length === 0) return null;
  return (
    <label className="text-xs text-slate-400">
      <span className="sr-only">{ar ? 'المشروع' : 'Project'}</span>
      <select
        value={current?.businessKey ?? ''}
        onChange={(e) => setCurrentByKey(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100"
        aria-label={ar ? 'اختيار المشروع' : 'Select project'}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.businessKey}>{p.businessKey} · {p.name}</option>
        ))}
      </select>
    </label>
  );
}

// ─────────────────────────── stage node ───────────────────────────

function StageNode({
  leg,
  index,
  total,
  open,
  onToggle,
}: {
  leg: JourneyLeg;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const present = leg.present;
  const isLast = index === total - 1;
  const label = ar ? STAGE_LABEL_AR[leg.stage] ?? leg.label : leg.label;
  const note = ar ? EMPTY_NOTE_AR[leg.stage] ?? leg.note : leg.note;

  return (
    <li className="flex gap-4">
      {/* marker column — dot + connector (RTL-safe via flex direction) */}
      <div className="flex flex-col items-center">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
            present
              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
              : 'border-slate-700 bg-slate-900 text-slate-500'
          }`}
          aria-hidden
        >
          {present ? <IconCheck className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}
        </span>
        {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-slate-700/60" />}
      </div>

      {/* content */}
      <div className="flex-1 pb-4">
        <div
          className={`overflow-hidden rounded-xl border ${
            present ? 'border-slate-700 bg-slate-900/85' : 'border-dashed border-slate-800 bg-slate-900/40'
          }`}
        >
          <button
            type="button"
            onClick={onToggle}
            disabled={!present || leg.count === 0}
            className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start disabled:cursor-default"
            aria-expanded={present ? open : undefined}
          >
            <span className={`text-sm font-semibold ${present ? 'text-slate-100' : 'text-slate-500'}`}>{label}</span>
            <span className="hidden font-mono text-[11px] text-slate-500 sm:inline" dir="ltr">{leg.stage}</span>
            <span className="flex-1" />
            {present ? (
              <>
                <Pill tone="emerald">{leg.count} {ar ? 'عنصر' : leg.count === 1 ? 'item' : 'items'}</Pill>
                <IconChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
              </>
            ) : (
              <Pill tone="slate">{ar ? 'فارغ' : 'empty'}</Pill>
            )}
          </button>

          {!present && note && <p className="px-4 pb-3 text-xs text-slate-500">{note}</p>}

          {present && open && (
            <div className="space-y-2 border-t border-slate-800 px-4 py-3">
              {leg.items.map((item, i) => <JourneyItem key={i} item={item} />)}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────── journey item ───────────────────────────

function JourneyItem({ item }: { item: Record<string, unknown> }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { key: primaryKey, value: primary } = pickPrimary(item);
  const id = typeof item.id === 'string' ? item.id : null;
  const corr = typeof item.journeyCorrelationId === 'string' ? item.journeyCorrelationId : null;
  const chips = CHIP_KEYS.filter((k) => k !== primaryKey && hasValue(item[k])).slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
      {id && <span className="font-mono text-[10px] text-slate-500" dir="ltr" title={id}>{shortId(id)}</span>}
      <span className="min-w-0 flex-1 truncate text-sm text-slate-100" title={primary}>{primary}</span>
      {chips.map((k) => {
        const [en, arl] = FIELD_LABEL[k] ?? [k, k];
        return (
          <Pill key={k} tone={toneFor(k, item[k])} className="gap-1">
            <span className="font-normal opacity-70">{ar ? arl : en}</span>
            <span dir="ltr">{fmt(item[k])}</span>
          </Pill>
        );
      })}
      {corr && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-violet-300" dir="ltr" title={corr}>
          JC {shortId(corr)}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────── small bits ───────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/85 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-slate-100'}`} dir="ltr">{value}</p>
    </div>
  );
}

function SkeletonTimeline() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-800" />
            {i < 5 && <span className="mt-1 w-px flex-1 bg-slate-800" />}
          </div>
          <div className="h-14 flex-1 animate-pulse rounded-xl bg-slate-900/70" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function pickPrimary(item: Record<string, unknown>): { key: string | null; value: string } {
  for (const k of PRIMARY_KEYS) {
    const v = item[k];
    if (typeof v === 'string' && v.trim()) return { key: k, value: v };
  }
  const id = item.id;
  if (typeof id === 'string' && id) return { key: 'id', value: shortId(id) };
  return { key: null, value: '—' };
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '' && typeof v !== 'object';
}

function shortId(v: string): string {
  return v.length > 10 ? `${v.slice(0, 8)}…` : v;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return v.toLocaleString();
  const s = String(v);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s) || s.length > 24) return shortId(s);
  return s;
}

function toneFor(key: string, value: unknown): PillTone {
  const v = String(value).toLowerCase();
  if (key === 'recommendation') return v === 'proceed' ? 'emerald' : v === 'reject' ? 'rose' : 'amber';
  if (key === 'riskRating') return v === 'low' ? 'emerald' : v === 'high' ? 'rose' : v === 'elevated' ? 'amber' : 'sky';
  if (key === 'status' || key === 'extractionStatus') {
    if (['approved', 'confirmed', 'current', 'extracted', 'closed', 'resolved'].includes(v)) return 'emerald';
    if (['open', 'pending', 'draft', 'manual'].includes(v)) return 'amber';
    return 'slate';
  }
  if (key === 'findingType') return v === 'safety' ? 'rose' : 'amber';
  return 'slate';
}
