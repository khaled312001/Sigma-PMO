'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, clearApiKey, MeResponse } from '../lib/api';
import { Sidebar } from './Sidebar';
import { ROLE_LABEL } from '../lib/capabilities';
import { Pill } from './ui';
import { IconLogIn, IconLogOut } from './Icons';

const PROJECT_KEY = 'P-1000';

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/auth/me'));
    } catch {
      setMe({ authenticated: false, bootstrapMode: false, user: null });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onSignOut = () => {
    clearApiKey();
    setMe({ authenticated: false, bootstrapMode: false, user: null });
    router.push('/auth');
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar me={me} onSignOut={onSignOut} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-950/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="text-slate-500">Project</span>
            <Pill tone="sky">{PROJECT_KEY} · Nile Tower</Pill>
          </div>
          <div className="flex items-center gap-2">
            {me?.bootstrapMode && <Pill tone="amber">Bootstrap mode</Pill>}
            {me?.user ? (
              <AccountChip me={me} onSignOut={onSignOut} />
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-sky-500/60 hover:text-sky-200"
              >
                <IconLogIn className="h-3.5 w-3.5" />
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 px-6 py-6 sm:px-10">
          {!loaded ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">Loading workspace…</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function AccountChip({ me, onSignOut }: { me: MeResponse; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);

  // Close on outside click via keydown Escape — light-weight (no portal needed).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!me.user) return null;
  const initials = me.user.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-slate-600"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-100">{initials}</span>
        <span className="hidden text-slate-200 sm:inline">{me.user.displayName}</span>
        <span className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:inline">· {ROLE_LABEL[me.user.role]}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-slate-800 bg-slate-950 p-1.5 shadow-xl">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-100">{me.user.displayName}</p>
              <p className="truncate text-[11px] text-slate-400">{me.user.email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{ROLE_LABEL[me.user.role]}</p>
            </div>
            <div className="my-1 border-t border-slate-800" />
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              role="menuitem"
            >
              Account details
            </Link>
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              role="menuitem"
            >
              Help
            </Link>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
              role="menuitem"
            >
              <IconLogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
