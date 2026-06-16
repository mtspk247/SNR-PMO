import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, StickyNote } from '@/lib/db';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 border-amber-200', green: 'bg-emerald-100 border-emerald-200',
  blue: 'bg-sky-100 border-sky-200', pink: 'bg-pink-100 border-pink-200',
};
const DOT: Record<string, string> = { yellow: 'bg-amber-400', green: 'bg-emerald-400', blue: 'bg-sky-400', pink: 'bg-pink-400' };
const POS_KEY = 'sn_fab_pos';
const HIDE_KEY = 'sn_fab_hidden';

type Pos = { x: number; y: number };

/** Floating quick-notes — draggable, dismissable. Full management lives at /notes. */
export default function StickyNotesFab() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => { if (me) listStickyNotes(me.id).then((n) => { setNotes(n); setSelId((cur) => cur || (n[0]?.id ?? null)); }).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me?.id]);

  // Restore persisted position + hidden state.
  useEffect(() => {
    try { const r = localStorage.getItem(POS_KEY); if (r) { const p = JSON.parse(r); setPos(p); posRef.current = p; } } catch { /* ignore */ }
    try { if (localStorage.getItem(HIDE_KEY) === '1') setHidden(true); } catch { /* ignore */ }
    // Re-show if user re-enabled it from /notes (custom event) or another tab.
    const onShow = () => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* ignore */ } };
    window.addEventListener('sn-fab-show', onShow);
    return () => window.removeEventListener('sn-fab-show', onShow);
  }, []);

  const sel = notes.find((n) => n.id === selId) || null;
  const patch = (id: string, p: Partial<StickyNote>) => setNotes((arr) => arr.map((n) => (n.id === id ? { ...n, ...p } : n)));

  // --- Reliable autosave: edits queue into a dirty ref + debounce; we FLUSH on
  // blur, note-switch, panel-close and unmount so a click on any non-focusable
  // area still persists (the old onBlur-only path missed those clicks). ---
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
  // Flush whenever the panel closes, and on unmount.
  useEffect(() => { if (!open) flush(); /* eslint-disable-next-line */ }, [open]);
  useEffect(() => () => flush(), []); // eslint-disable-line

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { flush(); setOpen(false); } };
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

  // Drag-to-move. A click that doesn't move toggles the panel; a real drag repositions + persists.
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const base = posRef.current ?? { x: window.innerWidth - 68, y: window.innerHeight - 68 };
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        const x = Math.min(Math.max(8, base.x + dx), window.innerWidth - 56);
        const y = Math.min(Math.max(8, base.y + dy), window.innerHeight - 56);
        const np = { x, y }; posRef.current = np; setPos(np);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) { setOpen((o) => !o); if (!open) load(); }
      else { try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ } }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const hide = () => { flush(); setHidden(true); setOpen(false); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } };

  if (!me || hidden) return null;

  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 20 };

  return (
    <div ref={ref} style={style} className="fixed z-40 print:hidden">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[32rem] max-w-[calc(100vw-2.5rem)] h-[24rem] bg-surface border border-line rounded-xl shadow-lg overflow-hidden flex">
          {/* Sidebar: note names */}
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
            <Link href="/notes" onClick={() => { flush(); setOpen(false); }} className="text-2xs text-center text-muted hover:text-content border-t border-line py-2">All notes &amp; archive →</Link>
          </div>
          {/* Detail */}
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
                    <button onClick={() => { flush(); setOpen(false); router.push(sel.page_path!); }} className="ml-1 text-sky-700 hover:underline shrink-0">open</button>
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
      {/* FAB: drag to move, click to toggle, × to hide */}
      <div className="relative">
        <button onMouseDown={onDown} title="Quick notes — drag to move"
          className="h-12 w-12 rounded-full bg-accent text-[#fff] shadow-lg grid place-items-center hover:opacity-90 transition cursor-grab active:cursor-grabbing select-none">
          <Icon name={open ? 'ti-x' : 'ti-notes'} className="text-xl" />
        </button>
        <button onClick={hide} title="Hide notes button (re-enable from the Notes page)"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-surface border border-line text-muted2 hover:text-rose-600 grid place-items-center shadow">
          <Icon name="ti-x" className="text-2xs" />
        </button>
      </div>
    </div>
  );
}
