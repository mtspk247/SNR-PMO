import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { sb } from '@/lib/supabase';
import { SupabaseProvider, b64ToU8, u8ToB64, PresenceUser } from '@/lib/yProvider';
import { loadDocState, saveDocState } from '@/lib/db';
import { Icon } from '@/components/ui';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const colorFor = (id: string) => COLORS[Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
const initials = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

type Slide = { title: string; body: string };

// Live collaborative presentation on the same Yjs/Realtime substrate. Slides are a
// Y.Array of Y.Maps {title, body} — add/remove/reorder & per-field edits merge CRDT-style.
export default function CollabSlideEditor({ fileId, meId, meName, canEdit }: {
  fileId: string; meId: string; meName: string; canEdit: boolean;
}) {
  const me: PresenceUser = useMemo(() => ({ id: meId, name: meName || 'Someone', color: colorFor(meId) }), [meId, meName]);
  const [ydoc] = useState(() => new Y.Doc());
  const [provider] = useState(() => new SupabaseProvider(sb, `drive_doc:${fileId}`, ydoc, me));
  const yslides = useMemo(() => ydoc.getArray<Y.Map<string>>('slides'), [ydoc]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [active, setActive] = useState(0);
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false); const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const rebuild = () => { const arr: Slide[] = []; yslides.forEach((m) => arr.push({ title: (m.get('title') || '') as string, body: (m.get('body') || '') as string })); setSlides(arr); };
    yslides.observeDeep(rebuild); rebuild();
    return () => yslides.unobserveDeep(rebuild);
  }, [yslides]);

  useEffect(() => {
    if (loaded.current) return; loaded.current = true;
    (async () => {
      try { const st = await loadDocState(fileId); if (st.doc_state) Y.applyUpdate(ydoc, b64ToU8(st.doc_state)); } catch { /* ignore */ }
      if (yslides.length === 0 && canEdit) { const m = new Y.Map<string>(); m.set('title', 'Slide 1'); m.set('body', ''); yslides.push([m]); }
    })();
  }, [fileId, ydoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = async () => {
    if (!dirty.current || !canEdit) return; dirty.current = false; setSaving('saving');
    try {
      const content = slides.map((s, i) => `# Slide ${i + 1}: ${s.title}\n${s.body}`).join('\n\n');
      await saveDocState(fileId, { doc_state: u8ToB64(Y.encodeStateAsUpdate(ydoc)), content });
      setSaving('saved');
    } catch { setSaving('idle'); }
  };
  useEffect(() => {
    if (!canEdit) return;
    const onU = (_u: Uint8Array, origin: unknown) => { if (origin === provider) return; dirty.current = true; setSaving('idle'); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(flush, 1500); };
    ydoc.on('update', onU);
    return () => { ydoc.off('update', onU); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [canEdit, ydoc, provider]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const u = () => setPeers(provider.onlineUsers()); provider.awareness.on('change', u); u(); return () => provider.awareness.off('change', u); }, [provider]);
  useEffect(() => () => { flush(); provider.destroy(); ydoc.destroy(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (i: number, field: 'title' | 'body', v: string) => { const m = yslides.get(i); if (m) m.set(field, v); };
  const addSlide = () => { const m = new Y.Map<string>(); m.set('title', 'Slide ' + (yslides.length + 1)); m.set('body', ''); yslides.push([m]); setActive(yslides.length - 1); };
  const delSlide = (i: number) => { if (yslides.length <= 1) return; yslides.delete(i, 1); setActive(Math.max(0, i - 1)); };

  const cur = slides[active] || { title: '', body: '' };
  return (
    <div className="rounded-lg border border-line overflow-hidden bg-surface flex flex-col">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-line bg-surface2/50">
        <span className="text-2xs text-muted2 inline-flex items-center"><Icon name="ti-presentation" className="mr-1" />{canEdit ? 'Live presentation' : 'Read-only'}</span>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && <span className="text-2xs text-muted2 w-12 text-right">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>}
          <div className="flex items-center -space-x-1.5">{peers.slice(0, 6).map((p) => <span key={p.id} title={p.name} className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold text-white ring-2 ring-surface" style={{ background: p.color }}>{initials(p.name)}</span>)}</div>
        </div>
      </div>
      <div className="grid grid-cols-[10rem_1fr]" style={{ minHeight: '50vh' }}>
        <div className="border-r border-line overflow-auto max-h-[55vh] p-2 space-y-1.5">
          {slides.map((s, i) => (
            <button key={i} onClick={() => setActive(i)} className={`w-full text-left rounded-md border p-2 ${i === active ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface2'}`}>
              <span className="text-2xs text-muted2">Slide {i + 1}</span>
              <span className="block text-xs font-medium truncate">{s.title || 'Untitled'}</span>
            </button>
          ))}
          {canEdit && <button onClick={addSlide} className="w-full rounded-md border border-dashed border-line p-2 text-2xs text-muted2 hover:bg-surface2"><Icon name="ti-plus" className="mr-1" />Add slide</button>}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input className="input text-lg font-semibold flex-1" value={cur.title} readOnly={!canEdit} placeholder="Slide title" onChange={(e) => setField(active, 'title', e.target.value)} />
            {canEdit && slides.length > 1 && <button onClick={() => delSlide(active)} className="text-muted2 hover:text-rose-500" title="Delete slide"><Icon name="ti-trash" /></button>}
          </div>
          <textarea className="input w-full min-h-[40vh] resize-none" value={cur.body} readOnly={!canEdit} placeholder="Slide content…" onChange={(e) => setField(active, 'body', e.target.value)} />
        </div>
      </div>
    </div>
  );
}
