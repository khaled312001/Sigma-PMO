'use client';

import type { GovTree, HierarchySel, TreePortfolioLite, TreeProgramLite } from '../lib/hierarchy';

/**
 * Reusable Enterprise → Portfolio → Program → Phase selector (Mr. Ayham,
 * 2026-06-21). Controlled: the parent holds a HierarchySel + the loaded GovTree.
 * Used by the Projects "Add/Edit" form and the Universal Input page so a project
 * can be assigned to any client / portfolio / program / phase from either place.
 */
export function HierarchyPicker({ value, onChange, tree, isAr }: {
  value: HierarchySel;
  onChange: (v: HierarchySel) => void;
  tree: GovTree | null;
  isAr: boolean;
}) {
  const set = (patch: Partial<HierarchySel>) => onChange({ ...value, ...patch });
  const enterprises = tree?.enterprises ?? [];
  const ent = enterprises.find((e) => e.businessKey === value.entSel);
  const portfolios: TreePortfolioLite[] = ent ? ent.portfolios : [];
  const pf = portfolios.find((p) => p.businessKey === value.pfSel);
  const programs: TreeProgramLite[] = pf ? pf.programs : [];
  const field = 'mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/70 focus:outline-none';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Client (Enterprise) */}
      <label className="block text-xs font-medium text-slate-300">{isAr ? 'العميل (المؤسسة)' : 'Client (Enterprise)'}
        <select value={value.entSel} onChange={(e) => set({ entSel: e.target.value, pfSel: '', progSel: '' })} dir="auto" className={field}>
          <option value="">{isAr ? '— بدون —' : '— None —'}</option>
          {enterprises.map((en) => <option key={en.businessKey} value={en.businessKey}>{en.name}</option>)}
          <option value="__new__">{isAr ? '➕ عميل جديد…' : '➕ New client…'}</option>
        </select>
        {value.entSel === '__new__' && (
          <input value={value.entNewName} onChange={(e) => set({ entNewName: e.target.value })} placeholder={isAr ? 'اسم العميل الجديد' : 'New client name'} dir="auto" className={field} />
        )}
      </label>

      {/* Portfolio */}
      {value.entSel && (
        <label className="block text-xs font-medium text-slate-300">{isAr ? 'المحفظة (Portfolio)' : 'Portfolio'}
          <select value={value.pfSel} onChange={(e) => set({ pfSel: e.target.value, progSel: '' })} dir="auto" className={field}>
            <option value="">{isAr ? '— بدون محفظة —' : '— No portfolio —'}</option>
            {value.entSel !== '__new__' && portfolios.map((p) => <option key={p.businessKey} value={p.businessKey}>{p.name}</option>)}
            <option value="__new__">{isAr ? '➕ محفظة جديدة…' : '➕ New portfolio…'}</option>
          </select>
          {value.pfSel === '__new__' && (
            <input value={value.pfNewName} onChange={(e) => set({ pfNewName: e.target.value })} placeholder={isAr ? 'اسم المحفظة' : 'Portfolio name'} dir="auto" className={field} />
          )}
        </label>
      )}

      {/* Program (links related projects / phases) */}
      {value.pfSel && (
        <label className="block text-xs font-medium text-slate-300">{isAr ? 'البرنامج (ربط)' : 'Program (link)'}
          <select value={value.progSel} onChange={(e) => set({ progSel: e.target.value })} dir="auto" className={field}>
            <option value="">{isAr ? '— مستقل (بدون برنامج) —' : '— Standalone (no program) —'}</option>
            {value.pfSel !== '__new__' && programs.map((p) => <option key={p.businessKey} value={p.businessKey}>{p.name}</option>)}
            <option value="__new__">{isAr ? '➕ برنامج جديد…' : '➕ New program…'}</option>
          </select>
          {value.progSel === '__new__' && (
            <input value={value.progNewName} onChange={(e) => set({ progNewName: e.target.value })} placeholder={isAr ? 'اسم البرنامج (مثال: مراحل برج النيل)' : 'Program name (e.g. Nile Tower phases)'} dir="auto" className={field} />
          )}
        </label>
      )}

      {/* Phase */}
      {value.entSel && (
        <label className="block text-xs font-medium text-slate-300">{isAr ? 'المرحلة (اختياري)' : 'Phase (optional)'}
          <input value={value.phaseLabel} onChange={(e) => set({ phaseLabel: e.target.value })} placeholder={isAr ? 'مثال: Phase 1' : 'e.g. Phase 1'} dir="auto" className={field} />
        </label>
      )}
    </div>
  );
}
