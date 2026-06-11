'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MeResponse } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useI18n } from '../lib/i18n';
import {
  IconActivity,
  IconApproval,
  IconBook,
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

const read = (me: MeResponse | null) => !me?.user || CAPABILITIES[me.user.role].canRead;

// ── Governance command (the destinations) ──
const PORTFOLIO: NavLink[] = [
  { href: '/',         labelKey: 'nav.overview', surface: 'overview', icon: IconDashboard, visible: () => true },
  { href: '/governance-command', labelKey: 'nav.command', surface: 'insights', icon: IconShield, badge: 'new', visible: read },
  { href: '/executive', labelKey: 'nav.executive', surface: 'evidence', icon: IconDashboard, badge: 'new', visible: read },
  { href: '/hierarchy', labelKey: 'nav.hierarchy', surface: 'overview', icon: IconFolder, badge: 'new', visible: read },
  { href: '/agents', labelKey: 'nav.agents', surface: 'insights', icon: IconSparkles, badge: 'new', visible: read },
  { href: '/projects', labelKey: 'projects.title', surface: 'overview', icon: IconFolder, visible: read },
];

// ── The L0–L8 agent taxonomy: each layer's primary screen, in order. ──
const AGENT_LAYERS: NavLink[] = [
  { href: '/knowledge', labelKey: 'nav.knowledge', surface: 'admin',    icon: IconBook,     tag: 'L0', visible: read },
  { href: '/input',     labelKey: 'nav.input',     surface: 'input',    icon: IconUpload,   tag: 'L1', visible: (me) => !me?.user || CAPABILITIES[me.user.role].canIngest },
  { href: '/review',    labelKey: 'nav.review',    surface: 'review',   icon: IconReview,   tag: 'L2', visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
  { href: '/decisions', labelKey: 'decisions.title', surface: 'insights', icon: IconList,   tag: 'L3', visible: read },
  { href: '/analytics', labelKey: 'nav.analytics', surface: 'insights', icon: IconActivity, tag: 'L4', visible: read },
  { href: '/risk',      labelKey: 'nav.risk',      surface: 'approval', icon: IconShield,   tag: 'L5', visible: read },
  { href: '/claims',    labelKey: 'nav.claims',    surface: 'admin',    icon: IconEvidence, tag: 'L6', visible: read },
  { href: '/executive', labelKey: 'nav.executive', surface: 'evidence', icon: IconDashboard, tag: 'L7', visible: read },
  { href: '/governance-command', labelKey: 'nav.command', surface: 'insights', icon: IconShield, tag: 'L8', visible: read },
];

// ── Tools & evidence surfaces (operational depth behind the layers) ──
const TOOLS: NavLink[] = [
  { href: '/repository', labelKey: 'nav.repository', surface: 'input', icon: IconDatabase, badge: 'new', visible: read },
  { href: '/evidence', labelKey: 'nav.evidence', surface: 'evidence', icon: IconEvidence,  visible: read },
  { href: '/approval', labelKey: 'nav.approval', surface: 'approval', icon: IconApproval,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEvaluateRules },
  { href: '/baselines', labelKey: 'nav.baselines', surface: 'planning', icon: IconActivity, visible: read },
  { href: '/simulation', labelKey: 'nav.simulation', surface: 'planning', icon: IconSparkles, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canSimulate },
  { href: '/clashes', labelKey: 'nav.clashes', surface: 'review', icon: IconReview, visible: read },
  { href: '/drawings', labelKey: 'nav.drawings', surface: 'input', icon: IconUpload, visible: read },
  { href: '/letters', labelKey: 'nav.letters', surface: 'admin', icon: IconEvidence, visible: read },
  { href: '/sources', labelKey: 'nav.sources', surface: 'insights', icon: IconList, visible: read },
  { href: '/reports/monthly', labelKey: 'nav.reports', surface: 'evidence', icon: IconEvidence, visible: read },
  { href: '/comparison', labelKey: 'nav.comparison', surface: 'insights', icon: IconSparkles, visible: read },
];

const ADMIN: NavLink[] = [
  { href: '/admin/policy',   labelKey: 'nav.policy',           surface: 'admin', icon: IconShield, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEditPolicy },
  { href: '/admin/personas', labelKey: 'admin.personas.title', surface: 'admin', icon: IconSparkles, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canRead },
  { href: '/admin/users',    labelKey: 'nav.users',            surface: 'admin', icon: IconUsers,  visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
  { href: '/admin/settings', labelKey: 'nav.settings',         surface: 'admin', icon: IconShield, badge: 'new', visible: (me) => !me?.user || CAPABILITIES[me.user.role].canEditPolicy },
  { href: '/audit',          labelKey: 'audit.title',          surface: 'admin', icon: IconHistory, visible: (me) => !me?.user || CAPABILITIES[me.user.role].canReadAll },
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

function NavItem({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  const { t } = useI18n();
  const accent = SURFACE_ACCENT[link.surface];

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm transition-all duration-200 ease-out
        before:absolute before:start-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-e-full before:transition-all before:duration-300 ${accent.rail}
        ${
          active
            ? `bg-slate-800/80 text-white before:opacity-100 before:scale-y-100 ${accent.glow}`
            : 'text-slate-200 before:opacity-0 before:scale-y-50 hover:translate-x-0.5 hover:bg-slate-800/50 hover:text-white rtl:hover:-translate-x-0.5'
        }`}
    >
      {/* Animated gradient backdrop on hover (subtle) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent transition-transform duration-700 group-hover:translate-x-full`}
      />
      <span className={`relative grid h-7 w-7 place-items-center rounded-md ring-1 transition-all duration-200
        ${active ? `bg-slate-900/80 ring-slate-600 ${accent.iconActive}` : 'bg-slate-900/40 ring-slate-700 text-slate-300 group-hover:bg-slate-900/70 group-hover:ring-slate-500'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      {link.tag && (
        <span className="relative inline-flex shrink-0 items-center rounded bg-slate-800 px-1 py-0.5 font-mono text-[9px] font-bold text-sky-300 ring-1 ring-slate-700" dir="ltr">
          {link.tag}
        </span>
      )}
      <span className="relative flex-1 truncate">{t(link.labelKey)}</span>
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
    </Link>
  );
}

function NavGroup({ title, links, pathname, onNavigate }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
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
  const layers = AGENT_LAYERS.filter((n) => n.visible(me));
  const tools = TOOLS.filter((n) => n.visible(me));
  const adm = ADMIN.filter((n) => n.visible(me));

  return (
    <div className="relative flex h-full w-64 shrink-0 flex-col border-e border-slate-700/80 bg-slate-950/95 backdrop-blur-xl">
      {/* Subtle ambient glow at the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-32 bg-gradient-to-b from-sky-500/10 via-sky-500/5 to-transparent blur-2xl"
      />

      {/* Brand */}
      <div className="relative flex items-center gap-2.5 border-b border-slate-700/70 px-5 py-4">
        <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-sky-500/40 via-sky-500/20 to-emerald-500/25 ring-1 ring-sky-400/40 shadow-md">
          <IconActivity className="relative h-4 w-4 text-sky-100 drop-shadow" />
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_4s_ease-in-out_infinite]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-slate-50">{t('brand.name')}</p>
          <p className="truncate text-[11px] text-slate-300">{t('brand.tagline')}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-slate-300 transition hover:bg-slate-800 hover:text-white md:hidden" aria-label={t('nav.closeMenu')}>
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="relative flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <NavGroup title={t('nav.commandGroup')} links={portfolio} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('nav.agentLayers')} links={layers} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('nav.tools')} links={tools} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup title={t('nav.admin')} links={adm} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="relative border-t border-slate-700/70 px-3 py-3 text-xs">
        {me?.user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-sm">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-500/40 to-emerald-500/30 text-[11px] font-semibold text-white ring-1 ring-sky-400/30">
                {me.user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-50">{me.user.displayName}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-300">{t(`roles.${me.user.role}`)}</p>
              </div>
            </div>
            <button onClick={onSignOut} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-2 py-1.5 text-[11px] text-slate-100 transition-all duration-200 hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100">
              <IconLogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
            </button>
          </div>
        ) : me?.bootstrapMode ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-50 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100">{t('auth.bootstrap.title')}</p>
            <p className="mt-1 text-[11px] leading-snug text-amber-50/90">{t('auth.bootstrap.body')}</p>
          </div>
        ) : (
          <Link href="/auth" onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-2 py-1.5 text-[11px] text-sky-200 transition-all duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 hover:text-sky-100">
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
