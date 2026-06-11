'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { DonutChart, CHART_PALETTE } from '../../../components/Charts';
import { GovernanceStatusBadge } from '../../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../../components/Icons';
import { MarkdownLite } from '../../../components/MarkdownLite';
import { useToast } from '../../../components/ToastProvider';
import {
  api,
  AssessmentRecord,
  ConceptDocumentRecord,
  FeasibilityPackage,
  OpportunityRecord,
  StudySectionRecord,
} from '../../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../../components/ui';

export default function OpportunityRoute() {
  return (
    <AuthGate capability="canRunFeasibility" surface="Investment & Feasibility">
      <OpportunityPage />
    </AuthGate>
  );
}

type Tab = 'assessment' | 'study' | 'packages' | 'sketches';

const REC_LABEL: Record<string, string> = {
  proceed: 'Proceed',
  proceed_with_conditions: 'Proceed with conditions',
  hold: 'Hold',
  reject: 'Reject',
};

const REC_BANNER: Record<string, string> = {
  proceed: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
  proceed_with_conditions: 'border-amber-400/50 bg-amber-400/10 text-amber-100',
  hold: 'border-orange-500/50 bg-orange-500/10 text-orange-100',
  reject: 'border-red-500/50 bg-red-500/10 text-red-100',
};

interface Detail {
  opportunity: OpportunityRecord;
  latestAssessment: AssessmentRecord | null;
  sections: StudySectionRecord[];
  documents: ConceptDocumentRecord[];
}

function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>('assessment');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`/feasibility/opportunities/${id}`));
    } catch (e) {
      toast.error('Failed to load opportunity', (e as Error).message);
    }
  }, [id, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!detail) return <p className="text-sm text-slate-400">Loading…</p>;
  const { opportunity: opp, latestAssessment: a } = detail;
  const cur = opp.currency;
  const fmtM = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `${cur} ${(n / 1_000_000).toFixed(2)}M`;
  const pct = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`;

  const runAssessment = async () => {
    setBusy('assess');
    try {
      const r = await api<{ assessment: AssessmentRecord }>(`/feasibility/opportunities/${opp.id}/assess`, { method: 'POST' });
      toast.success('Assessment complete', `${REC_LABEL[r.assessment?.recommendation ?? ''] ?? r.assessment?.recommendation} · audited via ext.investment`);
      await refresh();
    } catch (e) { toast.error('Assessment failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const generateStudy = async () => {
    setBusy('study');
    try {
      const rows = await api<StudySectionRecord[]>(`/feasibility/opportunities/${opp.id}/study/generate`, { method: 'POST' });
      toast.success('Study generated', `${rows.length} sections (v${rows[0]?.version ?? 1})`);
      setTab('study');
      await refresh();
    } catch (e) { toast.error('Study generation failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Investment & Feasibility · ${opp.code}`}
        title={opp.title}
        description={`${opp.projectType} · ${[opp.city, opp.country].filter(Boolean).join(', ') || 'location TBD'} · stage: ${opp.stage}`}
        actions={
          <>
            <Button variant="success" size="sm" disabled={busy === 'assess'} onClick={runAssessment}>
              {busy === 'assess' ? 'Running…' : 'Run rapid assessment'}
            </Button>
            <Button variant="primary" size="sm" disabled={busy === 'study'} onClick={generateStudy}>
              <IconSparkles className="h-3.5 w-3.5" /> {busy === 'study' ? 'Generating…' : 'Generate professional study'}
            </Button>
          </>
        }
      />

      <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Opportunity views">
        {([
          ['assessment', 'Level 1 · Assessment'],
          ['study', `Level 2 · Study${detail.sections.length ? ` (${detail.sections.length})` : ''}`],
          ['packages', 'Packages'],
          ['sketches', `Concept sketches${detail.documents.length ? ` (${detail.documents.length})` : ''}`],
        ] as Array<[Tab, string]>).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
              tab === k
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
                : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'assessment' && <AssessmentTab opp={opp} a={a} fmtM={fmtM} pct={pct} />}
      {tab === 'study' && <StudyTab opp={opp} sections={detail.sections} refresh={refresh} onGenerate={generateStudy} busy={busy === 'study'} />}
      {tab === 'packages' && <PackagesTab opp={opp} hasStudy={detail.sections.length > 0} />}
      {tab === 'sketches' && <SketchesTab opp={opp} documents={detail.documents} refresh={refresh} />}
    </div>
  );
}

// ───────────────────────── Level 1 · Assessment ─────────────────────────

