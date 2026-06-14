import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { getRecentSystemNotifications } from '@/lib/db';
import { AppNotification } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

const SEEN_KEY = 'snr_toast_seen';

/**
 * Slice 2 — global system-toast layer.
 * Surfaces ONLY SYSTEM-type notifications (usage/limit alerts, platform notices)
 * as transient bottom-right toasts. The notification itself is still recorded in
 * the bell; this layer only makes new SYSTEM items pop in real time on poll.
 */
export default function Toaster() {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const since = useRef<string>('');

  // Initialise the watermark to "now" so we never replay history on first mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    since.current = window.localStorage.getItem(SEEN_KEY) || new Date().toISOString();
  }, []);

  useEffect(() => {
    if (!me) return;
    let active = true;
    const poll = async () => {
      if (!since.current) return;
      try {
        const rows = await getRecentSystemNotifications(me.id, since.current);
        if (!active || rows.length === 0) return;
        const fresh = rows.filter((n) => !seen.current.has(n.id));
        fresh.forEach((n) => seen.current.add(n.id));
        if (fresh.length) setToasts((prev) => [...prev, ...fresh].slice(-4));
        const newest = rows[rows.length - 1].created_at;
        since.current = newest;
        if (typeof window !== 'undefined') window.localStorage.setItem(SEEN_KEY, newest);
      } catch {/* silent */}
    };
    poll();
    const t = setInterval(poll, 45000);
    return () => { active = false; clearInterval(t); };
  }, [me?.id]);

  const dismiss = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));
  const open = (n: AppNotification) => { dismiss(n.id); if (n.link) router.push(n.link); };

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[22rem] max-w-[calc(100vw-2rem)]">
      {toasts.map((n) => (
        <ToastCard key={n.id} n={n} onClose={() => dismiss(n.id)} onOpen={() => open(n)} />
      ))}
    </div>
  );
}

function ToastCard({ n, onClose, onOpen }: { n: AppNotification; onClose: () => void; onOpen: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, n.urgent ? 14000 : 9000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      role="status"
      className={`group relative flex gap-3 rounded-xl border bg-surface shadow-lg p-3.5 pr-9 animate-[modalPop_.18s_ease-out] ${n.urgent ? 'border-rose-500/40' : 'border-line'}`}
    >
      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${n.urgent ? 'bg-rose-500/10 text-rose-500' : 'bg-accent/10 text-accentstrong'}`}>
        <Icon name={n.urgent ? 'ti-alert-triangle' : 'ti-bell'} className="text-base" />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold text-content truncate">{n.title}</span>
        {n.body && <span className="block text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</span>}
        {n.link && <span className="block text-2xs text-accentstrong mt-1 font-medium">Open →</span>}
      </button>
      <button onClick={onClose} aria-label="Dismiss" className="absolute top-2 right-2 h-6 w-6 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 transition">
        <Icon name="ti-x" className="text-sm" />
      </button>
    </div>
  );
}
