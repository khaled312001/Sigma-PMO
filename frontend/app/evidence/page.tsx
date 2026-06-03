'use client';

import { useEffect, useState } from 'react';

import { AlertRecord, api, EvidencePackage } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { JsonView } from '../../components/JsonView';
import { Card, ConfidenceBar, EmptyState, ErrorBanner, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function EvidencePageRoute() {
  return <AuthGate surface="Evidence"><EvidencePage /></AuthGate>;
}

function EvidencePage() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AlertRecord[]>('/rules/alerts?limit=200')
      .then((a) => { setAlerts(a); if (a[0]) void open(a[0].id); })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (id: string) => {
    setSelected(id); setEvidence(null);
    try { setEvidence(await api<EvidencePackage>(`/governance/alerts/${id}/evidence`)); }
    catch (e) { setError((e as Error).message); }
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
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('evidence.rationale')}</p>
                <p className="mt-1 text-slate-100">{evidence.rationale}</p>
              </div>

              {evidence.sourceFile && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                  <Pill tone="sky">{t('evidence.sourceFile')}</Pill>
                  <span className="font-mono" dir="ltr">{evidence.sourceFile.filename}</span>
                  <span className="text-slate-500">·</span>
                  <span className="font-mono text-slate-400" dir="ltr">sha {evidence.sourceFile.contentSha256.slice(0, 12)}…</span>
                </div>
              )}

              {evidence.confidence && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label={t('evidence.metrics.overall')}     value={evidence.confidence.overall} accent />
                  <Metric label={t('evidence.metrics.completeness')} value={evidence.confidence.completeness} />
                  <Metric label={t('evidence.metrics.consistency')}  value={evidence.confidence.consistency} />
                  <Metric label={t('evidence.metrics.source')}       value={evidence.confidence.sourceReliability} />
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('evidence.rawSnippets')}</p>
                <JsonView data={evidence.rawSourceSnippets} title={t('evidence.rawSnippets')} maxHeight="28rem" defaultDepth={2} />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1"><ConfidenceBar value={value} width={64} /></div>
    </div>
  );
}
