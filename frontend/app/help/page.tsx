'use client';

import Link from 'next/link';

import { Card, PageHeader, Pill } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

type Tone = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose';

export default function HelpPage() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';

  const STEPS: Array<{ surface: string; title: string; description: string; href: string; tone: Tone }> = [
    {
      surface: isAr ? 'الإدخال' : 'Input',
      title: isAr ? 'ارفع ملف P6 / Excel / CSV' : 'Upload a P6 / Excel / CSV file',
      description: isAr
        ? 'يُعنوَن الملف بمحتواه (SHA-256)، ويُؤرشَف بصورة غير قابلة للتعديل، ثم يُمرَّر عبر مسار الإدخال القياسي. وتُرفق درجة ثقة بالبيانات بكل عملية إدخال.'
        : 'The file is content-addressed (SHA-256), archived immutably, and pushed through the canonical ingestion pipeline. A data-confidence score is attached to every run.',
      href: '/input',
      tone: 'sky',
    },
    {
      surface: isAr ? 'المراجعة' : 'Review',
      title: isAr ? 'قيّم محرّك القواعد واتّخذ القرار' : 'Evaluate the rule engine + decide',
      description: isAr
        ? 'اكتشف انزلاقات الجدول الزمني وتجاوزات التكلفة والأنشطة المتأخرة عن الخطة ونقص استغلال الموارد والتقارير المتقادمة. وكل ملاحظة مقترنة بربطها بـ FIDIC ومستوى التصعيد ومكتبة التدخّلات.'
        : 'Detect schedule slips, cost overruns, behind-plan activities, resource underuse, and stale reporting. Each finding is paired with its FIDIC mapping, escalation level, and intervention library.',
      href: '/review',
      tone: 'emerald',
    },
    {
      surface: isAr ? 'الأدلة' : 'Evidence',
      title: isAr ? 'تتبّع أي تنبيه حتى بايتات مصدره' : 'Trace any alert back to source bytes',
      description: isAr
        ? 'لأي تنبيه، اعرض السطر القياسي الذي أطلقه وعملية الإدخال والملف المصدر (مع SHA-256) والحمولة الأصلية بعد التحليل (rawSource).'
        : 'For any alert, view the triggering canonical row, the ingestion run, the source file (with SHA-256), and the original parsed payload (rawSource).',
      href: '/evidence',
      tone: 'violet',
    },
    {
      surface: isAr ? 'الاعتماد' : 'Approval',
      title: isAr ? 'اعتمِد / ارفض / أقِرّ القرارات' : 'Approve / Reject / Acknowledge decisions',
      description: isAr
        ? 'إجراءات الأطراف المعنية إضافية فقط — كل إجراء مختوم زمنياً ومنسوب إلى صاحبه. وأحدث إجراء على قرارٍ ما هو حالته السارية.'
        : 'Stakeholder actions are append-only — every action is timestamped against the actor. The latest action on a decision is its current state.',
      href: '/approval',
      tone: 'amber',
    },
    {
      surface: isAr ? 'السياسات' : 'Policy',
      title: isAr ? 'حرّر سياسة الحوكمة' : 'Edit governance policy',
      description: isAr
        ? 'حرّر ربط FIDIC والمساءلة وطبقات التصعيد ومكتبة التدخّلات. وكل حفظ يُنشئ إصداراً جديداً مع الاحتفاظ بالإصدارات السابقة.'
        : 'Edit the FIDIC mapping, accountability, escalation tiers, and intervention library. Every save is a new version; prior versions are preserved.',
      href: '/admin/policy',
      tone: 'rose',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'المساعدة' : 'Help'}
        title={isAr ? 'كيفية استخدام سيجما PMO' : 'How to use Sigma PMO'}
        description={isAr
          ? 'جولة موجزة عبر الأسطح الأساسية الخمسة للمنصّة. يفتح كل رابط أدناه ذلك السطح داخل هذه الوحدة.'
          : 'A short tour through the five core surfaces of the platform. Each link below opens that surface in this console.'}
      />

      <Card title={isAr ? 'حلقة عمل مكتب إدارة المشاريع' : 'The PMO loop'}>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.href} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">{i + 1}</div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={s.tone}>{s.surface}</Pill>
                  <Link href={s.href} className="text-sm font-medium text-slate-100 hover:text-sky-300">{s.title} →</Link>
                </div>
                <p className="mt-1 text-xs text-slate-400">{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title={isAr ? 'وضع التهيئة الأولى والتحكّم بالصلاحيات (RBAC)' : 'Bootstrap mode & RBAC'}>
        <p className="text-sm text-slate-200">
          {isAr ? (
            <>عندما لا توجد سجلّات <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">User</code>، تعمل المنصّة في <strong className="text-amber-300">وضع التهيئة الأولى</strong>: تكون جميع نقاط الكتابة مفتوحة لإتاحة إنشاء أوّل مسؤول.</>
          ) : (
            <>When no <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">User</code> rows exist, the platform runs in <strong className="text-amber-300">bootstrap mode</strong>: every write endpoint is open so the first admin can be created.</>
          )}
        </p>
        <p className="mt-3 text-sm text-slate-300">{isAr ? 'أنشئ أوّل مسؤول من خادم الواجهة الخلفية:' : 'Create the first admin from the backend host:'}</p>
        <pre dir="ltr" className="mt-2 overflow-auto rounded-lg bg-black/40 p-3 text-[12px] leading-snug text-slate-200">
{`cd backend
npm run user:create -- you@sigma-pmo.com sigma_admin "Your Name"`}
        </pre>
        <p className="mt-3 text-sm text-slate-300">
          {isAr ? (
            <>تطبع أداة CLI مفتاح API الخام <strong>مرّة واحدة</strong>. الصقه في <Link href="/auth" className="text-sky-300 hover:text-sky-200">صفحة تسجيل الدخول</Link>. ومن تلك اللحظة يبدأ فرض التحكّم بالصلاحيات حسب الدور (RBAC)، وتُرشَّح أسطح الشريط الجانبي وفق دور المستخدم.</>
          ) : (
            <>The CLI prints the raw API key <strong>once</strong>. Paste it on the <Link href="/auth" className="text-sky-300 hover:text-sky-200">sign-in page</Link>. From that moment on, RBAC enforcement applies and the sidebar surfaces filter to the user&rsquo;s role.</>
          )}
        </p>
      </Card>

      <Card title={isAr ? 'الأدوار والصلاحيات' : 'Roles & capabilities'}>
        <ul className="space-y-2 text-sm text-slate-200">
          <li><Pill tone="rose">Sigma Admin</Pill> &nbsp; {isAr ? 'صلاحية كاملة تشمل السياسات والمستخدمين' : 'full access including Policy & Users'}</li>
          <li><Pill tone="rose">Sigma Reviewer</Pill> &nbsp; {isAr ? 'المراجعة / الأدلة / الاعتماد (دون تحرير السياسات)' : 'Review / Evidence / Approval (no policy edit)'}</li>
          <li><Pill tone="sky">Client</Pill> &nbsp; {isAr ? 'مثل المراجِع، إضافةً إلى تحرير السياسات' : 'same as Reviewer, plus Policy editing'}</li>
          <li><Pill tone="emerald">Consultant</Pill> &nbsp; {isAr ? 'الإدخال / المراجعة / الأدلة / الاعتماد' : 'Input / Review / Evidence / Approval'}</li>
          <li><Pill tone="amber">Contractor</Pill> &nbsp; {isAr ? 'الإدخال فقط' : 'Input only'}</li>
        </ul>
      </Card>
    </div>
  );
}
