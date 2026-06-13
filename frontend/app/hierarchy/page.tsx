'use client';

/**
 * /hierarchy — the multi-level governance hierarchy
 * (Enterprise → Portfolio → Program → Project) with the 4-tier Green/Yellow/
 * Orange/Red status per node (2026-06-11 governance OS, Phase 1).
 *
 * Reads (tree) are open to any authenticated user. Managing the structure
 * (create node / attach project / recompute status) requires
 * `canManageHierarchy` (admin + client governance tier).
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { GovernanceTree, HierarchyTree, RollupNode } from '../../components/HierarchyTree';
import { LifecyclePhaseBar } from '../../components/LifecyclePhaseBar';
import { IconFolder, IconRefresh } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';

export default function HierarchyPageRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Governance hierarchy">
      <HierarchyPage />
    </AuthGate>
  );
}

type NodeKind = 'enterprise' | 'portfolio' | 'program';

function HierarchyPage() {
  const toast = useToast();
  const { me } = useMe();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const role = me?.user?.role;
  const caps = role ? CAPABILITIES[role] : null;
  const canManage = !!caps?.canManageHierarchy;

  const [tree, setTree] = useState<GovernanceTree | null>(null);
  const [rollups, setRollups] = useState<Map<string, RollupNode>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<NodeKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api<GovernanceTree>('/hierarchy/tree'),
        api<{ nodes: RollupNode[] }>('/hierarchy/rollups').catch(() => ({ nodes: [] as RollupNode[] })),
      ]);
      setTree(t);
      setRollups(new Map(r.nodes.map((n) => [n.businessKey, n])));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setTree({ enterprises: [], unattachedProjects: [] });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const recompute = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/hierarchy/recompute?nodeType=${selected.type}&nodeKey=${encodeURIComponent(selected.key)}`, {
        method: 'POST',
      });
      toast.success(
        ar ? 'أُعيد احتساب الحالة' : 'Status recomputed',
        ar ? `تم تحديث ${selected.type} ${selected.key}.` : `${selected.type} ${selected.key} refreshed.`,
      );
      await refresh();
    } catch (e) {
      toast.error(ar ? 'فشل إعادة الاحتساب' : 'Recompute failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Current lifecycle phase of the selected project (scanned from the tree). */
  const projectPhase = (() => {
    if (!tree || selected?.type !== 'project') return null;
    const all: Array<{ businessKey: string; lifecyclePhase: string | null }> = [
      ...tree.unattachedProjects,
      ...tree.enterprises.flatMap((e) => e.portfolios.flatMap((pf) => pf.programs.flatMap((pr) => pr.projects))),
    ];
    return all.find((p) => p.businessKey === selected.key)?.lifecyclePhase ?? null;
  })();

  const setPhase = async (projectKey: string, phase: string) => {
    try {
      await api('/hierarchy/phase', { method: 'POST', body: JSON.stringify({ projectKey, phase }) });
      toast.success(ar ? 'تم ضبط مرحلة دورة الحياة' : 'Lifecycle phase set', `${projectKey} → ${phase.replace(/_/g, ' ')}`);
      await refresh();
    } catch (e) {
      toast.error(ar ? 'فشل ضبط المرحلة' : 'Set phase failed', (e as Error).message);
    }
  };

  return (
    <div className="space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader
        eyebrow={ar ? 'الحوكمة · البنية' : 'Governance · Structure'}
        title={ar ? 'الهيكل الهرمي للحوكمة' : 'Governance Hierarchy'}
        description={
          ar
            ? 'المؤسسة ← المحفظة ← البرنامج ← المشروع. تحمل كل عقدة حالة الحوكمة رباعية ' +
              'التصنيف المُجمَّعة (أخضر / أصفر / برتقالي / أحمر)، مأخوذة بأسوأ حالة بين العُقد ' +
              'الفرعية من محرّك الحالة الحتمي.'
            : 'Enterprise → Portfolio → Program → Project. Each node carries its rolled-up ' +
              '4-tier governance status (Green / Yellow / Orange / Red), aggregated worst-of-children ' +
              'from the deterministic status engine.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}
            </Button>
            {canManage && (
              <>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'enterprise' ? null : 'enterprise'))}>
                  <IconFolder className="h-3.5 w-3.5" /> {ar ? 'مؤسسة' : 'Enterprise'}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'portfolio' ? null : 'portfolio'))}>
                  <IconFolder className="h-3.5 w-3.5" /> {ar ? 'محفظة' : 'Portfolio'}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'program' ? null : 'program'))}>
                  <IconFolder className="h-3.5 w-3.5" /> {ar ? 'برنامج' : 'Program'}
                </Button>
              </>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {/* Status legend. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="text-slate-500">{ar ? 'تصنيفات الحالة:' : 'Status tiers:'}</span>
        <GovernanceStatusBadge status="green" />
        <GovernanceStatusBadge status="yellow" />
        <GovernanceStatusBadge status="orange" />
        <GovernanceStatusBadge status="red" />
      </div>

      {/* Roll-up chip legend (md+ — chips render next to each node). */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 md:flex">
        <span>{ar ? 'مؤشرات مُجمَّعة لكل عقدة:' : 'Per-node roll-ups:'}</span>
        <span><span className="font-mono text-slate-300">CPI</span> {ar ? 'مؤشر التكلفة (EV/AC)' : 'cost index (EV/AC)'}</span>
        <span><span className="font-mono text-slate-300">SPI</span> {ar ? 'مؤشر الجدول (EV/PV)' : 'schedule index (EV/PV)'}</span>
        <span><span className="font-mono text-slate-300">R</span> {ar ? 'المخاطر المفتوحة' : 'open risks'}</span>
        <span><span className="font-mono text-slate-300">C</span> {ar ? 'المطالبات المفتوحة' : 'open claims'}</span>
        <span><span className="font-mono text-slate-300">B</span> {ar ? 'نسبة المنفعة المُحقَّقة' : 'benefit realized %'}</span>
        <span className="text-slate-600">{ar ? 'العُقد الأم مُرجَّحة بالـ BAC؛ مرّر فوق أي مؤشر لعرض الأرقام الكاملة.' : 'Parents are BAC-weighted; hover a chip for full numbers.'}</span>
      </div>

      {canManage && form && (
        <CreateNodeForm
          kind={form}
          busy={busy}
          onCancel={() => setForm(null)}
          onCreated={async () => { setForm(null); await refresh(); }}
          setBusy={setBusy}
          toast={toast}
          ar={ar}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={ar ? 'شجرة الحوكمة' : 'Governance tree'}>
          {tree === null ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-7 w-full animate-pulse rounded bg-slate-800/50" />
              ))}
            </div>
          ) : (
            <HierarchyTree
              tree={tree}
              selectedKey={selected?.key}
              onSelectNode={(type, key) => setSelected({ type, key })}
              rollups={rollups}
            />
          )}
        </Card>

        <Card title={ar ? 'العقدة' : 'Node'}>
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Pill tone="slate">{selected.type}</Pill>
                <span className="font-mono text-xs text-slate-300" dir="ltr">{selected.key}</span>
              </div>
              {canManage ? (
                <Button variant="success" size="sm" disabled={busy} onClick={recompute}>
                  {busy ? (ar ? 'جارٍ إعادة الاحتساب…' : 'Recomputing…') : (ar ? 'إعادة احتساب حالة الحوكمة' : 'Recompute governance status')}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">
                  {ar ? 'تتطلّب إعادة الاحتساب صلاحية إدارة الحوكمة.' : 'Recompute requires the governance-management capability.'}
                </p>
              )}
              {selected.type === 'project' && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{ar ? 'دورة حياة الحوكمة' : 'Governance lifecycle'}</p>
                  <LifecyclePhaseBar
                    current={projectPhase}
                    onSelect={canManage ? (phase) => setPhase(selected.key, phase) : undefined}
                  />
                </div>
              )}
              {selected.type === 'program' && canManage && (
                <AttachProjectForm
                  programKey={selected.key}
                  onAttached={refresh}
                  toast={toast}
                  ar={ar}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{ar ? 'اختر عقدة في الشجرة لإعادة احتساب حالتها أو لإرفاق مشروع.' : 'Select a node in the tree to recompute its status or attach a project.'}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-400';

/** Arabic display names for the hierarchy node kinds (the enum value `kind` is unchanged). */
const NODE_KIND_AR: Record<NodeKind, string> = { enterprise: 'مؤسسة', portfolio: 'محفظة', program: 'برنامج' };

function CreateNodeForm({
  kind,
  busy,
  onCancel,
  onCreated,
  setBusy,
  toast,
  ar,
}: {
  kind: NodeKind;
  busy: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  setBusy: (b: boolean) => void;
  toast: ReturnType<typeof useToast>;
  ar: boolean;
}) {
  const [businessKey, setKey] = useState('');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const kindLabel = ar ? NODE_KIND_AR[kind] : kind;
  const parentLabel =
    kind === 'portfolio' ? (ar ? 'المفتاح التجاري للمؤسسة (اختياري)' : 'Enterprise businessKey (optional)')
    : kind === 'program' ? (ar ? 'المفتاح التجاري للمحفظة (اختياري)' : 'Portfolio businessKey (optional)')
    : null;

  const submit = async () => {
    if (!businessKey.trim() || !name.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, string> = { businessKey: businessKey.trim(), name: name.trim() };
      if (kind === 'portfolio' && parent.trim()) body.enterpriseBusinessKey = parent.trim();
      if (kind === 'program' && parent.trim()) body.portfolioBusinessKey = parent.trim();
      await api(`/hierarchy/${kind}`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(
        ar ? `تم إنشاء ${kindLabel}` : `${kind} created`,
        ar ? `أُضيف ${name.trim()} إلى الهيكل الهرمي.` : `${name.trim()} added to the hierarchy.`,
      );
      await onCreated();
    } catch (e) {
      toast.error(ar ? 'فشل الإنشاء' : 'Create failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={ar ? `${kindLabel} جديدة` : `New ${kind}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{ar ? 'المفتاح التجاري' : 'Business key'}</label>
          <input className={`${inputCls} font-mono`} dir="ltr" value={businessKey} onChange={(e) => setKey(e.target.value)} placeholder={`${kind.toUpperCase()}-001`} />
        </div>
        <div>
          <label className={labelCls}>{ar ? 'الاسم' : 'Name'}</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? `اسم ${kindLabel}` : `${kind} name`} />
        </div>
        {parentLabel && (
          <div className="sm:col-span-2">
            <label className={labelCls}>{parentLabel}</label>
            <input className={`${inputCls} font-mono`} dir="ltr" value={parent} onChange={(e) => setParent(e.target.value)} placeholder={ar ? 'اتركه فارغاً للمستوى الأعلى' : 'leave blank for top-level'} />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{ar ? 'إلغاء' : 'Cancel'}</Button>
        <Button variant="primary" size="sm" disabled={busy || !businessKey.trim() || !name.trim()} onClick={submit}>
          {busy ? (ar ? 'جارٍ الإنشاء…' : 'Creating…') : (ar ? `إنشاء ${kindLabel}` : `Create ${kind}`)}
        </Button>
      </div>
    </Card>
  );
}

function AttachProjectForm({
  programKey,
  onAttached,
  toast,
  ar,
}: {
  programKey: string;
  onAttached: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
  ar: boolean;
}) {
  const [projectKey, setProjectKey] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!projectKey.trim()) return;
    setBusy(true);
    try {
      await api('/hierarchy/attach', {
        method: 'POST',
        body: JSON.stringify({ projectKey: projectKey.trim(), programKey }),
      });
      toast.success(ar ? 'تم إرفاق المشروع' : 'Project attached', `${projectKey.trim()} → ${programKey}`);
      setProjectKey('');
      await onAttached();
    } catch (e) {
      toast.error(ar ? 'فشل الإرفاق' : 'Attach failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-800 pt-3">
      <label className={labelCls}>{ar ? 'إرفاق مشروع بهذا البرنامج' : 'Attach a project to this program'}</label>
      <div className="mt-1 flex items-center gap-2">
        <input className={`${inputCls} font-mono`} dir="ltr" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="P-1000" />
        <Button variant="primary" size="sm" disabled={busy || !projectKey.trim()} onClick={submit}>
          {busy ? '…' : (ar ? 'إرفاق' : 'Attach')}
        </Button>
      </div>
    </div>
  );
}
