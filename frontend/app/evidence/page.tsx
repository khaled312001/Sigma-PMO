'use client';

import { useEffect, useState } from 'react';

import { AlertRecord, api, EvidencePackage } from '../../lib/api';

export default function EvidencePage() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AlertRecord[]>('/rules/alerts?limit=100').then(setAlerts).catch((e) => setError((e as Error).message));
  }, []);

  const open = async (id: string) => {
    setSelected(id); setEvidence(null);
    try { setEvidence(await api<EvidencePackage>(`/governance/alerts/${id}/evidence`)); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Evidence</h1>
        <p className="text-xs text-slate-400">Pick an alert to see the full evidence chain — source file (with SHA-256), the canonical row that triggered it, and the parsed raw source.</p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded border border-slate-800">
          <h2 className="border-b border-slate-800 bg-slate-900/60 px-3 py-2 text-xs uppercase tracking-wider text-slate-400">Alerts</h2>
          <ul className="max-h-[70vh] divide-y divide-slate-800 overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <button onClick={() => open(a.id)} className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-800/60 ${selected === a.id ? 'bg-slate-800/80' : ''}`}>
                  <div className="font-mono text-slate-400">{a.code} · {a.severity}</div>
                  <div className="text-slate-200">{a.summary}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded border border-slate-800 bg-slate-900/40 p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Select an alert from the left to inspect its evidence.</p>
          ) : !evidence ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Rationale</div>
                <p className="mt-1">{evidence.rationale}</p>
              </div>
              {evidence.sourceFile && (
                <div className="text-xs text-slate-300">
                  Source: <span className="font-mono">{evidence.sourceFile.filename}</span> · SHA-256 <span className="font-mono">{evidence.sourceFile.contentSha256.slice(0, 12)}…</span>
                </div>
              )}
              {evidence.confidence && (
                <div className="text-xs text-slate-300">
                  Confidence {(evidence.confidence.overall * 100).toFixed(1)}% — completeness {(evidence.confidence.completeness * 100).toFixed(0)}% · consistency {(evidence.confidence.consistency * 100).toFixed(0)}% · source {(evidence.confidence.sourceReliability * 100).toFixed(0)}%
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Raw source snippets</div>
                <pre className="mt-1 max-h-96 overflow-auto rounded bg-black/40 p-3 text-[11px] leading-snug text-slate-300">{JSON.stringify(evidence.rawSourceSnippets, null, 2)}</pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
