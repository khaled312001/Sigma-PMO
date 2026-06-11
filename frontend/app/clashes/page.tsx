'use client';

/**
 * `/clashes` — Layer 1 (Engineering) clash review surface (post-meeting plan
 * §3.7, ADR-0012 §5).
 *
 * Three jobs on one page:
 *
 *  1. **Upload** a Navisworks / Revit Interference Check Excel export
 *     (`.xlsx` / `.xlsm`) — calls `POST /clashes/upload` with the same
 *     base64 envelope that `/input` uses. We deliberately re-use that
 *     envelope shape (instead of multipart) so the SDK helper in `lib/api`
 *     and its rate limits keep working — and because ADR-0011 §6 wants the
 *     Computer-Use surface (when it lands) to see JSON only, never file
 *     streams.
 *
 *  2. **List** all clashes for the current project, with severity chips and
 *     a status pill that distinguishes
 *       - `pending`   — proposedOptions is `null` (just ingested, nobody asked
 *                       the persona yet),
 *       - `proposed`  — options are written but `chosenOptionIndex` is `null`
 *                       (waiting for a PM/PD pick),
 *       - `decided`   — a human picked an option; the row carries `decidedBy`
 *                       + `decidedAt` audit fields.
 *     The grid location surfaces the disciplines involved (the closest
 *     analogue to "BIM grid" we keep on the persisted ClashItem — the
 *     parser does not retain the model-space coordinates).
 *
 *  3. **Per-clash card** that lets a `canEvaluateRules` user either
 *       - call `POST /clashes/:id/propose` to invoke the
 *         `revit.clash.analyst` persona (when no options yet), or
 *       - select an option radio + `POST /clashes/:id/decide` to record
 *         the chosen option index (mirrors `ClashItem.chosenOptionIndex`).
 *
 * AuthGate contract:
 *  - Outer: any authenticated user can view (`AuthGate` with no capability —
 *    matches the post-meeting plan §3.7 expectation that consultants /
 *    clients can read clashes even when they can't act on them).
 *  - Inner: `Propose` and `Submit decision` buttons disable themselves when
 *    the current role lacks `canEvaluateRules`. We mirror the backend
 *    contract (`ClashSolutionProposerController` requires the same cap) so
 *    the user never sees a 403 surprise from a button that looked enabled.
 *
 * Why not collapse "propose" into the upload step?
 *  The post-meeting plan keeps them separate so the operator can review the
 *  ingested clash list before burning Claude tokens. The button-per-clash
 *  shape lines up with the per-clash `engineering.clash.options.proposed`
 *  outbox event (ADR-0012 §6) — one user click → one persona call → one
 *  cross-layer event.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { PersonaActiveBadge } from '../../components/PersonaActiveBadge';
import { PolicyAddonInline } from '../../components/PolicyAddonInline';
import { SimulationModal, SimulationProjectionView } from '../../components/SimulationModal';
import { useToast } from '../../components/ToastProvider';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { IconRefresh, IconSparkles, IconUpload } from '../../components/Icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  SeverityBadge,
} from '../../components/ui';

// ─────────────────────────── types ───────────────────────────

/** Mirrors `ProposedClashOption` from `clash-solution-proposer.service.ts`. */
interface ProposedClashOption {
  label: string;
  timeImpactDays: number;
  /** AED — `null` when the BoQ doesn't price the line. */
  costImpactAED: number | null;
  scopeImpact: string;
}

