'use client';

import { useEffect, useState } from 'react';

import { api, UserRecord } from '../../../lib/api';

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<UserRecord[]>('/auth/users').then(setUsers).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-xs text-slate-400">RBAC principals. New users are created via the CLI: <code className="rounded bg-slate-800 px-1 py-0.5">npm run user:create -- email role &quot;Name&quot; [scopes]</code></p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="overflow-hidden rounded border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr><th className="px-3 py-2">Email</th><th>Name</th><th>Role</th><th>Scopes</th><th>Active</th><th>Created</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No users yet — platform in bootstrap mode.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-t border-slate-800/70">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.displayName}</td>
                <td className="px-3 py-2"><span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{u.role}</span></td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{u.projectScopes}</td>
                <td className="px-3 py-2 text-xs">{u.active ? <span className="text-emerald-300">yes</span> : <span className="text-slate-500">no</span>}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{new Date(u.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
