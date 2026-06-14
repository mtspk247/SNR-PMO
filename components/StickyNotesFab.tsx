import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, StickyNote } from '@/lib/db';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 border-amber-200', green: 'bg-emerald-100 border-emerald-200',
  blue: 'bg-sky-100 border-sky-200', pink: 'bg-pink-100 border-pink-200',
};

/** Floating quick-notes button — personal sticky notes on every page. */
export default function StickyNotesFab() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => { if (me) listStickyNotes(me.id).then(setNotes).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me?.id]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const add = async () => { if (!org || !me) return; try { const n = await createStickyNote({ org_id: org.id, user_id: me.id, body: '', color: 'yellow' }); setNotes((p) => [n, ...p]); } catch { /* ignore */ } };
  const save = (n: StickyNote, body: string) => { if (body !== n.body) updateStickyNote(n.id, { body }).catch(() => {}); };
  const setColor = (n: StickyNote, color: string) => { setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, color } : x))); updateStickyNote(n.id, { color }).catch(() => {}); };
  const del = async (n: StickyNote) => { setNotes((p) => p.filter((x) => x.id !== n.id)); deleteStickyNote(n.id).catch(() => {}); };

  if (!me) return null;
  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-40 print:hidden">
      {open && (
        <div className="mb-2 w-72 max-h-[60vh] overflow-y-auto bg-surface border border-line rounded-xl shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Sticky notes</span>
            <button className="btn h-7 px-2 text-2xs" onClick={add}><Icon name="ti-plus" />Note</button>
          </div>
          {notes.length === 0 ? <p className="text-2xs text-muted2 py-6 text-center">No notes yet — add one.</p> : notes.map((n) => (
            <div key={n.id} className={`rounded-lg border p-2 mb-2 ${COLORS[n.color] || COLORS.yellow}`}>
              <textarea defaultValue={n.body} onBlur={(e) => save(n, e.target.value)} placeholder="Write a note…" rows={3}
                className="w-full bg-transparent text-sm text-neutral-800 resize-none outline-none placeholder:text-neutral-400" />
              <div className="flex items-center gap-1.5 mt-1">
                {Object.keys(COLORS).map((c) => <button key={c} onClick={() => setColor(n, c)} className={`w-3.5 h-3.5 rounded-full border ${COLORS[c]}`} title={c} />)}
                <button onClick={() => del(n)} className="ml-auto text-neutral-400 hover:text-rose-600"><Icon name="ti-trash" className="text-xs" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} title="Quick notes"
        className="h-12 w-12 rounded-full bg-accent text-[#fff] shadow-lg grid place-items-center hover:opacity-90 transition">
        <Icon name={open ? 'ti-x' : 'ti-notes'} className="text-xl" />
      </button>
    </div>
  );
}
