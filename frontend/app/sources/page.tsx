'use client';

/**
 * /sources — the authoritative reference catalogue.
 *
 * Read-only window onto the `Source` registry the platform's expert personas
 * are allowed to cite. The seed file (`sources.seed.json`) is the source of
 * truth; this page deliberately exposes no edit affordances — operator
 * workflow is "PR + restart" (see SourcesService.seedFromCatalogue).
 *
 * Auth: any authenticated user. Reading what the personas may cite is itself
 * an audit affordance and should not require an elevated role.
 *
 * Surface:
 *  - Family filter chips (FIDIC / PMI / ISO / AACE / BIM / PRIMAVERA / OTHER)
 *  - Search box (title / publisher / scope / personas / externalId)
 *  - Per-row card: title, family chip, publisher, year, applicable personas,
 *    URL link (opens new tab), scope text.
 *
 * Layout choice: card list (not DataTable) because the most useful field is
 * the multi-line `scope` body. A grid of cards keeps the long prose readable
 * without horizontal scrolling on mobile.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconBook, IconFilter, IconSearch } from '../../components/Icons';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';

interface SourceRecord {
  id: string;
  externalId: string;
  family: string;
  title: string;
  latestEdition: string;
  publisher: string;
  year: number;
  url: string;
  scope: string;
  applicablePersonas: string[];
  verification: string;
}

/**
 * Known canonical families, in display order. Any source whose `family`
 * value falls outside this set is bucketed into the synthetic "OTHER" chip
 * — the filter never silently swallows rows.
 */
const KNOWN_FAMILIES = ['FIDIC', 'PMI', 'ISO', 'AACE', 'BIM', 'PRIMAVERA'] as const;
type KnownFamily = (typeof KNOWN_FAMILIES)[number];
const OTHER_FAMILY = 'OTHER';

/** Per-family pill tone — keeps the catalogue legible at a glance. */
const FAMILY_TONE: Record<string, 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'> = {
  FIDIC: 'rose',
  PMI: 'sky',
  ISO: 'emerald',
  AACE: 'amber',
  BIM: 'violet',
  PRIMAVERA: 'sky',
  OTHER: 'slate',
};

function classifyFamily(raw: string): KnownFamily | typeof OTHER_FAMILY {
  const upper = (raw ?? '').toUpperCase();
  return (KNOWN_FAMILIES as readonly string[]).includes(upper)
    ? (upper as KnownFamily)
    : OTHER_FAMILY;
}

export default function SourcesPageRoute() {
  // Any authenticated user — no capability required. AuthGate without a
  // `capability` prop falls through to the "authenticated only" branch.
  return (
    <AuthGate surface="Sources">
      <SourcesPage />
    </AuthGate>
  );
}

