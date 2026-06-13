'use client';

/**
 * /admin/roles — the admin role-permission control (canManageRoles, admin-only).
 * Toggle any role's capabilities at runtime; the change is enforced immediately
 * by the backend guard (CapabilitiesService). The sigma_admin column is locked.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { IconRefresh, IconShield } from '../../../components/Icons';
import { useToast } from '../../../components/ToastProvider';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { api, Role } from '../../../lib/api';
import { ROLE_LABEL } from '../../../lib/capabilities';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';

type Matrix = Record<string, Record<string, boolean>>;
interface Snapshot { roles: string[]; flags: string[]; matrix: Matrix; overrides: { role: string; capability: string }[] }

/** Locked flags (lockout protection — backend refuses to change these). */
const LOCKED_FLAGS = new Set(['canRead', 'canManageRoles']);

export default function RolesAdminRoute() {
  return (
    <AuthGate capability="canManageRoles" surface="Role management">
      <RolesAdminPage />
    </AuthGate>
  );
}

function RolesAdminPage() {
  const toast = useToast();
  const { lang } = useI18n();
  const { refresh: refreshMe } = useMe();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSnap(await api<Snapshot>('/admin/capabilities'));
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isOverridden = (role: string, cap: string) =>
    !!snap?.overrides.some((o) => o.role === role && o.capability === cap);

  const toggle = async (role: string, capability: string, current: boolean) => {
    const key = `${role}:${capability}`;
    setBusy(key);
    try {
      const updated = await api<Snapshot>('/admin/capabilities', {
        method: 'POST',
        body: JSON.stringify({ role, capability, enabled: !current }),
      });
      setSnap(updated);
      toast.success(
        lang === 'ar' ? 'تم تحديث الصلاحية' : 'Permission updated',
        `${ROLE_LABEL[role as Role] ?? role} · ${capability} → ${!current ? (lang === 'ar' ? 'مُفعّل' : 'on') : (lang === 'ar' ? 'مُعطّل' : 'off')}`,
      );
      await refreshMe(); // re-sync the live nav for the current session
    } catch (e) {
      toast.error(lang === 'ar' ? 'تعذّر التحديث' : 'Update failed', (e as Error).message);
    } finally { setBusy(null); }
  };

  const reset = async (role?: string) => {
    setBusy(role ? `reset:${role}` : 'reset:all');
    try {
      const updated = await api<Snapshot>('/admin/capabilities/reset', {
        method: 'POST', body: JSON.stringify(role ? { role } : {}),
      });
      setSnap(updated);
      toast.success(
        lang === 'ar' ? 'تمت الإعادة إلى الإعدادات الافتراضية' : 'Reset to defaults',
        role ? (ROLE_LABEL[role as Role] ?? role) : (lang === 'ar' ? 'جميع الأدوار' : 'all roles'),
      );
      await refreshMe();
    } catch (e) { toast.error(lang === 'ar' ? 'تعذّرت الإعادة للإعدادات' : 'Reset failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const roles = snap?.roles ?? [];
  const flags = snap?.flags ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={lang === 'ar' ? 'الإدارة · التحكم في الصلاحيات' : 'Admin · Access control'}
        title={lang === 'ar' ? 'صلاحيات الأدوار' : 'Role Permissions'}
        description={lang === 'ar'
          ? 'تحكّم في صلاحيات أي دور — تُطبَّق التغييرات فوراً عبر حارس الصلاحيات في الخادم. عمود Sigma Admin مُقفل، ولا يمكن تعطيل canRead / canManageRoles (حماية من فقدان الوصول).'
          : "Toggle any role's capabilities — changes are enforced immediately by the backend guard. The Sigma Admin column is locked, and canRead / canManageRoles cannot be disabled (lockout protection)."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تحديث' : 'Refresh'}</Button>
            <Button variant="danger" size="sm" disabled={busy === 'reset:all'} onClick={() => reset()}>{lang === 'ar' ? 'إعادة الكل للإعدادات الافتراضية' : 'Reset all to defaults'}</Button>
          </div>
        }
      />
      <ErrorBanner message={error} />

      {snap === null ? (
        <Card><div className="h-64 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="sticky start-0 z-10 bg-slate-900/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-slate-400">Capability</th>
                  {roles.map((r) => (
                    <th key={r} className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-semibold text-slate-200">{ROLE_LABEL[r as Role] ?? r}</span>
                        {r === 'sigma_admin' ? (
                          <Pill tone="rose"><IconShield className="me-1 inline h-3 w-3" />locked</Pill>
                        ) : (
                          <button type="button" onClick={() => reset(r)} disabled={busy === `reset:${r}`} className="text-[9px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">reset</button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flags.map((cap) => (
                  <tr key={cap} className="border-b border-slate-800/50 last:border-b-0 hover:bg-slate-900/30">
                    <td className="sticky start-0 z-10 bg-slate-900/95 px-4 py-2 font-mono text-[11px] text-slate-300" dir="ltr">
                      {cap}
                      {LOCKED_FLAGS.has(cap) && <span className="ms-1.5 text-[9px] text-amber-400/70">locked</span>}
                    </td>
                    {roles.map((r) => {
                      const on = !!snap.matrix[r]?.[cap];
                      const locked = r === 'sigma_admin' || LOCKED_FLAGS.has(cap);
                      const overridden = isOverridden(r, cap);
                      const key = `${r}:${cap}`;
                      return (
                        <td key={key} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={locked || busy === key}
                            onClick={() => toggle(r, cap, on)}
                            aria-pressed={on}
                            title={overridden ? 'overridden from default' : 'default'}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                              on ? 'bg-emerald-500/80' : 'bg-slate-700'
                            } ${locked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:ring-2 hover:ring-sky-500/40'} ${
                              overridden ? 'ring-2 ring-amber-400/60' : ''
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded-full bg-emerald-500/80" /> enabled</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded-full bg-slate-700" /> disabled</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded-full bg-slate-700 ring-2 ring-amber-400/60" /> overridden from default</span>
          </div>
        </Card>
      )}
    </div>
  );
}
