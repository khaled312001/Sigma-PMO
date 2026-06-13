'use client';

import { useEffect, useState } from 'react';

import { AlertRecord, api, EvidencePackage } from '../../lib/api';
import { useCurrentProjectKey } from '../../lib/project-context';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { StructuredDataView } from '../../components/StructuredDataView';
import { IconArrowRight, IconCheck, IconDatabase, IconEvidence, IconUpload } from '../../components/Icons';
import { Card, ConfidenceBar, EmptyState, ErrorBanner, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function EvidencePageRoute() {
  return <AuthGate surface="Evidence"><EvidencePage /></AuthGate>;
}

/** GovernanceDecision enriched with chain state (local — lib/api is shared). */
interface EvidenceDecision {
  id: string;
  responsibleParty: string;
  escalationLevel: string;
  fidicClause: string | null;
  chainState?: 'approved' | 'awaiting-second-approval' | 'rejected' | 'acknowledged' | 'pending';
  approvalsRemaining?: number;
  requiresDualApproval?: boolean;
  escalated?: boolean;
  pendingAgeDays?: number | null;
}

/** Decision trace chain (local — from GET /governance/decisions/:id/trace). */
interface EvidenceTrace {
  confidence: { overall: number } | null;
  sourceFile: { filename: string; contentSha256: string } | null;
  ruleEvaluation: { id: string; status: string } | null;
}

function EvidencePage() {
  const { t, lang } = useI18n();
  const projectKey = useCurrentProjectKey();
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [decisions, setDecisions] = useState<EvidenceDecision[]>([]);
  const [trace, setTrace] = useState<EvidenceTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Project-scoped; switching projects reloads the list and auto-opens the
  // first alert of the newly selected project.
  useEffect(() => {
    api<AlertRecord[]>(`/rules/alerts?limit=200&projectKey=${encodeURIComponent(projectKey)}`)
      .then((a) => { setAlerts(a); setSelected(null); setEvidence(null); setDecisions([]); setTrace(null); if (a[0]) void open(a[0].id); })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const open = async (id: string) => {
    setSelected(id); setEvidence(null); setDecisions([]); setTrace(null);
    try { setEvidence(await api<EvidencePackage>(`/governance/alerts/${id}/evidence`)); }
    catch (e) { setError((e as Error).message); }
    // Evidence-to-decision: the decision(s) this alert produced + their chain
    // state, and the trace chain for the first decision (reuses /trace).
    try {
      const decs = await api<EvidenceDecision[]>(`/governance/decisions?alertId=${encodeURIComponent(id)}`);
      setDecisions(decs);
      if (decs[0]) {
        try { setTrace(await api<EvidenceTrace>(`/governance/decisions/${decs[0].id}/trace`)); }
        catch { setTrace(null); }
      }
    } catch { setDecisions([]); }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('evidence.eyebrow')}
        title={t('evidence.title')}
        description={t('evidence.description')}
      />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title={t('nav.review') /* alerts list lives under Evidence */} hint={t('evidence.selectAlertHint')} padded={false}>
          {!alerts ? (
            <p className="px-4 py-6 text-sm text-slate-400">{t('common.loading')}</p>
          ) : alerts.length === 0 ? (
            <EmptyState title={t('evidence.noAlerts')} description={t('evidence.noAlertsHint')} />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-800 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => open(a.id)}
                    className={`block w-full px-4 py-2.5 text-start text-xs transition hover:bg-slate-800/40 ${selected === a.id ? 'bg-slate-800/70' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="truncate font-mono text-[10px] text-slate-400" dir="ltr">{a.code}</span>
                    </div>
                    <div className="mt-1 text-slate-200">{a.summary}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('evidence.title')}>
          {!selected ? (
            <EmptyState title={t('evidence.selectAlert')} description={t('evidence.selectAlertHint')} />
          ) : !evidence ? (
            <p className="text-sm text-slate-400">{t('common.loading')}</p>
          ) : (
            <div className="space-y-5">
              {/* Rationale hero */}
              <div className="rounded-xl border-s-4 border-sky-500/60 bg-sky-500/5 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">{t('evidence.rationale')}</p>
                <p className="text-sm leading-relaxed text-slate-100" dir="auto">{evidence.rationale}</p>
              </div>

              {/* Trace chain — ingestion run → source file */}
              {evidence.sourceFile && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-200">
                    <IconUpload className="h-3 w-3" />
                    <span className="font-mono" dir="ltr">{evidence.sourceFile.filename}</span>
                  </span>
                  <IconArrowRight className="h-3 w-3 text-slate-500" />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/70 px-2.5 py-1 text-slate-300">
                    <IconEvidence className="h-3 w-3" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">{lang === 'ar' ? 'بصمة' : 'sha'}</span>
                    <code className="font-mono text-slate-200" dir="ltr">{evidence.sourceFile.contentSha256.slice(0, 12)}…</code>
                  </span>
                </div>
              )}

              {/* Confidence hero — Overall big, the 3 components below */}
              {evidence.confidence && (
                <ConfidenceHero c={evidence.confidence} t={t} />
              )}

              {/* Structured raw source data */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <IconDatabase className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('evidence.rawSnippets')}</p>
                </div>
                <StructuredDataView data={evidence.rawSourceSnippets} />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ConfidenceHero({
  c, t,
}: { c: { overall: number; completeness: number; consistency: number; sourceReliability: number }; t: (k: string) => string }) {
  const overallPct = Math.round(c.overall * 100);
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-950/0 to-transparent">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40">
            <IconCheck className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              {t('evidence.overallConfidence')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-slate-50" dir="ltr">{overallPct}%</p>
          </div>
        </div>
        <div className="flex-1 min-w-[140px]"><ConfidenceBar value={c.overall} /></div>
      </div>
      <div className="grid grid-cols-3 border-t border-emerald-500/20 bg-slate-950/40 text-xs">
        <MiniMetric label={t('evidence.metrics.completeness')} value={c.completeness} />
        <MiniMetric label={t('evidence.metrics.consistency')}  value={c.consistency} border />
        <MiniMetric label={t('evidence.metrics.source')}       value={c.sourceReliability} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, border = false }: { label: string; value: number; border?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 px-3 py-2.5 ${border ? 'border-x border-emerald-500/15' : ''}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="text-base font-semibold tabular-nums text-slate-100" dir="ltr">
        {Math.round(value * 100)}%
      </p>
      <ConfidenceBar value={value} width={56} />
    </div>
  );
}
