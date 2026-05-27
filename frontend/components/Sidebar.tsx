'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MeResponse } from '../lib/api';
import { CAPABILITIES, ROLE_LABEL } from '../lib/capabilities';

interface NavLink {
  href: string;
  label: string;
  surface: 'input' | 'review' | 'approval' | 'evidence' | 'admin' | 'overview';
  visible: (me: MeResponse | null) => boolean;
}

const NAV: NavLink[] = [
  { href: '/',               label: 'Overview',     surface: 'overview', visible: () => true },
  { href: '/input',          label: 'Input',        surface: 'input',    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canIngest },
  { href: '/review',         label: 'Review',       surface: 'review',   visible: () => true },
  { href: '/evidence',       label: 'Evidence',     surface: 'evidence', visible: () => true },
  { href: '/approval',       label: 'Approval',     surface: 'approval', visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
  { href: '/admin/policy',   label: 'Policy',       surface: 'admin',    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEditPolicy },
  { href: '/admin/users',    label: 'Users',        surface: 'admin',    visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
];

const SURFACE_COLOR: Record<NavLink['surface'], string> = {
  overview: 'text-slate-400',
  input:    'text-sky-300',
  review:   'text-emerald-300',
  approval: 'text-amber-300',
  evidence: 'text-fuchsia-300',
  admin:    'text-rose-300',
};

export function Sidebar({ me, onSignOut }: { me: MeResponse | null; onSignOut: () => void }) {
  const pathname = usePathname();
  const links = NAV.filter((n) => n.visible(me));

  return (
    <aside className="flex w-60 flex-col border-r border-slate-800 bg-slate-900/40">
      <div className="border-b border-slate-800 px-5 py-4">
        <p className="text-base font-semibold tracking-tight">Sigma PMO</p>
        <p className="text-[11px] text-slate-400">Governance operating system</p>
      </div>

      <nav className="flex-1 px-2 py-3">
        <ul className="space-y-0.5">
          {links.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-2 rounded px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-slate-800/70 text-white'
                      : 'text-slate-300 hover:bg-slate-800/40 hover:text-white'
                  }`}
                >
                  <span className={`text-[10px] uppercase tracking-wider ${SURFACE_COLOR[link.surface]}`}>{link.surface}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-800 px-3 py-3 text-xs">
        {me?.user ? (
          <div>
            <p className="font-medium text-slate-100">{me.user.displayName}</p>
            <p className="text-slate-400">{ROLE_LABEL[me.user.role]}</p>
            <button
              onClick={onSignOut}
              className="mt-2 w-full rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        ) : me?.bootstrapMode ? (
          <div className="text-amber-300">
            <p className="font-medium">Bootstrap mode</p>
            <p className="text-slate-400">No users exist yet. Create the first admin via the CLI to enable RBAC.</p>
          </div>
        ) : (
          <Link href="/auth" className="text-sky-300 hover:text-sky-200">Sign in with API key →</Link>
        )}
      </div>
    </aside>
  );
}
