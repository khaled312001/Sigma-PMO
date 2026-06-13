'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, clearApiKey, getApiKey, MeResponse } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/capabilities';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { IconLogIn, IconLogOut } from '../../components/Icons';
import { useI18n } from '../../lib/i18n';

export default function AccountPage() {
  const router = useRouter();
  const { lang } = useI18n();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyPreview = (getApiKey() ?? '').slice(0, 8);

  const refresh = useCallback(async () => {
    try { setMe(await api<MeResponse>('/auth/me')); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onSignOut = () => { clearApiKey(); router.push('/auth'); };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={lang === 'ar' ? 'الحساب' : 'Account'}
        title={lang === 'ar' ? 'جلستك الحالية' : 'Your session'}
        description={lang === 'ar' ? 'حالة تسجيل الدخول الحالية وصلاحيات الدور وبيانات المفتاح.' : 'Current sign-in state, role capabilities, and key information.'}
      />

      <ErrorBanner message={error} />

      {!me ? (
        <Card><p className="text-sm text-slate-400">{lang === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p></Card>
      ) : me.user ? (
        <Card title={lang === 'ar' ? 'مسجَّل الدخول' : 'Signed in'} hint={lang === 'ar' ? `موثَّق عبر مفتاح API ‏${keyPreview}…` : `Authenticated via API key ${keyPreview}…`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={lang === 'ar' ? 'الاسم المعروض' : 'Display name'} value={me.user.displayName} />
            <Field label={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}        value={me.user.email} />
            <Field label={lang === 'ar' ? 'الدور' : 'Role'}         value={<Pill tone="sky">{ROLE_LABEL[me.user.role]}</Pill>} />
            <Field label={lang === 'ar' ? 'نطاقات المشاريع' : 'Project scopes'} value={<code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">{me.user.projectScopes}</code>} />
          </div>
          <div className="mt-5 flex gap-2 border-t border-slate-800 pt-4">
            <Button variant="danger" size="sm" onClick={onSignOut}>
              <IconLogOut className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            </Button>
            <Link href="/help" className="inline-flex items-center rounded-lg border border-slate-700 px-3.5 py-2 text-sm text-slate-200 hover:border-slate-500">
              {lang === 'ar' ? 'عرض دليل الاستخدام' : 'View usage guide'}
            </Link>
          </div>
        </Card>
      ) : me.bootstrapMode ? (
        <EmptyState
          title={lang === 'ar' ? 'المنصّة في وضع التهيئة الأولى' : 'Platform is in bootstrap mode'}
          description={lang === 'ar' ? 'لا يوجد مستخدمون بعد. جميع نقاط الكتابة مفتوحة حالياً. أنشئ أوّل مسؤول عبر CLI الخادم لتفعيل التحكّم بالصلاحيات حسب الدور (RBAC).' : 'No users exist yet. Every write endpoint is currently open. Create the first admin via the backend CLI to enable RBAC.'}
          action={
            <Link href="/auth" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm text-white hover:bg-sky-500">
              <IconLogIn className="h-3.5 w-3.5" /> {lang === 'ar' ? 'صفحة تسجيل الدخول' : 'Sign-in page'}
            </Link>
          }
        />
      ) : (
        <EmptyState
          title={lang === 'ar' ? 'غير مسجَّل الدخول' : 'Not signed in'}
          description={lang === 'ar' ? 'الصق مفتاح API في صفحة تسجيل الدخول للوصول إلى الأسطح التشغيلية المسموح بها لدورك.' : 'Paste your API key on the sign-in page to access role-permitted operating surfaces.'}
          action={
            <Link href="/auth" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm text-white hover:bg-sky-500">
              <IconLogIn className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تسجيل الدخول' : 'Sign in'}
            </Link>
          }
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-100">{value}</div>
    </div>
  );
}
