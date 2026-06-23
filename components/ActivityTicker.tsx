import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { displayName } from '@/lib/format';
import { getRecentActivity, ActivityItem } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

const VERB: Record<string, string> = { INSERT: 'created', UPDATE: 'updated', DELETE: 'deleted' };
const niceEntity = (t: string | null) => (t || 'item').replace(/_/g, ' ');

function hrefFor(a: ActivityItem): string | null {
  const t = a.entity_type, id = a.entity_id;
  if (!t) return null;
  if (t === 'task' && id) return `/tasks?task=${id}`;
  if (t === 'project' && id) return `/projects/${id}`;
  if ((t === 'crm_deal' || t === 'deal') && id) return `/crm/deal/${id}`;
  if (t === 'company' && id) return `/companies/${id}`;
  if ((t === 'employee' || t === 'user') && id) return `/employees/${id}`;
  if (t === 'idea' && id) return `/ideas/${id}`;
  return null;
}

/** Rotating live-activity ticker for the header. Pause / clear / stop. */
export default function ActivityTicker() {
  const org = useActiveOrg();
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const idxRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    try { setPaused(localStorage.getItem('act_paused') === '1'); setStopped(localStorage.getItem('act_stopped') === '1'); } catch { /* ignore */ }
  }, []);

  // Poll recent activity (skip entirely while stopped).
  useEffect(() => {
    if (stopped || !org) { setItems([]); return; }
    let alive = true;
    const load = () => getRecentActivity()
      .then((rows) => { if (alive) setItems(rows); })
      .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [org?.id, stopped]);

  // Rotate (each item slides up in; long items reveal-scroll horizontally — see render).
  useEffect(() => {
    if (stopped || paused || hovered || items.length === 0) return;
    const t = setInterval(() => { idxRef.current = (idxRef.current + 1) % Math.max(items.length, 1); setIdx(idxRef.current); }, 4000);
    return () => clearInterval(t);
  }, [items.length, paused, stopped, hovered]);
  // Measure horizontal overflow of the current line → drives the reveal-scroll distance.
  useLayoutEffect(() => {
    const ov = (textRef.current?.scrollWidth || 0) - (boxRef.current?.clientWidth || 0);
    setScroll(ov > 6 ? ov + 12 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, items]);
  useEffect(() => {
    const onR = () => { const ov = (textRef.current?.scrollWidth || 0) - (boxRef.current?.clientWidth || 0); setScroll(ov > 6 ? ov + 12 : 0); };
    window.addEventListener('resize', onR); return () => window.removeEventListener('resize', onR);
  }, []);

  const setP = (v: boolean) => { setPaused(v); try { localStorage.setItem('act_paused', v ? '1' : '0'); } catch { /* ignore */ } };
  const setS = (v: boolean) => { setStopped(v); try { localStorage.setItem('act_stopped', v ? '1' : '0'); } catch { /* ignore */ } };

  if (stopped) {
    return (
      <button onClick={() => setS(false)} title="Show live activity"
        className="flex items-center gap-1.5 text-2xs text-muted2 hover:text-content">
        <Icon name="ti-player-play" className="text-sm" /><span className="uppercase tracking-wide">Activity off</span>
      </button>
    );
  }

  const cur = items[Math.min(idx, items.length - 1)];
  const href = cur ? hrefFor(cur) : null;

  return (
    <div className="group flex items-center gap-3 w-full min-w-0" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-2xs font-medium uppercase tracking-wide text-muted2">Live</span>
      </span>
      <span className="h-3.5 w-px bg-line shrink-0" />
      <div ref={boxRef} className="min-w-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <span className="text-2xs text-muted2 italic">No recent activity</span>
        ) : (
          <button onClick={() => href && router.push(href)} disabled={!href}
            title={cur ? `${cur.username || 'Someone'} ${VERB[cur.action] || (cur.action || '').toLowerCase()} ${niceEntity(cur.entity_type)} · ${new Date(cur.ts).toLocaleString()}` : ''}
            className={`block max-w-full text-2xs text-left ${href ? 'text-content hover:text-accentstrong cursor-pointer' : 'text-content cursor-default'}`}>
            <span key={idx} className="inline-block max-w-full align-bottom" style={{ animation: 'ticker-in 0.35s ease-out' }}>
              <span ref={textRef} key={`${idx}:${scroll}`}
                className={`inline-block whitespace-nowrap will-change-transform ${scroll > 0 ? 'group-hover:[animation-play-state:paused]' : ''}`}
                style={scroll > 0 ? ({ animation: `ticker-reveal ${Math.min(3.4, Math.max(1.8, scroll / 45))}s linear`, '--ticker-tx': `-${scroll}px` } as any) : undefined}>
                <span className="font-semibold">{displayName(cur?.username ?? null) || 'Someone'}</span>{' '}
                <span className="text-muted">{VERB[cur?.action || ''] || (cur?.action || '').toLowerCase()}</span>{' '}
                <span className="font-medium">{niceEntity(cur?.entity_type ?? null)}</span>
                <span className="text-muted2"> · {new Date(cur!.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 text-muted2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => setP(!paused)} title={paused ? 'Resume' : 'Pause'} className="hover:text-content p-1"><Icon name={paused ? 'ti-player-play' : 'ti-player-pause'} className="text-sm" /></button>
        <button onClick={() => { setItems([]); setIdx(0); idxRef.current = 0; }} title="Clear" className="hover:text-content p-1"><Icon name="ti-eraser" className="text-sm" /></button>
        <button onClick={() => setS(true)} title="Stop (hide)" className="hover:text-rose-500 p-1"><Icon name="ti-player-stop" className="text-sm" /></button>
      </div>
    </div>
  );
}
