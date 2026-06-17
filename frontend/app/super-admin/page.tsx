'use client';

/**
 * Platform SUPER_ADMIN console (multi-tenant SaaS). The super-admin sees the
 * normal dashboard chrome plus this surface: companies, subscriptions, and
 * support/requests across ALL companies, with a platform analytics roll-up.
 * Gated on `canManagePlatform`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../components/ui';

interface CompanyRow {
  id: string; slug: string; name: string; companyType: string; status: string; plan: string;
  ownerEmail: string | null; country: string | null; userCount: number;
  subscription: { id: string; plan: string; status: string; seats: number; mrr: string } | null;
}
interface SubRow { id: string; companyId: string; companyName: string | null; plan: string; status: string; seats: number; mrr: string; renewsAt: string | null }
interface ReqRow { id: string; companyId: string; companyName: string | null; kind: string; subject: string; body: string | null; status: string; createdByEmail: string | null; reply: string | null; createdAt: string }
interface Analytics {
  companies: { total: number; active: number; trial: number; suspended: number; cancelled: number; byType: Record<string, number> };
  users: number;
  subscriptions: { total: number; active: number; trial: number; totalMrr: number };
  openRequests: number;
}

type Tab = 'overview' | 'companies' | 'subscriptions' | 'requests';

export default function SuperAdminRoute() {
  return (
    <AuthGate capability="canManagePlatform" surface="Super Admin">
      <SuperAdminPage />
    </AuthGate>
  );
}

function SuperAdminPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>('overview');

  // Honor the sidebar sub-links (/super-admin?tab=…) so each opens its section.
  useEffect(() => {
    const q = search.get('tab');
    if (q && (['overview', 'companies', 'subscriptions', 'requests'] as string[]).includes(q)) {
      setTab(q as Tab);
    }
  }, [search]);
  const [an, setAn] = useState<Analytics | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [a, c, s, r] = await Promise.all([
        api<Analytics>('/super-admin/analytics'),
        api<CompanyRow[]>('/super-admin/companies'),
        api<SubRow[]>('/super-admin/subscriptions'),
        api<ReqRow[]>('/super-admin/requests'),
      ]);
      setAn(a); setCompanies(c); setSubs(s); setReqs(r);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setCompanyStatus = async (id: string, status: string) => {
    await api(`/super-admin/companies/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await refresh();
  };
  const setSubStatus = async (id: string, status: string) => {
    await api(`/super-admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await refresh();
  };
  const setReqStatus = async (id: string, status: string) => {
    await api(`/super-admin/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await refresh();
  };

  const tone = (s: string) => (s === 'active' ? 'emerald' : s === 'trial' ? 'sky' : s === 'open' ? 'amber' : s === 'suspended' || s === 'cancelled' ? 'rose' : 'slate') as 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ar ? 'منصّة · سوبر أدمن' : 'Platform · Super Admin'}
        title={ar ? 'إدارة المنصّة' : 'Platform Administration'}
        description={ar ? 'كل الشركات والاشتراكات والطلبات والدعم الفني عبر المنصّة.' : 'All companies, subscriptions and support/requests across the platform.'}
        actions={<Button variant="ghost" size="sm" onClick={() => void refresh()}>{ar ? 'تحديث' : 'Refresh'}</Button>}
      />
      <ErrorBanner message={err} />

      <div className="flex flex-wrap gap-2">
        {(['overview', 'companies', 'subscriptions', 'requests'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm transition ${tab === t ? 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/40' : 'text-slate-400 hover:text-slate-200'}`}>
            {t === 'overview' ? (ar ? 'نظرة عامة' : 'Overview') : t === 'companies' ? (ar ? 'الشركات' : 'Companies') : t === 'subscriptions' ? (ar ? 'الاشتراكات' : 'Subscriptions') : (ar ? 'الطلبات والدعم' : 'Requests & Support')}
          </button>
        ))}
      </div>

      {tab === 'overview' && an && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: ar ? 'الشركات' : 'Companies', v: an.companies.total },
            { k: ar ? 'نشطة' : 'Active', v: an.companies.active },
            { k: ar ? 'تجريبية' : 'Trial', v: an.companies.trial },
            { k: ar ? 'المستخدمون' : 'Users', v: an.users },
            { k: 'MRR', v: `$${an.subscriptions.totalMrr}` },
            { k: ar ? 'اشتراكات نشطة' : 'Active subs', v: an.subscriptions.active },
            { k: ar ? 'طلبات مفتوحة' : 'Open requests', v: an.openRequests },
            { k: ar ? 'موقوفة' : 'Suspended', v: an.companies.suspended },
          ].map((s) => (
            <Card key={s.k}><div className="text-center"><div className="text-2xl font-bold text-sky-300">{s.v}</div><div className="mt-1 text-[11px] text-slate-400">{s.k}</div></div></Card>
          ))}
        </div>
      )}

      {tab === 'companies' && (
        <Card>
          <div className="overflow-x-auto text-sm">
            <table className="w-full">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">{ar ? 'الشركة' : 'Company'}</th><th>{ar ? 'النوع' : 'Type'}</th><th>{ar ? 'المستخدمون' : 'Users'}</th><th>{ar ? 'الخطة' : 'Plan'}</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'إجراء' : 'Action'}</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-t border-slate-800">
                    <td className="py-2"><div className="font-medium text-slate-100">{c.name}</div><div className="text-[11px] text-slate-500" dir="ltr">{c.ownerEmail}</div></td>
                    <td><Pill tone="slate">{c.companyType}</Pill></td>
                    <td>{c.userCount}</td>
                    <td>{c.subscription?.plan ?? c.plan}</td>
                    <td><Pill tone={tone(c.status)}>{c.status}</Pill></td>
                    <td>
                      {c.status !== 'suspended'
                        ? <Button variant="ghost" size="sm" onClick={() => void setCompanyStatus(c.id, 'suspended')}>{ar ? 'إيقاف' : 'Suspend'}</Button>
                        : <Button variant="ghost" size="sm" onClick={() => void setCompanyStatus(c.id, 'active')}>{ar ? 'تفعيل' : 'Activate'}</Button>}
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">{ar ? 'لا توجد شركات بعد' : 'No companies yet'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'subscriptions' && (
        <Card>
          <div className="overflow-x-auto text-sm">
            <table className="w-full">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-2">{ar ? 'الشركة' : 'Company'}</th><th>{ar ? 'الخطة' : 'Plan'}</th><th>{ar ? 'المقاعد' : 'Seats'}</th><th>MRR</th><th>{ar ? 'الحالة' : 'Status'}</th><th>{ar ? 'إجراء' : 'Action'}</th></tr></thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-t border-slate-800">
                    <td className="py-2 text-slate-100">{s.companyName}</td><td>{s.plan}</td><td>{s.seats}</td><td>${s.mrr}</td>
                    <td><Pill tone={tone(s.status)}>{s.status}</Pill></td>
                    <td>{s.status !== 'active' ? <Button variant="ghost" size="sm" onClick={() => void setSubStatus(s.id, 'active')}>{ar ? 'تفعيل' : 'Activate'}</Button> : <Button variant="ghost" size="sm" onClick={() => void setSubStatus(s.id, 'cancelled')}>{ar ? 'إلغاء' : 'Cancel'}</Button>}</td>
                  </tr>
                ))}
                {subs.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">—</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          {reqs.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2"><Pill tone="slate">{r.kind}</Pill><Pill tone={tone(r.status)}>{r.status}</Pill><span className="font-medium text-slate-100">{r.subject}</span></div>
                  <div className="mt-1 text-xs text-slate-400">{r.companyName} · <span dir="ltr">{r.createdByEmail}</span></div>
                  {r.body && <p className="mt-2 text-sm text-slate-300">{r.body}</p>}
                </div>
                <div className="flex gap-2">
                  {r.status !== 'in_progress' && <Button variant="ghost" size="sm" onClick={() => void setReqStatus(r.id, 'in_progress')}>{ar ? 'قيد المعالجة' : 'In progress'}</Button>}
                  {r.status !== 'resolved' && <Button variant="ghost" size="sm" onClick={() => void setReqStatus(r.id, 'resolved')}>{ar ? 'حل' : 'Resolve'}</Button>}
                </div>
              </div>
            </Card>
          ))}
          {reqs.length === 0 && <Card><p className="py-3 text-center text-sm text-slate-500">{ar ? 'لا توجد طلبات' : 'No requests'}</p></Card>}
        </div>
      )}
    </div>
  );
}
