'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '../lib/i18n';
import { EmptyState } from './ui';

export interface Column<T> {
  /** Stable key for sort + react. */
  key: string;
  /** Display label (already translated by caller). */
  label: string;
  /** Pull the comparable value out of the row. Default: row[key]. */
  accessor?: (row: T) => unknown;
  /** Render the cell. Default: stringified accessor value. */
  render?: (row: T) => React.ReactNode;
  /** Column width hint (CSS grid template). */
  width?: string;
  /** Set to false to disable sort on this column. */
  sortable?: boolean;
  /** Right-align numeric columns. */
  align?: 'start' | 'center' | 'end';
  /** Hide on small screens. */
  hideOnMobile?: boolean;
}

/**
 * Senior-grade table primitive — sortable headers, sticky header, optional
 * search, optional row click, dense / comfortable density, accessible.
 *
 * Tables are still hard. Three rules this primitive enforces:
 *  - Header row sticks during scroll so the user never loses context.
 *  - Each column gets a sort affordance (▲▼) only if `sortable !== false`.
 *  - Row click is opt-in via `onRowClick`; when set, the whole row is a
 *    button-like target with proper aria + keyboard support.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  searchable = false,
  searchPlaceholder,
  searchAccessor,
  density = 'comfortable',
  emptyTitle,
  emptyDescription,
  initialSort,
  className = '',
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAccessor?: (row: T) => string;
  density?: 'comfortable' | 'compact';
  emptyTitle?: string;
  emptyDescription?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  className?: string;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    let out = rows;
    if (searchable && query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) => {
        const haystack = searchAccessor
          ? searchAccessor(r)
          : columns.map((c) => String(c.accessor ? c.accessor(r) : (r as Record<string, unknown>)[c.key] ?? '')).join(' ');
        return haystack.toLowerCase().includes(q);
      });
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const acc = col.accessor ?? ((r: T) => (r as Record<string, unknown>)[col.key]);
        out = [...out].sort((a, b) => {
          const va = acc(a) as string | number | Date | null | undefined;
          const vb = acc(b) as string | number | Date | null | undefined;
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, sort, query, searchable, searchAccessor]);

  const toggleSort = (key: string, sortable?: boolean) => {
    if (sortable === false) return;
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: 'asc' };
      if (cur.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const padCell = density === 'compact' ? 'px-3 py-1.5 text-[12px]' : 'px-3 py-2.5 text-sm';
  const padHead = density === 'compact' ? 'px-3 py-1.5' : 'px-3 py-2';

  const alignCls = (a?: Column<T>['align']) =>
    a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start';

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 ${className}`}>
      {searchable && (
        <div className="border-b border-slate-800/70 bg-slate-900/40 px-3 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? t('common.search') /* with fallback to 'Search…' */}
            aria-label={searchPlaceholder ?? 'Search'}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? t('common.loading')}
          description={emptyDescription ?? ''}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-slate-200">
            <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
              <tr>
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      style={c.width ? { width: c.width } : undefined}
                      aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${alignCls(c.align)} ${padHead} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key, c.sortable)}
                        disabled={c.sortable === false}
                        className={`inline-flex items-center gap-1 ${c.sortable === false ? 'cursor-default' : 'cursor-pointer hover:text-slate-200'}`}
                      >
                        <span>{c.label}</span>
                        {c.sortable !== false && (
                          <span aria-hidden className="text-[9px] text-slate-500">
                            {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const id = rowKey(row);
                const clickable = !!onRowClick;
                return (
                  <tr
                    key={id}
                    onClick={clickable ? () => onRowClick!(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick!(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                    className={`border-b border-slate-800/70 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-900/20' : ''} ${clickable ? 'cursor-pointer transition hover:bg-slate-800/40 focus-visible:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/60' : ''}`}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`${padCell} ${alignCls(c.align)} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                      >
                        {c.render ? c.render(row) : String((c.accessor ? c.accessor(row) : (row as Record<string, unknown>)[c.key]) ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
