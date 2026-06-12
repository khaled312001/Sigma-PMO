'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useEffect, useState } from 'react';

import { MeResponse } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useI18n } from '../lib/i18n';
import {
  IconActivity,
  IconApproval,
  IconBook,
  IconChevronRight,
  IconDashboard,
  IconDatabase,
  IconEvidence,
  IconFolder,
  IconHistory,
  IconList,
  IconLogIn,
  IconLogOut,
  IconReview,
  IconShield,
  IconSparkles,
  IconUpload,
  IconUsers,
  IconX,
} from './Icons';

interface NavLink {
  href: string;
  labelKey: string;
  surface: 'overview' | 'input' | 'review' | 'approval' | 'evidence' | 'admin' | 'insights' | 'planning';
  icon: React.ComponentType<{ className?: string }>;
  visible: (me: MeResponse | null) => boolean;
  /** Renders a small accent badge next to the label (e.g. "NEW"). */
  badge?: 'new' | 'beta';
  /** Agent-layer tag chip (e.g. "L4") — Governance OS L0–L8 taxonomy. */
  tag?: string;
}

// Capability-based visibility helpers. Each role sees a DIFFERENT sidebar:
//  - read    : any authenticated reader (everyone) — shared operational surfaces.
//  - govern  : the strategic-governance tier (canReadAll OR canEvaluateRules).
//              Excludes the subcontractor, who gets a deliberately minimal slice.
//  - cap(f)  : gate on a specific capability flag.
const read = (me: MeResponse | null) => !me?.user || CAPABILITIES[me.user.role].canRead;
const govern = (me: MeResponse | null) =>
  !me?.user || CAPABILITIES[me.user.role].canReadAll || CAPABILITIES[me.user.role].canEvaluateRules;
const cap = (flag: keyof (typeof CAPABILITIES)['sigma_admin']) =>
  (me: MeResponse | null) => !me?.user || CAPABILITIES[me.user.role][flag];

// ── Governance command (the destinations) — strategic-governance tier only. ──
const PORTFOLIO: NavLink[] = [
  { href: '/',         labelKey: 'nav.overview', surface: 'overview', icon: IconDashboard, visible: () => true },
  { href: '/governance-command', labelKey: 'nav.command', surface: 'insights', icon: IconShield, badge: 'new', visible: govern },
  { href: '/executive', labelKey: 'nav.executive', surface: 'evidence', icon: IconDashboard, badge: 'new', visible: govern },
  { href: '/hierarchy', labelKey: 'nav.hierarchy', surface: 'overview', icon: IconFolder, badge: 'new', visible: govern },
  { href: '/agents', labelKey: 'nav.agents', surface: 'insights', icon: IconSparkles, badge: 'new', visible: govern },
  { href: '/feasibility', labelKey: 'nav.feasibility', surface: 'approval', icon: IconActivity, badge: 'new', tag: 'INV', visible: cap('canRunFeasibility') },
  { href: '/projects', labelKey: 'projects.title', surface: 'overview', icon: IconFolder, visible: read },
];

// ── The L0–L8 agent taxonomy: each layer's primary screen, in order. ──
const AGENT_LAYERS: NavLink[] = [
  { href: '/knowledge', labelKey: 'nav.knowledge', surface: 'admin',    icon: IconBook,     tag: 'L0', visible: read },
  { href: '/input',     labelKey: 'nav.input',     surface: 'input',    icon: IconUpload,   tag: 'L1', visible: cap('canIngestSchedule') },
  { href: '/review',    labelKey: 'nav.review',    surface: 'review',   icon: IconReview,   tag: 'L2', visible: cap('canEvaluateRules') },
  { href: '/decisions', labelKey: 'decisions.title', surface: 'insights', icon: IconList,   tag: 'L3', visible: govern },
  { href: '/analytics', labelKey: 'nav.analytics', surface: 'insights', icon: IconActivity, tag: 'L4', visible: govern },
  { href: '/risk',      labelKey: 'nav.risk',      surface: 'approval', icon: IconShield,   tag: 'L5', visible: govern },
  { href: '/claims',    labelKey: 'nav.claims',    surface: 'admin',    icon: IconEvidence, tag: 'L6', visible: govern },
  { href: '/executive', labelKey: 'nav.executive', surface: 'evidence', icon: IconDashboard, tag: 'L7', visible: govern },
  { href: '/governance-command', labelKey: 'nav.command', surface: 'insights', icon: IconShield, tag: 'L8', visible: govern },
];

