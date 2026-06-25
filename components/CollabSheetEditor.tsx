import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { sb } from '@/lib/supabase';
import { SupabaseProvider, b64ToU8, u8ToB64, PresenceUser } from '@/lib/yProvider';
import { loadDocState, saveDocState } from '@/lib/db';
import { Icon } from '@/components/ui';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const colorFor = (id: string) => COLORS[Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
const initials = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const COLS = 12; const ROWS = 50;
const colName = (i: number) => String.fromCharCode(65 + i);
const ckey = (r: number, c: number) => r + ':' + c;

// Live collaborative spreadsheet on the same Yjs/Supabase-Realtime substrate as docs.
// Cells live in a Y.Map keyed "row:col" — concurrent edits to different cells merge
// conflict-free; same-cell is last-write-wins. Debounced autosave (CRDT state + CSV snapshot).
export default function CollabSheetEditor({ fileId, meId, meName, canEdit }: {
  fileId: string; meId: string; meName: string; canEdit: boolean;
}) {
  const me: PresenceUser = useMemo(() => ({ id: meId, name: meName || 'Someone', color: colorFor(meId) }), [meId, meName]);
  const [ydoc] = useState(() => new Y.Doc());
  const [provider] = useState(() => new SupabaseProvider(sb, `drive_doc:${fileId}`, ydoc, me));
  const ymap = useMemo(() => ydoc.getMap<string>('cells'), [ydoc]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false); const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sync = () => { const o: Record<string, string> = {}; ymap.forEach((v, k) => { o[k] = v as string; }); setCells(o); };
    ymap.observe(sync); sync();
    return () => ymap.unobserve(sync);
  }, [ymap]);

  useEffect(() => {
    if (loaded.current) return; loaded.current = true;
    (async () => { try { const st = await loadDocState(fileId); if (st.doc_state) Y.applyUpdate(ydoc, b64ToU8(st.doc_state)); } catch { /* ignore */ } })();
  }, [fileId, ydoc]);

  const flush = async () => {
    if (!dirty.current || !canEdit) return; dirty.current = false; setSaving('saving');
    try {
      const rows: string[] = [];
      for (let r = 0; r < ROWS; r++) { const cols: string[] = []; for (let c = 0; c < COLS; c++) cols.push('"' + (ymap.get(ckey(r, c)) || '').replace(/"/g, '""') + '"'); rows.push(cols.join(',')); }
      await saveDocState(fileId, { doc_state: u8ToB64(Y.encodeStateAsUpdate(ydoc)), content: rows.join('\n') });
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

  return (
    <div className="rounded-lg border border-line overflow-hidden bg-surface flex flex-col">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-line bg-surface2/50">
        <span className="text-2xs text-muted2 inline-flex items-center"><Icon name="ti-table" className="mr-1" />{canEdit ? 'Live spreadsheet' : 'Read-only'}</span>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && <span className="text-2xs text-muted2 w-12 text-right">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>}
          <div className="flex items-center -space-x-1.5">{peers.slice(0, 6).map((p) => <span key={p.id} title={p.name} className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold text-white ring-2 ring-surface" style={{ background: p.color }}>{initials(p.name)}</span>)}</div>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface2 border border-line w-10"></th>
              {Array.from({ length: COLS }).map((_, c) => <th key={c} className="border border-line bg-surface2 text-2xs text-muted2 font-medium w-28 px-1">{colName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }).map((_, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-surface2 border border-line text-2xs text-muted2 text-center w-10">{r + 1}</td>
                {Array.from({ length: COLS }).map((_, c) => (
                  <td key={c} className="border border-line p-0">
                    <input className="w-28 px-1 py-0.5 bg-transparent outline-none focus:bg-accent/10 text-sm" value={cells[ckey(r, c)] || ''} readOnly={!canEdit} onChange={(e) => ymap.set(ckey(r, c), e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
