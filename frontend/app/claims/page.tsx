'use client';

/**
 * /claims — the L6 Claims & Disputes Agent register (Mr. Ayham's Layer 6).
 * Potential claims (EOT/cost/variation) with delay-event evidence, FIDIC clause
 * and responsibility — now with deterministic entitlement screening, a per-claim
 * readiness score and a printable evidence-linked claim package.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconBook, IconChevronRight, IconRefresh, IconSparkles } from '../../components/Icons';
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

interface CriterionResult { key: string; label: string; pass: boolean | null; detail: string }
interface EntitlementAssessment {
  entitlementLikelihood: 'high' | 'medium' | 'low';
  passedCount: number; decidableCount: number;
  criteria: CriterionResult[]; source: string; basis: string;
}
interface EntitlementListResult {
  projectKey: string; count: number;
  rows: Array<{ claim: ClaimRow; entitlement: EntitlementAssessment }>;
}

interface ReadinessResult {
  claimId: string; projectKey: string; readinessScore: number;
  label: 'ready' | 'developing' | 'weak';
  breakdown: {
    evidenceLinked: { present: boolean; points: number; max: number };
    entitlement: { likelihood: string; points: number; max: number };
    quantumDocumented: { present: boolean; points: number; max: number };
    narrativePresent: { present: boolean; points: number; max: number };
  };
  entitlement: EntitlementAssessment; basis: string;
}

interface ClaimPackage {
  generatedAt: string; projectKey: string; claim: ClaimRow;
  delayAnalysis: { estimatedDays: number | null; estimatedAmount: string | null; type: string; fidicClause: string | null; responsibleParty: string };
  entitlement: EntitlementAssessment; readiness: ReadinessResult;
  relatedAlerts: Array<{ id: string; code: string; severity: string; summary: string; context: Record<string, unknown> }>;
  sourceRefs: { evidenceRefs: string[]; linkedLetterIds: string[]; relatedAlertIds: string[] };
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
const LIKELIHOOD_TONE: Record<string, 'emerald' | 'amber' | 'rose'> = {
  high: 'emerald', medium: 'amber', low: 'rose',
};

function ClaimsPage() {
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [rows, setRows] = useState<ClaimRow[] | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementListResult | null>(null);
  const [readiness, setReadiness] = useState<Record<string, ReadinessResult>>({});
  const [packages, setPackages] = useState<Record<string, ClaimPackage>>({});
  const [showCriteria, setShowCriteria] = useState<Record<string, boolean>>({});
  const [showPackage, setShowPackage] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const q = `projectKey=${encodeURIComponent(projectKey)}`;
      const [r, ent] = await Promise.all([
        api<ClaimRow[]>(`/claims?${q}`),
        api<EntitlementListResult>(`/claims/entitlement?${q}`).catch(() => null),
      ]);
      setRows(r); setEntitlement(ent); setError(null);
      // Best-effort readiness per claim (independent of entitlement list).
      const ready: Record<string, ReadinessResult> = {};
      await Promise.all(
        r.map(async (c) => {
          try { ready[c.id] = await api<ReadinessResult>(`/claims/${c.id}/readiness`); } catch { /* skip */ }
        }),
      );
      setReadiness(ready);
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

  const entitlementFor = (claimId: string): EntitlementAssessment | null =>
    entitlement?.rows.find((row) => row.claim.id === claimId)?.entitlement ?? null;

  const togglePackage = async (claimId: string) => {
    const next = !showPackage[claimId];
    setShowPackage((s) => ({ ...s, [claimId]: next }));
    if (next && !packages[claimId]) {
      try {
        const pkg = await api<ClaimPackage>(`/claims/${claimId}/package`);
        setPackages((s) => ({ ...s, [claimId]: pkg }));
      } catch (e) { toast.error('Package failed', (e as Error).message); }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 6 · Claims & Disputes"
        title="Claims Register"
        description="Potential claims identified deterministically from delay events and governance decisions — with FIDIC clause, responsibility, entitlement screening, readiness scoring and an evidence-linked package."
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
          {rows.map((c) => {
            const ent = entitlementFor(c.id);
            const ready = readiness[c.id];
            const criteriaOpen = !!showCriteria[c.id];
            const pkgOpen = !!showPackage[c.id];
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={TYPE_TONE[c.type] ?? 'slate'}>{c.type.toUpperCase()}</Pill>
                  <Pill tone="slate">{c.status}</Pill>
                  {c.fidicClause && <Pill tone="rose"><span className="font-mono" dir="ltr">{c.fidicClause}</span></Pill>}
                  {ent && (
                    <Pill tone={LIKELIHOOD_TONE[ent.entitlementLikelihood]}>
                      entitlement: {ent.entitlementLikelihood} ({ent.passedCount}/{ent.decidableCount})
                    </Pill>
                  )}
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

                {/* Readiness bar */}
                {ready && <ReadinessBar ready={ready} />}

                {/* Entitlement criteria expand */}
                {ent && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowCriteria((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                    >
                      <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${criteriaOpen ? 'rotate-90' : ''}`} />
                      {criteriaOpen ? 'Hide' : 'Show'} entitlement criteria
                    </button>
                    {criteriaOpen && (
                      <ul className="mt-2 space-y-1 border-s border-slate-800 ps-3 text-[11px]">
                        {ent.criteria.map((cr) => (
                          <li key={cr.key} className="flex items-start gap-2">
                            <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${cr.pass === true ? 'bg-emerald-500' : cr.pass === false ? 'bg-rose-500' : 'bg-slate-500'}`} />
                            <span className="text-slate-300"><strong className="text-slate-200">{cr.label}:</strong> {cr.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => togglePackage(c.id)}
                    className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                  >
                    <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${pkgOpen ? 'rotate-90' : ''}`} />
                    {pkgOpen ? 'Hide' : 'View'} claim package
                  </button>
                  <Link href="/letters" className="text-xs text-sky-300 underline-offset-2 hover:underline">Draft a FIDIC letter for this claim →</Link>
                </div>

                {pkgOpen && (
                  <ClaimPackageView pkg={packages[c.id]} />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadinessBar({ ready }: { ready: ReadinessResult }) {
  const tone = ready.label === 'ready' ? 'bg-emerald-500' : ready.label === 'developing' ? 'bg-amber-400' : 'bg-rose-500';
  const pillTone = ready.label === 'ready' ? 'emerald' : ready.label === 'developing' ? 'amber' : 'rose';
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Claim readiness</span>
        <span className="flex items-center gap-2">
          <Pill tone={pillTone}>{ready.label}</Pill>
          <span className="tabular-nums text-slate-300" dir="ltr">{ready.readinessScore}/100</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${tone}`} style={{ width: `${ready.readinessScore}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        <span>evidence {ready.breakdown.evidenceLinked.points}/{ready.breakdown.evidenceLinked.max}</span>
        <span>entitlement {ready.breakdown.entitlement.points}/{ready.breakdown.entitlement.max}</span>
        <span>quantum {ready.breakdown.quantumDocumented.points}/{ready.breakdown.quantumDocumented.max}</span>
        <span>narrative {ready.breakdown.narrativePresent.points}/{ready.breakdown.narrativePresent.max}</span>
      </div>
    </div>
  );
}

function ClaimPackageView({ pkg }: { pkg: ClaimPackage | undefined }) {
  if (!pkg) {
    return <div className="mt-2 h-16 animate-pulse rounded bg-slate-800/40" />;
  }
  const printId = `claim-package-${pkg.claim.id}`;
  const print = () => {
    if (typeof window === 'undefined') return;
    const node = document.getElementById(printId);
    const html = node?.innerHTML ?? '';
    const w = window.open('', '_blank', 'width=860,height=1000');
    if (!w) { window.print(); return; }
    w.document.write(
      `<html><head><title>Claim package — ${escapeHtml(pkg.claim.title)}</title>` +
      `<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#14171f;padding:28px;line-height:1.5}` +
      `h2{margin:0 0 4px}h3{margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}` +
      `table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ddd;padding:4px 6px;text-align:left}` +
      `.muted{color:#666;font-size:11px}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Evidence-linked claim package</span>
        <Button variant="ghost" size="sm" onClick={print}>Print / PDF</Button>
      </div>

      <div id={printId} className="space-y-3 text-sm text-slate-200">
        <section>
          <h2 className="text-base font-semibold text-slate-100">{pkg.claim.title}</h2>
          <p className="muted text-[11px] text-slate-500">
            Project {pkg.projectKey} · generated {new Date(pkg.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </p>
        </section>

        <PkgSection title="Delay analysis">
          <KeyVals
            rows={[
              ['Type', pkg.delayAnalysis.type],
              ['Estimated days', pkg.delayAnalysis.estimatedDays === null ? '—' : String(pkg.delayAnalysis.estimatedDays)],
              ['Estimated amount', pkg.delayAnalysis.estimatedAmount ?? '—'],
              ['FIDIC clause', pkg.delayAnalysis.fidicClause ?? '—'],
              ['Responsible party', pkg.delayAnalysis.responsibleParty],
            ]}
          />
        </PkgSection>

        <PkgSection title={`Entitlement — ${pkg.entitlement.entitlementLikelihood} (${pkg.entitlement.passedCount}/${pkg.entitlement.decidableCount})`}>
          <ul className="space-y-1 text-[12px]">
            {pkg.entitlement.criteria.map((cr) => (
              <li key={cr.key}>
                <strong className="text-slate-100">{cr.pass === true ? '✓' : cr.pass === false ? '✗' : '–'} {cr.label}:</strong>{' '}
                <span className="text-slate-300">{cr.detail}</span>
              </li>
            ))}
          </ul>
        </PkgSection>

        <PkgSection title={`Readiness — ${pkg.readiness.readinessScore}/100 (${pkg.readiness.label})`}>
          <KeyVals
            rows={[
              ['Evidence', `${pkg.readiness.breakdown.evidenceLinked.points}/${pkg.readiness.breakdown.evidenceLinked.max}`],
              ['Entitlement', `${pkg.readiness.breakdown.entitlement.points}/${pkg.readiness.breakdown.entitlement.max}`],
              ['Quantum', `${pkg.readiness.breakdown.quantumDocumented.points}/${pkg.readiness.breakdown.quantumDocumented.max}`],
              ['Narrative', `${pkg.readiness.breakdown.narrativePresent.points}/${pkg.readiness.breakdown.narrativePresent.max}`],
            ]}
          />
        </PkgSection>

        <PkgSection title={`Related alerts (${pkg.relatedAlerts.length})`}>
          {pkg.relatedAlerts.length === 0 ? (
            <p className="text-[12px] text-slate-500">No related alerts in window.</p>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {pkg.relatedAlerts.slice(0, 20).map((a) => (
                <li key={a.id}>
                  <span className="font-mono text-[11px] text-slate-400" dir="ltr">[{a.severity}] {a.code}</span> — {a.summary}
                </li>
              ))}
              {pkg.relatedAlerts.length > 20 && <li className="text-slate-500">… {pkg.relatedAlerts.length - 20} more</li>}
            </ul>
          )}
        </PkgSection>

        <PkgSection title="Source references">
          <KeyVals
            rows={[
              ['Evidence refs', pkg.sourceRefs.evidenceRefs.length ? pkg.sourceRefs.evidenceRefs.join(', ') : '—'],
              ['Linked letters', pkg.sourceRefs.linkedLetterIds.length ? String(pkg.sourceRefs.linkedLetterIds.length) : '0'],
              ['Related alerts', String(pkg.sourceRefs.relatedAlertIds.length)],
            ]}
          />
        </PkgSection>
      </div>
    </div>
  );
}

function PkgSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function KeyVals({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">{k}</dt>
          <dd className="text-slate-200" dir="auto">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}