// ── Tools & evidence surfaces (operational depth behind the layers) ──
const TOOLS: NavLink[] = [
  { href: '/repository', labelKey: 'nav.repository', surface: 'input', icon: IconDatabase, badge: 'new', visible: read },
  { href: '/evidence', labelKey: 'nav.evidence', surface: 'evidence', icon: IconEvidence,  visible: read },
  { href: '/approval', labelKey: 'nav.approval', surface: 'approval', icon: IconApproval,  visible: cap('canEvaluateRules') },
  { href: '/baselines', labelKey: 'nav.baselines', surface: 'planning', icon: IconActivity, visible: read },
  { href: '/simulation', labelKey: 'nav.simulation', surface: 'planning', icon: IconSparkles, visible: cap('canSimulate') },
  { href: '/clashes', labelKey: 'nav.clashes', surface: 'review', icon: IconReview, visible: read },
  { href: '/drawings', labelKey: 'nav.drawings', surface: 'input', icon: IconUpload, visible: read },
  { href: '/letters', labelKey: 'nav.letters', surface: 'admin', icon: IconEvidence, visible: govern },
  { href: '/sources', labelKey: 'nav.sources', surface: 'insights', icon: IconList, visible: read },
  { href: '/reports/monthly', labelKey: 'nav.reports', surface: 'evidence', icon: IconEvidence, visible: govern },
  { href: '/comparison', labelKey: 'nav.comparison', surface: 'insights', icon: IconSparkles, visible: govern },
];

// ── Admin — privileged operations only. ──
const ADMIN: NavLink[] = [
  { href: '/admin/roles',    labelKey: 'nav.roles',            surface: 'admin', icon: IconUsers, badge: 'new', visible: cap('canManageRoles') },
  { href: '/admin/governance', labelKey: 'nav.governanceConfig',  surface: 'admin', icon: IconShield, badge: 'new', visible: cap('canEditPolicy') },
  { href: '/admin/policy',   labelKey: 'nav.policy',           surface: 'admin', icon: IconShield, visible: cap('canEditPolicy') },
  { href: '/admin/personas', labelKey: 'admin.personas.title', surface: 'admin', icon: IconSparkles, visible: cap('canEditPersonas') },
  { href: '/admin/users',    labelKey: 'nav.users',            surface: 'admin', icon: IconUsers,  visible: cap('canReadAll') },
  { href: '/admin/settings', labelKey: 'nav.settings',         surface: 'admin', icon: IconShield, badge: 'new', visible: cap('canEditPolicy') },
  { href: '/audit',          labelKey: 'audit.title',          surface: 'admin', icon: IconHistory, visible: cap('canReadAll') },
];

// Surface accent (a thin rail on the start edge + the active glow color).
const SURFACE_ACCENT: Record<NavLink['surface'], { rail: string; glow: string; iconActive: string }> = {
  overview: { rail: 'before:bg-slate-400',    glow: 'shadow-[0_0_0_1px_rgba(148,163,184,0.40)]',  iconActive: 'text-slate-100' },
  input:    { rail: 'before:bg-sky-400',      glow: 'shadow-[0_0_0_1px_rgba(56,189,248,0.45)]',   iconActive: 'text-sky-200' },
  review:   { rail: 'before:bg-emerald-400',  glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.45)]',   iconActive: 'text-emerald-200' },
  approval: { rail: 'before:bg-amber-400',    glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.45)]',   iconActive: 'text-amber-200' },
  evidence: { rail: 'before:bg-fuchsia-400',  glow: 'shadow-[0_0_0_1px_rgba(232,121,249,0.45)]',  iconActive: 'text-fuchsia-200' },
  admin:    { rail: 'before:bg-rose-400',     glow: 'shadow-[0_0_0_1px_rgba(251,113,133,0.45)]',  iconActive: 'text-rose-200' },
  insights: { rail: 'before:bg-violet-400',   glow: 'shadow-[0_0_0_1px_rgba(167,139,250,0.45)]',  iconActive: 'text-violet-200' },
  planning: { rail: 'before:bg-sky-400',      glow: 'shadow-[0_0_0_1px_rgba(56,189,248,0.45)]',   iconActive: 'text-sky-200' },
};

