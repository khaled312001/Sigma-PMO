'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MeResponse } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useI18n } from '../lib/i18n';
import {
  IconActivity,
  IconApproval,
  IconDashboard,
  IconEvidence,
  IconFolder,
  IconHistory,
  IconList,
  IconLogIn,
  IconLogOut,
  IconReview,
  IconShield,
  IconUpload,
  IconUsers,
  IconX,
} from './Icons';

interface NavLink {
  href: string;
  labelKey: string;
  surface: 'overview' | 'input' | 'review' | 'approval' | 'evidence' | 'admin' | 'insights';
  icon: React.ComponentType<{ className?: string }>;
  visible: (me: MeResponse | null) => boolean;
}

const PORTFOLIO: NavLink[] = [
  { href: '/',         labelKey: 'nav.overview', surface: 'overview', icon: IconDashboard, visible: () => true },
  { href: '/projects', labelKey: 'projects.title', surface: 'overview', icon: IconFolder, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canRead },
];

const OPERATIONS: NavLink[] = [
  { href: '/input',    labelKey: 'nav.input',    surface: 'input',    icon: IconUpload,    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canIngest },
  { href: '/review',   labelKey: 'nav.review',   surface: 'review',   icon: IconReview,    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
  { href: '/evidence', labelKey: 'nav.evidence', surface: 'evidence', icon: IconEvidence,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canRead },
  { href: '/approval', labelKey: 'nav.approval', surface: 'approval', icon: IconApproval,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
];

const INSIGHTS: NavLink[] = [
  { href: '/decisions', labelKey: 'decisions.title', surface: 'insights', icon: IconList, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canRead },
];

const ADMIN: NavLink[] = [
  { href: '/admin/policy', labelKey: 'nav.policy', surface: 'admin', icon: IconShield, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEditPolicy },
  { href: '/admin/users',  labelKey: 'nav.users',  surface: 'admin', icon: IconUsers,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
  { href: '/audit',        labelKey: 'audit.title', surface: 'admin', icon: IconHistory, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
];

const SURFACE_ACCENT: Record<NavLink['surface'], string> = {
  overview: 'before:bg-slate-500',
  input:    'before:bg-sky-500',
  review:   'before:bg-emerald-500',
  approval: 'before:bg-amber-400',
  evidence: 'before:bg-fuchsia-500',
  admin:    'before:bg-rose-500',
  insights: 'before:bg-violet-500',
};

function NavItem({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  const { t } = useI18n();
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition before:absolute before:start-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-e-full ${SURFACE_ACCENT[link.surface]} ${
        active
          ? 'bg-slate-800/70 text-white before:opacity-100'
          : 'text-slate-300 before:opacity-0 hover:bg-slate-800/40 hover:text-white hover:before:opacity-60'
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
      <span>{t(link.labelKey)}</span>
    </Link>
  );
}

function NavGroup({ title, links, pathname, onNavigate }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
          return <li key={link.href}><NavItem link={link} active={active} onNavigate={onNavigate} /></li>;
        })}
      </ul>
    </div>
  );
}

function SidebarBody({
  me, onSignOut, onNavigate, onClose,
}: { me: MeResponse | null; onSignOut: () => void; onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const portfolio = PORTFOLIO.filter((n) => n.visible(me));
  const ops = OPERATIONS.filter((n) => n.visible(me));
  const insights = INSIGHTS.filter((n) => n.visible(me));
  const adm = ADMIN.filter((n) => n.visible(me));

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-e border-slate-800/80 bg-slate-950/95 backdrop-blur">
      <div className="flex items-center gap-2.5 border-b border-slate-800/70 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
          <IconActivity className="h-4 w-4 text-sky-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-tight">{t('brand.name')}</p>
          <p className="text-[11px] text-slate-400">{t('brand.tagline')}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-label={t('nav.closeMenu')}>
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavGroup title={t('projects.eyebrow')} links={portfolio} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('nav.operations')} links={ops} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('decisions.eyebrow')} links={insights} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('nav.admin')} links={adm} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="border-t border-slate-800/70 px-3 py-3 text-xs">
        {me?.user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-200">
                {me.user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-100">{me.user.displayName}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{t(`roles.${me.user.role}`)}</p>
              </div>
            </div>
            <button onClick={onSignOut} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white">
              <IconLogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
            </button>
          </div>
        ) : me?.bootstrapMode ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200">{t('auth.bootstrap.title')}</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-100/80">{t('auth.bootstrap.body')}</p>
          </div>
        ) : (
          <Link href="/auth" onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-sky-300 hover:border-sky-500/60 hover:text-sky-200">
            <IconLogIn className="h-3.5 w-3.5" /> {t('nav.signInWithKey')}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Desktop sidebar (always-on at md+). */
export function Sidebar({ me, onSignOut }: { me: MeResponse | null; onSignOut: () => void }) {
  return (
    <aside className="hidden md:flex">
      <SidebarBody me={me} onSignOut={onSignOut} />
    </aside>
  );
}

/** Mobile drawer (overlay). Controlled by Shell. */
export function MobileSidebar({ me, onSignOut, open, onClose }: { me: MeResponse | null; onSignOut: () => void; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-y-0 start-0 shadow-2xl">
        <SidebarBody me={me} onSignOut={onSignOut} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}
