import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Spinner } from '@/components/ui';
import { listAllGuestRequests, GuestRequestG } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

const TYPE_ICON: Record<string, string> = { request: 'ti-help-circle', suggestion: 'ti-bulb', edit: 'ti-pencil' };

/** Header dropdown of guest requests/suggestions across the user's visible projects. */
export default function RequestsBell({ onCount }: { onCount?: (n: number) => void } = {}) {
  const org = useActiveOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GuestRequestG[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onCountRef = useRef(onCount); onCountRef.current = onCount;

  const load = () => {
    if (!org) return;
    setLoading(true);
    listAllGuestRequests().then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [org?.id]);
  // Report open-request count up for the collapsed header cluster badge.
  useEffect(() => { onCountRef.current?.(items.filter((r) => r.status === 'open').length); }, [items]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openItems = items.filter((r) => r.status === 'open');
  const go = (id?: string) => { setOpen(false); router.push(id ? `/requests?req=${id}` : '/requests'); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Requests"
        className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition relative">
        <Icon name="ti-inbox" className="text-base" />
        {openItems.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[#fff] text-2xs grid place-items-center">{openItems.length > 9 ? '9+' : openItems.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 bg-surface border border-line rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-medium">Requests</span>
            <span className="text-2xs text-muted">{openItems.length} open</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <Spinner /> : openItems.length === 0 ? (
              <p className="text-sm text-muted2 text-center py-10">No open requests</p>
            ) : openItems.slice(0, 12).map((r) => (
              <button key={r.id} onClick={() => go(r.id)} className="w-full text-left flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface2">
                <span className="w-7 h-7 rounded-md grid place-items-center shrink-0 bg-amber-500/10 text-amber-600"><Icon name={TYPE_ICON[r.type] || 'ti-inbox'} className="text-sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{r.title}</span>
                  <span className="block text-2xs text-muted truncate">{r.project?.name || 'Project'} · {r.creator?.full_name || 'Guest'}</span>
                  <span className="block text-2xs text-muted2 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</span>
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => go()} className="w-full text-center text-2xs text-accentstrong hover:underline py-2.5 border-t border-line">View all requests</button>
        </div>
      )}
    </div>
  );
}