function AssessmentTab({
  opp, a, fmtM, pct,
}: {
  opp: OpportunityRecord;
  a: AssessmentRecord | null;
  fmtM: (n: number | null | undefined) => string;
  pct: (n: number | null | undefined) => string;
}) {
  if (!a) {
    return (
      <EmptyState
        title="No assessment yet"
        description="Run the rapid assessment — the deterministic model needs only the inputs you provided at creation (or a confirmed concept sketch)."
      />
    );
  }
  const r = a.results;
  const rec = String(a.recommendation);

  return (
    <div className="space-y-5">
      {/* Recommendation banner */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${REC_BANNER[rec] ?? REC_BANNER.hold}`}>
        <GovernanceStatusBadge status={a.governanceStatus} />
        <span className="text-base font-bold">{REC_LABEL[rec] ?? rec}</span>
        <span className="text-xs opacity-90">Risk: {a.riskRating}</span>
        <span className="text-xs opacity-90" dir="ltr">Attractiveness {r.attractivenessScore}/100</span>
        <span className="text-xs opacity-90" dir="ltr">Confidence {(a.confidence * 100).toFixed(0)}%</span>
        <span className="ms-auto text-[11px] opacity-75">{new Date(a.createdAt).toLocaleString()}</span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="NPV" value={fmtM(r.npv)} good={r.npv > 0} />
        <Kpi label={`Project IRR (hurdle ${pct(r.hurdleIrrPct)})`} value={pct(r.projectIrr)} good={(r.projectIrr ?? -1) >= r.hurdleIrrPct} />
        <Kpi label="Equity IRR" value={pct(r.equityIrr)} good={(r.equityIrr ?? -1) >= r.hurdleIrrPct} />
        <Kpi label="Payback (years)" value={String(r.paybackYears ?? '—')} good={r.paybackYears !== null} />
        <Kpi label="Min DSCR (stabilized)" value={String(r.dscr?.min ?? '—')} good={(r.dscr?.min ?? 0) >= 1.2} />
      </div>

      {(r.conditions?.length ?? 0) > 0 && (
        <Card title="Conditions / rationale" hint="Every fired ladder rule, named">
          <ul className="list-disc space-y-1 ps-5 text-sm text-slate-200">
            {r.conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="CAPEX breakdown" hint={`${fmtM(r.debtAmount + r.equityAmount)} total envelope`}>
          <DonutChart
            data={[
              { label: 'Construction', value: r.capexBreakdown?.construction ?? 0, accent: CHART_PALETTE.crimson },
              { label: 'Land', value: r.capexBreakdown?.land ?? 0, accent: '#38bdf8' },
              { label: 'Soft costs', value: r.capexBreakdown?.softCosts ?? 0, accent: '#a78bfa' },
              { label: 'Contingency', value: r.capexBreakdown?.contingency ?? 0, accent: '#f59e0b' },
            ]}
            centerValue={fmtM(r.debtAmount + r.equityAmount)}
            centerLabel="CAPEX"
          />
        </Card>
        <Card title="Funding & operating profile" hint="From the snapshotted assumption set">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Dt k="Equity" v={fmtM(r.equityAmount)} />
            <Dt k="Debt" v={fmtM(r.debtAmount)} />
            <Dt k="Annual debt service" v={fmtM(r.annualDebtService)} />
            <Dt k="Avg DSCR" v={String(r.dscr?.avg ?? '—')} />
            <Dt k="Stabilized revenue / yr" v={fmtM(r.stabilizedRevenue)} />
            <Dt k="Stabilized EBITDA / yr" v={fmtM(r.stabilizedEbitda)} />
            <Dt k="Exit (terminal) value" v={fmtM(r.terminalValue)} />
            <Dt k="Risk factors" v={r.riskFactors?.length ? r.riskFactors.join('; ') : 'none fired'} />
          </dl>
        </Card>
      </div>

      <Card title="Cash-flow projection" hint="Unlevered project flows; exit value in the final year">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Year', 'Phase', 'Revenue', 'OPEX', 'EBITDA', 'CAPEX out', 'Debt service', 'DSCR', 'Project CF', 'Cumulative'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-start font-semibold uppercase tracking-wider text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.years?.map((y) => (
                <tr key={y.year} className="border-t border-slate-800 odd:bg-slate-900/40">
                  <td className="px-2.5 py-1.5 font-mono text-slate-200" dir="ltr">{y.year}</td>
                  <td className="px-2.5 py-1.5"><Pill tone={y.phase === 'construction' ? 'amber' : 'emerald'}>{y.phase}</Pill></td>
                  {[y.revenue, y.opex, y.ebitda, y.capexOutflow, y.debtService].map((v, i) => (
                    <td key={i} className="px-2.5 py-1.5 tabular-nums text-slate-200" dir="ltr">{v ? (v / 1_000_000).toFixed(2) + 'M' : '—'}</td>
                  ))}
                  <td className="px-2.5 py-1.5 tabular-nums" dir="ltr">{y.dscr ?? '—'}</td>
                  <td className={`px-2.5 py-1.5 tabular-nums ${y.projectCashflow < 0 ? 'text-rose-300' : 'text-emerald-300'}`} dir="ltr">
                    {(y.projectCashflow / 1_000_000).toFixed(2)}M
                  </td>
                  <td className={`px-2.5 py-1.5 tabular-nums ${y.cumulativeProjectCashflow < 0 ? 'text-rose-300' : 'text-emerald-300'}`} dir="ltr">
                    {(y.cumulativeProjectCashflow / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-slate-500">
        Deterministic model · assumption library {String((a.assumptions as Record<string, unknown>).libraryVersion ?? '')} · inputs basis: {String((a.inputs as Record<string, unknown>).capexBasis ?? '')} · audited as AgentExecution (ext.investment).
        {' '}<Link href="/agents" className="text-sky-400 hover:underline">View in agent registry →</Link>
      </p>
    </div>
  );
}

function Kpi({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${good ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${good ? 'text-emerald-200' : 'text-rose-200'}`} dir="ltr">{value}</p>
    </div>
  );
}

