'use client';

import { useEffect, useState } from 'react';

import { useToast } from '../../../components/ToastProvider';
import { api, UserRecord } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { useI18n } from '../../../lib/i18n';
import { Card, EmptyState, PageHeader, Pill } from '../../../components/ui';
import { ROLE_LABEL } from '../../../lib/capabilities';

export default function UsersAdminRoute() {
  return <AuthGate capability="canReadAll" surface="Users"><UsersAdmin /></AuthGate>;
}

function UsersAdmin() {
  const toast = useToast();
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRecord[] | null>(null);

  useEffect(() => {
    api<UserRecord[]>('/auth/users')
      .then(setUsers)
      .catch((e) => toast.error('Failed to load users', (e as Error).message));
  }, [toast]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.users.eyebrow')}
        title={t('admin.users.title')}
        description={t('admin.users.description')}
      />

      <Card padded={false}>
        {users === null ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" description="Platform is in bootstrap mode. Create the first admin to enable RBAC enforcement." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-900/40 text-left text-[10px] uppercase tracking-wider text-slate-400">
                <tr><th scope="col" className="px-5 py-2.5">Email</th><th scope="col" className="py-2.5">Name</th><th scope="col" className="py-2.5">Role</th><th scope="col" className="py-2.5">Scopes</th><th scope="col" className="py-2.5">Active</th><th scope="col" className="py-2.5 pr-5">Created</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                    <td className="px-5 py-2.5 text-slate-200">{u.email}</td>
                    <td className="py-2.5 text-slate-300">{u.displayName}</td>
                    <td className="py-2.5"><Pill tone="sky">{ROLE_LABEL[u.role]}</Pill></td>
                    <td className="py-2.5 font-mono text-xs text-slate-400">{u.projectScopes}</td>
                    <td className="py-2.5 text-xs">{u.active ? <Pill tone="emerald">yes</Pill> : <Pill tone="slate">no</Pill>}</td>
                    <td className="py-2.5 pr-5 text-xs text-slate-400">{new Date(u.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
