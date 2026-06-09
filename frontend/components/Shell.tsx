'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { clearApiKey, MeResponse } from '../lib/api';
import { useMe } from '../lib/me-context';
import { useI18n } from '../lib/i18n';
import { useConfirm } from './ConfirmDialog';
import { MobileSidebar, Sidebar } from './Sidebar';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Pill } from './ui';
import { useToast } from './ToastProvider';
import { ThemeToggle } from './ThemeToggle';
import { LangSwitch } from './LangSwitch';
import { IconLogIn, IconLogOut, IconMenu } from './Icons';

/** Routes that render full-screen without the sidebar/topbar (pro login). */
const FULLSCREEN_ROUTES = new Set<string>(['/auth']);

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const confirm = useConfirm();
  const { me, loaded, setMe } = useMe();
  const { t, lang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Unauthenticated users belong on /auth, period. No chrome, no AuthGate
  // hero inside the shell — full split-screen sign-in.
  useEffect(() => {
    if (loaded && !me?.user && !FULLSCREEN_ROUTES.has(pathname)) {
      router.replace('/auth');
    }
  }, [loaded, me?.user, pathname, router]);

  const onSignOut = async () => {
    const ok = await confirm({
      title: t('signOutDialog.title'),
      description: t('signOutDialog.body'),
      confirmLabel: t('signOutDialog.confirm'),
      destructive: true,
    });
    if (!ok) return;
    clearApiKey();
    setMe({ authenticated: false, bootstrapMode: false, user: null });
    toast.success(t('auth.signedOut'));
    router.push('/auth');
  };

  // Full-screen pages render without the shell chrome.
  if (FULLSCREEN_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  // While the redirect to /auth is in flight, render a minimal stub —
  // avoids flashing the sidebar/topbar to anonymous users.
  if (loaded && !me?.user) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        {t('common.loadingWorkspace')}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar me={me} onSignOut={onSignOut} />
      <MobileSidebar me={me} onSignOut={onSignOut} open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-700/70 bg-slate-950/90 px-4 py-2.5 backdrop-blur-xl shadow-sm sm:px-6">
          {/* subtle ambient crimson rule across the top edge */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-700 p-1.5 text-slate-200 transition-all duration-200 hover:scale-105 hover:border-sky-400/60 hover:bg-sky-500/10 hover:text-sky-100 md:hidden"
              aria-label={t('nav.openMenu')}
            >
              <IconMenu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('nav.project')}</span>
              <ProjectSwitcher />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me?.bootstrapMode && <Pill tone="amber" className="hidden sm:inline-flex">{t('nav.bootstrapMode')}</Pill>}
            <LangSwitch />
            <ThemeToggle />
            {me?.user ? (
              <AccountChip me={me} onSignOut={onSignOut} />
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-100 transition-all duration-200 hover:scale-105 hover:border-sky-400/60 hover:text-sky-100"
              >
                <IconLogIn className="h-3.5 w-3.5" />
                {t('nav.signIn')}
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 animate-[fade-in-up_220ms_ease-out]">
          {!loaded ? (
            <div className="grid h-64 place-items-center text-sm text-slate-300">{t('common.loadingWorkspace')}</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function AccountChip({ me, onSignOut }: { me: MeResponse; onSignOut: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!me.user) return null;
  const initials = me.user.displayName.slice(0, 1).toUpperCase();
  const roleLabel = t(`roles.${me.user.role}`);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-slate-600"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('nav.accountMenu')} — ${me.user.displayName}, ${roleLabel}`}
      >
        <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-100">{initials}</span>
        <span className="hidden text-slate-200 sm:inline">{me.user.displayName}</span>
        <span className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:inline">· {roleLabel}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute end-0 z-20 mt-2 w-60 rounded-lg border border-slate-800 bg-slate-950 p-1.5 shadow-xl">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-100">{me.user.displayName}</p>
              <p className="truncate text-[11px] text-slate-400">{me.user.email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{roleLabel}</p>
            </div>
            <div className="my-1 border-t border-slate-800" />
            <Link href="/account" onClick={() => setOpen(false)} className="block rounded-md px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800" role="menuitem">{t('nav.account')}</Link>
            <Link href="/help" onClick={() => setOpen(false)} className="block rounded-md px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800" role="menuitem">{t('nav.help')}</Link>
            <button onClick={() => { setOpen(false); onSignOut(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10" role="menuitem">
              <IconLogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
