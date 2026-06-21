'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AlertRecord, api, IngestionRun } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { DataTable } from '../../components/DataTable';
import { SkeletonStat, SkeletonRow } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { useProject, ProjectSummary } from '../../lib/project-context';
import { useToast } from '../../components/ToastProvider';
import { IconAlertCritical, IconAlertWarning, IconDatabase, IconEdit, IconFolder, IconPlus, IconTrash, IconX } from '../../components/Icons';
import { Button, Card, PageHeader, Pill, SeverityBadge, ConfidenceBar } from '../../components/ui';
import { useMe } from '../../lib/me-context';
import { CAPABILITIES } from '../../lib/capabilities';

// Governance tree shapes (Enterprise → Portfolio → Program), used to place a new
// project under a client (Enterprise) + a Program that links related projects or
// the phases of one project (Mr. Ayham, 2026-06-21).
interface TreeProgramLite { businessKey: string; name: string }
interface TreePortfolioLite { businessKey: string; name: string; programs: TreeProgramLite[] }
interface TreeEnterpriseLite { businessKey: string; name: string; portfolios: TreePortfolioLite[] }
interface GovTree { enterprises: TreeEnterpriseLite[] }

/** Stable governance-node key from a name (latin slug, else a short hash for Arabic). */
function slugKey(prefix: string, name: string): string {
  const latin = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  if (latin) return `${prefix}-${latin}`;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${prefix}-${h.toString(36).toUpperCase()}`;
}

/** Create a governance node, treating an "already exists" response as success (idempotent). */
async function ensureNode(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    await api(path, { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    if (!/already exists/i.test((e as Error).message)) throw e;
  }
}

export default function ProjectsPageRoute() {
  return <AuthGate surface="Projects"><ProjectsPage /></AuthGate>;
}

/**
 * The additive deterministic score bundle the `/projects` endpoint now returns
 * (Agent A). Typed locally so we needn't widen the shared project-context type.
 */
interface ProjectScores {
  governanceScore: number;
  riskScore: number;
  healthScore: number;
  investmentScore: number | null;
  compositeScore: number;
  projectRanking: number;
  portfolioRanking: number;
}
type ScoredProject = ProjectSummary & Partial<ProjectScores>;

interface ProjectRow extends ScoredProject {
  alerts: number;
  criticals: number;
  runs: number;
  lastIngested: Date | null;
  confidence: number | null;
}

/** Shape sent to the create / update endpoints. */
interface ProjectFormData {
  businessKey: string;
  name: string;
  clientName: string;
  status: string;
  currency: string;
  plannedStart: string;
  plannedFinish: string;
  budgetAtCompletion: string;
}

const EMPTY_FORM: ProjectFormData = {
  businessKey: '',
  name: '',
  clientName: '',
  status: 'active',
  currency: 'SAR',
  plannedStart: '',
  plannedFinish: '',
  budgetAtCompletion: '',
};

function ProjectsPage() {
  const { t, lang } = useI18n();
  const isAr = lang === 'ar';
  const { projects, loading, refresh: refreshCtx } = useProject();
  const toast = useToast();
  const [scored, setScored] = useState<ScoredProject[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [runs, setRuns] = useState<IngestionRun[] | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // True when the create form is entering a NEW client (vs picking an existing one).
  const [newClientMode, setNewClientMode] = useState(false);

  // Hierarchy placement (Mr. Ayham, 2026-06-21): a client = an Enterprise that can
  // own several projects; a Program links related projects or the phases of one
  // project. Only the governance-management tier sees this.
  const { me } = useMe();
  const canHierarchy = !!me?.user && !!CAPABILITIES[me.user.role]?.canManageHierarchy;
  const [tree, setTree] = useState<GovTree | null>(null);
  const [entSel, setEntSel] = useState('');       // '' none | <enterpriseKey> | '__new__'
  const [entNewName, setEntNewName] = useState('');
  const [pfSel, setPfSel] = useState('');         // '' none | <portfolioKey> | '__new__'
  const [pfNewName, setPfNewName] = useState('');
  const [progSel, setProgSel] = useState('');     // '' none | <programKey> | '__new__'
  const [progNewName, setProgNewName] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const enterprises = tree?.enterprises ?? [];
  const portfoliosForEnt = useMemo<TreePortfolioLite[]>(() => {
    const ent = enterprises.find((e) => e.businessKey === entSel);
    return ent ? ent.portfolios : [];
  }, [enterprises, entSel]);
  const programsForPf = useMemo<TreeProgramLite[]>(() => {
    const pf = portfoliosForEnt.find((p) => p.businessKey === pfSel);
    return pf ? pf.programs : [];
  }, [portfoliosForEnt, pfSel]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    Promise.all([
      api<AlertRecord[]>('/rules/alerts?limit=500'),
      api<IngestionRun[]>('/ingestion/runs?limit=200'),
      api<ScoredProject[]>('/projects'),
    ]).then(([a, r, s]) => { setAlerts(a); setRuns(r); setScored(s); })
      .catch(() => { setAlerts([]); setRuns([]); setScored([]); });
  }, [fetchKey]);

  // Prefer the score-decorated list from /projects; fall back to the context
  // list (no scores) so the table still renders if the scored fetch failed.
  const baseProjects: ScoredProject[] = scored && scored.length > 0 ? scored : projects;

  const rows: ProjectRow[] = useMemo(() => {
    if (!alerts || !runs) return [];
    return baseProjects.map((p) => {
      // CRITICAL: group by businessKey, NOT id. alert.projectId pins to the
      // versioned project row that was current when the alert fired, so a
      // newer ingestion run rolls the project forward and the old alerts
      // are no longer reachable via the current-version id. Confirmed by
      // workflow D1: filtering by id under-counted P-1000 alerts 7 vs 50.
      const pa = alerts.filter((a) => a.projectBusinessKey === p.businessKey);
      const runsForKey = runs.filter((r) => ((r.summary as Record<string, unknown>)?.projectKey as string | undefined) === p.businessKey);
      const last = runsForKey.length > 0 ? new Date(runsForKey[0].createdAt) : null;
      const conf = runsForKey[0]?.summary?.confidence?.overall ?? null;
      return {
        ...p,
        alerts: pa.length,
        criticals: pa.filter((a) => a.severity === 'critical').length,
        runs: runsForKey.length,
        lastIngested: last,
        confidence: conf,
      };
    });
  }, [baseProjects, alerts, runs]);

  // Distinct existing clients (Mr. Ayham, 2026-06-20 voice note): adding a project
  // can attach it to an EXISTING client (same client → new project), or create a
  // brand-new client. This list powers the "pick existing client" selector.
  const existingClients = useMemo(
    () => Array.from(new Set(baseProjects.map((p) => (p.clientName ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [baseProjects],
  );

  const totalAlerts = rows.reduce((s, r) => s + r.alerts, 0);
  const totalCriticals = rows.reduce((s, r) => s + r.criticals, 0);
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);

  const ready = !loading && alerts !== null && runs !== null;

  // ── Modal handlers ──
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setModalMode('create');
    // Default to "pick existing client" when any client already exists; otherwise
    // there is nothing to pick, so start in new-client mode.
    setNewClientMode(existingClients.length === 0);
    setEntSel(''); setEntNewName(''); setPfSel(''); setPfNewName('');
    setProgSel(''); setProgNewName(''); setPhaseLabel('');
    if (canHierarchy) {
      api<GovTree>('/hierarchy/tree').then(setTree).catch(() => setTree({ enterprises: [] }));
    }
    setModalOpen(true);
  };

  const openEdit = (r: ProjectRow) => {
    setForm({
      businessKey: r.businessKey,
      name: r.name,
      clientName: r.clientName ?? '',
      status: r.status ?? 'active',
      currency: '',
      plannedStart: '',
      plannedFinish: '',
      budgetAtCompletion: '',
    });
    setEditId(r.id);
    setModalMode('edit');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(isAr ? 'خطأ' : 'Error', isAr ? 'اسم المشروع مطلوب' : 'Project name is required');
      return;
    }
    if (modalMode === 'create' && !form.businessKey.trim()) {
      toast.error(isAr ? 'خطأ' : 'Error', isAr ? 'مفتاح المشروع مطلوب' : 'Project key is required');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        const projectKey = form.businessKey.trim();
        // ── Resolve the client (Enterprise): pick existing, create new, or none. ──
        let enterpriseKey: string | null = null;
        let enterpriseName: string | null = null;
        if (canHierarchy && entSel) {
          if (entSel === '__new__') {
            enterpriseName = entNewName.trim() || null;
            if (enterpriseName) {
              enterpriseKey = slugKey('ENT', enterpriseName);
              await ensureNode('/hierarchy/enterprise', { businessKey: enterpriseKey, name: enterpriseName });
            }
          } else {
            enterpriseKey = entSel;
            enterpriseName = enterprises.find((e) => e.businessKey === entSel)?.name ?? null;
          }
        }
        // clientName follows the chosen Enterprise when placed in the hierarchy.
        const clientName = enterpriseName ?? (form.clientName.trim() || null);

        // ── Resolve the Portfolio (المحفظة) under the enterprise: existing or new. ──
        let portfolioKey: string | null = null;
        if (canHierarchy && enterpriseKey && pfSel) {
          if (pfSel === '__new__') {
            const pfn = pfNewName.trim() || `${enterpriseName} — Portfolio`;
            portfolioKey = slugKey('PF', pfn);
            await ensureNode('/hierarchy/portfolio', { businessKey: portfolioKey, name: pfn, enterpriseBusinessKey: enterpriseKey });
          } else {
            portfolioKey = pfSel;
          }
        }

        // ── Resolve the Program (links related projects / phases): existing or new. ──
        let programKey: string | null = null;
        if (canHierarchy && progSel) {
          if (progSel === '__new__') {
            const pn = progNewName.trim();
            if (pn && enterpriseKey) {
              // A program needs a portfolio: use the chosen one, else auto-create a default.
              if (!portfolioKey) {
                portfolioKey = slugKey('PF', enterpriseName || projectKey);
                await ensureNode('/hierarchy/portfolio', { businessKey: portfolioKey, name: `${enterpriseName ?? 'Client'} — Portfolio`, enterpriseBusinessKey: enterpriseKey });
              }
              programKey = slugKey('PRG', pn);
              await ensureNode('/hierarchy/program', { businessKey: programKey, name: pn, portfolioBusinessKey: portfolioKey });
            }
          } else {
            programKey = progSel;
          }
        }

        await api('/projects', {
          method: 'POST',
          body: JSON.stringify({
            businessKey: projectKey,
            name: form.name.trim(),
            clientName,
            status: form.status.trim() || 'active',
            currency: form.currency.trim() || null,
            plannedStart: form.plannedStart || null,
            plannedFinish: form.plannedFinish || null,
            budgetAtCompletion: form.budgetAtCompletion.trim() || null,
          }),
        });
        // Attach into the hierarchy — denormalizes program → portfolio → enterprise.
        if (programKey) {
          await api('/hierarchy/attach', { method: 'POST', body: JSON.stringify({ projectKey, programKey }) });
        }
        // Optional phase label — a project can be Phase 1/2/3 within its program.
        if (canHierarchy && phaseLabel.trim()) {
          await api('/hierarchy/phase', { method: 'POST', body: JSON.stringify({ projectKey, phase: phaseLabel.trim() }) });
        }
        toast.success(
          isAr ? 'تم الإنشاء' : 'Created',
          isAr ? `تم إنشاء المشروع ${form.name}` : `Project "${form.name}" created`,
        );
      } else {
        await api(`/projects/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            clientName: form.clientName.trim() || null,
            status: form.status.trim() || null,
            currency: form.currency.trim() || null,
            plannedStart: form.plannedStart || null,
            plannedFinish: form.plannedFinish || null,
            budgetAtCompletion: form.budgetAtCompletion.trim() || null,
          }),
        });
        toast.success(
          isAr ? 'تم التحديث' : 'Updated',
          isAr ? `تم تحديث المشروع ${form.name}` : `Project "${form.name}" updated`,
        );
      }
      closeModal();
      refetch();
      void refreshCtx();
    } catch (e) {
      toast.error(
        isAr ? 'فشلت العملية' : 'Operation failed',
        (e as Error).message,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/projects/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(
        isAr ? 'تم الحذف' : 'Deleted',
        isAr ? `تم حذف المشروع ${deleteTarget.name}` : `Project "${deleteTarget.name}" deleted`,
      );
      setDeleteTarget(null);
      refetch();
      void refreshCtx();
    } catch (e) {
      toast.error(isAr ? 'فشل الحذف' : 'Delete failed', (e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const setField = (key: keyof ProjectFormData, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
        description={t('projects.description')}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            <IconPlus className="h-4 w-4" />
            {isAr ? 'إضافة مشروع' : 'Add Project'}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ready ? (
          <>
            <StatTile label={t('projects.title')} value={rows.length} tone="sky" icon={<IconFolder className="h-5 w-5" />} />
            <StatTile label={t('overview.cards.totalAlerts')} value={totalAlerts} tone="emerald" icon={<IconDatabase className="h-5 w-5" />} />
            <StatTile label={t('overview.cards.critical')} value={totalCriticals} tone="rose" icon={<IconAlertCritical className="h-5 w-5" />} />
            <StatTile label={t('projects.runs')} value={totalRuns} tone="amber" icon={<IconAlertWarning className="h-5 w-5" />} />
          </>
        ) : (
          <>
            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
          </>
        )}
      </section>

      {ready ? (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder={t('common2.search')}
          searchAccessor={(r) => `${r.name} ${r.businessKey} ${r.clientName ?? ''} ${r.status ?? ''}`}
          initialSort={{ key: 'composite', dir: 'desc' }}
          emptyTitle={t('projects.empty.title')}
          emptyDescription={t('projects.empty.description')}
          columns={[
            {
              key: 'name',
              label: t('projects.headers.name'),
              render: (r) => (
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100">{r.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">{r.clientName ?? '—'}</div>
                </div>
              ),
              accessor: (r) => r.name.toLowerCase(),
            },
            {
              key: 'businessKey',
              label: t('projects.headers.key'),
              width: '9rem',
              render: (r) => <span className="font-mono text-xs text-slate-300" dir="ltr">{r.businessKey}</span>,
              hideOnMobile: true,
            },
            {
              key: 'status',
              label: t('projects.headers.status'),
              width: '8rem',
              render: (r) => r.status ? <Pill tone="slate">{r.status}</Pill> : <span className="text-slate-500">—</span>,
              hideOnMobile: true,
            },
            {
              key: 'composite',
              label: isAr ? 'الدرجة المركّبة' : 'Composite',
              width: '11rem',
              render: (r) => (
                <div className="flex flex-col items-start gap-1">
                  <ScorePill value={r.compositeScore} higherBetter />
                  <div className="flex items-center gap-1">
                    {typeof r.projectRanking === 'number' && r.projectRanking > 0 && (
                      <Pill tone="violet">{isAr ? `الترتيب #${r.projectRanking}` : `Rank #${r.projectRanking}`}</Pill>
                    )}
                    {typeof r.portfolioRanking === 'number' && r.portfolioRanking > 0 && (
                      <Pill tone="sky">{isAr ? `المحفظة #${r.portfolioRanking}` : `Portfolio #${r.portfolioRanking}`}</Pill>
                    )}
                  </div>
                </div>
              ),
              accessor: (r) => r.compositeScore ?? -1,
            },
            {
              key: 'governance',
              label: isAr ? 'الحوكمة' : 'Governance',
              width: '7rem',
              align: 'end',
              render: (r) => <ScorePill value={r.governanceScore} higherBetter />,
              accessor: (r) => r.governanceScore ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'risk',
              label: isAr ? 'المخاطر' : 'Risk',
              width: '6rem',
              align: 'end',
              render: (r) => <ScorePill value={r.riskScore} higherBetter={false} />,
              accessor: (r) => r.riskScore ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'investment',
              label: isAr ? 'الاستثمار' : 'Investment',
              width: '7rem',
              align: 'end',
              render: (r) => r.investmentScore === null || r.investmentScore === undefined
                ? <span className="text-slate-500">—</span>
                : <ScorePill value={r.investmentScore} higherBetter />,
              accessor: (r) => r.investmentScore ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'alerts',
              label: t('projects.headers.alerts'),
              width: '7rem',
              align: 'end',
              render: (r) => (
                <div className="flex items-center justify-end gap-1.5 tabular-nums">
                  {r.criticals > 0 && <SeverityBadge severity="critical" />}
                  <span className="font-semibold text-slate-200">{r.alerts}</span>
                </div>
              ),
              accessor: (r) => r.alerts,
            },
            {
              key: 'runs',
              label: t('projects.headers.runs'),
              width: '5rem',
              align: 'end',
              render: (r) => <span className="tabular-nums text-slate-300">{r.runs}</span>,
              accessor: (r) => r.runs,
              hideOnMobile: true,
            },
            {
              key: 'confidence',
              label: t('projects.headers.confidence'),
              width: '10rem',
              render: (r) => <ConfidenceBar value={r.confidence ?? null} width={80} />,
              accessor: (r) => r.confidence ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'lastIngested',
              label: t('projects.headers.lastIngested'),
              width: '11rem',
              render: (r) => r.lastIngested
                ? <span className="text-xs text-slate-300">{r.lastIngested.toLocaleString()}</span>
                : <span className="text-xs text-slate-500">{t('projects.never')}</span>,
              accessor: (r) => r.lastIngested?.getTime() ?? 0,
              hideOnMobile: true,
            },
            {
              key: 'actions',
              label: isAr ? 'إجراءات' : 'Actions',
              width: '7rem',
              align: 'end',
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                    title={isAr ? 'تعديل' : 'Edit'}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-300"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                    title={isAr ? 'حذف' : 'Delete'}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <Card padded={false}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
        </Card>
      )}

      <p className="text-center text-[11px] text-slate-500">
        <Link href="/review" className="hover:text-slate-300">{t('common2.viewAll')} →</Link>
      </p>

      {/* ═══ Create / Edit Modal ═══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />

          {/* Panel */}
          <div className="relative mx-4 w-full max-w-lg animate-[fadeScaleIn_200ms_ease-out] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">
                  {modalMode === 'create'
                    ? (isAr ? 'إضافة مشروع جديد' : 'Add New Project')
                    : (isAr ? 'تعديل المشروع' : 'Edit Project')}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {modalMode === 'create'
                    ? (isAr ? 'أدخل بيانات المشروع الأساسية' : 'Enter the basic project details')
                    : (isAr ? 'عدّل بيانات المشروع' : 'Update the project details')}
                </p>
              </div>
              <button onClick={closeModal} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
              {/* Business Key — only for create mode */}
              {modalMode === 'create' && (
                <FieldGroup label={isAr ? 'مفتاح المشروع' : 'Project Key'} required hint={isAr ? 'مثال: P-2000' : 'e.g. P-2000'}>
                  <input
                    value={form.businessKey}
                    onChange={(e) => setField('businessKey', e.target.value)}
                    placeholder="P-2000"
                    dir="ltr"
                    className="input-field font-mono"
                  />
                </FieldGroup>
              )}

              {/* Name */}
              <FieldGroup label={isAr ? 'اسم المشروع' : 'Project Name'} required>
                <input
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={isAr ? 'اسم المشروع' : 'Project name'}
                  dir="auto"
                  className="input-field"
                />
              </FieldGroup>

              {/* Client/hierarchy placement. Governance-tier users place the project
                  under a client (Enterprise) + an optional Program that links related
                  projects or the phases of one project (Mr. Ayham, 2026-06-21). Other
                  users get the simple existing/new client selector (2026-06-20). */}
              {canHierarchy && modalMode === 'create' ? (
                <>
                  <FieldGroup
                    label={isAr ? 'العميل (المؤسسة)' : 'Client (Enterprise)'}
                    hint={isAr ? 'العميل = مؤسسة ممكن تملك عدة مشاريع' : 'A client is an Enterprise that can own several projects'}
                  >
                    <div className="space-y-2">
                      <select
                        value={entSel}
                        onChange={(e) => { setEntSel(e.target.value); setProgSel(''); }}
                        dir="auto"
                        className="input-field"
                      >
                        <option value="">{isAr ? '— بدون / عميل كنص حر —' : '— None / free-text client —'}</option>
                        {enterprises.map((en) => <option key={en.businessKey} value={en.businessKey}>{en.name}</option>)}
                        <option value="__new__">{isAr ? '➕ عميل جديد…' : '➕ New client…'}</option>
                      </select>
                      {entSel === '__new__' && (
                        <input value={entNewName} onChange={(e) => setEntNewName(e.target.value)} placeholder={isAr ? 'اسم العميل/المؤسسة الجديدة' : 'New client / enterprise name'} dir="auto" className="input-field" autoFocus />
                      )}
                      {entSel === '' && (
                        <input value={form.clientName} onChange={(e) => setField('clientName', e.target.value)} placeholder={isAr ? 'اسم العميل (نص حر، اختياري)' : 'Client name (free text, optional)'} dir="auto" className="input-field" />
                      )}
                    </div>
                  </FieldGroup>

                  {entSel && (
                    <>
                      {/* Portfolio (المحفظة) under the enterprise */}
                      <FieldGroup
                        label={isAr ? 'المحفظة (Portfolio)' : 'Portfolio'}
                        hint={isAr ? 'مجموعة برامج/مشاريع العميل' : "The client's grouping of programs/projects"}
                      >
                        <div className="space-y-2">
                          <select value={pfSel} onChange={(e) => { setPfSel(e.target.value); setProgSel(''); }} dir="auto" className="input-field">
                            <option value="">{isAr ? '— بدون محفظة —' : '— No portfolio —'}</option>
                            {entSel !== '__new__' && portfoliosForEnt.map((pf) => <option key={pf.businessKey} value={pf.businessKey}>{pf.name}</option>)}
                            <option value="__new__">{isAr ? '➕ محفظة جديدة…' : '➕ New portfolio…'}</option>
                          </select>
                          {pfSel === '__new__' && (
                            <input value={pfNewName} onChange={(e) => setPfNewName(e.target.value)} placeholder={isAr ? 'اسم المحفظة' : 'Portfolio name'} dir="auto" className="input-field" />
                          )}
                        </div>
                      </FieldGroup>

                      {/* Program (البرنامج) — links related projects / phases */}
                      {pfSel && (
                        <FieldGroup
                          label={isAr ? 'البرنامج (ربط)' : 'Program (link)'}
                          hint={isAr ? 'اربط المشاريع المترابطة أو مراحل المشروع الواحد تحت برنامج' : 'Group related projects — or the phases of one project — under a program'}
                        >
                          <div className="space-y-2">
                            <select value={progSel} onChange={(e) => setProgSel(e.target.value)} dir="auto" className="input-field">
                              <option value="">{isAr ? '— مستقل (بدون برنامج) —' : '— Standalone (no program) —'}</option>
                              {pfSel !== '__new__' && programsForPf.map((pr) => <option key={pr.businessKey} value={pr.businessKey}>{pr.name}</option>)}
                              <option value="__new__">{isAr ? '➕ برنامج جديد…' : '➕ New program…'}</option>
                            </select>
                            {progSel === '__new__' && (
                              <input value={progNewName} onChange={(e) => setProgNewName(e.target.value)} placeholder={isAr ? 'اسم البرنامج (مثال: مراحل برج النيل)' : 'Program name (e.g. Nile Tower phases)'} dir="auto" className="input-field" />
                            )}
                          </div>
                        </FieldGroup>
                      )}

                      {/* Phase (المرحلة) — this project's phase within its program */}
                      <FieldGroup
                        label={isAr ? 'المرحلة (Phase)' : 'Phase'}
                        hint={isAr ? 'اختياري — مرحلة المشروع داخل البرنامج (مثال: Phase 1)' : "Optional — the project's phase within its program (e.g. Phase 1)"}
                      >
                        <input value={phaseLabel} onChange={(e) => setPhaseLabel(e.target.value)} placeholder={isAr ? 'مثال: Phase 1' : 'e.g. Phase 1'} dir="auto" className="input-field" />
                      </FieldGroup>
                    </>
                  )}
                </>
              ) : (
              <FieldGroup
                label={isAr ? 'العميل' : 'Client'}
                hint={isAr ? 'اختر عميلًا موجودًا لإضافة المشروع له، أو أضف عميلًا جديدًا' : 'Pick an existing client to add this project to, or add a new client'}
              >
                {modalMode === 'create' && existingClients.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={newClientMode ? '__new__' : form.clientName}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__new__') { setNewClientMode(true); setField('clientName', ''); }
                        else { setNewClientMode(false); setField('clientName', v); }
                      }}
                      dir="auto"
                      className="input-field"
                    >
                      <option value="">{isAr ? '— اختر عميلًا موجودًا —' : '— Select existing client —'}</option>
                      {existingClients.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">{isAr ? '➕ عميل جديد…' : '➕ New client…'}</option>
                    </select>
                    {newClientMode && (
                      <input
                        value={form.clientName}
                        onChange={(e) => setField('clientName', e.target.value)}
                        placeholder={isAr ? 'اسم العميل الجديد' : 'New client name'}
                        dir="auto"
                        className="input-field"
                        autoFocus
                      />
                    )}
                  </div>
                ) : (
                  <input
                    value={form.clientName}
                    onChange={(e) => setField('clientName', e.target.value)}
                    placeholder={isAr ? 'اسم الشركة أو العميل' : 'Company or client name'}
                    dir="auto"
                    className="input-field"
                  />
                )}
              </FieldGroup>
              )}

              {/* Status + Currency (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label={isAr ? 'الحالة' : 'Status'}>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value)}
                    className="input-field"
                  >
                    <option value="active">{isAr ? 'نشط' : 'Active'}</option>
                    <option value="on_hold">{isAr ? 'متوقف' : 'On Hold'}</option>
                    <option value="completed">{isAr ? 'مكتمل' : 'Completed'}</option>
                    <option value="cancelled">{isAr ? 'ملغي' : 'Cancelled'}</option>
                    <option value="planning">{isAr ? 'تخطيط' : 'Planning'}</option>
                  </select>
                </FieldGroup>
                <FieldGroup label={isAr ? 'العملة' : 'Currency'}>
                  <select
                    value={form.currency}
                    onChange={(e) => setField('currency', e.target.value)}
                    className="input-field"
                  >
                    <option value="SAR">SAR</option>
                    <option value="USD">USD</option>
                    <option value="AED">AED</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </FieldGroup>
              </div>

              {/* Planned Start + Finish (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label={isAr ? 'تاريخ البدء المخطط' : 'Planned Start'}>
                  <input
                    type="date"
                    value={form.plannedStart}
                    onChange={(e) => setField('plannedStart', e.target.value)}
                    dir="ltr"
                    className="input-field"
                  />
                </FieldGroup>
                <FieldGroup label={isAr ? 'تاريخ الانتهاء المخطط' : 'Planned Finish'}>
                  <input
                    type="date"
                    value={form.plannedFinish}
                    onChange={(e) => setField('plannedFinish', e.target.value)}
                    dir="ltr"
                    className="input-field"
                  />
                </FieldGroup>
              </div>

              {/* Budget */}
              <FieldGroup label={isAr ? 'الميزانية الإجمالية' : 'Budget at Completion'}>
                <input
                  type="number"
                  value={form.budgetAtCompletion}
                  onChange={(e) => setField('budgetAtCompletion', e.target.value)}
                  placeholder="0.00"
                  dir="ltr"
                  className="input-field font-mono"
                  min="0"
                  step="0.01"
                />
              </FieldGroup>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
              <Button variant="ghost" size="sm" onClick={closeModal}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving
                  ? (isAr ? 'جارٍ الحفظ…' : 'Saving…')
                  : modalMode === 'create'
                    ? (isAr ? 'إنشاء المشروع' : 'Create Project')
                    : (isAr ? 'حفظ التعديلات' : 'Save Changes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirmation Modal ═══ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />

          {/* Panel */}
          <div className="relative mx-4 w-full max-w-md animate-[fadeScaleIn_200ms_ease-out] rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30">
                  <IconTrash className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-50">
                    {isAr ? 'حذف المشروع' : 'Delete Project'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {isAr
                      ? <>هل أنت متأكد من حذف المشروع <strong className="text-white">{deleteTarget.name}</strong> ({deleteTarget.businessKey})؟</>
                      : <>Are you sure you want to delete <strong className="text-white">{deleteTarget.name}</strong> ({deleteTarget.businessKey})?</>}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {isAr ? 'سيتم إخفاء المشروع من القوائم. يمكن استرجاعه لاحقاً.' : 'The project will be hidden from all lists. It can be restored later.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? (isAr ? 'جارٍ الحذف…' : 'Deleting…') : (isAr ? 'نعم، احذف' : 'Yes, Delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scoped styles for the modal input fields + animation */}
      <style jsx global>{`
        .input-field {
          display: block;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(15,23,42,0.6);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #f1f5f9;
          transition: border-color 0.2s;
          outline: none;
        }
        .input-field::placeholder { color: #64748b; }
        .input-field:focus { border-color: rgba(56,189,248,0.5); }
        .input-field option { background: #0f172a; color: #f1f5f9; }
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Form field wrapper. */
function FieldGroup({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * A 0–100 score chip. `higherBetter` flips the tone scale so the Risk score
 * (where 100 = worst) reads red at the top while Governance/Composite read
 * green at the top.
 */
function ScorePill({ value, higherBetter }: { value: number | undefined; higherBetter: boolean }) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  const good = higherBetter ? value >= 75 : value <= 25;
  const mid = higherBetter ? value >= 50 : value <= 50;
  const tone: 'emerald' | 'amber' | 'rose' = good ? 'emerald' : mid ? 'amber' : 'rose';
  return <Pill tone={tone}>{Math.round(value)}</Pill>;
}

function StatTile({
  label, value, tone, icon,
}: { label: string; value: number; tone: 'sky' | 'emerald' | 'rose' | 'amber'; icon: React.ReactNode }) {
  const grad: Record<string, string> = {
    sky:     'from-sky-500/10 ring-sky-500/30 text-sky-300',
    emerald: 'from-emerald-500/10 ring-emerald-500/30 text-emerald-300',
    rose:    'from-rose-500/10 ring-rose-500/30 text-rose-300',
    amber:   'from-amber-400/10 ring-amber-400/30 text-amber-300',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${grad[tone]} to-transparent p-4`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-slate-900/70 ring-1 ${grad[tone].split(' ')[1]} ${grad[tone].split(' ')[2]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-50">{value}</p>
    </div>
  );
}
