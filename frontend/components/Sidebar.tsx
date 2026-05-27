'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MeResponse } from '../lib/api';
import { CAPABILITIES, ROLE_LABEL } from '../lib/capabilities';
import {
  IconActivity,
  IconApproval,
  IconDashboard,
  IconEvidence,
  IconLogIn,
  IconLogOut,
  IconReview,
  IconShield,
  IconUpload,
  IconUsers,
} from './Icons';

interface NavLink {
  href: string;
  label: string;
  surface: 'overview' | 'input' | 'review' | 'approval' | 'evidence' | 'admin';
  icon: React.ComponentType<{ className?: string }>;
  visible: (me: MeResponse | null) => boolean;
}

const OPERATIONS: NavLink[] = [
  { href: '/',         label: 'Overview', surface: 'overview', icon: IconDashboard, visible: () => true },
  { href: '/input',    label: 'Input',    surface: 'input',    icon: IconUpload,    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canIngest },
  { href: '/review',   label: 'Review',   surface: 'review',   icon: IconReview,    visible: () => true },
  { href: '/evidence', label: 'Evidence', surface: 'evidence', icon: IconEvidence,  visible: () => true },
  { href: '/approval', label: 'Approval', surface: 'approval', icon: IconApproval,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
];

const ADMIN: NavLink[] = [
  { href: '/admin/policy', label: 'Policy', surface: 'admin', icon: IconShield, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEditPolicy },
  { href: '/admin/users',  label: 'Users',  surface: 'admin', icon: IconUsers,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
];

const SURFACE_ACCENT: Record<NavLink['surface'], string> = {
  overview: 'before:bg-slate-500',
  input:    'before:bg-sky-500',
  review:   'before:bg-emerald-500',
  approval: 'before:bg-amber-400',
  evidence: 'before:bg-fuchsia-500',
  admin:    'before:bg-rose-500',
};

function NavItem({ link, active }: { link: NavLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-r-full ${SURFACE_ACCENT[link.surface]} ${
        active
          ? 'bg-slate-800/70 text-white before:opacity-100'
          : 'text-slate-300 before:opacity-0 hover:bg-slate-800/40 hover:text-white hover:before:opacity-60'
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
      <span>{link.label}</span>
    </Link>
  );
}

function NavGroup({ title, links, pathname }: { title: string; links: NavLink[]; pathname: string }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
          return <li key={link.href}><NavItem link={link} active={active} /></li>;
        })}
      </ul>
    </div>
  );
}

export function Sidebar({ me, onSignOut }: { me: MeResponse | null; onSignOut: () => void }) {
  const pathname = usePathname();
  const ops = OPERATIONS.filter((n) => n.visible(me));
  const adm = ADMIN.filter((n) => n.visible(me));

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/60 backdrop-blur">
      <div className="flex items-center gap-2.5 border-b border-slate-800/70 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
          <IconActivity className="h-4 w-4 text-sky-300" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Sigma PMO</p>
          <p className="text-[11px] text-slate-400">Governance operating system</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavGroup title="Operations" links={ops} pathname={pathname} />
        <NavGroup title="Admin" links={adm} pathname={pathname} />
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
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{ROLE_LABEL[me.user.role]}</p>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white"
            >
              <IconLogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        ) : me?.bootstrapMode ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200">Bootstrap mode</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-100/80">No users exist. Create the first admin via the CLI to enable RBAC.</p>
          </div>
        ) : (
          <Link href="/auth" className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-sky-300 hover:border-sky-500/60 hover:text-sky-200">
            <IconLogIn className="h-3.5 w-3.5" /> Sign in with API key
          </Link>
        )}
      </div>
    </aside>
  );
}
