import { useEffect, useState } from 'react';
import { getMyOpenToday } from '@/lib/db';
import { Attendance } from '@/lib/supabase';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { Icon } from '@/components/ui';

function elapsed(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  if (ms < 0) return '0m';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** Global footer: live date/time + a running "on the clock" timer while checked in.
 *  Refreshes from the snr:checkin / snr:checkout events the shared helpers broadcast. */
export default function AppFooter() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState<Attendance | null>(null);

  const refresh = () => { if (me) getMyOpenToday(me.id).then(setOpen).catch(() => {}); else setOpen(null); };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [me?.id]);
  useEffect(() => {
    const onIn = () => refresh();
    const onOut = () => setOpen(null);
    window.addEventListener('snr:checkin', onIn);
    window.addEventListener('snr:checkout', onOut);
    return () => { window.removeEventListener('snr:checkin', onIn); window.removeEventListener('snr:checkout', onOut); };
    // eslint-disable-next-line
  }, [me?.id]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  if (!me) return null;
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <footer className="shrink-0 border-t border-line bg-surface px-4 sm:px-6 py-1.5 flex items-center gap-3 text-2xs text-muted print:hidden">
      <span className="hidden sm:inline truncate">© {now.getFullYear()} {org?.name || ''}</span>
      {open?.check_in ? (
        <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-600 font-medium"
          title={`On the clock since ${new Date(open.check_in).toLocaleTimeString()}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          On the clock · {elapsed(open.check_in)}
          {(open.check_in_place || open.check_in_lat != null) && (
            <span className="inline-flex items-center gap-1 font-normal opacity-90" title="Check-in location">
              <Icon name="ti-map-pin" className="text-2xs" /><span className="hidden md:inline truncate max-w-[12rem]">{open.check_in_place || 'Location captured'}</span>
            </span>
          )}
        </span>
      ) : <span className="ml-auto" />}
      <span className="inline-flex items-center gap-1.5 tabular-nums"><Icon name="ti-clock" className="text-2xs" />{date} · {time}</span>
    </footer>
  );
}
