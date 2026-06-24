import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import {
  listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, StickyNote,
  getMyOpenToday,
} from '@/lib/db';
import { Attendance, FabEntry } from '@/lib/supabase';
import { performCheckIn, performCheckOut } from '@/lib/attendance';
import { useActiveOrg, useAuthStore } from '@/lib/store';

// --- Configurable shortcut catalog (admin picks which appear, in Settings ▸ Workspace) ---
type FabKind = 'notes' | 'checkin' | 'route' | 'event';
export interface FabShortcutDef { id: string; label: string; icon: string; kind: FabKind; href?: string; event?: string; }
export const FAB_SHORTCUTS: FabShortcutDef[] = [
  { id: 'notes',    label: 'Quick notes',    icon: 'ti-notes',      kind: 'notes' },
  { id: 'checkin',  label: 'Check in / out', icon: 'ti-clock-play', kind: 'checkin' },
  { id: 'chat',     label: 'Team chat',      icon: 'ti-messages',   kind: 'event', event: 'snr:open-chat' },
  { id: 'task',     label: 'New task',       icon: 'ti-checkbox',   kind: 'route', href: '/tasks' },
  { id: 'calendar', label: 'Calendar',       icon: 'ti-calendar',   kind: 'route', href: '/calendar' },
  { id: 'ask',      label: 'Ask AI',         icon: 'ti-sparkles',   kind: 'event', event: 'snr:open-assistant' },
  { id: 'dashboard',label: 'Dashboard',      icon: 'ti-layout-dashboard', kind: 'route', href: '/' },
  { id: 'crm',      label: 'CRM / Deals',    icon: 'ti-target',     kind: 'route', href: '/crm' },
  { id: 'clients',  label: 'Clients',        icon: 'ti-building',    kind: 'route', href: '/clients' },
  { id: 'projects', label: 'Projects',       icon: 'ti-folder',     kind: 'route', href: '/projects' },
  { id: 'support',  label: 'Support',        icon: 'ti-lifebuoy',   kind: 'route', href: '/support' },
  { id: 'docs',     label: 'Help & docs',    icon: 'ti-help',       kind: 'route', href: '/docs' },
];
export const FAB_DEFAULT_IDS = ['notes', 'checkin', 'chat', 'task'];

// Vibrant per-action colors for the speed-dial circles (custom shortcuts cycle the palette).
const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f97316'];
const FAB_COLORS: Record<string, string> = {
  notes: '#f59e0b', checkin: '#10b981', chat: '#0ea5e9', task: '#6366f1', calendar: '#f43f5e',
  ask: '#8b5cf6', dashboard: '#14b8a6', crm: '#f97316', clients: '#06b6d4', projects: '#6366f1',
  support: '#ef4444', docs: '#0891b2',
};

const COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 border-amber-200', green: 'bg-emerald-100 border-emerald-200',
  blue: 'bg-sky-100 border-sky-200', pink: 'bg-pink-100 border-pink-200',
};
const DOT: Record<string, string> = { yellow: 'bg-amber-400', green: 'bg-emerald-400', blue: 'bg-sky-400', pink: 'bg-pink-400' };
const POS_KEY = 'sn_fab_pos';
const HIDE_KEY = 'sn_fab_hidden';

type Pos = { x: number; y: number };

/** Floating shortcuts launcher — admin-configurable quick actions (notes, check-in, chat, …).
 *  Draggable + dismissable; the Quick-notes shortcut opens the same panel as before. */
