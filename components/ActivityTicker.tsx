import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { getRecentActivity, ActivityItem } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

const VERB: Record<string, string> = { INSERT: 'created', UPDATE: 'updated', DELETE: 'deleted' };
const niceEntity = (t: string | null) => (t || 'item').replace(/_/g, ' ');
const firstName = (u: string | null) => (u || 'Someone').trim().split(/\s+/)[0];

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
  const [vis, setVis] = useState(true);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const idxRef = useRef(0);

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

  // Rotate with a quick fade.
  useEffect(() => {
    if (stopped || paused || hovered || items.length === 0) return;
    const t = setInterval(() => {
      setVis(false);
      setTimeout(() => { idxRef.current = (idxRef.current + 1) % Math.max(items.length, 1); setIdx(idxRef.current); setVis(true); }, 200);
    }, 3500);
    return () => clearInterval(t);
  }, [items.length, paused, stopped, hovered]);

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
      <div className="min-w-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <span className="text-2xs text-muted2 italic">No recent activity</span>
        ) : (
          <button onClick={() => href && router.push(href)} disabled={!href}
            title={cur ? `${firstName(cur.username)} ${VERB[cur.action] || (cur.action || '').toLowerCase()} ${niceEntity(cur.entity_type)} · ${new Date(cur.ts).toLocaleString()}` : ''}
            className={`block truncate text-2xs transition-opacity duration-200 ${vis ? 'opacity-100' : 'opacity-0'} ${href ? 'text-content hover:text-accentstrong cursor-pointer' : 'text-content cursor-default'}`}>
            <span className="font-semibold">{firstName(cur?.username ?? null)}</span>{' '}
            <span className="text-muted">{VERB[cur?.action || ''] || (cur?.action || '').toLowerCase()}</span>{' '}
            <span className="font-medium">{niceEntity(cur?.entity_type ?? null)}</span>
            <span className="text-muted2"> · {new Date(cur!.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
