'use client';

/**
 * PersonaActiveBadge — the visible "أنت تتحدث مع خبير 25 سنة" indicator the
 * 2026-06-08 meeting asked for (00:20:25): the user must SEE that the AI on
 * this surface is permanently primed as a domain expert, without re-typing
 * the prompt each time.
 *
 * Renders a slim chip (brain icon + persona slug); clicking opens a details
 * popover describing the expertise, tier, and where the system prompt is
 * managed. Pure client component — persona facts ship as props from the
 * page (each surface knows its own persona contract).
 */

import { useEffect, useRef, useState } from 'react';

import { Pill } from './ui';
import { IconSparkles } from './Icons';

export function PersonaActiveBadge({
  personaSlug,
  expertise,
  tier = 'claude-sonnet',
  surface,
}: {
  personaSlug: string;
  /** Human-readable expertise line, e.g. "Primavera P6 planner — 25-30 years". */
  expertise: string;
  tier?: string;
  surface: string;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/50 bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-100 transition-all duration-200 hover:scale-105 hover:border-violet-400/70"
        title="AI persona active on this surface"
      >
        <IconSparkles className="h-3 w-3" />
        <span className="font-mono" dir="ltr">{personaSlug}</span>
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-72 rounded-xl border border-slate-600 bg-slate-950 p-4 shadow-2xl animate-[fade-in-up_160ms_ease-out]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            AI persona on this surface
          </p>
          <p className="mt-1.5 text-sm font-semibold text-slate-50" dir="ltr">{personaSlug}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{expertise}</p>
          <dl className="mt-3 space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Surface</dt>
              <dd className="font-mono text-slate-200" dir="ltr">{surface}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Model tier</dt>
              <dd className="font-mono text-slate-200" dir="ltr">{tier}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <Pill tone="emerald">Always-on — no prompt re-typing</Pill>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            The persona's full system prompt (expertise framing, citation rules, refusal
            contract) is versioned in <span className="font-mono">/admin/personas</span>.
            Project-specific instructions added below are appended to every call.
          </p>
        </div>
      )}
    </div>
  );
}
