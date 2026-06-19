'use client';

import { useState } from 'react';

import { api } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/me-context';
import { useToast } from './ToastProvider';
import { Button } from './ui';

/**
 * Reusable edit/delete control for ANY result row (Mr. Ayham, 2026-06-20). Calls
 * the generic, tenant-safe, audited /records API. Only the governance-evaluation
 * tier sees it. Drop it next to any result across any page.
 */
export function RecordActions({
  table, id, record, fields = ['label', 'value', 'status'], onChanged, compact = true,
}: {
  table: string;
  id: string;
  record?: Record<string, unknown>;
  fields?: string[];
  onChanged?: () => void;
  compact?: boolean;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const { me } = useMe();
  const canManage = !!me?.user && CAPABILITIES[me.user.role].canEvaluateRules;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, record && record[f] != null ? String(record[f]) : ''])),
  );

  if (!canManage) return null;

  const del = async () => {
    if (!window.confirm(isAr ? 'حذف هذه النتيجة نهائياً؟' : 'Delete this result permanently?')) return;
    setBusy(true);
    try {
      await api(`/records/${table}/${id}`, { method: 'DELETE' });
      toast.success(isAr ? 'تم الحذف' : 'Deleted');
      onChanged?.();
    } catch (e) { toast.error(isAr ? 'فشل الحذف' : 'Delete failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, string> = {};
      for (const f of fields) if (draft[f] !== undefined) body[f] = draft[f];
      await api(`/records/${table}/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast.success(isAr ? 'تم التعديل' : 'Saved');
      setEditing(false);
      onChanged?.();
    } catch (e) { toast.error(isAr ? 'فشل التعديل' : 'Save failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" title={isAr ? 'تعديل' : 'Edit'} disabled={busy} onClick={() => setEditing((v) => !v)}
        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-sky-300">✎</button>
      <button type="button" title={isAr ? 'حذف' : 'Delete'} disabled={busy} onClick={del}
        className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300">🗑</button>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-950 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-100">{isAr ? 'تعديل النتيجة' : 'Edit result'}</p>
            <div className="mt-3 space-y-2">
              {fields.map((f) => (
                <label key={f} className="block">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">{f}</span>
                  {f === 'value' || f === 'details' || f === 'notes' || f === 'description' ? (
                    <textarea value={draft[f] ?? ''} rows={3} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                      className="mt-0.5 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                  ) : (
                    <input value={draft[f] ?? ''} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                      className="mt-0.5 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={save}>{isAr ? 'حفظ' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