/** Mirrors the persisted `ClashItem` row, with the audit + decision fields. */
interface ClashItem {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  sourceFileId: string;
  clashRef: string;
  disciplinesInvolved: string[];
  /** `critical` | `major` | `minor` — domain severity, not the canonical alert tri-state. */
  severity: string;
  description: string;
  proposedOptions: ProposedClashOption[] | null;
  chosenOptionIndex: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** Response shape of `POST /clashes/upload` (mirrors `ClashIngestionOutcome`). */
interface ClashUploadOutcome {
  runId: string;
  sourceFileId: string;
  parser: string;
  status: string;
  counts: { clashesParsed: number; clashesPersisted: number; rejectedRows: number };
  parserMeta?: { sheetName?: string; rejectedRows?: number };
}

/** Response shape of `POST /clashes/:id/propose` (mirrors `ProposeClashSolutionsOutcome`). */
interface ProposeOutcome {
  clashId: string;
  options: ProposedClashOption[];
  aiEnabled: boolean;
  personaSlug: string | null;
  personaVersion: number | null;
  citations: string[];
  outboxEventId: string;
}

/** Response shape of `POST /clashes/:id/options/:idx/apply` (mirrors `ApplyClashResolutionOutcome`). */
interface ApplyOutcome {
  clashId: string;
  chosenOptionIndex: number;
  revisedActivityKeys: string[];
  revisionNumber: number;
  scenarioId: string | null;
  outboxEventId: string;
  claimLetterId: string | null;
  warnings: string[];
}

type Status = 'pending' | 'proposed' | 'decided';

const ACCEPTED_EXT = /\.(xlsx|xlsm)$/i;
const MAX_BYTES = 24 * 1024 * 1024;

// ─────────────────────────── route ───────────────────────────

export default function ClashesPageRoute() {
  // Outer gate: viewing is open to any authenticated user. Per-row action
  // buttons gate themselves on `canEvaluateRules` (see `CapAware*` helpers
  // below). Mirrors the read/write split the rest of the app uses.
  return (
    <AuthGate surface="Clashes">
      <ClashesPage />
    </AuthGate>
  );
}

// ─────────────────────────── page ───────────────────────────

function ClashesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canAct = me?.user ? CAPABILITIES[me.user.role].canEvaluateRules : false;
  const canSimulate = me?.user ? CAPABILITIES[me.user.role].canSimulate : false;
  const canApprove = me?.user ? CAPABILITIES[me.user.role].canEditPolicy : false;
  const approverName = me?.user?.displayName ?? 'unknown';

