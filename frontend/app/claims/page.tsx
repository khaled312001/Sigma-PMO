'use client';

/**
 * /claims — the L6 Claims & Disputes Agent register (Mr. Ayham's Layer 6).
 * Potential claims (EOT/cost/variation) with delay-event evidence, FIDIC clause
 * and responsibility. Dispute-prep drafting stays on /letters.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconBook, IconRefresh, IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface ClaimRow {
  id: string; title: string; type: string; basis: string;
  estimatedDays: number | null; estimatedAmount: string | null;
  responsibleParty: string; fidicClause: string | null;
  evidenceRefs: string[]; status: string; confidence: number;
}

export default function ClaimsPageRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Claims">
      <ClaimsPage />
    </AuthGate>
  );
}

const TYPE_TONE: Record<string, 'sky' | 'amber' | 'violet' | 'rose'> = {
  eot: 'amber', cost: 'rose', variation: 'violet', disruption: 'sky',
};

function ClaimsPage() {
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [rows, setRows] = useState<ClaimRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const r = await api<ClaimRow[]>(`/claims?projectKey=${encodeURIComponent(projectKey)}`);
      setRows(r); setError(null);
    } catch (e) { setError((e as Error).message); setRows([]); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      await api(`/agents/l6.claims/run`, { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success('Claims agent ran', 'Register refreshed from delay analysis + governance decisions.');
      await load();
    } catch (e) { toast.error('Claims run failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 6 · Claims & Disputes"
        title="Claims Register"
        description="Potential claims identified deterministically from delay events (L2 schedule alerts) and the linked L3 governance decisions — with FIDIC clause, responsibility and evidence."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canRun && <Button variant="primary" size="sm" disabled={busy} onClick={run}><IconSparkles className="h-3.5 w-3.5" /> {busy ? 'Running…' : 'Run claims agent'}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {rows === null ? (
        <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No potential claims" description={canRun ? 'Run the claims agent to identify potential claims from current findings.' : 'The register appears once a reviewer runs the claims agent.'} />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TYPE_TONE[c.type] ?? 'slate'}>{c.type.toUpperCase()}</Pill>
                <Pill tone="slate">{c.status}</Pill>
                {c.fidicClause && <Pill tone="rose"><span className="font-mono" dir="ltr">{c.fidicClause}</span></Pill>}
                <span className="text-sm font-medium text-slate-100">{c.title}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{c.basis}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                {c.estimatedDays !== null && <span>Time impact: <strong className="text-slate-200">{c.estimatedDays} d</strong></span>}
                {c.estimatedAmount && <span>Cost impact: <strong className="text-slate-200" dir="ltr">{c.estimatedAmount}</strong></span>}
                <span>Responsibility: <strong className="text-slate-200">{c.responsibleParty}</strong></span>
                <span>Confidence: <strong className="text-slate-200">{Math.round(c.confidence * 100)}%</strong></span>
                <span className="inline-flex items-center gap-1"><IconBook className="h-3 w-3" /> {c.evidenceRefs.length} evidence link(s)</span>
              </div>
              <div className="mt-2">
                <Link href="/letters" className="text-xs text-sky-300 underline-offset-2 hover:underline">Draft a FIDIC letter for this claim →</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
