import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, Spinner, Avatar } from '@/components/ui';
import { getRunningTimers, RunningTimer } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="tabular-nums font-mono text-2xs">{h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>;
}

/** Header dropdown of currently-running timers (admins see everyone's; others see their own). */
export default function RunningTimers() {
  const org = useActiveOrg();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RunningTimer[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!org) return;
    setLoading(true);
    getRunningTimers(org.id).then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [org?.id]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Active timers"
        className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition relative">
        <Icon name="ti-clock-play" className="text-base" />
        {items.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[#fff] text-2xs grid place-items-center">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 bg-surface border border-line rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-medium">Active timers</span>
            <span className="text-2xs text-muted">{items.length} running</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <Spinner /> : items.length === 0 ? (
              <p className="text-sm text-muted2 text-center py-10">No active timers</p>
            ) : items.map((t) => (
              <Link key={t.id} href={t.task_id ? `/tasks?task=${t.task_id}` : '#'} onClick={() => setOpen(false)}
                className="flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface2">
                <Avatar name={t.user_name || 'U'} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{t.task_name || 'Task'}</span>
                  <span className="block text-2xs text-muted truncate">{t.user_name || 'Someone'} · {t.project_name || 'No project'}</span>
                </span>
                <span className="shrink-0 self-center inline-flex items-center gap-1 text-accentstrong">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><Elapsed since={t.started_at} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
