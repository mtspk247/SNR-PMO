import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Spinner } from '@/components/ui';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/db';
import { AppNotification } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';

// Per-type icon + accent colour so the feed reads at a glance.
const META: Record<string, { icon: string; tone: string }> = {
  TASK_ASSIGNED: { icon: 'ti-checkbox', tone: 'bg-sky-500/10 text-sky-600' },
  COMMENT: { icon: 'ti-message', tone: 'bg-violet-500/10 text-violet-600' },
  MENTION: { icon: 'ti-at', tone: 'bg-violet-500/10 text-violet-600' },
  LEAVE_STATUS: { icon: 'ti-beach', tone: 'bg-amber-500/10 text-amber-600' },
  CHECK_IN: { icon: 'ti-login', tone: 'bg-emerald-500/10 text-emerald-600' },
  CHECK_OUT: { icon: 'ti-logout', tone: 'bg-slate-500/10 text-slate-600' },
  SYSTEM: { icon: 'ti-bell', tone: 'bg-accent/10 text-accentstrong' },
  POLL: { icon: 'ti-chart-bar', tone: 'bg-sky-500/10 text-sky-600' },
  reminder: { icon: 'ti-alarm', tone: 'bg-amber-500/10 text-amber-600' },
};
const metaFor = (t: string) => META[t] || { icon: 'ti-bell', tone: 'bg-surface2 text-muted' };

function relTime(iso: string): string {
  const d = new Date(iso).getTime(); const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.round(h / 24); if (dd < 7) return `${dd}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function bucket(iso: string): 'Today' | 'Yesterday' | 'Earlier' {
  const d = new Date(iso); const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : 'Earlier';
}

function hrefFor(n: AppNotification): string | null {
  if (n.entity_type === 'task' && n.entity_id) return `/tasks?task=${n.entity_id}`;
  if (n.entity_type === 'leave') return '/leave';
  if (n.entity_type === 'chat') return '/chat';
  if (n.entity_type === 'crm_deal' && n.entity_id) return `/crm/deal/${n.entity_id}`;
  if (n.entity_type === 'employee' && n.entity_id) return `/employees/${n.entity_id}`;
  return n.link || null;
}

export default function NotificationBell({ onCount }: { onCount?: (n: number) => void } = {}) {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const onCountRef = useRef(onCount); onCountRef.current = onCount;

  const load = () => { if (!me) return; setLoading(true); getNotifications(me.id).then(setItems).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [me?.id]);
  // Report unread count up so a collapsed header cluster can aggregate it.
  useEffect(() => { onCountRef.current?.(items.filter((n) => !n.is_read).length); }, [items]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;
  const click = async (n: AppNotification) => {
    if (!n.is_read) { try { await markNotificationRead(n.id); setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); } catch {} }
    const href = hrefFor(n); if (href) { setOpen(false); router.push(href); }
  };
  const allRead = async () => { if (!me) return; try { await markAllNotificationsRead(me.id); setItems((p) => p.map((x) => ({ ...x, is_read: true }))); } catch {} };

  const shown = filter === 'unread' ? items.filter((n) => !n.is_read) : items;
  const groups: ['Today' | 'Yesterday' | 'Earlier', AppNotification[]][] = (['Today', 'Yesterday', 'Earlier'] as const)
    .map((g) => [g, shown.filter((n) => bucket(n.created_at) === g)] as ['Today' | 'Yesterday' | 'Earlier', AppNotification[]])
    .filter(([, arr]) => arr.length > 0);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="Notifications" className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition relative">
        <Icon name="ti-bell" className="text-base" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[#fff] text-2xs font-semibold grid place-items-center ring-2 ring-surface">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-[22rem] bg-surface border border-line rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-line">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-semibold inline-flex items-center gap-2">Notifications{unread > 0 && <span className="pill pill-red">{unread} new</span>}</span>
              {unread > 0 && <button onClick={allRead} className="text-2xs text-accentstrong hover:underline inline-flex items-center gap-1"><Icon name="ti-checks" className="text-xs" />Mark all read</button>}
            </div>
            <div className="inline-flex items-center rounded-md border border-line bg-surface2/60 p-0.5 text-2xs">
              {(['all', 'unread'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-2.5 h-6 rounded capitalize transition ${filter === f ? 'bg-surface text-content shadow-sm font-medium' : 'text-muted hover:text-content'}`}>{f}{f === 'unread' && unread > 0 ? ` (${unread})` : ''}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {loading ? <div className="py-10"><Spinner /></div> : shown.length === 0 ? (
              <div className="text-center py-12 px-4">
                <span className="w-12 h-12 rounded-full bg-surface2 grid place-items-center mx-auto mb-3 text-muted2"><Icon name={filter === 'unread' ? 'ti-checks' : 'ti-bell-off'} className="text-xl" /></span>
                <p className="text-sm text-muted">{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</p>
              </div>
            ) : groups.map(([g, arr]) => (
              <div key={g}>
                <div className="px-4 py-1.5 bg-surface2/50 text-2xs font-medium text-muted2 uppercase tracking-wide sticky top-0 z-10">{g}</div>
                {arr.map((n) => { const m = metaFor(n.type); return (
                  <button key={n.id} onClick={() => click(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-line/60 last:border-0 transition hover:bg-surface2/70 ${n.is_read ? '' : 'bg-accent/[0.04]'}`}>
                    <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${n.urgent ? 'bg-rose-500/10 text-rose-500' : m.tone}`}><Icon name={n.urgent ? 'ti-alert-triangle' : m.icon} className="text-sm" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5"><span className={`block text-sm truncate ${n.is_read ? 'text-content' : 'font-semibold text-content'}`}>{n.title}</span>{!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-accentstrong shrink-0" />}</span>
                      {n.body && <span className="block text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</span>}
                      <span className="block text-2xs text-muted2 mt-1">{relTime(n.created_at)}</span>
                    </span>
                  </button>
                ); })}
              </div>
            ))}
          </div>
          <button onClick={() => { setOpen(false); if (me) router.push(`/users/${me.id}`); }} className="w-full px-4 py-2.5 border-t border-line text-2xs text-muted hover:text-content hover:bg-surface2/60 transition inline-flex items-center justify-center gap-1.5"><Icon name="ti-settings" className="text-xs" />Notification settings</button>
        </div>
      )}
    </div>
  );
}
