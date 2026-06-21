import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Spinner } from '@/components/ui';
import { listMyNotices, noticeMarkRead, Notice } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

const isUnread = (n: Notice) => !!n.mine?.some((m) => !m.read_at);

/** Notice board — dropdown of received notices (like the notification bell). */
export default function NoticeBoardIcon({ onCount }: { onCount?: (n: number) => void } = {}) {
  const org = useActiveOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onCountRef = useRef(onCount); onCountRef.current = onCount;

  const load = () => {
    if (!org) return;
    setLoading(true);
    // Only notices actually addressed to me (have a recipient row).
    listMyNotices(org.id).then((all) => setItems(all.filter((n) => n.mine && n.mine.length > 0)))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [org?.id]);
  // Report unread-notice count up for the collapsed header cluster badge.
  useEffect(() => { onCountRef.current?.(items.filter(isUnread).length); }, [items]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const unread = items.filter(isUnread).length;

  const click = async (n: Notice) => {
    if (isUnread(n)) {
      try { await noticeMarkRead(n.id); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, mine: [{ read_at: new Date().toISOString() }] } : x))); } catch { /* ignore */ }
    }
    setOpen(false);
    router.push(`/notices?notice=${n.id}`);
  };
  const allRead = async () => {
    const un = items.filter(isUnread);
    try { await Promise.all(un.map((n) => noticeMarkRead(n.id))); setItems((p) => p.map((x) => ({ ...x, mine: [{ read_at: new Date().toISOString() }] }))); } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Notice board"
        className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition relative">
        <Icon name="ti-speakerphone" className="text-base" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[#fff] text-2xs grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 bg-surface border border-line rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-medium">Notice board</span>
            {unread > 0 && <button onClick={allRead} className="text-2xs text-accentstrong hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <Spinner /> : items.length === 0 ? (
              <p className="text-sm text-muted2 text-center py-10">No notices</p>
            ) : items.map((n) => {
              const un = isUnread(n);
              return (
                <button key={n.id} onClick={() => click(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface2 ${un ? 'bg-accent/5' : ''}`}>
                  <span className="w-7 h-7 rounded-md grid place-items-center shrink-0 bg-surface2 text-muted"><Icon name={n.pinned ? 'ti-pin' : 'ti-speakerphone'} className="text-sm" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{n.title}</span>
                    {n.body && <span className="block text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</span>}
                    <span className="block text-2xs text-muted2 mt-1">{new Date(n.created_at).toLocaleString()}</span>
                  </span>
                  {un && <span className="w-2 h-2 rounded-full bg-accentstrong shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setOpen(false); router.push('/notices'); }} className="w-full text-2xs text-center text-muted hover:text-content border-t border-line py-2">Open notice board →</button>
        </div>
      )}
    </div>
  );
}
