import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Spinner } from '@/components/ui';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/db';
import { AppNotification } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

const ICON: Record<string, string> = {
  TASK_ASSIGNED: 'ti-checkbox', COMMENT: 'ti-message', MENTION: 'ti-at',
  LEAVE_STATUS: 'ti-beach', CHECK_IN: 'ti-login', CHECK_OUT: 'ti-logout', SYSTEM: 'ti-bell',
  reminder: 'ti-alarm',
};

/** C2 — resolve a notification to its in-app destination. */
function hrefFor(n: AppNotification): string | null {
  if (n.entity_type === 'task' && n.entity_id) return `/tasks?task=${n.entity_id}`;
  if (n.entity_type === 'leave') return '/leave';
  if (n.entity_type === 'chat') return '/chat';
  if (n.entity_type === 'crm_deal' && n.entity_id) return `/crm/deal/${n.entity_id}`;
  if (n.entity_type === 'employee' && n.entity_id) return `/employees/${n.entity_id}`;
  return n.link || null;
}

export default function NotificationBell() {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!me) return;
    setLoading(true);
    getNotifications(me.id).then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [me?.id]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;
  const click = async (n: AppNotification) => {
    if (!n.is_read) {
      try { await markNotificationRead(n.id); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); } catch {}
    }
    const href = hrefFor(n);
    if (href) { setOpen(false); router.push(href); }
  };
  const allRead = async () => {
    if (!me) return;
    try { await markAllNotificationsRead(me.id); setItems((p) => p.map((x) => ({ ...x, is_read: true }))); } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} className="btn-ghost p-2 rounded-md text-muted relative">
        <Icon name="ti-bell" className="text-base" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[#fff] text-2xs grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 bg-surface border border-line rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && <button onClick={allRead} className="text-2xs text-accentstrong hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <Spinner /> : items.length === 0 ? (
              <p className="text-sm text-muted2 text-center py-10">No notifications</p>
            ) : items.map((n) => (
              <button key={n.id} onClick={() => click(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface2 ${n.is_read ? '' : 'bg-accent/5'}`}>
                <span className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${n.urgent ? 'bg-rose-500/10 text-rose-500' : 'bg-surface2 text-muted'}`}><Icon name={ICON[n.type] || 'ti-bell'} className="text-sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{n.title}</span>
                  {n.body && <span className="block text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</span>}
                  <span className="block text-2xs text-muted2 mt-1">{new Date(n.created_at).toLocaleString()}</span>
                </span>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-accentstrong shrink-0 mt-1" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