export default function ShortcutsFab() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Resolve enabled entries (admin-set; sensible default otherwise). Each entry is either a
  // built-in id (string) or a custom { id,label,icon,href } object.
  const entries: FabEntry[] = Array.isArray(org?.fab_shortcuts) ? org!.fab_shortcuts! : FAB_DEFAULT_IDS;
  const shortcuts: FabShortcutDef[] = entries
    .map((e) => (typeof e === 'string'
      ? FAB_SHORTCUTS.find((s) => s.id === e)
      : { id: e.id, label: e.label, icon: e.icon || 'ti-link', kind: 'route' as FabKind, href: e.href }))
    .filter((s): s is FabShortcutDef => !!s);
  // 'Ask AI' lives in the FAB cluster itself (permanent pill, below) — never the dial
  // fan and never a separate floating entity. The fan shows only the other shortcuts.
  const otherShortcuts = shortcuts.filter((s) => s.id !== 'ask');

  // --- Check-in/out (attendance) — same db path as /attendance; geolocation is a later slice. ---
  const [att, setAtt] = useState<Attendance | null>(null);
  const [pill, setPill] = useState('');
  const flash = (m: string) => { setPill(m); setTimeout(() => setPill(''), 2600); };
  useEffect(() => { if (me) getMyOpenToday(me.id).then(setAtt).catch(() => {}); }, [me?.id]);
  const toggleCheckin = async () => {
    if (!me || !org) return;
    try {
      if (att) { await performCheckOut(att); setAtt(null); flash('Checked out ✓'); }
      else { const a = await performCheckIn(me, org); setAtt(a); }
    } catch (e: any) { flash(e?.message || 'Could not update attendance'); }
  };

  const load = () => { if (me) listStickyNotes(me.id).then((n) => { setNotes(n); setSelId((cur) => cur || (n[0]?.id ?? null)); }).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me?.id]);

  // Restore persisted position + hidden state.
  useEffect(() => {
    try { const r = localStorage.getItem(POS_KEY); if (r) { const p = JSON.parse(r); setPos(p); posRef.current = p; } } catch { /* ignore */ }
    try { if (localStorage.getItem(HIDE_KEY) === '1') setHidden(true); } catch { /* ignore */ }
    const onShow = () => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* ignore */ } };
    window.addEventListener('sn-fab-show', onShow);
    return () => window.removeEventListener('sn-fab-show', onShow);
  }, []);

  const sel = notes.find((n) => n.id === selId) || null;
  const patch = (id: string, p: Partial<StickyNote>) => setNotes((arr) => arr.map((n) => (n.id === id ? { ...n, ...p } : n)));

  // Reliable autosave: edits queue into a dirty ref + debounce; FLUSH on blur, switch, close, unmount.
  const dirty = useRef<Record<string, Partial<StickyNote>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const d = dirty.current; dirty.current = {};
    Object.entries(d).forEach(([id, p]) => { updateStickyNote(id, p).catch(() => {}); });
  };
  const queueSave = (id: string, p: Partial<StickyNote>) => {
    patch(id, p);
    dirty.current[id] = { ...(dirty.current[id] || {}), ...p };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };
  useEffect(() => { if (!notesOpen) flush(); /* eslint-disable-next-line */ }, [notesOpen]);
  useEffect(() => () => flush(), []); // eslint-disable-line

  // Close panels (and flush notes) on an outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { flush(); setMenuOpen(false); setNotesOpen(false); } };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const add = async () => {
    if (!org || !me) return;
    flush();
    try {
      const n = await createStickyNote({ org_id: org.id, user_id: me.id, body: '', color: 'yellow', title: '', page_path: router.asPath });
      setNotes((p) => [n, ...p]); setSelId(n.id);
    } catch { /* ignore */ }
  };
  const selectNote = (id: string) => { flush(); setSelId(id); };
  const setColor = (n: StickyNote, color: string) => { queueSave(n.id, { color }); flush(); };
  const del = async (n: StickyNote) => { delete dirty.current[n.id]; setNotes((p) => p.filter((x) => x.id !== n.id)); if (selId === n.id) setSelId(null); deleteStickyNote(n.id).catch(() => {}); };

  const runShortcut = (s: FabShortcutDef) => {
    setMenuOpen(false);
    if (s.kind === 'notes') { setNotesOpen(true); load(); return; }
    if (s.kind === 'checkin') { toggleCheckin(); return; }
    if (s.kind === 'route' && s.href) { if (/^https?:\/\//i.test(s.href)) { try { window.open(s.href, '_blank', 'noopener'); } catch { /* ignore */ } } else { router.push(s.href); } return; }
    if (s.kind === 'event' && s.event) { try { window.dispatchEvent(new CustomEvent(s.event)); } catch { /* ignore */ } return; }
  };
  const labelFor = (s: FabShortcutDef) => (s.kind === 'checkin' ? (att ? 'Check out' : 'Check in') : s.label);
  const openAssistant = () => { setMenuOpen(false); setNotesOpen(false); flush(); try { window.dispatchEvent(new CustomEvent('snr:open-assistant')); } catch { /* ignore */ } };

  // Drag-to-move. A click that doesn't move toggles the launcher; a real drag repositions + persists.
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const base = posRef.current ?? { x: window.innerWidth - 168, y: window.innerHeight - 68 };
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        const x = Math.min(Math.max(8, base.x + dx), window.innerWidth - 168);
        const y = Math.min(Math.max(8, base.y + dy), window.innerHeight - 56);
        const np = { x, y }; posRef.current = np; setPos(np);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) {
        if (notesOpen) { flush(); setNotesOpen(false); }
        else { setMenuOpen((o) => !o); }
      } else { try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ } }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const hide = () => { flush(); setHidden(true); setMenuOpen(false); setNotesOpen(false); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } };

  if (!me || hidden) return null;

  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 20 };
  const fabIcon = notesOpen || menuOpen ? 'ti-x' : 'ti-bolt';

  return (
    <div ref={ref} style={style} className="fixed z-40 print:hidden">
      <style>{`@keyframes snrFabPop{from{opacity:0;transform:translateY(10px) scale(.8)}to{opacity:1;transform:none}}`}</style>
      {/* Speed-dial launcher: a fan of round icon buttons (Ask AI is the highlighted hero, nearest the FAB) */}
      {menuOpen && !notesOpen && (
        <div className="absolute bottom-full right-0 mb-3 flex flex-col items-end gap-2.5">
          {otherShortcuts.map((s) => ({ s, hero: false })).map(({ s, hero }, i, arr) => {
            const color = FAB_COLORS[s.id] || PALETTE[i % PALETTE.length];
            return (
              <div key={s.id} className="flex items-center gap-2"
                style={{ animation: 'snrFabPop .2s cubic-bezier(.34,1.56,.64,1) both', animationDelay: `${(arr.length - 1 - i) * 26}ms` }}>
                <span className="px-2 py-1 rounded-md bg-content text-surface text-2xs font-medium shadow whitespace-nowrap">{labelFor(s)}</span>
                <button onClick={() => runShortcut(s)} title={labelFor(s)} style={{ background: color }}
                  className={`relative rounded-full shadow-lg grid place-items-center text-[#fff] transition hover:scale-110 ${hero ? 'h-12 w-12 ring-2 ring-white/70' : 'h-11 w-11'}`}>
                  <Icon name={s.icon} className={hero ? 'text-xl' : 'text-lg'} />
                  {s.kind === 'checkin' && att && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Checked in" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick-notes panel (opened by the Notes shortcut) */}
      {notesOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-[32rem] max-w-[calc(100vw-2.5rem)] h-[24rem] bg-surface border border-line rounded-xl shadow-lg overflow-hidden flex">
          <div className="w-40 shrink-0 border-r border-line flex flex-col">
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-line">
              <span className="text-sm font-medium">Notes</span>
              <button className="btn-ghost h-7 w-7 p-0 grid place-items-center" title="New note" onClick={add}><Icon name="ti-plus" className="text-sm" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notes.length === 0 ? <p className="text-2xs text-muted2 p-3">No notes yet.</p> : notes.map((n) => (
                <button key={n.id} onClick={() => selectNote(n.id)}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-2 border-b border-line/60 ${selId === n.id ? 'bg-accent/10' : 'hover:bg-surface2'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[n.color] || DOT.yellow}`} />
                  <span className="text-sm truncate text-content">{n.title?.trim() || 'Untitled'}</span>
                </button>
              ))}
            </div>
            <Link href="/notes" onClick={() => { flush(); setNotesOpen(false); }} className="text-2xs text-center text-muted hover:text-content border-t border-line py-2">All notes &amp; archive →</Link>
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            {!sel ? (
              <div className="flex-1 grid place-items-center text-2xs text-muted2 p-4 text-center">Select a note, or add a new one.</div>
            ) : (
              <div className={`flex-1 flex flex-col p-3 ${COLORS[sel.color] || COLORS.yellow} border-0`}>
                <input value={sel.title || ''} onChange={(e) => queueSave(sel.id, { title: e.target.value })} onBlur={flush} placeholder="Note name"
                  className="bg-transparent text-sm font-semibold text-neutral-800 outline-none placeholder:text-neutral-400 mb-1" />
                <div className="flex items-center gap-1 text-2xs text-neutral-500 mb-2">
                  <Icon name="ti-file-text" className="text-2xs" />
                  <span className="truncate">on {sel.page_path || 'unknown page'}</span>
                  {sel.page_path && sel.page_path !== router.asPath && (
                    <button onClick={() => { flush(); setNotesOpen(false); router.push(sel.page_path!); }} className="ml-1 text-sky-700 hover:underline shrink-0">open</button>
                  )}
                </div>
                <textarea value={sel.body || ''} onChange={(e) => queueSave(sel.id, { body: e.target.value })} onBlur={flush} placeholder="Write your note…"
                  className="flex-1 bg-transparent text-sm text-neutral-800 resize-none outline-none placeholder:text-neutral-400" />
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-black/10">
                  {Object.keys(COLORS).map((c) => <button key={c} onClick={() => setColor(sel, c)} className={`w-4 h-4 rounded-full border ${COLORS[c]} ${sel.color === c ? 'ring-2 ring-neutral-500' : ''}`} title={c} />)}
                  <button onClick={() => del(sel)} className="ml-auto text-neutral-500 hover:text-rose-600" title="Delete note"><Icon name="ti-trash" className="text-sm" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transient action feedback (e.g. check-in) */}
      {pill && !notesOpen && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-content text-surface text-xs shadow-lg whitespace-nowrap">{pill}</div>
      )}

      {/* FAB cluster: ONE floating control — ⚡ launcher (drag/toggle dial) + permanent ✨ Ask. × hides. */}
      <div className="relative inline-flex items-stretch rounded-full bg-accent text-[#fff] shadow-lg select-none">
        <button onMouseDown={onDown} title="Shortcuts — drag to move"
          className="h-12 w-12 rounded-l-full grid place-items-center hover:bg-white/10 transition cursor-grab active:cursor-grabbing border-r border-white/25">
          <Icon name={fabIcon} className="text-xl" />
        </button>
        <button onClick={openAssistant} title="Ask AI" aria-label="Ask AI"
          className="h-12 pl-3 pr-4 rounded-r-full flex items-center gap-1.5 hover:bg-white/10 transition">
          <Icon name="ti-sparkles" className="text-lg" />
          <span className="text-sm font-medium">Ask</span>
        </button>
        <button onClick={hide} title="Hide (restore from Settings ▸ Shortcuts)"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-surface border border-line text-muted2 hover:text-rose-600 grid place-items-center shadow">
          <Icon name="ti-x" className="text-2xs" />
        </button>
      </div>
    </div>
  );
}
