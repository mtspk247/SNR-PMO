import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

// Client-side pagination over an already-loaded (RLS-scoped) array. Keeps
// in-memory search/filter intact — the page just windows the final rows.
// Resets to page 1 when the list shrinks below the current page (e.g. a filter).
export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(1); }, [pageCount, page]);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);
  return { page, setPage, pageCount, pageItems: items.slice(start, end), total: items.length, start, end };
}

export function Pagination({ page, pageCount, total, start, end, onPage }: {
  page: number; pageCount: number; total: number; start: number; end: number; onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line text-2xs text-muted2">
      <span>Showing {start + 1}&ndash;{end} of {total}</span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}
            className="btn btn-ghost h-7 px-2 disabled:opacity-40" aria-label="Previous page"><Icon name="ti-chevron-left" /></button>
          <span className="px-1.5 tabular-nums">{page} / {pageCount}</span>
          <button onClick={() => onPage(page + 1)} disabled={page >= pageCount}
            className="btn btn-ghost h-7 px-2 disabled:opacity-40" aria-label="Next page"><Icon name="ti-chevron-right" /></button>
        </div>
      )}
    </div>
  );
}
