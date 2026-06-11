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
      toast.success('Status recomputed', `${selected.type} ${selected.key} refreshed.`);
      await refresh();
    } catch (e) {
      toast.error('Recompute failed', (e as Error).message);
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
      toast.success('Lifecycle phase set', `${projectKey} → ${phase.replace(/_/g, ' ')}`);
      await refresh();
    } catch (e) {
      toast.error('Set phase failed', (e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance · Structure"
        title="Governance Hierarchy"
        description={
          'Enterprise → Portfolio → Program → Project. Each node carries its rolled-up ' +
          '4-tier governance status (Green / Yellow / Orange / Red), aggregated worst-of-children ' +
          'from the deterministic status engine.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <IconRefresh className="h-3.5 w-3.5" /> Refresh
            </Button>
            {canManage && (
              <>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'enterprise' ? null : 'enterprise'))}>
                  <IconFolder className="h-3.5 w-3.5" /> Enterprise
                </Button>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'portfolio' ? null : 'portfolio'))}>
                  <IconFolder className="h-3.5 w-3.5" /> Portfolio
                </Button>
                <Button variant="primary" size="sm" onClick={() => setForm((f) => (f === 'program' ? null : 'program'))}>
                  <IconFolder className="h-3.5 w-3.5" /> Program
                </Button>
              </>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {/* Status legend. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="text-slate-500">Status tiers:</span>
        <GovernanceStatusBadge status="green" />
        <GovernanceStatusBadge status="yellow" />
        <GovernanceStatusBadge status="orange" />
        <GovernanceStatusBadge status="red" />
      </div>

      {/* Roll-up chip legend (md+ — chips render next to each node). */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 md:flex">
        <span>Per-node roll-ups:</span>
        <span><span className="font-mono text-slate-300">CPI</span> cost index (EV/AC)</span>
        <span><span className="font-mono text-slate-300">SPI</span> schedule index (EV/PV)</span>
        <span><span className="font-mono text-slate-300">R</span> open risks</span>
        <span><span className="font-mono text-slate-300">C</span> open claims</span>
        <span><span className="font-mono text-slate-300">B</span> benefit realized %</span>
        <span className="text-slate-600">Parents are BAC-weighted; hover a chip for full numbers.</span>
      </div>

      {canManage && form && (
        <CreateNodeForm
          kind={form}
          busy={busy}
          onCancel={() => setForm(null)}
          onCreated={async () => { setForm(null); await refresh(); }}
          setBusy={setBusy}
          toast={toast}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Governance tree">
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

        <Card title="Node">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Pill tone="slate">{selected.type}</Pill>
                <span className="font-mono text-xs text-slate-300" dir="ltr">{selected.key}</span>
              </div>
              {canManage ? (
                <Button variant="success" size="sm" disabled={busy} onClick={recompute}>
                  {busy ? 'Recomputing…' : 'Recompute governance status'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">
                  Recompute requires the governance-management capability.
                </p>
              )}
              {selected.type === 'project' && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Governance lifecycle</p>
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
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a node in the tree to recompute its status or attach a project.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-400';

function CreateNodeForm({
  kind,
  busy,
  onCancel,
  onCreated,
  setBusy,
  toast,
}: {
  kind: NodeKind;
  busy: boolean;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  setBusy: (b: boolean) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [businessKey, setKey] = useState('');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const parentLabel =
    kind === 'portfolio' ? 'Enterprise businessKey (optional)'
    : kind === 'program' ? 'Portfolio businessKey (optional)'
    : null;

  const submit = async () => {
    if (!businessKey.trim() || !name.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, string> = { businessKey: businessKey.trim(), name: name.trim() };
      if (kind === 'portfolio' && parent.trim()) body.enterpriseBusinessKey = parent.trim();
      if (kind === 'program' && parent.trim()) body.portfolioBusinessKey = parent.trim();
      await api(`/hierarchy/${kind}`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(`${kind} created`, `${name.trim()} added to the hierarchy.`);
      await onCreated();
    } catch (e) {
      toast.error('Create failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`New ${kind}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Business key</label>
          <input className={`${inputCls} font-mono`} dir="ltr" value={businessKey} onChange={(e) => setKey(e.target.value)} placeholder={`${kind.toUpperCase()}-001`} />
        </div>
        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${kind} name`} />
        </div>
        {parentLabel && (
          <div className="sm:col-span-2">
            <label className={labelCls}>{parentLabel}</label>
            <input className={`${inputCls} font-mono`} dir="ltr" value={parent} onChange={(e) => setParent(e.target.value)} placeholder="leave blank for top-level" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={busy || !businessKey.trim() || !name.trim()} onClick={submit}>
          {busy ? 'Creating…' : `Create ${kind}`}
        </Button>
      </div>
    </Card>
  );
}

function AttachProjectForm({
  programKey,
  onAttached,
  toast,
}: {
  programKey: string;
  onAttached: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
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
      toast.success('Project attached', `${projectKey.trim()} → ${programKey}`);
      setProjectKey('');
      await onAttached();
    } catch (e) {
      toast.error('Attach failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-800 pt-3">
      <label className={labelCls}>Attach a project to this program</label>
      <div className="mt-1 flex items-center gap-2">
        <input className={`${inputCls} font-mono`} dir="ltr" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="P-1000" />
        <Button variant="primary" size="sm" disabled={busy || !projectKey.trim()} onClick={submit}>
          {busy ? '…' : 'Attach'}
        </Button>
      </div>
    </div>
  );
}
