import { useEffect } from 'react';
import Link from 'next/link';
import { create } from 'zustand';
import { Icon } from '@/components/ui';

export type Crumb = { label: string; href?: string };

/** Tiny global store so any page (esp. dynamic routes) can publish its trail. */
type CrumbState = { crumbs: Crumb[] | null; setCrumbs: (c: Crumb[] | null) => void };
export const useCrumbStore = create<CrumbState>((set) => ({
  crumbs: null,
  setCrumbs: (crumbs) => set({ crumbs }),
}));

/**
 * Pages call this to set a custom breadcrumb trail (e.g. Projects / Acme Website).
 * Cleans up on unmount so the next page falls back to the route-derived default.
 */
export function useSetCrumbs(crumbs: Crumb[] | null) {
  const setCrumbs = useCrumbStore((s) => s.setCrumbs);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
}

/** Clickable address bar: Home icon → trail. Last crumb = current page (not a link). */
export default function Breadcrumbs({ fallback }: { fallback: Crumb[] }) {
  const crumbs = useCrumbStore((s) => s.crumbs) ?? fallback;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-sm">
      <Link href="/dashboard" title="Dashboard"
        className="shrink-0 grid place-items-center h-6 w-6 rounded text-muted hover:text-content hover:bg-surface2 transition">
        <Icon name="ti-home" className="text-sm" />
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            <Icon name="ti-chevron-right" className="text-xs text-muted2 shrink-0" />
            {c.href && !last ? (
              <Link href={c.href} className="px-1 py-0.5 rounded text-muted hover:text-content hover:bg-surface2 transition truncate">
                {c.label}
              </Link>
            ) : (
              <span className={`px-1 truncate ${last ? 'font-medium text-content' : 'text-muted'}`}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
