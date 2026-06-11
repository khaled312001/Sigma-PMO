'use client';

import { useState } from 'react';

import { IconChevronRight, IconFolder, IconActivity } from './Icons';
import { GovernanceStatusBadge } from './GovernanceStatusBadge';

/**
 * Mirror of the backend `GovernanceTree` shape (hierarchy.service.ts).
 * Enterprise → Portfolio → Program → Project, each node carrying its rolled-up
 * 4-tier governance status.
 */
export interface TreeProject {
  businessKey: string;
  name: string;
  governanceStatus: string | null;
  lifecyclePhase: string | null;
}
export interface TreeProgram {
  businessKey: string;
  name: string;
  governanceStatus: string;
  currentPhase: string | null;
  projects: TreeProject[];
}
export interface TreePortfolio {
  businessKey: string;
  name: string;
  governanceStatus: string;
  programs: TreeProgram[];
}
export interface TreeEnterprise {
  businessKey: string;
  name: string;
  governanceStatus: string;
  portfolios: TreePortfolio[];
}
export interface GovernanceTree {
  enterprises: TreeEnterprise[];
  unattachedProjects: TreeProject[];
}

/** One node's deterministic roll-up (mirror of backend RollupNode). */
export interface RollupNode {
  nodeType: string;
  businessKey: string;
  name: string;
  governanceStatus: string | null;
  cost: { cpi: number | null };
  schedule: { spi: number | null };
  risk: { openCount: number; maxScore: number };
  claims: { openCount: number; exposure: number };
  benefitRealizationPct: number;
  bac: number;
}

/** Format an index (CPI/SPI) for a compact chip; em-dash when null. */
function fmtIndex(v: number | null): string {
  return v === null ? '--' : v.toFixed(2);
}

/**
 * Compact mono pills carrying a node's roll-up: CPI, SPI, open risks, open
 * claims, benefit %. Tone keys off the usual cost/schedule thresholds. The
 * `title` attribute carries the full numbers for hover.
 */
function RollupChips({ r }: { r: RollupNode }) {
  const cpiTone = r.cost.cpi === null ? 'muted' : r.cost.cpi >= 1 ? 'good' : r.cost.cpi >= 0.9 ? 'warn' : 'bad';
  const spiTone = r.schedule.spi === null ? 'muted' : r.schedule.spi >= 1 ? 'good' : r.schedule.spi >= 0.9 ? 'warn' : 'bad';
  const benefitTone = r.benefitRealizationPct >= 70 ? 'good' : r.benefitRealizationPct >= 40 ? 'warn' : 'bad';
  return (
    <span className="hidden shrink-0 items-center gap-1 md:flex" aria-label="roll-up metrics">
      <Chip tone={cpiTone} title={`Cost Performance Index ${fmtIndex(r.cost.cpi)} (EV/AC)`}>CPI {fmtIndex(r.cost.cpi)}</Chip>
      <Chip tone={spiTone} title={`Schedule Performance Index ${fmtIndex(r.schedule.spi)} (EV/PV)`}>SPI {fmtIndex(r.schedule.spi)}</Chip>
      <Chip tone={r.risk.openCount > 0 ? 'warn' : 'muted'} title={`${r.risk.openCount} open risk(s); max priority score ${r.risk.maxScore}`}>R:{r.risk.openCount}</Chip>
      <Chip tone={r.claims.openCount > 0 ? 'warn' : 'muted'} title={`${r.claims.openCount} open claim(s); exposure ${Math.round(r.claims.exposure).toLocaleString()}`}>C:{r.claims.openCount}</Chip>
      <Chip tone={benefitTone} title={`Benefit realization ${r.benefitRealizationPct}% (EV/BAC x status multiplier); BAC ${Math.round(r.bac).toLocaleString()}`}>B:{r.benefitRealizationPct}%</Chip>
    </span>
  );
}

const CHIP_TONE: Record<string, string> = {
  good: 'border-emerald-700/50 bg-emerald-900/30 text-emerald-300',
  warn: 'border-amber-700/50 bg-amber-900/30 text-amber-300',
  bad: 'border-rose-700/50 bg-rose-900/30 text-rose-300',
  muted: 'border-slate-700/60 bg-slate-800/40 text-slate-400',
};

function Chip({ tone, title, children }: { tone: string; title: string; children: React.ReactNode }) {
  return (
    <span
      className={`rounded border px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums ${CHIP_TONE[tone] ?? CHIP_TONE.muted}`}
      title={title}
      dir="ltr"
    >
      {children}
    </span>
  );
}

