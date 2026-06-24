import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

type Info = { time: string | null; located: boolean; notified: boolean };

/** Bottom-left confirmation popup shown to the person who just checked in. */
export default function CheckInPopup() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    const onIn = (e: Event) => {
      const d = ((e as CustomEvent).detail || {}) as Partial<Info>;
      setInfo({ time: d.time ?? null, located: !!d.located, notified: !!d.notified });
      setTimeout(() => setInfo(null), 6000);
    };
    window.addEventListener('snr:checkin', onIn);
    return () => window.removeEventListener('snr:checkin', onIn);
  }, []);
  if (!info) return null;
  const t = info.time ? new Date(info.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const meta = [info.located ? 'Location captured' : 'Location not shared', info.notified ? 'manager notified' : null].filter(Boolean).join(' · ');
  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden animate-[fadein_.2s_ease-out]">
      <div className="flex items-start gap-2.5 bg-surface border border-line rounded-xl shadow-lg px-3.5 py-2.5 w-[19rem] max-w-[calc(100vw-2rem)]">
        <span className="mt-0.5 h-7 w-7 shrink-0 grid place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="ti-check" className="text-base" /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-content">You&apos;re checked in{t ? ` · ${t}` : ''}</p>
          <p className="text-2xs text-muted flex items-center gap-1">
            {info.located && <Icon name="ti-map-pin" className="text-2xs" />}{meta}
          </p>
        </div>
        <button onClick={() => setInfo(null)} aria-label="Dismiss" className="ml-auto text-muted2 hover:text-content"><Icon name="ti-x" className="text-sm" /></button>
      </div>
    </div>
  );
}
