'use client';

import { useEffect, useState } from 'react';

import { AlertRecord, api, EvidencePackage } from '../../lib/api';
import { Card, ConfidenceBar, EmptyState, ErrorBanner, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function EvidencePage() {
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
        eyebrow="Evidence"
        title="Trace any alert to its source"
        description="Every alert links to the canonical row that triggered it, the ingestion run + source file, and the original parsed payload (rawSource)."
      />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title="Alerts" hint="Click to inspect the evidence chain." padded={false}>
          {!alerts ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
          ) : alerts.length === 0 ? (
            <EmptyState title="No alerts yet" description="Run the rule engine on the Review page first." />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-800 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => open(a.id)}
                    className={`block w-full px-4 py-2.5 text-left text-xs transition hover:bg-slate-800/40 ${selected === a.id ? 'bg-slate-800/70' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="truncate font-mono text-[10px] text-slate-400">{a.code}</span>
                    </div>
                    <div className="mt-1 text-slate-200">{a.summary}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Evidence package">
          {!selected ? (
            <EmptyState title="Select an alert" description="Pick from the list on the left to see its full evidence chain." />
          ) : !evidence ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rationale</p>
                <p className="mt-1 text-slate-100">{evidence.rationale}</p>
              </div>

              {evidence.sourceFile && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                  <Pill tone="sky">source file</Pill>
                  <span className="font-mono">{evidence.sourceFile.filename}</span>
                  <span className="text-slate-500">·</span>
                  <span className="font-mono text-slate-400">sha {evidence.sourceFile.contentSha256.slice(0, 12)}…</span>
                </div>
              )}

              {evidence.confidence && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Overall"     value={evidence.confidence.overall} accent />
                  <Metric label="Completeness" value={evidence.confidence.completeness} />
                  <Metric label="Consistency"  value={evidence.confidence.consistency} />
                  <Metric label="Source"       value={evidence.confidence.sourceReliability} />
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Raw source snippets</p>
                <pre className="mt-1 max-h-96 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[11px] leading-snug text-slate-300">
{JSON.stringify(evidence.rawSourceSnippets, null, 2)}
                </pre>
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
      <p className="mt-1 text-base font-semibold text-slate-100"><ConfidenceBar value={value} width={64} /></p>
    </div>
  );
}