function Row({
  depth,
  icon,
  name,
  businessKey,
  status,
  phase,
  rollup,
  expandable,
  expanded,
  onToggle,
  onSelect,
  selected,
}: {
  depth: number;
  icon: React.ReactNode;
  name: string;
  businessKey: string;
  status: string | null;
  phase?: string | null;
  rollup?: RollupNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
        selected ? 'bg-sky-500/10 ring-1 ring-sky-500/30' : 'hover:bg-slate-800/50'
      }`}
      style={{ paddingInlineStart: `${depth * 18 + 8}px` }}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="grid h-4 w-4 shrink-0 place-items-center text-slate-400 hover:text-slate-200"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <span className="shrink-0 text-slate-400">{icon}</span>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-start"
      >
        <span className="text-sm font-medium text-slate-100">{name}</span>
        <span className="ms-2 font-mono text-[10px] text-slate-500" dir="ltr">{businessKey}</span>
      </button>
      {phase && (
        <span className="hidden rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400 sm:inline">
          {phase.replace(/_/g, ' ')}
        </span>
      )}
      {rollup && <RollupChips r={rollup} />}
      <GovernanceStatusBadge status={status} size="sm" showLabel={false} />
    </div>
  );
}

export function HierarchyTree({
  tree,
  selectedKey,
  onSelectNode,
  rollups,
}: {
  tree: GovernanceTree;
  selectedKey?: string | null;
  onSelectNode?: (nodeType: string, businessKey: string) => void;
  /** Per-node roll-ups keyed by businessKey (CPI/SPI/risks/claims/benefit). */
  rollups?: Map<string, RollupNode>;
}) {
  const ru = (key: string): RollupNode | undefined => rollups?.get(key);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const isOpen = (key: string) => !collapsed.has(key);

  const empty =
    tree.enterprises.length === 0 && tree.unattachedProjects.length === 0;
  if (empty) {
    return (
      <p className="px-2 py-6 text-center text-sm text-slate-500">
        No governance hierarchy yet. Create an enterprise, portfolio, or program to begin —
        or projects appear below once ingested.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.enterprises.map((e) => (
        <div key={e.businessKey}>
          <Row
            depth={0}
            icon={<IconFolder className="h-4 w-4" />}
            name={e.name}
            businessKey={e.businessKey}
            status={e.governanceStatus}
            rollup={ru(e.businessKey)}
            expandable={e.portfolios.length > 0}
            expanded={isOpen(`e:${e.businessKey}`)}
            onToggle={() => toggle(`e:${e.businessKey}`)}
            onSelect={() => onSelectNode?.('enterprise', e.businessKey)}
            selected={selectedKey === e.businessKey}
          />
          {isOpen(`e:${e.businessKey}`) &&
            e.portfolios.map((pf) => (
              <div key={pf.businessKey}>
                <Row
                  depth={1}
                  icon={<IconFolder className="h-4 w-4" />}
                  name={pf.name}
                  businessKey={pf.businessKey}
                  status={pf.governanceStatus}
                  rollup={ru(pf.businessKey)}
                  expandable={pf.programs.length > 0}
                  expanded={isOpen(`pf:${pf.businessKey}`)}
                  onToggle={() => toggle(`pf:${pf.businessKey}`)}
                  onSelect={() => onSelectNode?.('portfolio', pf.businessKey)}
                  selected={selectedKey === pf.businessKey}
                />
                {isOpen(`pf:${pf.businessKey}`) &&
                  pf.programs.map((pr) => (
                    <div key={pr.businessKey}>
                      <Row
                        depth={2}
                        icon={<IconFolder className="h-4 w-4" />}
                        name={pr.name}
                        businessKey={pr.businessKey}
                        status={pr.governanceStatus}
                        phase={pr.currentPhase}
                        rollup={ru(pr.businessKey)}
                        expandable={pr.projects.length > 0}
                        expanded={isOpen(`pr:${pr.businessKey}`)}
                        onToggle={() => toggle(`pr:${pr.businessKey}`)}
                        onSelect={() => onSelectNode?.('program', pr.businessKey)}
                        selected={selectedKey === pr.businessKey}
                      />
                      {isOpen(`pr:${pr.businessKey}`) &&
                        pr.projects.map((p) => (
                          <Row
                            key={p.businessKey}
                            depth={3}
                            icon={<IconActivity className="h-4 w-4" />}
                            name={p.name}
                            businessKey={p.businessKey}
                            status={p.governanceStatus}
                            phase={p.lifecyclePhase}
                            rollup={ru(p.businessKey)}
                            onSelect={() => onSelectNode?.('project', p.businessKey)}
                            selected={selectedKey === p.businessKey}
                          />
                        ))}
                    </div>
                  ))}
              </div>
            ))}
        </div>
      ))}

      {tree.unattachedProjects.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Project-level (not attached to a program)
          </p>
          {tree.unattachedProjects.map((p) => (
            <Row
              key={p.businessKey}
              depth={0}
              icon={<IconActivity className="h-4 w-4" />}
              name={p.name}
              businessKey={p.businessKey}
              status={p.governanceStatus}
              phase={p.lifecyclePhase}
              rollup={ru(p.businessKey)}
              onSelect={() => onSelectNode?.('project', p.businessKey)}
              selected={selectedKey === p.businessKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
