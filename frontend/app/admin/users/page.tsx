'use client';

import { useCallback, useEffect, useState } from 'react';

import { useToast } from '../../../components/ToastProvider';
import { useConfirm } from '../../../components/ConfirmDialog';
import { api, Role, UserRecord } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { useI18n } from '../../../lib/i18n';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { IconRefresh, IconUsers } from '../../../components/Icons';
import { CAPABILITIES, ROLE_LABEL } from '../../../lib/capabilities';
import { useMe } from '../../../lib/me-context';

const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[];

export default function UsersAdminRoute() {
  return <AuthGate capability="canReadAll" surface="Users"><UsersAdmin /></AuthGate>;
}

function UsersAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const { me } = useMe();
  const canManage = !!(me?.user?.role && CAPABILITIES[me.user.role].canManageRoles);

  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api<UserRecord[]>('/auth/users'));
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const del = async (u: UserRecord) => {
    const ok = await confirm({
      title: `Delete ${u.displayName}?`,
      description: `This permanently removes the account ${u.email}. This cannot be undone.`,
      confirmLabel: 'Delete user',
      destructive: true,
    });
    if (!ok) return;
    setBusy(u.id);
    try {
      await api(`/auth/users/${u.id}`, { method: 'DELETE' });
      toast.success('User deleted', u.email);
      await load();
    } catch (e) { toast.error('Delete failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const rotateKey = async (u: UserRecord) => {
    setBusy(u.id);
    try {
      const r = await api<{ apiKey: string }>(`/auth/users/${u.id}/rotate-key`, { method: 'POST' });
      toast.success('API key rotated', `New key (shown once): ${r.apiKey}`);
    } catch (e) { toast.error('Rotate failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const resetPassword = async (u: UserRecord) => {
    const pw = window.prompt(`New password for ${u.email} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) { toast.error('Password too short', 'Minimum 8 characters.'); return; }
    setBusy(u.id);
    try {
      await api(`/auth/users/${u.id}/set-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
      toast.success('Password reset', u.email);
    } catch (e) { toast.error('Reset failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.users.eyebrow')}
        title={t('admin.users.title')}
        description="Stakeholder accounts. Add, edit roles, reset passwords, rotate keys, or remove users."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canManage && <Button variant="primary" size="sm" onClick={() => { setShowCreate((v) => !v); setEditingId(null); }}><IconUsers className="h-3.5 w-3.5" /> New user</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {canManage && showCreate && (
        <CreateUserForm onCancel={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await load(); }} toast={toast} />
      )}

      <Card padded={false}>
        {users === null ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" description="Platform is in bootstrap mode. Create the first admin to enable RBAC enforcement." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-900/40 text-left text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-5 py-2.5">Email</th><th className="py-2.5">Name</th><th className="py-2.5">Role</th>
                  <th className="py-2.5">Scopes</th><th className="py-2.5">Active</th><th className="py-2.5">Created</th>
                  {canManage && <th className="py-2.5 pe-5 text-end">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  editingId === u.id ? (
                    <EditUserRow key={u.id} user={u} colSpan={canManage ? 7 : 6} onCancel={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await load(); }} toast={toast} />
                  ) : (
                    <tr key={u.id} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                      <td className="px-5 py-2.5 text-slate-200">{u.email}</td>
                      <td className="py-2.5 text-slate-300">{u.displayName}</td>
                      <td className="py-2.5"><Pill tone="sky">{ROLE_LABEL[u.role]}</Pill></td>
                      <td className="py-2.5 font-mono text-xs text-slate-400" dir="ltr">{u.projectScopes}</td>
                      <td className="py-2.5 text-xs">{u.active ? <Pill tone="emerald">yes</Pill> : <Pill tone="slate">no</Pill>}</td>
                      <td className="py-2.5 text-xs text-slate-400" dir="ltr">{new Date(u.createdAt).toLocaleDateString()}</td>
                      {canManage && (
                        <td className="py-2.5 pe-5">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <RowBtn onClick={() => { setEditingId(u.id); setShowCreate(false); }} disabled={busy === u.id}>Edit</RowBtn>
                            <RowBtn onClick={() => resetPassword(u)} disabled={busy === u.id}>Password</RowBtn>
                            <RowBtn onClick={() => rotateKey(u)} disabled={busy === u.id}>Rotate key</RowBtn>
                            <RowBtn onClick={() => del(u)} disabled={busy === u.id} danger>Delete</RowBtn>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {canManage && <p className="text-[11px] text-slate-500">New users + rotated keys show the raw API key once in a toast — copy it immediately. The sole active admin cannot be deleted, demoted, or deactivated.</p>}
    </div>
  );
}

function RowBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-md border px-2 py-1 text-[11px] transition disabled:opacity-40 ${danger ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10' : 'border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-800'}`}>
      {children}
    </button>
  );
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const labelCls = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

function CreateUserForm({ onCancel, onCreated, toast }: { onCancel: () => void; onCreated: () => void | Promise<void>; toast: ReturnType<typeof useToast> }) {
  const [email, setEmail] = useState('');
  const [displayName, setName] = useState('');
  const [role, setRole] = useState<Role>('contractor');
  const [password, setPassword] = useState('');
  const [projectScopes, setScopes] = useState('*');
  const [busy, setBusy] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && displayName.trim() && password.length >= 8;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api<{ id: string; apiKey: string }>('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), displayName: displayName.trim(), role, password, projectScopes: projectScopes.trim() || '*' }),
      });
      toast.success('User created', `${email} · API key (shown once): ${r.apiKey}`);
      await onCreated();
    } catch (e) { toast.error('Create failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Card title="New user">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Email</label><input className={inputCls} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        <div><label className={labelCls}>Display name</label><input className={inputCls} value={displayName} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className={labelCls}>Role</label>
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Password (min 8)</label><input className={inputCls} type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Project scopes (* = all)</label><input className={`${inputCls} font-mono`} dir="ltr" value={projectScopes} onChange={(e) => setScopes(e.target.value)} placeholder="* or P-1000,P-1001" /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={busy || !valid} onClick={submit}>{busy ? 'Creating…' : 'Create user'}</Button>
      </div>
    </Card>
  );
}

function EditUserRow({ user, colSpan, onCancel, onSaved, toast }: { user: UserRecord; colSpan: number; onCancel: () => void; onSaved: () => void | Promise<void>; toast: ReturnType<typeof useToast> }) {
  const [displayName, setName] = useState(user.displayName);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [projectScopes, setScopes] = useState(user.projectScopes);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/auth/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ displayName: displayName.trim(), role, active, projectScopes: projectScopes.trim() || '*' }) });
      toast.success('User updated', user.email);
      await onSaved();
    } catch (e) { toast.error('Update failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <tr className="border-t border-sky-500/30 bg-sky-500/[0.04]">
      <td className="px-5 py-2.5 text-slate-300" colSpan={colSpan}>
        <div className="flex flex-wrap items-end gap-3">
          <span className="font-mono text-xs text-slate-400" dir="ltr">{user.email}</span>
          <div><label className={labelCls}>Name</label><input className={`${inputCls} w-40`} value={displayName} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={`${inputCls} w-36`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Scopes</label><input className={`${inputCls} w-32 font-mono`} dir="ltr" value={projectScopes} onChange={(e) => setScopes(e.target.value)} /></div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-300"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          <div className="ms-auto flex items-center gap-2 pb-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={busy || !displayName.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
