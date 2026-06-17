'use client';

import { Fragment, ReactNode } from 'react';

/**
 * MarkdownLite — a tiny deterministic renderer for the markdown the platform's
 * AI narratives + feasibility engine emit: # / ## / ### headings, --- rules,
 * **bold**, `- ` and `1.` lists, and GitHub-style pipe tables. No external
 * dependency, no HTML injection (text-only nodes).
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-200">
      {blocks.map((b, i) => {
        if (b.type === 'table') return <PipeTable key={i} rows={b.lines} />;
        if (b.type === 'hr') return <hr key={i} className="border-slate-700/70" />;
        if (b.type === 'h') {
          const level = b.level ?? 2;
          const cls =
            level <= 1 ? 'mt-1 text-lg font-bold text-slate-50'
            : level === 2 ? 'mt-3 text-base font-bold text-slate-50'
            : 'mt-2 text-sm font-semibold uppercase tracking-wide text-sky-300';
          return <p key={i} className={cls}>{inline(b.lines[0])}</p>;
        }
        if (b.type === 'olist') {
          return (
            <ol key={i} className="list-decimal space-y-1 ps-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s+/, ''))}</li>)}
            </ol>
          );
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 ps-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s+/, ''))}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{inline(b.lines.join('\n'))}</p>;
      })}
    </div>
  );
}

interface Block { type: 'p' | 'list' | 'olist' | 'table' | 'h' | 'hr'; lines: string[]; level?: number }

function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  const push = (b: Block) => { out.push(b); cur = null; };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { cur = null; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { push({ type: 'h', level: h[1].length, lines: [h[2]] }); continue; }
    if (/^([-*_])\1{2,}$/.test(line.trim())) { push({ type: 'hr', lines: [] }); continue; }

    const kind: Block['type'] =
      line.startsWith('|') ? 'table'
      : /^[-*]\s/.test(line) ? 'list'
      : /^\d+\.\s/.test(line) ? 'olist'
      : 'p';
    if (!cur || cur.type !== kind) { cur = { type: kind, lines: [] }; out.push(cur); }
    cur.lines.push(line);
  }
  return out;
}

/** Render **bold** + `code` spans inside a text run. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-slate-50">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.85em] text-sky-300" dir="ltr">{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function PipeTable({ rows }: { rows: string[] }) {
  const parsed = rows
    .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  if (!parsed.length) return null;
  const [head, ...body] = parsed;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/70">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/80 text-start">
            {head.map((c, i) => (
              <th key={i} className="px-3 py-2 text-start font-semibold uppercase tracking-wider text-slate-300">{inline(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((cells, i) => (
            <tr key={i} className="border-t border-slate-800 odd:bg-slate-900/40">
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-1.5 tabular-nums text-slate-200" dir="auto">{inline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
