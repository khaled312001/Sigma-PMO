'use client';

import Link from 'next/link';

import type { Role } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useMe } from '../lib/me-context';
import { useI18n } from '../lib/i18n';
import { IconLogIn, IconShield } from './Icons';

type Capability = keyof typeof CAPABILITIES['sigma_admin'];

/**
 * Wraps a page surface so it only renders for users with the required role
 * capability. Anonymous users see a sign-in hero; signed-in users without
 * the capability see a role-mismatch message. The Shell already shows a
 * "Loading workspace…" state while `me` is in flight.
 */
export function AuthGate({
  capability,
  surface,
  children,
}: {
  /** If omitted, only authentication is required (any role passes). */
  capability?: Capability;
  /** Short surface name for the unauth hero ("Review", "Approval", ...). */
  surface?: string;
  children: React.ReactNode;
}) {
  const { me, loaded } = useMe();
  if (!loaded) return null;

  if (!me?.user) {
    return <SignInHero surface={surface} bootstrapMode={!!me?.bootstrapMode} />;
  }
  if (capability && !CAPABILITIES[me.user.role][capability]) {
    return <RoleMismatch role={me.user.role} surface={surface} />;
  }
  return <>{children}</>;
}

function SignInHero({ surface, bootstrapMode }: { surface?: string; bootstrapMode: boolean }) {
  const { t } = useI18n();
  const title = surface ? t('gate.signInTo', { surface }) : t('gate.signInGeneric');
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-sky-500/5 via-slate-950 to-emerald-500/5 p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/40">
          <IconLogIn className="h-5 w-5 text-sky-300" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-100">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{t('gate.signInBody')}</p>
        {bootstrapMode && (
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-start text-xs text-amber-100">
            <p className="font-semibold text-amber-200">{t('auth.bootstrap.title')}</p>
            <p className="mt-1 text-amber-100/85">{t('auth.bootstrap.body')}</p>
            <pre className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px]" dir="ltr">npm run user:create -- you@example.com sigma_admin &quot;Your Name&quot;</pre>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
          >
            <IconLogIn className="h-4 w-4" /> {t('nav.signInWithKey')}
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            {t('common.howItWorks')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function RoleMismatch({ role, surface }: { role: Role; surface?: string }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/40">
          <IconShield className="h-5 w-5 text-amber-300" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-100">
          {t('gate.roleNoAccess', { surface: surface ?? t('nav.overview') })}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {t('gate.roleHint', { role: t(`roles.${role}`) })}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
        >
          {t('common.backToOverview')}
        </Link>
      </div>
    </div>
  );
}
