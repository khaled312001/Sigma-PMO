'use client';

/**
 * `/drawings` — phase-1 drawings ingestion surface (correction-plan §2.7;
 * ADR-0021). Upload a PDF drawing set → the backend archives it immutably
 * (SHA-256) and extracts floor / discipline hints → "Generate baseline
 * from this package" hands the package to the drawing-driven Author Path
 * where the detected floor count genuinely scales the WBS.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { IconRefresh, IconSparkles, IconUpload } from '../../components/Icons';

interface DrawingPackageRow {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  sourceFileId: string;
  filename: string;
  format: string;
  summary: {
    pageCount?: number;
    sheetTitles?: string[];
    floorHints?: string[];
    disciplineHints?: string[];
    extractionNote?: string | null;
  };
  uploadedBy: string | null;
}

const MAX_BYTES = 24 * 1024 * 1024;

export default function DrawingsRoute() {
  return (
    <AuthGate surface="Drawings">
      <DrawingsPage />
    </AuthGate>
  );
}

function DrawingsPage() {
  const toast = useToast();
  const router = useRouter();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canIngest = !!me?.user && CAPABILITIES[me.user.role].canIngest;
  const canAuthor = !!me?.user && CAPABILITIES[me.user.role].canSimulate;

  const [packages, setPackages] = useState<DrawingPackageRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    setLoadError(null);
    try {
      setPackages(await api<DrawingPackageRow[]>(`/drawings?projectKey=${encodeURIComponent(projectKey)}`));
    } catch (e) {
      setPackages([]);
      setLoadError((e as Error).message);
    }
  }, [projectKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Hand the package to the drawing-driven Author Path. */
  const onGenerateBaseline = useCallback(
    async (pkg: DrawingPackageRow) => {
      setBusyId(pkg.id);
      try {
        await api('/baselines/jobs/author', {
          method: 'POST',
          body: JSON.stringify({
            projectKey,
            authoredBy: me?.user?.displayName ?? 'unknown',
            drawingPackageId: pkg.id,
          }),
        });
        toast.success(
          'Planning started from drawings',
          `${detectedFloors(pkg)} floor(s) detected — the WBS scales accordingly. Opening /baselines…`,
        );
        router.push('/baselines');
      } catch (e) {
        toast.error('Generation failed', (e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [projectKey, me?.user?.displayName, toast, router],
  );

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow="Engineering · Drawings · ADR-0021"
        title="Drawing Packages"
        description="Upload PDF drawing sets. The platform archives every byte immutably (SHA-256), extracts floor + discipline hints, and the AI planner builds the baseline FROM the drawings — a G+5 set produces a genuinely different schedule than a G+1 set."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <IconRefresh className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      <ErrorBanner message={loadError} />

      <UploadCard projectKey={projectKey} canIngest={canIngest} uploadedBy={me?.user?.displayName ?? null} onUploaded={refresh} />

      {packages === null ? (
        <Card title="Packages"><p className="text-sm text-slate-300">Loading…</p></Card>
      ) : packages.length === 0 ? (
        <EmptyState
          title="No drawing packages yet"
          description="Upload an architectural / structural / MEP PDF set above. Phase 1 reads the text layer; IFC and DWG land in later phases."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              canAuthor={canAuthor}
              busy={busyId === pkg.id}
              onGenerate={() => void onGenerateBaseline(pkg)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadCard({
  projectKey,
  canIngest,
  uploadedBy,
  onUploaded,
}: {
  projectKey: string;
  canIngest: boolean;
  uploadedBy: string | null;
  onUploaded: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/\.pdf$/i.test(f.name)) {
      toast.error('Unsupported file', 'Phase 1 accepts PDF drawing sets only (IFC / DWG follow).');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File too large', `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 24 MB limit.`);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const r = await api<DrawingPackageRow>('/drawings/upload', {
        method: 'POST',
        body: JSON.stringify({ projectKey, filename: file.name, contentBase64: btoa(bin), uploadedBy }),
      });
      setFile(null);
      toast.success(
        'Drawing set ingested',
        `${r.summary.pageCount ?? 0} page(s) · ${detectedFloors(r)} floor hint(s) · ${(r.summary.disciplineHints ?? []).length} discipline(s)`,
      );
      await onUploaded();
    } catch (e) {
      toast.error('Ingestion failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card title="Upload a PDF drawing set" hint={`Archived immutably for project ${projectKey}.`}>
      <div
        onDragOver={(e) => { if (canIngest) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canIngest) return;
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFileSafe(f);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition ${
          !canIngest ? 'border-slate-800 bg-slate-900/20 opacity-60'
            : dragOver ? 'border-sky-500 bg-sky-500/5'
            : 'border-slate-700 bg-slate-900/30'
        }`}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
          <IconUpload className="h-5 w-5" />
        </div>
        {file ? (
          <p className="text-sm font-medium text-slate-100">{file.name} <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></p>
        ) : (
          <p className="text-sm text-slate-200">Drag an architectural / structural / MEP PDF set here</p>
        )}
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="hidden" disabled={!canIngest}
            onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)} aria-label="Drawing set to ingest" />
          <Button variant="ghost" size="sm" disabled={!canIngest} onClick={() => fileInput.current?.click()}>Browse</Button>
          <Button variant="primary" size="sm" disabled={!canIngest || !file || uploading} onClick={upload}>
            {uploading ? 'Ingesting…' : 'Ingest'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PackageCard({
  pkg,
  canAuthor,
  busy,
  onGenerate,
}: {
  pkg: DrawingPackageRow;
  canAuthor: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  const floors = pkg.summary.floorHints ?? [];
  const disciplines = pkg.summary.disciplineHints ?? [];
  const scanned = !!pkg.summary.extractionNote;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-50" dir="ltr">{pkg.filename}</span>
            <Pill tone="sky">{pkg.format.toUpperCase()}</Pill>
            <Pill tone="slate">{pkg.summary.pageCount ?? 0} pages</Pill>
            <Pill tone={floors.length > 0 ? 'emerald' : 'amber'}>
              {floors.length > 0 ? `${detectedFloors(pkg)} floor(s) detected` : 'no floor hints'}
            </Pill>
            {disciplines.map((d) => <Pill key={d} tone="violet">{d}</Pill>)}
          </div>
          {scanned && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100">
              {pkg.summary.extractionNote}
            </p>
          )}
          {floors.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400" dir="ltr">
              Hints: {floors.slice(0, 8).join(' · ')}{floors.length > 8 ? ` (+${floors.length - 8})` : ''}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500" dir="ltr">
            Uploaded {new Date(pkg.createdAt).toLocaleString()}{pkg.uploadedBy ? ` by ${pkg.uploadedBy}` : ''} · SHA-archived
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={!canAuthor || busy} onClick={onGenerate}>
          <IconSparkles className="h-3.5 w-3.5" />
          {busy ? 'Planning…' : 'Generate baseline from this package'}
        </Button>
      </div>
    </Card>
  );
}

/** Mirror of the backend deriveFloorCount — display-only estimate. */
function detectedFloors(pkg: DrawingPackageRow): number {
  const hints = pkg.summary.floorHints ?? [];
  if (hints.length === 0) return 2;
  for (const h of hints) {
    const g = /^G\+(\d+)$/i.exec(h.trim());
    if (g) return Math.min(40, parseInt(g[1], 10) + 1);
  }
  const NAMED = ['GROUND FLOOR', 'FIRST FLOOR', 'SECOND FLOOR', 'THIRD FLOOR'];
  const named = new Set(hints.filter((h) => NAMED.includes(h.toUpperCase())));
  const levels = new Set(hints.map((h) => /LEVEL\s*(\d+)/i.exec(h)?.[1]).filter(Boolean));
  const count = Math.max(named.size, levels.size);
  return count > 0 ? Math.min(40, count) : 2;
}
