import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, StickyNote } from '@/lib/db';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 border-amber-200', green: 'bg-emerald-100 border-emerald-200',
  blue: 'bg-sky-100 border-sky-200', pink: 'bg-pink-100 border-pink-200',
};
const DOT: Record<string, string> = { yellow: 'bg-amber-400', green: 'bg-emerald-400', blue: 'bg-sky-400', pink: 'bg-pink-400' };

/** Floating quick-notes — sidebar of note names + detail (content + the page it was made on). */
export default function StickyNotesFab() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => { if (me) listStickyNotes(me.id).then((n) => { setNotes(n); setSelId((cur) => cur || (n[0]?.id ?? null)); }).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me?.id]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const sel = notes.find((n) => n.id === selId) || null;
  const patch = (id: string, p: Partial<StickyNote>) => setNotes((arr) => arr.map((n) => (n.id === id ? { ...n, ...p } : n)));

  const add = async () => {
    if (!org || !me) return;
    try {
      const n = await createStickyNote({ org_id: org.id, user_id: me.id, body: '', color: 'yellow', title: '', page_path: router.asPath });
      setNotes((p) => [n, ...p]); setSelId(n.id);
    } catch { /* ignore */ }
  };
  const saveTitle = (n: StickyNote, title: string) => { if (title !== n.title) { patch(n.id, { title }); updateStickyNote(n.id, { title }).catch(() => {}); } };
  const saveBody = (n: StickyNote, body: string) => { if (body !== n.body) { patch(n.id, { body }); updateStickyNote(n.id, { body }).catch(() => {}); } };
  const setColor = (n: StickyNote, color: string) => { patch(n.id, { color }); updateStickyNote(n.id, { color }).catch(() => {}); };
  const del = async (n: StickyNote) => { setNotes((p) => p.filter((x) => x.id !== n.id)); if (selId === n.id) setSelId(null); deleteStickyNote(n.id).catch(() => {}); };

  if (!me) return null;
  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-40 print:hidden">
      {open && (
        <div className="mb-2 w-[32rem] max-w-[calc(100vw-2.5rem)] h-[24rem] bg-surface border border-line rounded-xl shadow-lg overflow-hidden flex">
          {/* Sidebar: note names */}
          <div className="w-40 shrink-0 border-r border-line flex flex-col">
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-line">
              <span className="text-sm font-medium">Notes</span>
              <button className="btn-ghost h-7 w-7 p-0 grid place-items-center" title="New note" onClick={add}><Icon name="ti-plus" className="text-sm" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notes.length === 0 ? <p className="text-2xs text-muted2 p-3">No notes yet.</p> : notes.map((n) => (
                <button key={n.id} onClick={() => setSelId(n.id)}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-2 border-b border-line/60 ${selId === n.id ? 'bg-accent/10' : 'hover:bg-surface2'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[n.color] || DOT.yellow}`} />
                  <span className="text-sm truncate text-content">{n.title?.trim() || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Detail */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!sel ? (
              <div className="flex-1 grid place-items-center text-2xs text-muted2 p-4 text-center">Select a note, or add a new one.</div>
            ) : (
              <div className={`flex-1 flex flex-col p-3 ${COLORS[sel.color] || COLORS.yellow} border-0`}>
                <input defaultValue={sel.title} key={'t' + sel.id} onBlur={(e) => saveTitle(sel, e.target.value)} placeholder="Note name"
                  className="bg-transparent text-sm font-semibold text-neutral-800 outline-none placeholder:text-neutral-400 mb-1" />
                <div className="flex items-center gap-1 text-2xs text-neutral-500 mb-2">
                  <Icon name="ti-file-text" className="text-2xs" />
                  <span className="truncate">on {sel.page_path || 'unknown page'}</span>
                  {sel.page_path && sel.page_path !== router.asPath && (
                    <button onClick={() => { setOpen(false); router.push(sel.page_path!); }} className="ml-1 text-sky-700 hover:underline shrink-0">open</button>
                  )}
                </div>
                <textarea defaultValue={sel.body} key={'b' + sel.id} onBlur={(e) => saveBody(sel, e.target.value)} placeholder="Write your note…"
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
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Quick notes"
        className="h-12 w-12 rounded-full bg-accent text-[#fff] shadow-lg grid place-items-center hover:opacity-90 transition">
        <Icon name={open ? 'ti-x' : 'ti-notes'} className="text-xl" />
      </button>
    </div>
  );
}