function SourcesPage() {
  const [sources, setSources] = useState<SourceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // null = "All families". Storing as a Set would allow multi-select, but a
  // single-select chip row is closer to what curators asked for and keeps
  // the URL-shareable state shape trivial if we add ?family= later.
  const [family, setFamily] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<SourceRecord[]>('/sources')
      .then((rows) => {
        if (!cancelled) setSources(rows);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-family counts power the chip badges and let the user see at-a-glance
  // how many sources live in each family — useful when the catalogue grows.
  const counts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const f of KNOWN_FAMILIES) out[f] = 0;
    out[OTHER_FAMILY] = 0;
    for (const s of sources ?? []) {
      const key = classifyFamily(s.family);
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [sources]);

  const filtered = useMemo<SourceRecord[]>(() => {
    if (!sources) return [];
    const needle = search.trim().toLowerCase();
    return sources.filter((s) => {
      // Family filter — null means "all".
      if (family !== null) {
        const bucket = classifyFamily(s.family);
        if (bucket !== family) return false;
      }
      if (!needle) return true;
      // Search across the columns a curator is most likely to recall: title,
      // externalId (slug), publisher, scope prose, and persona slugs.
      const haystack = [
        s.title,
        s.externalId,
        s.publisher,
        s.scope,
        s.latestEdition,
        ...(s.applicablePersonas ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [sources, search, family]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reference catalogue"
        title="Sources"
        description="The authoritative scientific and professional references the platform's expert personas are allowed to cite. Curated by Sigma — every persona claim without a [SOURCE: externalId] marker pointing to a row below is flagged as an unverified assumption."
        actions={
          sources ? (
            <Pill tone="slate">
              {sources.length} {sources.length === 1 ? 'source' : 'sources'}
            </Pill>
          ) : null
        }
      />

      <ErrorBanner message={error} />

      {/* Filter chip row + search box. Chips are buttons (toggleable), the
          search is a controlled input. Both share the same Card chrome so
          they read as a single filter strip. */}
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-800/70 px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by family">
            <span className="inline-flex items-center gap-1 pe-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <IconFilter className="h-3.5 w-3.5" />
              Family
            </span>
            <FamilyChip label="All" active={family === null} count={sources?.length ?? 0} onClick={() => setFamily(null)} />
            {KNOWN_FAMILIES.map((f) => (
              <FamilyChip
                key={f}
                label={f}
                active={family === f}
                count={counts[f] ?? 0}
                onClick={() => setFamily(f)}
              />
            ))}
            {(counts[OTHER_FAMILY] ?? 0) > 0 && (
              <FamilyChip
                label={OTHER_FAMILY}
                active={family === OTHER_FAMILY}
                count={counts[OTHER_FAMILY]}
                onClick={() => setFamily(OTHER_FAMILY)}
              />
            )}
          </div>
          <label className="relative block w-full md:w-80">
            <span className="sr-only">Search sources</span>
            <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, publisher, scope, persona…"
              className="block w-full rounded-lg border border-slate-800 bg-slate-950/60 ps-9 pe-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              dir="ltr"
              spellCheck={false}
            />
          </label>
        </div>
      </Card>

      {/* Body: loading skeleton, empty state, or the catalogue list. */}
      {sources === null ? (
        <Card padded={false}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-slate-800/70 px-5 py-4 last:border-b-0">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800/60" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-800/40" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800/40" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconBook className="h-8 w-8" />}
          title={search || family ? 'No sources match the current filter' : 'No sources registered yet'}
          description={
            search || family
              ? 'Try clearing the family chip or the search box.'
              : 'The catalogue is empty. Edit sources.seed.json on the backend and restart to populate it.'
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Reference catalogue">
          {filtered.map((s) => (
            <li key={s.id}>
              <SourceRow source={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Family chip — toggle button styled to match the existing pill tone palette.
 * Renders count as a softer trailing badge so users see the impact of each
 * chip before clicking it.
 */
function FamilyChip({
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 transition ${
        active
          ? 'bg-sky-500/20 text-sky-100 ring-sky-500/40'
          : 'bg-slate-900/50 text-slate-300 ring-slate-800 hover:text-slate-50 hover:ring-slate-600'
      }`}
    >
      <span>{label}</span>
      <span className={`tabular-nums ${active ? 'text-sky-200/80' : 'text-slate-500'}`}>{count}</span>
    </button>
  );
}

/**
 * Single catalogue row. Structured so curators can scan many rows quickly:
 * top line = title + family chip; meta line = publisher / edition / year /
 * verification; persona chip row = who's allowed to cite this; scope body =
 * the long prose; link footer = the upstream publisher URL (new tab).
 */
function SourceRow({ source }: { source: SourceRecord }) {
  const familyKey = classifyFamily(source.family);
  const tone = FAMILY_TONE[familyKey] ?? 'slate';
  const verified = source.verification === 'confirmed';

  return (
    <Card padded={false}>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={tone}>{familyKey}</Pill>
              <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                {source.externalId}
              </span>
              {verified ? (
                <Pill tone="emerald">verified</Pill>
              ) : (
                <Pill tone="amber">verify</Pill>
              )}
            </div>
            <h3 className="mt-2 text-sm font-semibold text-slate-100">{source.title}</h3>
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-slate-300">{source.publisher}</span>
              {source.publisher && (source.latestEdition || source.year) ? ' · ' : ''}
              {source.latestEdition && <span>{source.latestEdition}</span>}
              {source.latestEdition && source.year ? ' · ' : source.year ? '' : ''}
              {source.year ? <span className="tabular-nums">{source.year}</span> : null}
            </p>
          </div>
          {source.url && (
            // Open in new tab; rel="noreferrer" because the catalogue links
            // out to publishers we don't control (FIDIC, ISO, Oracle docs).
            <Link
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-sky-500/60 hover:text-sky-200"
              dir="ltr"
            >
              Open
              {/* Tiny inline external-link glyph keeps the bundle lean — we
                  don't depend on adding a new icon to the global set. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M14 4h6v6" />
                <path d="M20 4 10 14" />
                <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
              </svg>
            </Link>
          )}
        </div>

        {source.applicablePersonas && source.applicablePersonas.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Applicable personas
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {source.applicablePersonas.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-[10px] text-slate-200 ring-1 ring-slate-700"
                  dir="ltr"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {source.scope && (
          <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-slate-300">
            {source.scope}
          </p>
        )}
      </div>
    </Card>
  );
}
