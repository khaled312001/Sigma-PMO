'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useProject } from '../lib/project-context';
import { useI18n } from '../lib/i18n';
import { Pill } from './ui';
import { IconChevronRight } from './Icons';

/**
 * Project switcher in the top bar. Shows the current project's businessKey
 * and name; on click, opens a dropdown of all current projects to switch to.
 * Selection persists to localStorage via ProjectContext.
 */
export function ProjectSwitcher() {
  const { projects, current, setCurrentByKey, loading } = useProject();
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Group the switcher by client (Mr. Ayham, 2026-06-20): a client can own
  // several projects, so the navbar picker lists projects under their client.
  const groups = useMemo(() => {
    const m = new Map<string, typeof projects>();
    for (const p of projects) {
      const c = (p.clientName ?? '').trim() || '__none__';
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(p);
    }
    return Array.from(m.entries()).sort((a, b) =>
      a[0] === '__none__' ? 1 : b[0] === '__none__' ? -1 : a[0].localeCompare(b[0]),
    );
  }, [projects]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading && !current) {
    return <Pill tone="slate">…</Pill>;
  }

  // No current project (anonymous + empty DB) → render nothing. The Shell
  // redirects anonymous to /auth anyway; this prevents a misleading "no
  // projects" pill from flashing during the transition.
  if (!current) return null;

  // With a single project (the common Layer-1 case), still show the pill but
  // disable the click-to-switch UI to keep things visually obvious.
  const switchable = projects.length > 1;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => switchable && setOpen((v) => !v)}
        aria-haspopup={switchable ? 'menu' : undefined}
        aria-expanded={switchable ? open : undefined}
        aria-label={switchable ? 'Switch project' : `Current project ${current.businessKey}`}
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ring-1 ring-sky-500/30 ${
          switchable ? 'bg-sky-500/10 text-sky-200 hover:ring-sky-500/60' : 'bg-sky-500/10 text-sky-200 cursor-default'
        }`}
      >
        <span className="font-mono">{current.businessKey}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden truncate sm:inline-block max-w-[18rem]">{current.name}</span>
        {switchable && <IconChevronRight className="h-3 w-3 rotate-90" />}
      </button>
      {open && switchable && (
        <div role="menu" className="absolute start-0 z-30 mt-2 max-h-80 w-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-1 shadow-xl">
          {groups.map(([client, list]) => (
            <div key={client} className="pb-0.5">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500" dir="auto">
                {client === '__none__' ? (isAr ? 'بدون عميل' : 'No client') : client}
              </div>
              {list.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentByKey(p.businessKey); setOpen(false); }}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-xs hover:bg-slate-800 ${
                    p.businessKey === current.businessKey ? 'bg-slate-800/70 text-white' : 'text-slate-200'
                  }`}
                  role="menuitem"
                >
                  <span className="font-mono text-[11px] text-slate-400">{p.businessKey}</span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
