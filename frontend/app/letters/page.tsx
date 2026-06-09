'use client';

/**
 * /letters — Layer 3 / Governance FIDIC letter drafter surface
 * (post-meeting plan §3.5, ADR-0011 §3).
 *
 * What this surface does — and what it deliberately does NOT do:
 *
 *  - DRAFT: any user with `canEvaluateRules` can hit one of two buttons to ask
 *    the `fidic-redbook-expert` persona to compose a bilingual letter. The
 *    backend rejects the persisted row if the persona omits the mandatory
 *    [SOURCE: …] citation footer; we surface that rejection inline rather
 *    than masquerading as a generic 400.
 *
 *  - APPROVE: only `canEditPolicy` (sigma_admin / client) can flip a draft
 *    to `approved`. The approval state machine refuses to operate on `sent`
 *    rows server-side; we mirror that in the UI by hiding the button.
 *
 *  - DOWNLOAD PDF: PDF rendering of an *approved* letter is on demand. Wave 2
 *    deliberately refuses to render a still-`draft` letter — the backend
 *    returns 400 in that case, so the Download button is disabled until the
 *    row is approved.
 *
 *  - **NOT** SEND: there is no "send" affordance anywhere on this page.
 *    Auto-send is forbidden in Wave 2 (ADR-0011 stays Proposed on Q6).
 *    A future Computer-Use-enabled cycle will add a `Send` button gated
 *    behind the 12 guardrails; until then "approved" is the terminal state
 *    a user can drive a Letter to from this surface.
 *
 *  - **NOT** EDIT: the body the persona produced is treated as the artefact.
 *    Corrections happen by drafting a new letter (the prior row stays for
 *    the audit trail). This is intentional — exposing an editor would let
 *    a reviewer silently rewrite a citation footer the LLM produced.
 *
 * Surface anatomy (top → bottom):
 *  1. PageHeader with two CTAs: "Draft from incoming" / "Draft compliance".
 *  2. Inline forms that expand below the buttons when clicked (no modal —
 *     the form is short and a modal would steal scroll position).
 *  3. Status filter chip row (Draft / Approved / Sent / all).
 *  4. List of letter rows. Click a row to expand it into a detail panel.
 *  5. Detail panel: subject, bodies (Ar/En toggle), citations chip list with
 *     deep-links to /sources, Approve + Download PDF actions per capability.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import {
  IconBell,
  IconBook,
  IconCheck,
  IconClock,
  IconRefresh,
  IconSparkles,
  IconX,
} from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmDialog';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { API_BASE, api, getApiKey } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

// ──────────────────────────── types ────────────────────────────

/**
 * Mirror of `Letter` (backend `letter.entity.ts`). We keep the type local
 * rather than adding it to `lib/api.ts` so the letters page can evolve its
 * shape independently of the global API surface.
 */
interface LetterRecord {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  trigger: 'incoming-letter' | 'compliance-flag' | string;
  subject: string;
  bodyAr: string;
  bodyEn: string;
  fidicClauseRef: string | null;
  deadlineDays: number | null;
  status: 'draft' | 'approved' | 'sent' | string;
  citations: string[];
  incomingLetterSourceFileId: string | null;
}

type StatusKey = 'draft' | 'approved' | 'sent';
type StatusFilter = 'all' | StatusKey;

// ──────────────────────────── route wrapper ────────────────────────────

/**
 * AuthGate gating: ANY authenticated user can VIEW the surface (`canRead`).
 * Per-action capability gates (drafting requires `canEvaluateRules`,
 * approval requires `canEditPolicy`) are enforced **inside** the page from
 * the `useMe()` role rather than via the gate so a reviewer can still
 * read approved letters they cannot draft. The backend enforces the same
 * capability gates server-side — these client-side checks are UX only.
 */
export default function LettersPageRoute() {
  // Spec: "any authenticated user can view". AuthGate without a `capability`
  // prop falls through to the authentication-only branch (the SourcesPage
  // uses the same wiring). Per-action capability gates live below.
  return (
    <AuthGate surface="Letters">
      <LettersPage />
    </AuthGate>
  );
}

// ──────────────────────────── page body ────────────────────────────

function LettersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useMe();
  const projectKey = useCurrentProjectKey();

  const role = me?.user?.role;
  const caps = role ? CAPABILITIES[role] : null;
  const canDraft = !!caps?.canEvaluateRules;
  const canApprove = !!caps?.canEditPolicy;

  const [letters, setLetters] = useState<LetterRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Which draft form is open, if any. Only one open at a time. */
  const [openForm, setOpenForm] = useState<'incoming' | 'compliance' | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    try {
      const rows = await api<LetterRecord[]>(
        `/letters?projectKey=${encodeURIComponent(projectKey)}`,
      );
      setLetters(rows);
      setError(null);
    } catch (e) {
      // The /letters endpoint requires a projectKey; if the user lands here
      // before /projects loaded a default key, the api() call 400s. Surface
      // the message rather than silently rendering an empty list — empty
      // would imply "you have no drafts" which is not what happened.
      setError((e as Error).message);
      setLetters([]);
    }
  }, [projectKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ────── filter + count derived state ──────

  const filtered = useMemo<LetterRecord[]>(() => {
    if (!letters) return [];
    if (filter === 'all') return letters;
    return letters.filter((l) => l.status === filter);
  }, [letters, filter]);

  const counts = useMemo(
    () => ({
      all: letters?.length ?? 0,
      draft: letters?.filter((l) => l.status === 'draft').length ?? 0,
      approved: letters?.filter((l) => l.status === 'approved').length ?? 0,
      sent: letters?.filter((l) => l.status === 'sent').length ?? 0,
    }),
    [letters],
  );

  const selected = useMemo(
    () => filtered.find((l) => l.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  // ────── draft actions ──────

  const draftFromIncoming = async (input: { letterSourceFileId: string }) => {
    if (!canDraft) return;
    setActing('draft-incoming');
    try {
      await api<LetterRecord>('/letters/draft-from-incoming', {
        method: 'POST',
        body: JSON.stringify({
          letterSourceFileId: input.letterSourceFileId,
          projectKey,
        }),
      });
      toast.success('Draft created', 'Persona returned a citation-backed reply.');
      setOpenForm(null);
      await refresh();
    } catch (e) {
      // The drafter throws `LetterDrafterRejection` for missing/unknown
      // citations — surface the body so the user knows why the draft was
      // refused rather than "Action failed".
      toast.error('Drafting refused', (e as Error).message);
    } finally {
      setActing(null);
    }
  };

  const draftCompliance = async (input: {
    complianceTrigger: string;
    narrative: string;
  }) => {
    if (!canDraft) return;
    setActing('draft-compliance');
    try {
      await api<LetterRecord>('/letters/draft-compliance', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          complianceTrigger: input.complianceTrigger,
          narrative: input.narrative,
        }),
      });
      toast.success('Compliance draft created', 'Persona produced a citation-backed notice.');
      setOpenForm(null);
      await refresh();
    } catch (e) {
      toast.error('Drafting refused', (e as Error).message);
    } finally {
      setActing(null);
    }
  };

  const approve = async (letterId: string) => {
    if (!canApprove) return;
    const ok = await confirm({
      title: 'Approve this letter?',
      description:
        'Approval flips the draft to `approved` and unlocks PDF rendering. ' +
        'Sending is still gated until Computer Use enablement (ADR-0011).',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setActing(letterId);
    try {
      await api<LetterRecord>(`/letters/${letterId}/approve`, { method: 'POST' });
      toast.success('Letter approved');
      await refresh();
    } catch (e) {
      toast.error('Approval failed', (e as Error).message);
    } finally {
      setActing(null);
    }
  };

  /**
   * Download an approved letter as PDF. The backend returns 400 for a
   * still-`draft` row — we mirror that contract by disabling the button
   * client-side, but we still surface the error if a race happened (e.g.
   * the row was just reverted by another approver).
   */
  const downloadPdf = async (letter: LetterRecord) => {
    const key = getApiKey();
    try {
      const res = await fetch(`${API_BASE}/letters/${letter.id}/pdf`, {
        headers: key ? { 'x-api-key': key } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body.slice(0, 240) || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Drive a Blob download rather than a same-tab navigation so the
      // user keeps the page state (selected row, filter, etc.).
      const a = document.createElement('a');
      a.href = url;
      a.download = `letter-${letter.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('PDF download failed', (e as Error).message);
    }
  };

  // ──────────────────────────── render ────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance · FIDIC"
        title="Letters"
        description={
          'Bilingual FIDIC contract letters drafted by the fidic-redbook-expert persona. ' +
          'Every draft carries a mandatory citation footer pointing to the Source registry. ' +
          'Wave 2 stops at approval — sending stays gated until Computer Use enablement (ADR-0011).'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <IconRefresh className="h-3.5 w-3.5" /> Refresh
            </Button>
            {canDraft && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setOpenForm((cur) => (cur === 'incoming' ? null : 'incoming'))
                  }
                >
                  <IconSparkles className="h-3.5 w-3.5" /> Draft from incoming
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setOpenForm((cur) => (cur === 'compliance' ? null : 'compliance'))
                  }
                >
                  <IconBell className="h-3.5 w-3.5" /> Draft compliance
                </Button>
              </>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {/* Inline draft forms — only one is open at a time. Mounted below the
          header so the user keeps the filter row + list in view. */}
      {openForm === 'incoming' && canDraft && (
        <DraftFromIncomingForm
          projectKey={projectKey}
          busy={acting === 'draft-incoming'}
          onCancel={() => setOpenForm(null)}
          onSubmit={draftFromIncoming}
        />
      )}
      {openForm === 'compliance' && canDraft && (
        <DraftComplianceForm
          projectKey={projectKey}
          busy={acting === 'draft-compliance'}
          onCancel={() => setOpenForm(null)}
          onSubmit={draftCompliance}
        />
      )}

      {/* Status filter chip row. Mirrors the same pattern Decisions page uses
          (consistent UX across governance surfaces). */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
        {(['all', 'draft', 'approved', 'sent'] as const).map((k) => (
          <StatusChip
            key={k}
            label={k === 'all' ? 'All' : k}
            active={filter === k}
            count={counts[k]}
            onClick={() => setFilter(k)}
          />
        ))}
      </div>

      {/* Body: skeleton, empty state, or the two-pane list + detail layout. */}
      {letters === null ? (
        <Card padded={false}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-slate-800/70 px-5 py-4 last:border-b-0">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800/60" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-800/40" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconBook className="h-8 w-8" />}
          title={
            filter === 'all'
              ? 'No letters drafted yet'
              : `No letters in status “${filter}”`
          }
          description={
            canDraft
              ? 'Use the two CTAs above to ask the FIDIC persona to draft a reply or a compliance notice.'
              : 'Once a Sigma reviewer drafts a letter for this project it will appear here.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Left pane: row list. Click selects the row for the detail pane. */}
          <ul className="space-y-2" aria-label="Letter list">
            {filtered.map((l) => (
              <li key={l.id}>
                <LetterRowCard
                  letter={l}
                  selected={l.id === selectedId}
                  onSelect={() => setSelectedId(l.id)}
                />
              </li>
            ))}
          </ul>

          {/* Right pane: detail. On small screens it stacks below the list. */}
          <div className="space-y-3">
            {selected ? (
              <LetterDetailCard
                letter={selected}
                canApprove={canApprove}
                acting={acting === selected.id}
                onApprove={() => approve(selected.id)}
                onDownload={() => downloadPdf(selected)}
              />
            ) : (
              <EmptyState
                title="Select a letter"
                description="Pick a row on the left to read its bilingual body and citation footer."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── row card (list item) ────────────────────────────

/**
 * One row in the left-pane list. Compact: status pill, FIDIC chip, deadline
 * countdown, citation count, subject. The whole card is a click target.
 */
function LetterRowCard({
  letter,
  selected,
  onSelect,
}: {
  letter: LetterRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const deadline = useDeadlineCountdown(letter.createdAt, letter.deadlineDays);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full rounded-xl border bg-slate-900/40 px-4 py-3 text-start transition ${
        selected
          ? 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/30'
          : 'border-slate-800 hover:border-slate-600 hover:bg-slate-900/60'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={letter.status as StatusKey} />
        {letter.fidicClauseRef && (
          <Pill tone="rose">
            <span className="font-mono" dir="ltr">{letter.fidicClauseRef}</span>
          </Pill>
        )}
        {letter.trigger === 'compliance-flag' ? (
          <Pill tone="amber">compliance</Pill>
        ) : (
          <Pill tone="sky">incoming</Pill>
        )}
        <span className="ms-auto inline-flex items-center gap-1 text-[10px] text-slate-500">
          <IconBook className="h-3 w-3" />
          {letter.citations.length} citation{letter.citations.length === 1 ? '' : 's'}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-slate-100">{letter.subject}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span dir="ltr">{new Date(letter.createdAt).toLocaleString()}</span>
        <DeadlineBadge countdown={deadline} status={letter.status as StatusKey} />
      </div>
    </button>
  );
}

// ──────────────────────────── detail card ────────────────────────────

function LetterDetailCard({
  letter,
  canApprove,
  acting,
  onApprove,
  onDownload,
}: {
  letter: LetterRecord;
  canApprove: boolean;
  acting: boolean;
  onApprove: () => void;
  onDownload: () => void;
}) {
  const [bodyLang, setBodyLang] = useState<'ar' | 'en'>('ar');
  const isDraft = letter.status === 'draft';
  const isApproved = letter.status === 'approved';
  const isSent = letter.status === 'sent';
  // PDF rendering is forbidden by the backend while still a draft (it returns
  // 400). Disable client-side to avoid that round-trip.
  const canDownload = isApproved || isSent;

  return (
    <Card padded={false}>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={letter.status as StatusKey} />
              {letter.fidicClauseRef && (
                <Pill tone="rose">
                  <span className="font-mono" dir="ltr">{letter.fidicClauseRef}</span>
                </Pill>
              )}
              {letter.trigger === 'compliance-flag' ? (
                <Pill tone="amber">compliance flag</Pill>
              ) : (
                <Pill tone="sky">incoming reply</Pill>
              )}
            </div>
            <h2 className="mt-2 text-base font-semibold text-slate-100">{letter.subject}</h2>
            <p className="mt-1 text-[11px] text-slate-500" dir="ltr">
              Drafted {new Date(letter.createdAt).toLocaleString()} · project {letter.projectBusinessKey}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canApprove && isDraft && (
              <Button variant="success" size="sm" disabled={acting} onClick={onApprove}>
                <IconCheck className="h-3.5 w-3.5" /> Approve
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={!canDownload} onClick={onDownload}>
              <IconBook className="h-3.5 w-3.5" /> Download PDF
            </Button>
          </div>
        </div>

        {/* Deadline strip — only meaningful if a numeric day count was returned. */}
        {letter.deadlineDays !== null && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 ring-1 ring-slate-700">
            <IconClock className="h-3.5 w-3.5" />
            Contractual deadline: <span className="font-semibold">{letter.deadlineDays} d</span>
            <span className="text-slate-500">from drafting</span>
          </div>
        )}
      </div>

      {/* Bilingual body with an Ar/En toggle. The persona persists both — we
          never machine-translate one from the other on the client. */}
      <div className="border-t border-slate-800/70 px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Body
          </p>
          <div
            className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-700"
            role="group"
            aria-label="Language toggle"
          >
            <button
              type="button"
              onClick={() => setBodyLang('ar')}
              aria-pressed={bodyLang === 'ar'}
              className={`px-2.5 py-1 text-[11px] ${
                bodyLang === 'ar' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              العربية
            </button>
            <button
              type="button"
              onClick={() => setBodyLang('en')}
              aria-pressed={bodyLang === 'en'}
              className={`px-2.5 py-1 text-[11px] ${
                bodyLang === 'en' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              English
            </button>
          </div>
        </div>
        <article
          dir={bodyLang === 'ar' ? 'rtl' : 'ltr'}
          className="whitespace-pre-line rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm leading-relaxed text-slate-100"
        >
          {bodyLang === 'ar'
            ? letter.bodyAr || '[لا يوجد نص عربي]'
            : letter.bodyEn || '[no English body]'}
        </article>
      </div>

      {/* Citation footer. Each id deep-links to /sources so the reviewer can
          verify exactly which standard the persona invoked. The backend
          validates this same list against the SourceRegistry before persist;
          the chips below are therefore guaranteed-resolvable curated ids. */}
      <div className="border-t border-slate-800/70 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Citations ({letter.citations.length})
        </p>
        {letter.citations.length === 0 ? (
          // Defensive: the drafter refuses to persist a row with zero
          // citations, so this branch is effectively unreachable. Render
          // a warning rather than silently hiding the empty footer.
          <p className="mt-2 text-xs text-amber-300">
            No citations recorded — this row should not have been persisted.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {letter.citations.map((externalId) => (
              <li key={externalId}>
                {/* Link target follows the spec literally: /sources/:id.
                    The backend resolves :id by externalId OR uuid. The
                    frontend /sources page may not have a dedicated /[id]
                    route yet — graceful fallback is the catalogue list. */}
                <Link
                  href={`/sources/${encodeURIComponent(externalId)}`}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-[11px] text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:ring-sky-500/60"
                  dir="ltr"
                >
                  <IconBook className="h-3 w-3 opacity-70" />
                  {externalId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ──────────────────────────── draft forms ────────────────────────────

function DraftFromIncomingForm({
  projectKey,
  busy,
  onCancel,
  onSubmit,
}: {
  projectKey: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { letterSourceFileId: string }) => void;
}) {
  const [sourceFileId, setSourceFileId] = useState('');
  const valid = sourceFileId.trim().length > 0;
  return (
    <Card title="Draft from incoming contractor letter" hint={`Project: ${projectKey}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || busy) return;
          onSubmit({ letterSourceFileId: sourceFileId.trim() });
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Incoming letter source file id
          </label>
          <input
            type="text"
            value={sourceFileId}
            onChange={(e) => setSourceFileId(e.target.value)}
            placeholder="SourceFile uuid (uploaded on the Input page)"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            dir="ltr"
            spellCheck={false}
            required
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Paste the uuid of the contractor letter you previously ingested. The persona
            reads its bytes and proposes a reply with explicit Sub-Clause + deadline.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <IconX className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!valid || busy}>
            {busy ? 'Drafting…' : 'Draft reply'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DraftComplianceForm({
  projectKey,
  busy,
  onCancel,
  onSubmit,
}: {
  projectKey: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { complianceTrigger: string; narrative: string }) => void;
}) {
  const [trigger, setTrigger] = useState('');
  const [narrative, setNarrative] = useState('');
  const valid = trigger.trim().length > 0 && narrative.trim().length > 0;
  return (
    <Card title="Draft compliance letter" hint={`Project: ${projectKey}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || busy) return;
          onSubmit({
            complianceTrigger: trigger.trim(),
            narrative: narrative.trim(),
          });
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Trigger code
          </label>
          <input
            type="text"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="e.g. pmi.org-chart-non-compliance"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            dir="ltr"
            spellCheck={false}
            required
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Narrative
          </label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={4}
            placeholder="What is the non-compliance? Which role / role-week / clause is affected?"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            required
          />
          <p className="mt-1 text-[11px] text-slate-500">
            The persona weaves this narrative into a formal Arabic + English notice and
            cites the applicable Sub-Clause / PMI / ISO standard from the Source registry.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <IconX className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!valid || busy}>
            {busy ? 'Drafting…' : 'Draft notice'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ──────────────────────────── status / deadline helpers ────────────────────────────

/** Status pill — single source of truth for the colour mapping. */
function StatusPill({ status }: { status: StatusKey | string }) {
  const tone: 'amber' | 'emerald' | 'sky' | 'slate' =
    status === 'draft' ? 'amber'
    : status === 'approved' ? 'emerald'
    : status === 'sent' ? 'sky'
    : 'slate';
  return <Pill tone={tone}>{status}</Pill>;
}

function StatusChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
          : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
      }`}
    >
      <span className="capitalize">{label}</span>
      <span className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[9px] text-slate-400">
        {count}
      </span>
    </button>
  );
}

/**
 * Countdown bucket. Returned by {@link useDeadlineCountdown} so the badge
 * component can pick a colour without re-computing day deltas.
 */
type DeadlineCountdown =
  | { kind: 'none' }
  | { kind: 'remaining'; days: number }
  | { kind: 'overdue'; days: number };

/**
 * Compute days remaining until the contractual deadline.
 *
 *  - `letter.deadlineDays` is the deadline length in days the persona
 *    extracted from the Sub-Clause (e.g. 28 for the standard FIDIC 20.1 reply).
 *  - We anchor it at `createdAt` because that is the timestamp the audit
 *    trail will use. NOT `approvedAt` — the contractor's clock started when
 *    the reply was drafted in the system, not when we approved it.
 *  - `null` deadlineDays = persona returned "TBD pending data" — we surface
 *    the {kind: 'none'} bucket so the badge can render an explicit "—".
 */
function useDeadlineCountdown(
  createdAtIso: string,
  deadlineDays: number | null,
): DeadlineCountdown {
  if (deadlineDays === null) return { kind: 'none' };
  const created = new Date(createdAtIso).getTime();
  const due = created + deadlineDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diffMs = due - now;
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) return { kind: 'overdue', days: Math.abs(days) };
  return { kind: 'remaining', days };
}

function DeadlineBadge({
  countdown,
  status,
}: {
  countdown: DeadlineCountdown;
  status: StatusKey;
}) {
  if (countdown.kind === 'none') {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <IconClock className="h-3 w-3" />
        deadline TBD
      </span>
    );
  }
  // If the letter is already sent, the countdown is historical context only —
  // render it muted so reviewers do not read "overdue" as an outstanding
  // action on a row that has already moved past this surface.
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <IconClock className="h-3 w-3" />
        {countdown.kind === 'overdue'
          ? `was ${countdown.days}d overdue`
          : `${countdown.days}d window`}
      </span>
    );
  }
  if (countdown.kind === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-300">
        <IconClock className="h-3 w-3" />
        {countdown.days}d overdue
      </span>
    );
  }
  const tone =
    countdown.days <= 3 ? 'text-rose-300'
    : countdown.days <= 7 ? 'text-amber-300'
    : 'text-emerald-300';
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <IconClock className="h-3 w-3" />
      {countdown.days}d remaining
    </span>
  );
}