function Dt({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-end font-medium tabular-nums text-slate-100" dir="ltr">{v}</dd>
    </>
  );
}

// ───────────────────────── Level 2 · Study ─────────────────────────

function StudyTab({
  opp, sections, refresh, onGenerate, busy,
}: {
  opp: OpportunityRecord;
  sections: StudySectionRecord[];
  refresh: () => Promise<void>;
  onGenerate: () => Promise<void>;
  busy: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(sections[0]?.sectionKey ?? null);

  if (!sections.length) {
    return (
      <EmptyState
        title="No professional study yet"
        description="Level 2 progressively generates the full feasibility & bankability study — 17 sections from Executive Summary to Governance Recommendation — from the deterministic model."
        action={<Button variant="primary" disabled={busy} onClick={onGenerate}>{busy ? 'Generating…' : 'Generate professional study'}</Button>}
      />
    );
  }

  const approve = async (sectionKey: string) => {
    try {
      await api(`/feasibility/opportunities/${opp.id}/study/${sectionKey}/approve`, { method: 'POST' });
      toast.success('Section approved', sectionKey);
      await refresh();
    } catch (e) { toast.error('Approve failed', (e as Error).message); }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400">
        Version {sections[0]?.version} · {sections.filter((s) => s.status === 'approved').length}/{sections.length} approved ·
        every section is regenerable; approval is the human gate before packaging.
      </p>
      {sections.map((s, i) => (
        <div key={s.id} className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/60">
          <button
            onClick={() => setOpen((o) => (o === s.sectionKey ? null : s.sectionKey))}
            className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-slate-800/50"
            aria-expanded={open === s.sectionKey}
          >
            <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1 text-sm font-semibold text-slate-100">{s.title}</span>
            <Pill tone={s.source === 'llm' ? 'violet' : 'slate'}>{s.source}</Pill>
            <Pill tone={s.status === 'approved' ? 'emerald' : 'amber'}>{s.status}</Pill>
          </button>
          {open === s.sectionKey && (
            <div className="space-y-3 border-t border-slate-800 px-4 py-4">
              <MarkdownLite text={s.content} />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">v{s.version} · {new Date(s.createdAt).toLocaleString()}{s.approvedBy ? ` · approved by ${s.approvedBy}` : ''}</span>
                {s.status !== 'approved' && (
                  <Button variant="success" size="sm" onClick={() => approve(s.sectionKey)}>Approve section</Button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Audience packages ─────────────────────────

const AUDIENCES: Array<{ key: string; title: string; desc: string }> = [
  { key: 'investor', title: 'Investor Package', desc: 'Returns story: market, revenue, NPV/IRR/payback, sensitivity, risk.' },
  { key: 'partner', title: 'Partner Package', desc: 'Venture story: market, technical & operational model, CAPEX/OPEX.' },
  { key: 'bank', title: 'Bank Financing Package', desc: 'Credit story: statements, DSCR, funding requirements, bankability.' },
];

function PackagesTab({ opp, hasStudy }: { opp: OpportunityRecord; hasStudy: boolean }) {
  const toast = useToast();
  const [pkg, setPkg] = useState<FeasibilityPackage | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  if (!hasStudy) {
    return <EmptyState title="Generate the study first" description="Packages are audience-specific compositions of the Level-2 study sections." />;
  }

  const load = async (audience: string) => {
    setLoading(audience);
    try {
      setPkg(await api<FeasibilityPackage>(`/feasibility/opportunities/${opp.id}/package/${audience}`));
    } catch (e) { toast.error('Package failed', (e as Error).message); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {AUDIENCES.map((a) => (
          <button
            key={a.key}
            onClick={() => load(a.key)}
            className={`rounded-xl border p-4 text-start transition hover:border-sky-500/60 hover:bg-slate-900/80 ${
              pkg?.audience === a.key ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-700/70 bg-slate-900/60'
            }`}
          >
            <p className="text-sm font-bold text-slate-50">{a.title}</p>
            <p className="mt-1 text-xs text-slate-400">{a.desc}</p>
            <p className="mt-2 text-[11px] font-semibold text-sky-300">{loading === a.key ? 'Composing…' : 'Compose →'}</p>
          </button>
        ))}
      </div>

      {pkg && (
        <Card
          title={`${AUDIENCES.find((a) => a.key === pkg.audience)?.title ?? pkg.audience} — ${pkg.opportunity.code}`}
          hint={`${pkg.generatedSections} sections · ${pkg.approvedSections} approved`}
          actions={<Button variant="ghost" size="sm" onClick={() => window.print()}>Print / save PDF</Button>}
        >
          <div ref={printRef} className="space-y-6">
            <div className="border-b border-slate-700 pb-3">
              <p className="text-lg font-bold text-slate-50">{pkg.opportunity.title}</p>
              <p className="text-xs text-slate-400">
                {pkg.opportunity.code} · {pkg.opportunity.projectType} · {[pkg.opportunity.city, pkg.opportunity.country].filter(Boolean).join(', ')} · {pkg.opportunity.currency}
              </p>
            </div>
            {pkg.sections.map((s, i) => (
              <section key={s.id}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-sky-300">
                  {i + 1}. {s.title}
                  {s.status === 'approved' && <span className="ms-2 text-[10px] font-semibold text-emerald-400">✓ approved</span>}
                </h3>
                <MarkdownLite text={s.content} />
              </section>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── Concept sketches ─────────────────────────

const FIELD_DEFS: Array<{ key: string; label: string; kind: 'number' | 'text' | 'list' }> = [
  { key: 'plotAreaSqm', label: 'Plot area (m²)', kind: 'number' },
  { key: 'builtUpAreaSqm', label: 'Built-up area (m²)', kind: 'number' },
  { key: 'floors', label: 'Floors', kind: 'number' },
  { key: 'functionalZones', label: 'Functional zones (comma-separated)', kind: 'list' },
  { key: 'approxDimensions', label: 'Approx. dimensions', kind: 'text' },
  { key: 'capacity', label: 'Capacity', kind: 'text' },
  { key: 'writtenNotes', label: 'Written notes (comma-separated)', kind: 'list' },
  { key: 'keyAssumptions', label: 'Key assumptions (comma-separated)', kind: 'list' },
];

function SketchesTab({
  opp, documents, refresh,
}: {
  opp: OpportunityRecord;
  documents: ConceptDocumentRecord[];
  refresh: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ConceptDocumentRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy('upload');
    try {
      const b64 = await toBase64(file);
      await api(`/feasibility/opportunities/${opp.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: b64 }),
      });
      toast.success('Sketch uploaded', file.name);
      await refresh();
    } catch (e) { toast.error('Upload failed', (e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const extract = async (doc: ConceptDocumentRecord) => {
    setBusy(doc.id);
    try {
      const updated = await api<ConceptDocumentRecord>(`/feasibility/documents/${doc.id}/extract`, { method: 'POST' });
      if (updated.extractionStatus === 'extracted') {
        toast.success('Extraction proposed', 'Review the fields, edit if needed, then confirm.');
        setReviewing(updated);
      } else {
        toast.error('Extraction not available', updated.extractionError ?? 'unknown');
        if (updated.extractionStatus === 'manual') setReviewing(updated);
      }
      await refresh();
    } catch (e) { toast.error('Extraction failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <Card
        title="Upload a concept sketch / preliminary drawing"
        hint="PNG, JPEG, WEBP, GIF or PDF · max 15 MB · OCR + vision extraction proposes the inputs; a human confirms before anything is applied"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          disabled={busy === 'upload'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-600 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-300 file:me-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:border-sky-500/60"
        />
      </Card>

      {documents.length === 0 ? (
        <EmptyState title="No concept documents" description="Many investors start with a simple sketch or handwritten notes — upload one to extract plot area, BUA, floors, zones, unit mix and notes." />
      ) : (
        <div className="space-y-2.5">
          {documents.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 truncate text-sm font-semibold text-slate-100">{d.filename}</span>
                <span className="text-[11px] text-slate-500" dir="ltr">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
                <Pill tone={
                  d.extractionStatus === 'confirmed' ? 'emerald'
                  : d.extractionStatus === 'extracted' ? 'sky'
                  : d.extractionStatus === 'failed' ? 'rose'
                  : d.extractionStatus === 'manual' ? 'amber' : 'slate'
                }>{d.extractionStatus}</Pill>
                {(d.extractionStatus === 'pending' || d.extractionStatus === 'failed') && (
                  <Button variant="primary" size="sm" disabled={busy === d.id} onClick={() => extract(d)}>
                    <IconSparkles className="h-3.5 w-3.5" /> {busy === d.id ? 'Extracting…' : 'AI extract'}
                  </Button>
                )}
                {d.extractionStatus !== 'confirmed' && d.extractionStatus !== 'pending' && (
                  <Button variant="ghost" size="sm" onClick={() => setReviewing(d)}>Review & confirm</Button>
                )}
              </div>
              {d.extractionError && <p className="mt-1.5 text-[11px] text-amber-300/90">{d.extractionError}</p>}
              {d.extractionStatus === 'confirmed' && d.confirmedFields && (
                <p className="mt-1.5 text-[11px] text-emerald-300/80">
                  Applied to feasibility inputs{d.confirmedBy ? ` by ${d.confirmedBy}` : ''}: {summarizeFields(d.confirmedFields)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <ConfirmFieldsForm
          doc={reviewing}
          onDone={async () => { setReviewing(null); await refresh(); }}
          onCancel={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

function ConfirmFieldsForm({
  doc, onDone, onCancel,
}: {
  doc: ConceptDocumentRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const proposed = (doc.extraction?.fields ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of FIELD_DEFS) {
      const raw = proposed[f.key];
      v[f.key] = Array.isArray(raw) ? (raw as unknown[]).join(', ') : raw == null ? '' : String(raw);
    }
    return v;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const f of FIELD_DEFS) {
        const raw = values[f.key]?.trim();
        if (!raw) continue;
        fields[f.key] =
          f.kind === 'number' ? Number(raw)
          : f.kind === 'list' ? raw.split(',').map((s) => s.trim()).filter(Boolean)
          : raw;
      }
      await api(`/feasibility/documents/${doc.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ fields }),
      });
      toast.success('Fields confirmed', 'Merged into the opportunity inputs — re-run the assessment to use them.');
      await onDone();
    } catch (err) { toast.error('Confirm failed', (err as Error).message); }
    finally { setBusy(false); }
  };

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/60 focus:outline-none';

  return (
    <Card
      title={`Review extracted fields — ${doc.filename}`}
      hint={doc.extraction?.confidence !== undefined
        ? `AI proposal at ${((doc.extraction.confidence ?? 0) * 100).toFixed(0)}% confidence — you are the approval gate`
        : 'Manual entry — fill in what the sketch shows'}
    >
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {FIELD_DEFS.map((f) => (
          <div key={f.key} className={f.kind === 'list' ? 'md:col-span-2' : ''}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{f.label}</label>
            <input
              className={field}
              type={f.kind === 'number' ? 'number' : 'text'}
              step="any"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="success" disabled={busy}>{busy ? 'Confirming…' : 'Confirm & apply to inputs'}</Button>
        </div>
      </form>
    </Card>
  );
}

function summarizeFields(f: Record<string, unknown>): string {
  const bits: string[] = [];
  if (f.plotAreaSqm) bits.push(`plot ${f.plotAreaSqm} m²`);
  if (f.builtUpAreaSqm) bits.push(`BUA ${f.builtUpAreaSqm} m²`);
  if (f.floors) bits.push(`${f.floors} floors`);
  if (Array.isArray(f.functionalZones) && f.functionalZones.length) bits.push(`${(f.functionalZones as string[]).length} zones`);
  return bits.join(' · ') || 'fields saved';
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolveB64, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolveB64(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