function NavItem({ link, active, onNavigate, collapsed }: { link: NavLink; active: boolean; onNavigate?: () => void; collapsed?: boolean }) {
  const Icon = link.icon;
  const { t } = useI18n();
  const accent = SURFACE_ACCENT[link.surface];
  const label = t(link.labelKey);

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center overflow-hidden rounded-lg text-sm transition-all duration-200 ease-out
        ${collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'}
        before:absolute before:start-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-e-full before:transition-all before:duration-300 ${accent.rail}
        ${
          active
            ? `bg-sky-500/10 text-slate-50 before:opacity-100 before:scale-y-100 ${accent.glow}`
            : 'text-slate-300 before:opacity-0 before:scale-y-50 hover:bg-slate-500/15 hover:text-slate-50'
        }`}
    >
      {/* Animated gradient backdrop on hover (subtle, theme-adaptive) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-slate-400/10 to-transparent transition-transform duration-700 group-hover:translate-x-full`}
      />
      <span className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 transition-all duration-200
        ${active ? `bg-slate-900/80 ring-slate-600 ${accent.iconActive}` : 'bg-slate-900/40 ring-slate-700/80 text-slate-300 group-hover:bg-slate-900/70 group-hover:ring-slate-500'}`}>
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed && (
        <>
          {link.tag && (
            <span className="relative inline-flex shrink-0 items-center rounded bg-slate-800 px-1 py-0.5 font-mono text-[9px] font-bold text-sky-300 ring-1 ring-slate-700" dir="ltr">
              {link.tag}
            </span>
          )}
          <span className="relative flex-1 truncate">{label}</span>
          {link.badge === 'new' && (
            <span
              aria-hidden
              className="relative inline-flex items-center rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-950 shadow-sm animate-[pulse-soft_2s_ease-in-out_infinite]"
            >
              NEW
            </span>
          )}
          {link.badge === 'beta' && (
            <span
              aria-hidden
              className="relative inline-flex items-center rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950"
            >
              BETA
            </span>
          )}
        </>
      )}
      {/* Collapsed: a tiny dot signals NEW without the label. */}
      {collapsed && link.badge === 'new' && (
        <span aria-hidden className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-[pulse-soft_2s_ease-in-out_infinite]" />
      )}
    </Link>
  );
}

function NavGroup({ title, links, pathname, onNavigate, collapsed }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void; collapsed?: boolean }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-5 first:mt-1">
      {collapsed ? (
        <div className="mx-auto mb-1.5 h-px w-6 bg-slate-700/70" aria-hidden />
      ) : (
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      )}
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
          return <li key={link.href}><NavItem link={link} active={active} onNavigate={onNavigate} collapsed={collapsed} /></li>;
        })}
      </ul>
    </div>
  );
}

function SidebarBody({
  me, onSignOut, onNavigate, onClose, collapsed, onToggleCollapse,
}: { me: MeResponse | null; onSignOut: () => void; onNavigate?: () => void; onClose?: () => void; collapsed?: boolean; onToggleCollapse?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const portfolio = PORTFOLIO.filter((n) => n.visible(me));
  const layers = AGENT_LAYERS.filter((n) => n.visible(me));
  const tools = TOOLS.filter((n) => n.visible(me));
  const adm = ADMIN.filter((n) => n.visible(me));

  return (
    <div className={`relative flex h-full shrink-0 flex-col border-e border-slate-700/60 bg-slate-950/95 backdrop-blur-xl transition-[width] duration-300 ease-out ${collapsed ? 'w-[68px]' : 'w-64'}`}>
      {/* Subtle ambient glow at the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-32 bg-gradient-to-b from-sky-500/10 via-sky-500/5 to-transparent blur-2xl"
      />

      {/* Brand */}
      <div className={`relative flex items-center border-b border-slate-700/60 py-4 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-5'}`}>
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-sky-400/40 shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={t('brand.name')} className="h-full w-full object-cover" />
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_5s_ease-in-out_infinite]"
          />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-slate-50">{t('brand.name')}</p>
            <p className="truncate text-[11px] text-slate-400">{t('brand.tagline')}</p>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-slate-300 transition hover:bg-slate-800 hover:text-slate-50 md:hidden" aria-label={t('nav.closeMenu')}>
            <IconX className="h-4 w-4" />
          </button>
        )}
        {/* Desktop collapse toggle — pinned to the edge of the brand row. */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
            title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
            className={`absolute -end-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-md transition hover:border-sky-400/60 hover:text-sky-200 md:grid`}
          >
            <IconChevronRight className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        )}
      </div>

      <nav className={`relative flex-1 overflow-y-auto py-3 scrollbar-thin ${collapsed ? 'px-2' : 'px-2'}`}>
        <NavGroup title={t('nav.commandGroup')} links={portfolio} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        <NavGroup title={t('nav.agentLayers')} links={layers} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        <NavGroup title={t('nav.tools')} links={tools} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        <NavGroup title={t('nav.admin')} links={adm} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
      </nav>

      <div className={`relative border-t border-slate-700/60 py-3 text-xs ${collapsed ? 'px-2' : 'px-3'}`}>
        {me?.user ? (
          collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-500/40 to-emerald-500/30 text-[11px] font-semibold text-white ring-1 ring-sky-400/30" title={`${me.user.displayName} · ${t(`roles.${me.user.role}`)}`}>
                {me.user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <button onClick={onSignOut} aria-label={t('nav.signOut')} title={t('nav.signOut')} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100">
                <IconLogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 shadow-sm">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500/40 to-emerald-500/30 text-[11px] font-semibold text-white ring-1 ring-sky-400/30">
                  {me.user.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-50">{me.user.displayName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">{t(`roles.${me.user.role}`)}</p>
                </div>
              </div>
              <button onClick={onSignOut} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700/70 px-2 py-1.5 text-[11px] text-slate-100 transition-all duration-200 hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100">
                <IconLogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
              </button>
            </div>
          )
        ) : me?.bootstrapMode && !collapsed ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-50 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100">{t('auth.bootstrap.title')}</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-50/90">{t('auth.bootstrap.body')}</p>
          </div>
        ) : !collapsed ? (
          <Link href="/auth" onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700/70 px-2 py-1.5 text-[11px] text-sky-200 transition-all duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 hover:text-sky-100">
            <IconLogIn className="h-3.5 w-3.5" /> {t('nav.signInWithKey')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Desktop sidebar (always-on at md+) — collapsible, state persisted. */
export function Sidebar({ me, onSignOut }: { me: MeResponse | null; onSignOut: () => void }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sigma_sidebar_collapsed') === '1');
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('sigma_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <aside className="hidden md:flex">
      <SidebarBody me={me} onSignOut={onSignOut} collapsed={collapsed} onToggleCollapse={toggle} />
    </aside>
  );
}

/** Mobile drawer (overlay). Controlled by Shell. */
export function MobileSidebar({ me, onSignOut, open, onClose }: { me: MeResponse | null; onSignOut: () => void; open: boolean; onClose: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 start-0 shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0 rtl:translate-x-0' : '-translate-x-full rtl:translate-x-full'}`}
      >
        <SidebarBody me={me} onSignOut={onSignOut} onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}
