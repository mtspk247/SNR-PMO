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

// ---- Tiny, safe spreadsheet formula engine ----
// Cells store the raw string ("=A1+B2", "=SUM(A1:A10)", "100", or text). Display computes
// formulas; refs resolve recursively with a cycle guard; the final arithmetic is sanitized
// to numbers/operators before evaluation (never eval of arbitrary input).
const refToKey = (ref: string): string | null => {
  const m = ref.toUpperCase().match(/^([A-Z]+)([0-9]+)$/); if (!m) return null;
  let col = 0; for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  col -= 1; const row = parseInt(m[2], 10) - 1; if (row < 0 || col < 0) return null; return row + ':' + col;
};
const numVal = (key: string, cells: Record<string, string>, seen: Set<string>): number => {
  if (seen.has(key)) return 0;
  const raw = cells[key]; if (raw == null || raw === '') return 0;
  if (raw[0] === '=') { const v = evalFormula(raw.slice(1), cells, new Set(seen).add(key)); return typeof v === 'number' ? v : 0; }
  const n = parseFloat(raw); return isNaN(n) ? 0 : n;
};
function evalFormula(expr: string, cells: Record<string, string>, seen: Set<string>): number | string {
  try {
    let e = expr.replace(/\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\s*\(\s*([A-Z]+[0-9]+)\s*:\s*([A-Z]+[0-9]+)\s*\)/gi, (_m, fn, a, b) => {
      const ka = refToKey(a), kb = refToKey(b); if (!ka || !kb) return '0';
      const [r1, c1] = ka.split(':').map(Number); const [r2, c2] = kb.split(':').map(Number);
      const vals: number[] = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) vals.push(numVal(r + ':' + c, cells, seen));
      const f = fn.toUpperCase();
      if (f === 'SUM') return String(vals.reduce((x, y) => x + y, 0));
      if (f === 'AVG' || f === 'AVERAGE') return String(vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0);
      if (f === 'MIN') return String(vals.length ? Math.min(...vals) : 0);
      if (f === 'MAX') return String(vals.length ? Math.max(...vals) : 0);
      if (f === 'COUNT') return String(vals.length);
      return '0';
    });
    e = e.replace(/\b([A-Z]+[0-9]+)\b/gi, (ref) => { const k = refToKey(ref); return k ? String(numVal(k, cells, seen)) : '0'; });
    if (e.trim() === '') return 0;
    if (!/^[0-9+\-*/().\s]*$/.test(e)) return '#ERR';
    // eslint-disable-next-line no-new-func
    const r = Function('"use strict"; return (' + e + ')')();
    return typeof r === 'number' && isFinite(r) ? Math.round(r * 1e6) / 1e6 : '#ERR';
  } catch { return '#ERR'; }
}
const displayCell = (key: string, cells: Record<string, string>): string => {
  const raw = cells[key]; if (raw == null) return '';
  if (raw[0] === '=') return String(evalFormula(raw.slice(1), cells, new Set([key])));
  return raw;
};

// Live collaborative spreadsheet — Y.Map of cells (row:col), presence, autosave, formulas.
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
  const [focused, setFocused] = useState<string | null>(null);
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
      for (let r = 0; r < ROWS; r++) { const cols: string[] = []; for (let c = 0; c < COLS; c++) cols.push('"' + displayCell(ckey(r, c), Object.fromEntries(ymap.entries()) as Record<string, string>).replace(/"/g, '""') + '"'); rows.push(cols.join(',')); }
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
        <span className="text-2xs text-muted2 inline-flex items-center"><Icon name="ti-table" className="mr-1" />{canEdit ? 'Live spreadsheet · start a cell with = for formulas' : 'Read-only'}</span>
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
                {Array.from({ length: COLS }).map((_, c) => {
                  const key = ckey(r, c);
                  const isF = focused === key;
                  const shown = isF ? (cells[key] || '') : displayCell(key, cells);
                  const isFormula = (cells[key] || '')[0] === '=';
                  return (
                    <td key={c} className="border border-line p-0">
                      <input className={`w-28 px-1 py-0.5 bg-transparent outline-none focus:bg-accent/10 text-sm ${!isF && isFormula ? 'text-accentstrong' : ''}`}
                        value={shown} readOnly={!canEdit}
                        onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
                        onChange={(e) => ymap.set(key, e.target.value)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
