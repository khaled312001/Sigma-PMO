'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

// ── API response shapes (mirror backend acceptance.catalog + acceptance.service) ──

interface AcceptanceTest {
  id: string;
  title: string;
  lifecycleStage: string;
  inputs: string[];
  expectedOutputs: string[];
  successCriteria: string;
  agentKey?: string;
  automatable: boolean;
}

type AcceptanceStatus = 'pass' | 'fail' | 'skipped';

interface AcceptanceTestResult {
  id: string;
  title: string;
  lifecycleStage: string;
  agentKey?: string;
  status: AcceptanceStatus;
  evidence: Record<string, unknown>;
  reason: string | null;
}

interface AcceptanceRunReport {
  projectKey: string;
  ranAt: string | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: AcceptanceTestResult[];
}

export default function AcceptanceRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Acceptance Program">
      <AcceptancePage />
    </AuthGate>
  );
}

function AcceptancePage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [catalog, setCatalog] = useState<AcceptanceTest[]>([]);
  const [report, setReport] = useState<AcceptanceRunReport | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const tests = await api<AcceptanceTest[]>('/acceptance/catalog');
      setCatalog(tests);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل كتالوج الاختبارات' : 'Failed to load test catalog', (e as Error).message);
    }
  }, [toast, ar]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const runAll = async () => {
    setRunning(true);
    try {
      const result = await api<AcceptanceRunReport>('/acceptance/run', {
        method: 'POST',
        body: JSON.stringify({ projectKey }),
      });
      setReport(result);
      toast.success(
        ar ? 'اكتمل برنامج القبول' : 'Acceptance program complete',
        ar
          ? `${result.passed} ناجح · ${result.failed} فاشل · ${result.skipped} متخطّى`
          : `${result.passed} passed · ${result.failed} failed · ${result.skipped} skipped`,
      );
    } catch (e) {
      toast.error(ar ? 'فشل تشغيل البرنامج' : 'Run failed', (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  // Stitch each catalog entry to its latest result (if a run happened).
  const resultById = new Map<string, AcceptanceTestResult>(
    (report?.results ?? []).map((r) => [r.id, r]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ar ? 'التحقّق · برنامج القبول' : 'VALIDATION · ACCEPTANCE PROGRAM'}
        title={ar ? 'إطار التحقّق والقبول من سيجما' : 'Sigma Validation / Acceptance Framework'}
        description={ar
          ? 'برنامج القبول الرسمي المكوّن من 23 اختباراً لإعلان جاهزية سيجما للإنتاج والسوق. كل اختبار يُنفَّذ مقابل خدمات المنصّة الحيّة ويُرجِع نجاح/فشل مع الأدلّة.'
          : 'The formal 23-test acceptance program for declaring Sigma production-ready and market-ready. Each test runs against the live platform services and returns pass/fail with evidence.'}
        actions={(
          <Button variant="success" disabled={running} onClick={runAll}>
            {running ? (ar ? 'جارٍ التشغيل…' : 'Running…') : (ar ? 'تشغيل كل الاختبارات' : 'Run all tests')}
          </Button>
        )}
      />

      {/* Summary ribbon (after a run) */}
      {report && (
        <Card
          title={ar ? 'ملخّص التشغيل' : 'Run summary'}
          hint={report.ranAt ? `${ar ? 'حتى' : 'as of'} ${report.ranAt} · ${report.projectKey}` : report.projectKey}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tally label={ar ? 'الإجمالي' : 'Total'} value={report.total} tone="slate" />
            <Tally label={ar ? 'ناجح' : 'Passed'} value={report.passed} tone="emerald" />
            <Tally label={ar ? 'فاشل' : 'Failed'} value={report.failed} tone="rose" />
            <Tally label={ar ? 'متخطّى' : 'Skipped'} value={report.skipped} tone="amber" />
          </div>
        </Card>
      )}

      {/* The 23-test matrix */}
      <Card
        title={ar ? 'مصفوفة الاختبارات (23)' : '23-test matrix'}
        hint={ar ? 'انقر على أي صف لعرض المخرجات المتوقّعة والأدلّة' : 'Click any row to expand expected outputs + evidence'}
      >
        {catalog.length === 0 ? (
          <EmptyState
            title={ar ? 'جارٍ تحميل الكتالوج…' : 'Loading catalog…'}
            description={ar ? 'يُحمَّل كتالوج الاختبارات الـ23 من المنصّة.' : 'Fetching the 23-test catalog from the platform.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'المعرّف' : 'ID'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'الاختبار' : 'Test'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'المرحلة' : 'Stage'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'الوكيل' : 'Agent'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((test) => {
                  const result = resultById.get(test.id);
                  const isOpen = expanded === test.id;
                  return (
                    <FragmentRow key={test.id}>
                      <tr
                        className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-900/50"
                        onClick={() => setExpanded(isOpen ? null : test.id)}
                      >
                        <td className="px-2 py-2 font-mono text-[11px] text-sky-300" dir="ltr">{test.id}</td>
                        <td className="px-2 py-2 font-medium text-slate-100">{test.title}</td>
                        <td className="px-2 py-2 text-slate-300">{test.lifecycleStage}</td>
                        <td className="px-2 py-2">
                          {test.agentKey
                            ? <span className="font-mono text-[11px] text-violet-200" dir="ltr">{test.agentKey}</span>
                            : <span className="text-[11px] text-slate-500">{ar ? '— لا يوجد وكيل' : '— no agent'}</span>}
                        </td>
                        <td className="px-2 py-2 text-center"><StatusBadge status={result?.status} ar={ar} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-800/60 bg-slate-950/60">
                          <td colSpan={5} className="px-4 py-3">
                            <TestDetail test={test} result={result} ar={ar} />
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── presentational pieces ──

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function StatusBadge({ status, ar }: { status?: AcceptanceStatus; ar: boolean }) {
  if (!status) {
    return <Pill tone="slate">{ar ? 'لم يُشغَّل' : 'not run'}</Pill>;
  }
  const map: Record<AcceptanceStatus, { tone: 'emerald' | 'rose' | 'amber'; en: string; ar: string }> = {
    pass: { tone: 'emerald', en: 'pass', ar: 'ناجح' },
    fail: { tone: 'rose', en: 'fail', ar: 'فاشل' },
    skipped: { tone: 'amber', en: 'skipped', ar: 'متخطّى' },
  };
  const s = map[status];
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function Tally({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'rose' | 'amber' }) {
  const color =
    tone === 'emerald' ? 'text-emerald-300'
      : tone === 'rose' ? 'text-rose-300'
        : tone === 'amber' ? 'text-amber-300'
          : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function TestDetail({ test, result, ar }: { test: AcceptanceTest; result?: AcceptanceTestResult; ar: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <Field label={ar ? 'معيار النجاح' : 'Success criteria'}>
          <p className="text-xs text-slate-300">{test.successCriteria}</p>
        </Field>
        <Field label={ar ? 'المدخلات' : 'Inputs'}>
          <BulletList items={test.inputs} />
        </Field>
        <Field label={ar ? 'المخرجات المتوقّعة' : 'Expected outputs'}>
          <div className="flex flex-wrap gap-1.5">
            {test.expectedOutputs.map((o) => <Pill key={o} tone="sky">{o}</Pill>)}
          </div>
        </Field>
      </div>
      <div className="space-y-2">
        <Field label={ar ? 'الحالة' : 'Status'}>
          <StatusBadge status={result?.status} ar={ar} />
        </Field>
        {result?.reason && (
          <Field label={ar ? 'السبب' : 'Reason'}>
            <p className="text-xs text-amber-200">{result.reason}</p>
          </Field>
        )}
        <Field label={ar ? 'الأدلّة' : 'Evidence'}>
          {result && Object.keys(result.evidence).length > 0 ? (
            <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700/70 bg-black/40 p-3 text-[11px] text-slate-200" dir="ltr">
              {JSON.stringify(result.evidence, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-slate-500">{ar ? 'شغّل البرنامج لالتقاط الأدلّة.' : 'Run the program to capture evidence.'}</p>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i} className="flex gap-1.5 text-xs text-slate-300">
          <span className="text-slate-600">•</span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}
