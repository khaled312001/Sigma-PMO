import { api } from './api';

// ── Governance-tree shapes (Enterprise → Portfolio → Program → Project[/Phase]). ──
export interface TreeProjectLite { businessKey: string; lifecyclePhase?: string | null }
export interface TreeProgramLite { businessKey: string; name: string; projects?: TreeProjectLite[] }
export interface TreePortfolioLite { businessKey: string; name: string; programs: TreeProgramLite[] }
export interface TreeEnterpriseLite { businessKey: string; name: string; portfolios: TreePortfolioLite[] }
export interface GovTree { enterprises: TreeEnterpriseLite[]; unattachedProjects?: TreeProjectLite[] }

/** The user's hierarchy choices: each level is '' (none) | a businessKey | '__new__'. */
export interface HierarchySel {
  entSel: string; entNewName: string;
  pfSel: string; pfNewName: string;
  progSel: string; progNewName: string;
  phaseLabel: string;
}
export const emptyHierarchySel = (): HierarchySel => ({
  entSel: '', entNewName: '', pfSel: '', pfNewName: '', progSel: '', progNewName: '', phaseLabel: '',
});

/** Stable governance-node key from a name (latin slug, else a short hash for Arabic). */
export function slugKey(prefix: string, name: string): string {
  const latin = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  if (latin) return `${prefix}-${latin}`;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${prefix}-${h.toString(36).toUpperCase()}`;
}

/** Create a governance node, treating an "already exists" response as success (idempotent). */
async function ensureNode(path: string, body: Record<string, unknown>): Promise<void> {
  try { await api(path, { method: 'POST', body: JSON.stringify(body) }); }
  catch (e) { if (!/already exists/i.test((e as Error).message)) throw e; }
}

/** Resolve the chosen Enterprise (creating it when new). Returns {key,name} (nulls when none). */
export async function resolveEnterprise(sel: HierarchySel, tree: GovTree): Promise<{ key: string | null; name: string | null }> {
  if (!sel.entSel) return { key: null, name: null };
  if (sel.entSel === '__new__') {
    const name = sel.entNewName.trim();
    if (!name) return { key: null, name: null };
    const key = slugKey('ENT', name);
    await ensureNode('/hierarchy/enterprise', { businessKey: key, name });
    return { key, name };
  }
  return { key: sel.entSel, name: tree.enterprises.find((e) => e.businessKey === sel.entSel)?.name ?? null };
}

/**
 * Place an EXISTING project under the chosen Portfolio → Program (creating them when
 * new) and set its phase. Reuses the /hierarchy endpoints; idempotent.
 */
export async function placeProjectInHierarchy(projectKey: string, sel: HierarchySel, entKey: string | null, entName: string | null): Promise<void> {
  if (entKey) {
    let portfolioKey: string | null = null;
    if (sel.pfSel) {
      if (sel.pfSel === '__new__') {
        const pfn = sel.pfNewName.trim() || `${entName} — Portfolio`;
        portfolioKey = slugKey('PF', pfn);
        await ensureNode('/hierarchy/portfolio', { businessKey: portfolioKey, name: pfn, enterpriseBusinessKey: entKey });
      } else portfolioKey = sel.pfSel;
    }
    let programKey: string | null = null;
    if (sel.progSel) {
      if (sel.progSel === '__new__') {
        const pn = sel.progNewName.trim();
        if (pn) {
          if (!portfolioKey) {
            portfolioKey = slugKey('PF', entName || projectKey);
            await ensureNode('/hierarchy/portfolio', { businessKey: portfolioKey, name: `${entName ?? 'Client'} — Portfolio`, enterpriseBusinessKey: entKey });
          }
          programKey = slugKey('PRG', pn);
          await ensureNode('/hierarchy/program', { businessKey: programKey, name: pn, portfolioBusinessKey: portfolioKey });
        }
      } else programKey = sel.progSel;
    }
    if (programKey) await api('/hierarchy/attach', { method: 'POST', body: JSON.stringify({ projectKey, programKey }) });
  }
  if (sel.phaseLabel.trim()) {
    await api('/hierarchy/phase', { method: 'POST', body: JSON.stringify({ projectKey, phase: sel.phaseLabel.trim() }) });
  }
}

/** Find a project's current placement (enterprise/portfolio/program/phase) in the tree. */
export function locateInTree(tree: GovTree, key: string): { entKey: string | null; pfKey: string | null; progKey: string | null; phase: string | null } {
  for (const e of tree.enterprises) {
    for (const pf of e.portfolios) {
      for (const pr of pf.programs) {
        const found = (pr.projects ?? []).find((p) => p.businessKey === key);
        if (found) return { entKey: e.businessKey, pfKey: pf.businessKey, progKey: pr.businessKey, phase: found.lifecyclePhase ?? null };
      }
    }
  }
  const un = (tree.unattachedProjects ?? []).find((p) => p.businessKey === key);
  return { entKey: null, pfKey: null, progKey: null, phase: un?.lifecyclePhase ?? null };
}
