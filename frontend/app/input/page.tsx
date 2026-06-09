'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, IngestionRun } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { IconRefresh, IconUpload } from '../../components/Icons';
import { Button, Card, ConfidenceBar, EmptyState, PageHeader, Pill } from '../../components/ui';

interface IngestOutcome {
  runId: string;
  parser: string;
  status: string;
  counts: Record<string, number>;
  confidence: { overall: number } | null;
}

const ACCEPTED_EXT = /\.(xer|xml|xlsx|csv|pdf)$/i;
const MAX_BYTES = 24 * 1024 * 1024;

export default function InputPageRoute() {
  return <AuthGate capability="canIngest" surface="Input"><InputPage /></AuthGate>;
}

function InputPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<IngestOutcome | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try { setRuns(await api<IngestionRun[]>('/ingestion/runs?limit=20')); }
    catch (e) { toast.error('Failed to load runs', (e as Error).message); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!ACCEPTED_EXT.test(f.name)) {
      toast.error('Unsupported file', 'Accepted formats: .xer, .xml, .xlsx, .csv, .pdf (Primavera P6 PDF export)');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File too large', `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 24 MB limit. Use ingest-path for larger files.`);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true); setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r = await api<IngestOutcome>('/ingestion/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64: b64 }),
      });
      setOutcome(r);
      setFile(null);
      toast.success('Ingested', `${r.parser} · ${Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join(' · ')}`);
      await refresh();
    } catch (e) { toast.error('Ingestion failed', (e as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('input.eyebrow')}
        title={t('input.title')}
        description={t('input.description')}
        actions={<Button variant="ghost" size="sm" onClick={refresh}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>}
      />

      <Card title="Upload a file" hint="Drop here or browse. The file is archived immutably and traced through the entire pipeline.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFileSafe(f); }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? 'border-sky-500 bg-sky-500/5' : 'border-slate-700 bg-slate-900/30'
          }`}
          role="region"
          aria-label="Drop zone for file upload"
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
            <IconUpload className="h-5 w-5" />
          </div>
          {file ? (
            <>
              <p className="text-sm font-medium text-slate-100">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-200">Drag a P6 (.xer / .xml / .pdf) · MS Project · Excel · CSV file here</p>
              <p className="text-xs text-slate-400">or click below to browse</p>
            </>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xer,.xml,.xlsx,.csv,.pdf,application/pdf"
              onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)}
              className="hidden"
              aria-label="File to ingest"
            />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>Browse</Button>
            <Button variant="primary" size="sm" disabled={!file || uploading} onClick={upload}>
              {uploading ? 'Ingesting…' : 'Ingest'}
            </Button>
          </div>
        </div>

        {outcome && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-wrap items-center gap-2">
              <span>Ingested via</span>
              <Pill tone="emerald">{outcome.parser}</Pill>
              <Pill tone="slate">{outcome.status}</Pill>
              {outcome.confidence && <Pill tone="emerald">{(outcome.confidence.overall * 100).toFixed(1)}% confidence</Pill>}
            </div>
            <p className="mt-2 text-xs text-emerald-100/80">
              Rows: {Object.entries(outcome.counts).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </p>
          </div>
        )}
      </Card>

      <Card title="Recent runs" hint="Append-only audit trail. Each row pins to its archived source file." padded={false}>
        {runs.length === 0 ? (
          <EmptyState title="No ingestion runs yet" description="Upload a file above to start the pipeline." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-900/40 text-left text-[10px] uppercase tracking-wider text-slate-400">
                <tr><th scope="col" className="px-5 py-2.5">When</th><th scope="col" className="py-2.5">Parser</th><th scope="col" className="py-2.5">Status</th><th scope="col" className="py-2.5">Counts</th><th scope="col" className="py-2.5 pr-5">Confidence</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const conf = (r.summary?.confidence as { overall?: number } | undefined)?.overall;
                  return (
                    <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                      <td className="px-5 py-2.5 text-slate-300">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2.5"><Pill tone="sky">{r.parser}</Pill></td>
                      <td className="py-2.5"><Pill tone="emerald">{r.status}</Pill></td>
                      <td className="py-2.5 text-xs text-slate-300">{Object.entries(r.rowCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</td>
                      <td className="py-2.5 pr-5"><ConfidenceBar value={conf ?? null} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
