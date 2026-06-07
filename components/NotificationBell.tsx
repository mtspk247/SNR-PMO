import { useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from '@/components/ui';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/db';
import { AppNotification } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

const ICON: Record<string, string> = {
  TASK_ASSIGNED: 'ti-checkbox', COMMENT: 'ti-message', MENTION: 'ti-at',
  LEAVE_STATUS: 'ti-beach', CHECK_IN: 'ti-login', CHECK_OUT: 'ti-logout', SYSTEM: 'ti-bell',
};

export default function NotificationBell() {
  const me = useAuthStore((s) => s.user);
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
    if (n.is_read) return;
    try { await markNotificationRead(n.id); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); } catch {}
  };
  const allRead = async () => {
    if (!me) return;
    try { await markAllNotificationsRead(me.id); setItems((p) => p.map((x) => ({ ...x, is_read: true }))); } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} className="btn-ghost p-2 rounded-md text-neutral-500 relative">
        <Icon name="ti-bell" className="text-base" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-2xs grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 bg-white border border-line rounded-lg shadow-xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && <button onClick={allRead} className="text-2xs text-sky-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <Spinner /> : items.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-10">No notifications</p>
            ) : items.map((n) => (
              <button key={n.id} onClick={() => click(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-paper ${n.is_read ? '' : 'bg-sky-50/50'}`}>
                <span className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${n.urgent ? 'bg-rose-50 text-rose-600' : 'bg-neutral-100 text-neutral-500'}`}><Icon name={ICON[n.type] || 'ti-bell'} className="text-sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{n.title}</span>
                  {n.body && <span className="block text-2xs text-neutral-500 line-clamp-2">{n.body}</span>}
                  <span className="block text-2xs text-neutral-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</span>
                </span>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