  const [clashes, setClashes] = useState<ClashItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | Status | 'critical'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api<ClashItem[]>(`/clashes?projectKey=${encodeURIComponent(projectKey)}`);
      setClashes(list);
    } catch (e) {
      setClashes([]);
      const msg = (e as Error).message;
      setLoadError(msg);
      toast.error('Failed to load clashes', msg);
    }
  }, [projectKey, toast]);

  // Refresh on mount + whenever the project switches. The lint rule flags
  // any setState inside an effect, but a one-shot data fetch on dependency
  // change is exactly what effects are for and matches the existing
  // /input + /review pages.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  // Memoise the array reference so the downstream counts/filtered memos don't
  // re-run on every parent render (the `clashes ?? []` literal would otherwise
  // produce a fresh array each pass).
  const rows = useMemo<ClashItem[]>(() => clashes ?? [], [clashes]);

  const counts = useMemo(() => ({
    all:       rows.length,
    pending:   rows.filter((r) => deriveStatus(r) === 'pending').length,
    proposed:  rows.filter((r) => deriveStatus(r) === 'proposed').length,
    decided:   rows.filter((r) => deriveStatus(r) === 'decided').length,
    critical:  rows.filter((r) => r.severity === 'critical').length,
  }), [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all')      return rows;
    if (filter === 'critical') return rows.filter((r) => r.severity === 'critical');
    return rows.filter((r) => deriveStatus(r) === filter);
  }, [rows, filter]);

  // ── handlers ──
  const onClashUpdated = useCallback((next: ClashItem) => {
    setClashes((prev) => prev?.map((c) => (c.id === next.id ? next : c)) ?? prev);
  }, []);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Layer 1 — Engineering"
        title={t('clashes.title') /* falls back to 'clashes.title' literal if dict misses */}
        description="Navisworks / Revit clash review. Upload one report at a time; the BIM clash analyst persona proposes three options per clash, then a PM / PD picks one and submits a decision."
        actions={
          <span className="flex items-center gap-2">
            <PersonaActiveBadge
              personaSlug="revit-clash-analyst"
              expertise="BIM clash analyst — 10-20 years Revit / Navisworks coordination. Cost numbers from the BoQ only; durations from the approved baseline only."
              surface="engineering"
            />
            <Button variant="ghost" size="sm" onClick={refresh}>
              <IconRefresh className="h-3.5 w-3.5" /> Refresh
            </Button>
          </span>
        }
      />

      <ErrorBanner message={loadError} />

      <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[13px] text-slate-300">
        Working from BIM models? Upload IFC sets and run model-validation checks in the{' '}
        <a href="/drawings" className="text-sky-300 underline-offset-2 hover:underline">BIM Models (IFC) section on Drawings</a>.
      </p>

      <PolicyAddonInline projectKey={projectKey} surface="engineering" />

      <UploadCard
        projectKey={projectKey}
        canIngest={!!me?.user && CAPABILITIES[me.user.role].canIngest}
        onUploaded={async () => { await refresh(); }}
      />

      <FilterChips counts={counts} filter={filter} setFilter={setFilter} />

      {clashes === null ? (
        <Card title="Clashes" hint={`Project ${projectKey}`}>
          <p className="text-sm text-slate-400">Loading…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No clashes match this filter"
          description={
            rows.length === 0
              ? 'Upload a Navisworks / Revit Interference Check export to see clashes for this project.'
              : 'Try the All chip to clear the filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((c) => (
            <ClashCard
              key={c.id}
              clash={c}
              canAct={canAct}
              canSimulate={canSimulate}
              canApprove={canApprove}
              approverName={approverName}
              onUpdated={onClashUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── upload card ───────────────────────────

function UploadCard({
  projectKey,
  canIngest,
  onUploaded,
}: {
  projectKey: string;
  canIngest: boolean;
  onUploaded: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<ClashUploadOutcome | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!ACCEPTED_EXT.test(f.name)) {
      toast.error('Unsupported file', 'Clash reports must be .xlsx or .xlsm');
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
    setUploading(true); setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      // Same base64 pump the /input page uses — keeps the upload envelope
      // identical so the API helper rate-limits both paths uniformly.
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r = await api<ClashUploadOutcome>('/clashes/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64: b64, projectKey }),
      });
      setOutcome(r);
      setFile(null);
      toast.success(
        'Clash report ingested',
        `${r.counts.clashesPersisted}/${r.counts.clashesParsed} clashes (${r.counts.rejectedRows} rejected)`,
      );
      await onUploaded();
    } catch (e) {
      toast.error('Ingestion failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card
      title="Upload clash report"
      hint={`Drops directly into project ${projectKey}. Accepted formats: .xlsx, .xlsm.`}
    >
      {!canIngest && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Your role can read clashes but not ingest. Ask a Sigma admin, consultant, or contractor to upload.
        </div>
      )}
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
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          !canIngest
            ? 'border-slate-800 bg-slate-900/20 opacity-60'
            : dragOver
              ? 'border-sky-500 bg-sky-500/5'
              : 'border-slate-700 bg-slate-900/30'
        }`}
        role="region"
        aria-label="Drop zone for clash report upload"
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
            <p className="text-sm text-slate-200">Drag a Navisworks / Revit clash report here</p>
            <p className="text-xs text-slate-400">or click below to browse</p>
          </>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)}
            className="hidden"
            aria-label="Clash report to ingest"
            disabled={!canIngest}
          />
          <Button variant="ghost" size="sm" disabled={!canIngest} onClick={() => fileInput.current?.click()}>
            Browse
          </Button>
          <Button variant="primary" size="sm" disabled={!canIngest || !file || uploading} onClick={upload}>
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
            <Pill tone="emerald">{outcome.counts.clashesPersisted} clash(es)</Pill>
            {outcome.counts.rejectedRows > 0 && (
              <Pill tone="amber">{outcome.counts.rejectedRows} rejected</Pill>
            )}
          </div>
          {outcome.parserMeta?.sheetName && (
            <p className="mt-2 text-xs text-emerald-100/80">Sheet: {outcome.parserMeta.sheetName}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── filter chips ───────────────────────────

function FilterChips({
  counts,
  filter,
  setFilter,
}: {
  counts: { all: number; pending: number; proposed: number; decided: number; critical: number };
  filter: 'all' | Status | 'critical';
  setFilter: (f: 'all' | Status | 'critical') => void;
}) {
  const chips: Array<{ key: 'all' | Status | 'critical'; label: string }> = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'proposed', label: 'Proposed' },
    { key: 'decided',  label: 'Decided' },
    { key: 'critical', label: 'Critical only' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setFilter(key)}
          aria-pressed={filter === key}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
            filter === key
              ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
              : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
          }`}
        >
          <span>{label}</span>
          <span className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[9px] text-slate-400">{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── clash card ───────────────────────────

function ClashCard({
  clash,
  canAct,
  canSimulate,
  canApprove,
  approverName,
  onUpdated,
}: {
  clash: ClashItem;
  canAct: boolean;
  canSimulate: boolean;
  canApprove: boolean;
  approverName: string;
  onUpdated: (next: ClashItem) => void;
}) {
  const toast = useToast();
  const status = deriveStatus(clash);
  const hasOptions = !!clash.proposedOptions && clash.proposedOptions.length > 0;
  const decided = clash.chosenOptionIndex !== null && clash.chosenOptionIndex !== undefined;

  // The radio selection is local until the user runs the simulation.
  // Pre-seed it with the currently-chosen option so an already-decided clash
  // shows its winner highlighted (the radios stay disabled in that branch).
  const [picked, setPicked] = useState<number | null>(clash.chosenOptionIndex);
  const [proposing, setProposing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [projection, setProjection] = useState<SimulationProjectionView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Resync local pick when the parent swaps in a fresh row (e.g. after
  // propose). The append-only ingestion contract means `clash.id` stays
  // stable, so this is safe.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPicked(clash.chosenOptionIndex); }, [clash.id, clash.chosenOptionIndex]);

  const onPropose = async () => {
    if (!canAct) return;
    setProposing(true);
    try {
      const r = await api<ProposeOutcome>(`/clashes/${clash.id}/propose`, { method: 'POST' });
      // Refetch the row so we get the latest persisted shape (and any
      // server-side coercion of option labels). Cheaper than reloading the
      // whole list and keeps the per-card surface self-healing.
      const refreshed = await api<ClashItem>(`/clashes/${clash.id}`);
      onUpdated(refreshed);
      toast.success(
        r.aiEnabled ? 'Options proposed' : 'AI offline — operator must propose',
        r.aiEnabled
          ? `${r.options.length} option(s) from ${r.personaSlug ?? 'persona'} v${r.personaVersion ?? '?'}`
          : 'Placeholder options written; please replace them with real proposals.',
      );
    } catch (e) {
      toast.error('Propose failed', (e as Error).message);
    } finally {
      setProposing(false);
    }
  };

  /** Step 1 — run the deterministic what-if; opens the before/after modal. */
  const onSimulate = async () => {
    if (!canSimulate || picked === null) return;
    setSimulating(true);
    try {
      const p = await api<SimulationProjectionView>(
        `/clashes/${clash.id}/options/${picked}/simulate`,
        { method: 'POST', body: JSON.stringify({ requestedBy: approverName }) },
      );
      setProjection(p);
      setModalOpen(true);
    } catch (e) {
      toast.error('Simulation failed', (e as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  /** Step 2 — approve: append-only schedule revision + FIDIC claim letter. */
  const onApprove = async () => {
    if (!canApprove || picked === null || !projection) return;
    setApplying(true);
    try {
      const r = await api<ApplyOutcome>(
        `/clashes/${clash.id}/options/${picked}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({ approvedBy: approverName, scenarioId: projection.scenarioId }),
        },
      );
      setModalOpen(false);
      const refreshed = await api<ClashItem>(`/clashes/${clash.id}`);
      onUpdated(refreshed);
      toast.success(
        'Resolution applied',
        `${r.revisedActivityKeys.length} activity revision(s) at rev ${r.revisionNumber}` +
          (r.claimLetterId ? ` · claim letter drafted (${r.claimLetterId.slice(0, 8)})` : ' · letter pending — see warnings'),
      );
      for (const w of r.warnings) toast.error('Note', w);
    } catch (e) {
      toast.error('Apply failed', (e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card padded={false} className="overflow-hidden">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/70 px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-200" dir="ltr">{clash.clashRef}</span>
            <ClashSeverityPill severity={clash.severity} />
            <StatusPill status={status} />
            {clash.disciplinesInvolved.map((d) => (
              <Pill key={d} tone="violet">{d}</Pill>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-200">{clash.description}</p>
          <p className="mt-1 text-[11px] text-slate-500" dir="ltr">
            Ingested {new Date(clash.createdAt).toLocaleString()}
            {' · '}
            <a href={`/clashes/${clash.id}`} className="text-sky-300 underline-offset-2 hover:underline">
              Open detail page →
            </a>
          </p>
        </div>
      </div>

      {/* body */}
      <div className="space-y-4 p-5">
        {!hasOptions ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-4">
            <p className="text-sm text-slate-300">
              No options proposed yet. Trigger the BIM clash analyst persona to draft three options
              (time-impact / cost-impact / scope-coordination).
            </p>
            <Button
              variant="primary"
              size="sm"
              disabled={!canAct || proposing}
              onClick={onPropose}
            >
              <IconSparkles className="h-3.5 w-3.5" />
              {proposing ? 'Proposing…' : 'Propose options'}
            </Button>
            {!canAct && (
              <p className="text-[11px] text-slate-500">
                Your role can view clashes but cannot trigger a persona call. `canEvaluateRules` is required.
              </p>
            )}
          </div>
        ) : (
          <OptionsBlock
            options={clash.proposedOptions!}
            picked={picked}
            setPicked={setPicked}
            disabled={decided || !canAct}
          />
        )}

        {hasOptions && !decided && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
            <p className="text-[11px] text-slate-500">
              Pick an option, then run the simulation to see the time/cost impact
              before approving. Approval issues an append-only schedule revision
              and drafts the FIDIC claim letter.
            </p>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSimulate || picked === null || simulating}
              onClick={onSimulate}
            >
              {simulating ? 'Simulating…' : 'Simulate impact'}
            </Button>
          </div>
        )}

        {decided && <DecisionAuditRow clash={clash} />}
      </div>

      <SimulationModal
        open={modalOpen}
        optionLabel={picked !== null ? clash.proposedOptions?.[picked]?.label ?? '' : ''}
        projection={projection}
        applying={applying}
        onApprove={canApprove ? onApprove : () => {
          toast.error('Not permitted', 'Approving requires the canEditPolicy capability (PD / Client / Admin).');
        }}
        onClose={() => setModalOpen(false)}
      />
    </Card>
  );
}

// ─────────────────────────── options block ───────────────────────────

function OptionsBlock({
  options,
  picked,
  setPicked,
  disabled,
}: {
  options: ProposedClashOption[];
  picked: number | null;
  setPicked: (idx: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      {options.map((opt, idx) => {
        const active = picked === idx;
        return (
          <label
            key={idx}
            className={`flex cursor-pointer flex-col gap-2 rounded-lg border px-4 py-3 transition ${
              active
                ? 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/30'
                : 'border-slate-800 bg-slate-900/30 hover:border-slate-600'
            } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">{opt.label}</span>
              <input
                type="radio"
                name={`pick-${options.length}-${idx}`}
                checked={active}
                disabled={disabled}
                onChange={() => setPicked(idx)}
                className="mt-1 h-3.5 w-3.5 accent-sky-500"
                aria-label={`Pick option ${idx + 1}`}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <Delta label="Time" value={`${opt.timeImpactDays} d`} tone={opt.timeImpactDays > 0 ? 'amber' : 'slate'} />
              <Delta
                label="Cost"
                value={opt.costImpactAED === null ? '— (not in BoQ)' : `${opt.costImpactAED.toLocaleString()} AED`}
                tone={opt.costImpactAED && opt.costImpactAED > 0 ? 'amber' : 'slate'}
              />
              <Delta label="Scope" value={opt.scopeImpact || 'none'} tone="violet" />
            </div>
          </label>
        );
      })}
    </div>
  );
}

function Delta({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'amber' | 'violet' }) {
  const tones: Record<string, string> = {
    slate:  'bg-slate-800/80 text-slate-300 ring-slate-700',
    amber:  'bg-amber-500/10 text-amber-200 ring-amber-500/30',
    violet: 'bg-violet-500/10 text-violet-200 ring-violet-500/30',
  };
  return (
    <div className={`rounded-md px-2 py-1.5 ring-1 ${tones[tone]}`}>
      <p className="text-[9px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 break-words text-[11px]">{value}</p>
    </div>
  );
}

// ─────────────────────────── decision audit row ───────────────────────────

function DecisionAuditRow({ clash }: { clash: ClashItem }) {
  const idx = clash.chosenOptionIndex ?? -1;
  const chosen = idx >= 0 ? clash.proposedOptions?.[idx] : undefined;
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="emerald">Decided</Pill>
        <span className="text-sm font-medium text-slate-100">
          Option {labelForIndex(clash.proposedOptions, idx)}
          {chosen ? ` — ${chosen.label}` : ''}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-slate-300 md:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-slate-500">Decided by:</dt>
          <dd>{clash.decidedBy ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-500">When:</dt>
          <dd dir="ltr">{clash.decidedAt ? new Date(clash.decidedAt).toLocaleString() : '—'}</dd>
        </div>
        {chosen && (
          <>
            <div className="flex gap-2">
              <dt className="text-slate-500">Time impact:</dt>
              <dd>{chosen.timeImpactDays} day(s)</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Cost impact:</dt>
              <dd>{chosen.costImpactAED === null ? '— (not in BoQ)' : `${chosen.costImpactAED.toLocaleString()} AED`}</dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function deriveStatus(c: ClashItem): Status {
  if (c.chosenOptionIndex !== null && c.chosenOptionIndex !== undefined) return 'decided';
  if (c.proposedOptions && c.proposedOptions.length > 0) return 'proposed';
  return 'pending';
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'decided')  return <Pill tone="emerald">Decided</Pill>;
  if (status === 'proposed') return <Pill tone="sky">Proposed</Pill>;
  return <Pill tone="amber">Pending</Pill>;
}

/**
 * Severity for clashes lives in a different vocabulary than alert severity
 * (`critical` | `major` | `minor` vs `critical` | `warning` | `info`), so we
 * cannot reuse `SeverityBadge` directly without lying about the level. We
 * remap to the closest alert-tone for visual continuity while keeping the
 * Arabic / English source word.
 */
function ClashSeverityPill({ severity }: { severity: string }) {
  const lower = severity?.toLowerCase?.() ?? '';
  if (lower === 'critical') return <SeverityBadge severity="critical" />;
  if (lower === 'major')    return <SeverityBadge severity="warning" />;
  if (lower === 'minor')    return <SeverityBadge severity="info" />;
  return <Pill tone="slate">{severity || 'unknown'}</Pill>;
}

function labelForIndex(options: ProposedClashOption[] | null, idx: number | null): string {
  if (idx === null || idx < 0 || !options || !options[idx]) return '—';
  // Persona schema labels options A / B / C; prefer the persona label when
  // it sticks to the schema and fall back to a 1-based index otherwise.
  const lbl = options[idx].label.trim();
  if (/^[ABC]$/i.test(lbl)) return lbl.toUpperCase();
  return String(idx + 1);
}
