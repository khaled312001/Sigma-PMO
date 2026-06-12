'use client';

import { useState } from 'react';

import { api, AiAnalysisResult } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useToast } from './ToastProvider';
import { MarkdownLite } from './MarkdownLite';
import { Button, Card, Pill } from './ui';

/**
 * AiAnalysisPanel — the shared AI-narration surface for the governance modules
 * (Quantity Survey / Procurement / Revenue). Calls the module's `ai-analysis`
 * endpoint (Claude, grounded in the real domain reference library), renders the
 * narrative + the cited sources, and degrades gracefully when no key is set.
 * Bilingual: passes the active language so the narrative comes back in Arabic
 * or English, with domain terms kept inline.
 */
export function AiAnalysisPanel({ endpoint, body }: { endpoint: string; body: Record<string, unknown> }) {
  const { lang } = useI18n();
  const toast = useToast();
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const ar = lang === 'ar';

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api<AiAnalysisResult>(endpoint, { method: 'POST', body: JSON.stringify({ ...body, language: lang }) }));
    } catch (e) { toast.error(ar ? 'فشل التحليل' : 'Analysis failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Card
      title={ar ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}
      hint={ar ? 'تحليل استرشادي مدعوم بـ Claude ومستند إلى مصادر علمية حقيقية' : 'Advisory AI narrative grounded in real scientific sources'}
      actions={<Button variant="primary" size="sm" disabled={busy} onClick={run}>{busy ? (ar ? 'جارٍ التحليل…' : 'Analysing…') : (ar ? 'تشغيل التحليل' : 'Run analysis')}</Button>}
    >
      {!result ? (
        <p className="text-sm text-slate-400">{ar ? 'اضغط «تشغيل التحليل» لتفسير الأرقام الحتمية وربطها بالمصادر العلمية والإجراءات الموصى بها.' : 'Run the analysis to interpret the deterministic figures, ground them in the scientific sources, and surface recommended governance actions.'}</p>
      ) : (
        <div className="space-y-3">
          {!result.enabled && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {ar ? 'الذكاء الاصطناعي غير مُفعّل — أضف مفتاح Claude من الإعدادات. المصادر المرجعية معروضة أدناه.' : 'AI not enabled — add a Claude key in Admin → Settings. The reference library is shown below.'}
            </div>
          )}
          {result.enabled && <MarkdownLite text={result.narrative} />}
          {result.model && <p className="text-[11px] text-slate-500">{result.model} · {result.citations.length} {ar ? 'استشهاد' : 'citations'}</p>}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ar ? 'المصادر العلمية' : 'Scientific sources'}</p>
            <ul className="space-y-1">
              {result.sources.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-xs">
                  <Pill tone={s.cited ? 'emerald' : 'slate'}>{s.cited ? (ar ? 'مُستشهَد' : 'cited') : (ar ? 'مرجع' : 'ref')}</Pill>
                  <span className="flex-1 text-slate-300">
                    <span className="font-mono text-[10px] text-sky-300" dir="ltr">[{s.id}]</span> {s.title} — <span className="text-slate-400">{s.author}, {s.reference}</span>
                    {s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline" dir="ltr">link</a></>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] italic text-slate-500">{result.disclaimer}</p>
        </div>
      )}
    </Card>
  );
}
