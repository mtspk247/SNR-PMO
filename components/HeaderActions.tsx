import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getTheme, toggleTheme, Theme } from '@/lib/theme';
import RunningTimers from '@/components/RunningTimers';
import RequestsBell from '@/components/RequestsBell';
import NoticeBoardIcon from '@/components/NoticeBoardIcon';
import NotificationBell from '@/components/NotificationBell';

const PIN_KEY = 'snrpmo.headerTools.pinned';

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setTheme(getTheme()); }, []);
  return (
    <button onClick={() => setTheme(toggleTheme())} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
      <Icon name={theme === 'dark' ? 'ti-sun' : 'ti-moon'} className="text-base" />
    </button>
  );
}

/**
 * Collapsible header tools cluster (Batch 4 #1).
 * Houses the secondary header actions (timers, chat, theme, requests, notices,
 * notifications) behind ONE control that expands LEFT on hover. Click the control
 * to PIN it open (persisted per-browser); collapsed by default (mobile too).
 * Children stay mounted while collapsed (display toggle, not unmount) so their
 * badge pollers keep running — when collapsed we surface an aggregate
 * "needs attention" count on the control so nothing is missed.
 */
export default function HeaderActions({ onOpenChat }: { onOpenChat: () => void }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [counts, setCounts] = useState({ requests: 0, notices: 0, notifs: 0 });

  // Restore the pin preference once mounted (localStorage is client-only).
  useEffect(() => {
    try { setPinned(localStorage.getItem(PIN_KEY) === '1'); } catch { /* ignore */ }
  }, []);

  const expanded = pinned || hover;
  const togglePin = () => {
    setPinned((p) => {
      const v = !p;
      try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* ignore */ }
      return v;
    });
    setHover(false); // touch taps fire mouseenter; reset so a tap collapses cleanly
  };

  const attention = counts.requests + counts.notices + counts.notifs;

  return (
    <div className="flex items-center gap-2 sm:gap-3"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* Tool group — kept mounted via display toggle so badges keep polling. */}
      <div className={`items-center gap-2 sm:gap-3 ${expanded ? 'flex' : 'hidden'}`}>
        <RunningTimers />
        <button onClick={onOpenChat} title="Chat"
          className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
          <Icon name="ti-messages" className="text-base" />
        </button>
        <ThemeToggle />
        <RequestsBell onCount={(n) => setCounts((c) => (c.requests === n ? c : { ...c, requests: n }))} />
        <NoticeBoardIcon onCount={(n) => setCounts((c) => (c.notices === n ? c : { ...c, notices: n }))} />
        <NotificationBell onCount={(n) => setCounts((c) => (c.notifs === n ? c : { ...c, notifs: n }))} />
      </div>

      {/* The single control: hover (desktop) peeks; click pins/unpins (persisted). */}
      <button onClick={togglePin}
        title={pinned ? 'Unpin tools' : expanded ? 'Pin tools open' : 'Tools'} aria-label="Header tools" aria-expanded={expanded}
        className={`relative h-9 w-9 grid place-items-center rounded-lg border transition ${
          pinned
            ? 'border-accent/60 text-accentstrong bg-accent/10'
            : 'border-line text-muted hover:text-content hover:bg-surface2'
        }`}>
        <Icon name={expanded ? 'ti-pin' : 'ti-dots'} className="text-base" />
        {!expanded && attention > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[#fff] text-2xs grid place-items-center">
            {attention > 9 ? '9+' : attention}
          </span>
        )}
      </button>
    </div>
  );
}
