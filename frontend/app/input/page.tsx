'use client';

import { useCallback, useEffect, useState } from 'react';

import { api, IngestionRun } from '../../lib/api';

interface IngestOutcome {
  runId: string;
  parser: string;
  status: string;
  counts: Record<string, number>;
  confidence: { overall: number } | null;
}

function confColor(v: number | undefined): string {
  if (v === undefined) return 'bg-slate-700';
  if (v >= 0.9) return 'bg-emerald-500';
  if (v >= 0.75) return 'bg-amber-400';
  return 'bg-red-500';
}

export default function InputPage() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<IngestOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setRuns(await api<IngestionRun[]>('/ingestion/runs?limit=20')); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async () => {
    if (!file) return;
    setUploading(true); setError(null); setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await api<IngestOutcome>('/ingestion/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64: b64 }),
      });
      setOutcome(r);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Input</h1>
        <p className="text-xs text-slate-400">Upload schedule and report files. Supported: Primavera P6 (.xer, .xml/PMXML), Excel (.xlsx), CSV.</p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="rounded border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold">Upload a file</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" accept=".xer,.xml,.xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs text-slate-300" />
          <button onClick={upload} disabled={!file || uploading} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
            {uploading ? 'Uploading…' : 'Ingest'}
          </button>
        </div>
        {outcome && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            Ingested via <strong>{outcome.parser}</strong> → status <strong>{outcome.status}</strong>.
            {' '}counts: {Object.entries(outcome.counts).map(([k, v]) => `${k}:${v}`).join(' · ')}.
            {outcome.confidence && <> Confidence {(outcome.confidence.overall * 100).toFixed(1)}%.</>}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Recent runs</h2>
        <div className="mt-3 overflow-hidden rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
              <tr><th className="px-3 py-2">When</th><th>Parser</th><th>Status</th><th>Counts</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const conf = (r.summary?.confidence as { overall?: number } | undefined)?.overall;
                return (
                  <tr key={r.id} className="border-t border-slate-800/70">
                    <td className="px-3 py-2 text-slate-400">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.parser}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{r.status}</span></td>
                    <td className="px-3 py-2 text-xs text-slate-300">{Object.entries(r.rowCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</td>
                    <td className="px-3 py-2 text-xs">
                      {conf === undefined ? <span className="text-slate-500">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-800"><div className={`h-full ${confColor(conf)}`} style={{ width: `${conf * 100}%` }} /></div>
                          <span className="tabular-nums">{(conf * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
