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
 * Bilingual. A "Download PDF" action opens a styled print window (browser
 * Save-as-PDF) with the full report — no extra dependency.
 */
export function AiAnalysisPanel({ endpoint, body, title }: { endpoint: string; body: Record<string, unknown>; title?: string }) {
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

  const downloadPdf = () => {
    if (!result) return;
    const reportTitle = title ?? (ar ? 'تقرير تحليل الذكاء الاصطناعي' : 'AI Analysis Report');
    const win = window.open('', '_blank', 'width=920,height=1040');
    if (!win) { toast.error(ar ? 'تعذّر فتح نافذة الطباعة' : 'Could not open the print window', ar ? 'اسمح بالنوافذ المنبثقة' : 'Allow pop-ups and retry'); return; }
    win.document.write(buildReportHtml(result, reportTitle, lang));
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 350);
  };

  return (
    <Card
      title={ar ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}
      hint={ar ? 'تحليل استرشادي مدعوم بـ Claude ومستند إلى مصادر علمية حقيقية' : 'Advisory AI narrative grounded in real scientific sources'}
      actions={
        <div className="flex items-center gap-2">
          {result && (
            <Button variant="ghost" size="sm" onClick={downloadPdf}>↓ {ar ? 'تنزيل PDF' : 'Download PDF'}</Button>
          )}
          <Button variant="primary" size="sm" disabled={busy} onClick={run}>{busy ? (ar ? 'جارٍ التحليل…' : 'Analysing…') : (ar ? 'تشغيل التحليل' : 'Run analysis')}</Button>
        </div>
      }
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

// ── print/PDF report builder (runs in a separate window; plain HTML) ─────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function tableHtml(rows: string[]): string {
  const parsed = rows
    .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  if (!parsed.length) return '';
  const [head, ...bodyRows] = parsed;
  return (
    '<table><thead><tr>' + head.map((c) => `<th>${inlineMd(c)}</th>`).join('') + '</tr></thead><tbody>' +
    bodyRows.map((r) => '<tr>' + r.map((c) => `<td>${inlineMd(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'
  );
}

/** Tiny markdown → HTML (headings, hr, **bold**, `code`, lists, pipe tables). */
function mdToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  const isBlockStart = (l: string) => /^(#{1,6})\s|^[-*]\s|^\d+\.\s|^\|/.test(l.trim());
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { i += 1; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const lvl = Math.min(h[1].length + 1, 6); out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`); i += 1; continue; }
    if (/^([-*_])\1{2,}$/.test(line.trim())) { out.push('<hr/>'); i += 1; continue; }
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i += 1; }
      out.push(tableHtml(rows)); continue;
    }
    if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i += 1; }
      out.push('<ul>' + items.map((x) => `<li>${inlineMd(x)}</li>`).join('') + '</ul>'); continue;
    }
    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i += 1; }
      out.push('<ol>' + items.map((x) => `<li>${inlineMd(x)}</li>`).join('') + '</ol>'); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i].trim()); i += 1; }
    out.push(`<p>${inlineMd(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

function buildReportHtml(result: AiAnalysisResult, reportTitle: string, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar';
  const date = new Date().toLocaleString(ar ? 'ar' : 'en-GB');
  const narrative = result.enabled ? mdToHtml(result.narrative) : `<p>${escapeHtml(result.disclaimer)}</p>`;
  const sources = result.sources
    .map(
      (s) =>
        `<li><b>[${escapeHtml(s.id)}]</b> ${escapeHtml(s.title)} — <i>${escapeHtml(s.author)}, ${escapeHtml(s.reference)}</i>` +
        `${s.url ? ` · <a href="${escapeHtml(s.url)}">${escapeHtml(s.url)}</a>` : ''}</li>`,
    )
    .join('');
  return `<!doctype html><html dir="${ar ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8">
<title>${escapeHtml(reportTitle)} — Sigma PMO</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: ${ar ? "'Segoe UI', Tahoma, Arial" : "'Inter', 'Segoe UI', Arial"}, sans-serif; color: #1f2937; line-height: 1.6; font-size: 11.5pt; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #C8102E; padding-bottom: 10px; margin-bottom: 18px; }
  .head .brand { font-weight: 700; font-size: 15pt; letter-spacing: -0.01em; }
  .head .brand span { color: #C8102E; }
  .head .meta { font-size: 9pt; color: #6b7280; text-align: ${ar ? 'left' : 'right'}; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 13pt; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin: 18px 0 8px; }
  h3 { font-size: 11.5pt; color: #C8102E; text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 6px; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0; padding-${ar ? 'right' : 'left'}: 22px; }
  li { margin: 3px 0; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: ${ar ? 'right' : 'left'}; }
  th { background: #f9fafb; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.04em; color: #374151; }
  tr:nth-child(even) td { background: #fafafa; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .sources { margin-top: 22px; }
  .sources ol { padding-${ar ? 'right' : 'left'}: 20px; font-size: 10pt; color: #374151; }
  .sources a { color: #1d4ed8; word-break: break-all; }
  .disclaimer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8.5pt; color: #6b7280; font-style: italic; }
</style></head><body>
  <div class="head">
    <div class="brand">Sigma <span>PMO</span></div>
    <div class="meta">${escapeHtml(reportTitle)}<br>${escapeHtml(date)}${result.model ? `<br>${escapeHtml(result.model)} · ${result.citations.length} ${ar ? 'استشهاد' : 'citations'}` : ''}</div>
  </div>
  <h1>${escapeHtml(reportTitle)}</h1>
  <main>${narrative}</main>
  <section class="sources"><h2>${ar ? 'المصادر العلمية' : 'Scientific sources'}</h2><ol>${sources}</ol></section>
  <div class="disclaimer">${escapeHtml(result.disclaimer)}</div>
</body></html>`;
}
