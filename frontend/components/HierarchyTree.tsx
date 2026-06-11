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

function Row({
  depth,
  icon,
  name,
  businessKey,
  status,
  phase,
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
      <GovernanceStatusBadge status={status} size="sm" showLabel={false} />
    </div>
  );
}

export function HierarchyTree({
  tree,
  selectedKey,
  onSelectNode,
}: {
  tree: GovernanceTree;
  selectedKey?: string | null;
  onSelectNode?: (nodeType: string, businessKey: string) => void;
}) {
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
              onSelect={() => onSelectNode?.('project', p.businessKey)}
              selected={selectedKey === p.businessKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
