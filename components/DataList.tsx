import { useState, useEffect, useLayoutEffect, useRef, ReactNode } from 'react';
import type { PointerEvent as RPointerEvent, CSSProperties } from 'react';
import { Icon, Avatar, INLINE_SELECT_CLS } from '@/components/ui';
import Dropdown from '@/components/Dropdown';
import type { ColDef, ListPrefs } from '@/components/ListToolbar';
import { HeadCheckbox, RowCheckbox } from '@/components/RowSelection';
import AddColumnForm from '@/components/AddColumnForm';
import { useAuthStore } from '@/lib/store';

// One reusable, ClickUp-style list: PLAIN borderless rows that highlight on hover,
// a left 6-dot grip handle that drags rows with a floating chip that STICKS TO THE
// CURSOR (pointer-based, realtime) to reorder up/down and move across status groups,
// draggable column headers (reorder) + "+ add column", dynamic columns, multi-select,
// and collapsible grouping. Single source of truth so every module behaves identically.

const CF_PREFIX = 'cf:';
const isCustomCol = (id: string) => id.startsWith(CF_PREFIX);
// Pill class -> hex, for the name-cell status circle (slice E).
const PILL_HEX: Record<string, string> = { 'pill-green': '#10b981', 'pill-amber': '#f59e0b', 'pill-blue': '#0ea5e9', 'pill-red': '#f43f5e', 'pill-rose': '#f43f5e', 'pill-gray': '#9ca3af', 'pill-violet': '#8b5cf6' };

export type GroupMeta = { value: string; label: string; pill?: string };
export type EditSpec = { type: 'text' | 'number' | 'date' | 'select' | 'person'; options?: { value: string; label: string; dot?: string; deactivated?: boolean }[]; multi?: boolean; manage?: () => void };

type Selection = {
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  allSelected: boolean;
  someSelected: boolean;
  toggleAll: () => void;
};

export type DataListProps<T> = {
  rows: T[];
  rowKey: (r: T) => string;
  cols: ColDef[];
  prefs: ListPrefs;
  cell: (colId: string, r: T) => ReactNode;
  onRowClick?: (r: T) => void;
  selection?: Selection;
  /** 'none' = flat list; any other value groups by `groupOf` using `groups`. */
  groupBy?: string;
  groupOf?: (r: T) => string;
  groups?: GroupMeta[];
  /** Inline-edit: per-column edit spec + current-value getter + save handler.
   *  Saving goes through the page's normal update fn, so RLS/RBAC stays enforced. */
  editable?: Record<string, EditSpec>;
  rawValue?: (colId: string, r: T) => string;
  onEdit?: (r: T, colId: string, value: string) => void;
  /** B3.2: per-group "+ Add" — create a record straight into that status group. */
  onAddInGroup?: (groupValue: string) => void;
  /** When set, the grip handle reorders rows and persists the manual order per-user. */
  orderKey?: string;
  /** Primary/name column id — the only cell that opens the record detail on click.
   *  Defaults to the first declared column. */
  nameCol?: string;
  /** Invite-by-email handler for person/assignee cells (org-scoped, page-supplied). */
  onInvitePerson?: (email: string) => void | Promise<void>;
  /** Inline rename from the name cell (hover pencil). Page persists via its update fn. */
  onRename?: (r: T, name: string) => void;
  /** Adds a "+" on the name cell to create a subtask/child (page-supplied). */
  onAddSubtask?: (r: T) => void;
  /** Returns a row's child rows (subtasks) → enables expand/collapse nesting. */
  childrenOf?: (r: T) => T[];
};

function PersonPicker({ options, value, onSave, multi, onInvite }: { options: { value: string; label: string; deactivated?: boolean }[]; value: string; onSave: (v: string) => void; multi?: boolean; onInvite?: (email: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const meId = useAuthStore((st) => st.user?.id);
  const meOpt = meId ? options.find((o) => o.value === meId) : undefined;
  const sel = multi ? value.split(',').map((s) => s.trim()).filter(Boolean) : (value ? [value] : []);
  const selOpts = sel.map((id) => options.find((o) => o.value === id)).filter(Boolean) as { value: string; label: string }[];
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
  const W = 288;
  const place = () => { const r = btnRef.current?.getBoundingClientRect(); if (!r) return; const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8)); const below = window.innerHeight - r.bottom - 8; const above = r.top - 8; const up = below < 240 && above > below; const maxH = Math.max(180, Math.min(320, (up ? above : below) - 6)); setPos({ top: up ? r.top - 6 - maxH : r.bottom + 6, left, maxH }); };
  useLayoutEffect(() => { if (open) { place(); setQ(''); } /* eslint-disable-next-line */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const reposition = (e?: Event) => { if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return; place(); };
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return; setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition); document.addEventListener('mousedown', onDown, true); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pick = (id: string) => {
    if (multi) { const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; onSave(next.join(',')); }
    else { onSave(id); setOpen(false); }
  };
  const doInvite = async () => { if (!onInvite || !isEmail) return; setInviting(true); try { await onInvite(q.trim()); setQ(''); } finally { setInviting(false); } };
  return (
    <span className="inline-flex max-w-full" onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className={`inline-flex items-center -mx-1 px-1 py-0.5 rounded-md transition max-w-full ${open ? 'ring-1 ring-accent bg-surface' : 'hover:bg-surface2'}`}>
        {selOpts.length > 0
          ? (multi
              ? <span className="inline-flex items-center -space-x-1.5">{selOpts.slice(0, 3).map((o) => <span key={o.value} title={o.label} className="ring-2 ring-surface rounded-full inline-flex"><Avatar name={o.label} size={22} /></span>)}{selOpts.length > 3 && <span className="ml-1.5 text-2xs text-muted2">+{selOpts.length - 3}</span>}</span>
              : <span title={selOpts[0].label} className="inline-flex"><Avatar name={selOpts[0].label} size={22} /></span>)
          : <span className="grid place-items-center h-6 w-6 rounded-full border border-dashed border-borderstrong text-muted2 hover:border-accent hover:text-accentstrong"><Icon name="ti-plus" className="text-2xs" /></span>}
      </button>
      {open && pos && (
        <div ref={menuRef} className="fixed z-[61]" style={{ top: pos.top, left: pos.left, width: W }}>
          <div className="bg-surface border border-line rounded-lg shadow-xl p-1.5">
            <div className="relative mb-1.5"><Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2 text-sm pointer-events-none" /><input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={onInvite ? 'Search or enter email…' : 'Search people…'} className="input h-8 text-sm w-full pl-8" /></div>
            <div className="overflow-auto" style={{ maxHeight: pos.maxH }}>
              {multi && <div className="px-2 pt-0.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted2">Assignees</div>}
              {meOpt && !q && <button onClick={() => pick(meOpt.value)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-surface2 text-sm ${sel.includes(meOpt.value) ? 'bg-accent/5' : ''}`}><Avatar name={meOpt.label} size={24} /><span className="flex-1 text-left text-content font-medium">Me</span>{sel.includes(meOpt.value) && <Icon name="ti-check" className="text-accentstrong text-sm" />}</button>}
              {!multi && <button onClick={() => { onSave(''); setOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-surface2 text-sm text-muted2"><span className="grid place-items-center h-6 w-6 rounded-full border border-dashed border-borderstrong"><Icon name="ti-x" className="text-2xs" /></span>Unassigned</button>}
              {(q ? list : list.filter((o) => o.value !== meId)).map((o) => { const on = sel.includes(o.value); return (
                <button key={o.value} onClick={() => pick(o.value)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-surface2 text-sm ${on ? 'bg-accent/5' : ''}`}>
                  <Avatar name={o.label} size={24} /><span className={`flex-1 truncate text-left ${o.deactivated ? 'text-muted2' : 'text-content'}`}>{o.label}{o.deactivated ? ' (deactivated)' : ''}</span>{on && <Icon name="ti-check" className="text-accentstrong text-sm" />}
                </button>
              ); })}
              {onInvite && isEmail && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) && (
                <button onClick={doInvite} disabled={inviting} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent/10 text-sm text-accentstrong">
                  <span className="grid place-items-center h-6 w-6 rounded-full bg-accent/15"><Icon name="ti-mail" className="text-2xs" /></span><span className="truncate">{inviting ? 'Inviting…' : `Invite ${q.trim()}`}</span>
                </button>
              )}
              {onInvite && !isEmail && <button type="button" onClick={() => inputRef.current?.focus()} className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md hover:bg-surface2 text-sm text-muted2"><span className="grid place-items-center h-6 w-6 rounded-full bg-surface2 text-accentstrong"><Icon name="ti-user-plus" className="text-2xs" /></span>Invite people via email</button>}
              {list.length === 0 && !isEmail && <div className="px-2 py-2 text-sm text-muted2">No people found</div>}
            </div>
            {multi && <button onClick={() => setOpen(false)} className="w-full mt-1 pt-1.5 border-t border-line/60 text-2xs font-medium text-muted2 hover:text-content">Done</button>}
          </div>
        </div>
      )}
    </span>
  );
}

function EditableCell({ spec, value, display, onSave, onInvite }: { spec: EditSpec; value: string; display: ReactNode; onSave: (v: string) => void; onInvite?: (email: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  if (spec.type === 'person') {
    return <PersonPicker options={spec.options || []} value={value} onSave={onSave} multi={spec.multi} onInvite={onInvite} />;
  }
  if (spec.type === 'select') {
    const opts = spec.options || [];
    const cur = opts.find((o) => o.value === value);
    const dot = cur?.dot;
    return (
      <span onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[12rem]">
        <Dropdown value={value} onChange={(v) => { if (v !== value) onSave(v); }} items={opts} width={208} search={opts.length > 8}
          footer={spec.manage ? ((close) => (<button type="button" onClick={() => { close(); spec.manage!(); }} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-2xs text-muted2 hover:text-content hover:bg-surface2"><Icon name="ti-pencil" className="text-2xs" />Edit options</button>)) : undefined}
          trigger={dot
            ? <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-2xs font-medium cursor-pointer max-w-full" style={{ backgroundColor: dot + '1f', color: dot, boxShadow: `inset 0 0 0 1px ${dot}33` }}><span className="truncate">{cur?.label ?? value}</span><Icon name="ti-chevron-down" className="text-2xs opacity-70 shrink-0" /></span>
            : <span className={`input flex items-center justify-between gap-2 cursor-pointer ${INLINE_SELECT_CLS}`}><span className={`truncate ${cur ? 'text-content' : 'text-muted2'}`}>{cur ? cur.label : (value || 'Select…')}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} />
      </span>
    );
  }
  if (!editing) {
    return (
      <span onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded cursor-text hover:bg-surface2 transition-colors">
        {display}
        <Icon name="ti-pencil" className="text-2xs text-muted2 opacity-0 group-hover:opacity-50" />
      </span>
    );
  }
  const commit = (v: string) => { setEditing(false); if (v !== value) onSave(v); };
  return (
    <input autoFocus type={spec.type === 'date' ? 'date' : spec.type === 'number' ? 'number' : 'text'}
      defaultValue={value} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(false); }}
      onBlur={(e) => commit(e.target.value)} className="input h-7 text-xs py-0 w-full max-w-[16rem]" />
  );
}

function AddColHeader({ prefs }: { prefs: ListPrefs }) {
  const [open, setOpen] = useState(false);
  if (!prefs.cf?.canManage) return null;
  return (
    <div className="relative inline-block">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title="Add column"
        className="inline-flex items-center justify-center h-6 w-6 rounded text-muted2 hover:text-content hover:bg-surface2"><Icon name="ti-plus" className="text-sm" /></button>
      {open && <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-hidden />}
      {open && (
        <div className="absolute right-0 top-8 z-20 w-60 bg-surface border border-line rounded-lg shadow-lg p-2">
          <AddColumnForm cf={prefs.cf!} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function DataList<T>({ rows, rowKey, cols, prefs, cell, onRowClick, selection, groupBy = 'none', groupOf, groups, editable, rawValue, onEdit, onAddInGroup, orderKey, nameCol, onInvitePerson, onRename, onAddSubtask, childrenOf }: DataListProps<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [colDrag, setColDrag] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (rid: string) => setExpandedRows((p) => { const n = new Set(p); n.has(rid) ? n.delete(rid) : n.add(rid); return n; });
  const dragId = drag?.id || null;

  useEffect(() => {
    if (!orderKey) return;
    try { const raw = localStorage.getItem(orderKey); if (raw) setManualOrder(JSON.parse(raw)); } catch { /* ignore */ }
  }, [orderKey]);
  const persistOrder = (ids: string[]) => { setManualOrder(ids); if (orderKey) { try { localStorage.setItem(orderKey, JSON.stringify(ids)); } catch { /* ignore */ } } };

  const canGroupChange = !!(groupBy && groupBy !== 'none' && groupOf && groups && editable && editable[groupBy] && onEdit);
  const rowDnD = !!orderKey || canGroupChange;

  const orderedRows = (() => {
    if (!orderKey || manualOrder.length === 0) return rows;
    const idx = new Map(manualOrder.map((id, i) => [id, i] as [string, number]));
    return [...rows].sort((a, b) => (idx.has(rowKey(a)) ? idx.get(rowKey(a))! : 1e9) - (idx.has(rowKey(b)) ? idx.get(rowKey(b))! : 1e9));
  })();

  const commitDrag = (src: string, tgtId: string | null, grp: string | null) => {
    if (!src) return;
    const srcRow = rows.find((x) => rowKey(x) === src);
    let targetGroup = grp;
    if (tgtId) { const tr = rows.find((x) => rowKey(x) === tgtId); if (tr && groupOf) targetGroup = groupOf(tr); }
    if (canGroupChange && srcRow && targetGroup && groupOf!(srcRow) !== targetGroup) onEdit!(srcRow, groupBy, targetGroup);
    if (orderKey && tgtId && tgtId !== src) {
      const ids = orderedRows.map(rowKey);
      const from = ids.indexOf(src); const to = ids.indexOf(tgtId);
      if (from >= 0 && to >= 0) { ids.splice(from, 1); ids.splice(to, 0, src); persistOrder(ids); }
    }
  };

  // Pointer-based drag: a floating chip follows the cursor; the row under the cursor
  // highlights as the drop target. Commits on pointer-up.
  useEffect(() => {
    if (!drag) return;
    const hit = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      const row = el ? el.closest('[data-rowid]') : null;
      const grp = el ? el.closest('[data-group]') : null;
      return { rowId: row ? row.getAttribute('data-rowid') : null, group: grp ? grp.getAttribute('data-group') : null };
    };
    const move = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const h = hit(e.clientX, e.clientY);
      setOverId(h.rowId); setDropGroup(h.group);
    };
    const up = (e: PointerEvent) => {
      const h = hit(e.clientX, e.clientY);
      commitDrag(drag.id, h.rowId, h.group);
      setDrag(null); setOverId(null); setDropGroup(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  const beginDrag = (e: RPointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    const tr = (e.currentTarget as HTMLElement).closest('tr') as HTMLElement | null;
    const label = ((tr && tr.innerText) || '').trim().split('\n')[0].slice(0, 60) || 'Item';
    setDrag({ id, label, x: e.clientX, y: e.clientY });
  };

  const reorderCols = (from: string, to: string) => {
    if (from === to) return;
    const arr = [...prefs.ordered];
    const fi = arr.indexOf(from); const ti = arr.indexOf(to);
    if (fi < 0 || ti < 0) return;
    arr.splice(fi, 1); arr.splice(ti, 0, from);
    prefs.setOrderArr(arr);
  };

  const toggle = (k: string) => setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const labelOf = (id: string) => (prefs.allCols || cols).find((c) => c.id === id)?.label;
  // Primary/name column = the ONLY click target that opens the record detail (ClickUp model).
  const primaryId = [nameCol, cols[0]?.id].find((x) => x && prefs.ordered.includes(x)) || prefs.ordered[0];
  const selCol = !!selection;
  const defW = (id: string) => (prefs.allCols || cols).find((c) => c.id === id)?.width;
  const colW = (id: string, i: number) => prefs.widths[id] ?? defW(id) ?? (i === 0 ? 280 : 160);
  const totalW = (rowDnD ? 28 : 0) + (selCol ? 36 : 0) + prefs.ordered.reduce((a, id, i) => a + colW(id, i), 0) + 36;
  // Freeze / pin: the first `pinCount` data columns (plus grip/checkbox) stick to the left.
  const pinCount = Math.min(prefs.pinned || 0, prefs.ordered.length);
  const leadW = (rowDnD ? 28 : 0) + (selCol ? 36 : 0);
  const dataLeft = (i: number) => leadW + prefs.ordered.slice(0, i).reduce((a, id, j) => a + colW(id, j), 0);
  const pinSty = (i: number): CSSProperties => (i < pinCount ? { position: 'sticky', left: dataLeft(i), zIndex: 2 } : {});
  const leadSty = (which: 'grip' | 'sel'): CSSProperties => (pinCount > 0 ? { position: 'sticky', left: which === 'grip' ? 0 : (rowDnD ? 28 : 0), zIndex: 2 } : {});
  const pinCls = (i: number) => (i < pinCount ? 'bg-surface group-hover:bg-surface2' + (i === pinCount - 1 ? ' border-r border-line' : '') : '');
  const leadCls = pinCount > 0 ? 'bg-surface group-hover:bg-surface2' : '';
  const startColResize = (e: RPointerEvent, id: string, i: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = colW(id, i);
    const mv = (ev: PointerEvent) => prefs.setWidth(id, startW + (ev.clientX - startX));
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const autoFit = (id: string) => {
    let max = 80;
    document.querySelectorAll(`[data-col="${id}"]`).forEach((c) => { const w = (c as HTMLElement).scrollWidth; if (w > max) max = w; });
    prefs.setWidth(id, Math.min(max + 28, 640));
  };
  const colGroup = (
    <colgroup>
      {rowDnD && <col style={{ width: 28 }} />}
      {selCol && <col style={{ width: 36 }} />}
      {prefs.ordered.map((id, i) => <col key={id} style={{ width: colW(id, i) }} />)}
      <col style={{ width: 36 }} />
    </colgroup>
  );

  const headerRow = (selectAll: boolean) => (
    <tr className="border-b border-line text-muted2">
      {rowDnD && <th className={`w-7 ${leadCls}`} style={leadSty('grip')} />}
      {selCol && (selectAll
        ? <th className={`px-3 py-2 w-9 ${leadCls}`} style={leadSty('sel')}><HeadCheckbox checked={selection!.allSelected} indeterminate={selection!.someSelected} onChange={selection!.toggleAll} /></th>
        : <th className={`px-3 py-2 w-9 ${leadCls}`} style={leadSty('sel')} />)}
      {prefs.ordered.map((id, ci) => (
        <th key={id} draggable data-col={id}
          onDragStart={(e) => { e.stopPropagation(); setColDrag(id); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (colDrag) reorderCols(colDrag, id); setColDrag(null); }}
          onDragEnd={() => setColDrag(null)}
          style={pinSty(ci)}
          className={`group/col relative px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider whitespace-nowrap overflow-hidden cursor-grab select-none transition ${pinCls(ci)} ${colDrag === id ? 'opacity-40' : 'hover:text-content'}`}>
          <span className="inline-flex items-center gap-1 max-w-full">
            <Icon name="ti-grip-vertical" className="text-2xs text-muted2 opacity-0 group-hover/col:opacity-60 shrink-0" />
            <span className="truncate">{labelOf(id)}</span>
          </span>
          <span onPointerDown={(e) => startColResize(e, id, ci)} onDoubleClick={() => autoFit(id)} onClick={(e) => e.stopPropagation()} title="Drag to resize · double-click to fit"
            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-accent/50 z-10" />
        </th>
      ))}
      <th className="px-2 py-2 w-9 text-left"><AddColHeader prefs={prefs} /></th>
    </tr>
  );

  const dataRow = (r: T, depth = 0, hasKids = false) => {
    const id = rowKey(r);
    const sel = selection?.isSelected(id) || false;
    const dropHi = overId === id && !!dragId && dragId !== id;
    return (
      <tr key={id} data-rowid={id}
        className={`group relative transition border-b border-line/50 last:border-0 ${dragId === id ? 'opacity-50' : ''} ${dropHi ? 'bg-accent/10' : sel ? 'bg-accent/5' : 'hover:bg-surface2'}`}>
        {rowDnD && (depth === 0 ? (
          <td className={`w-7 pl-1.5 pr-0 align-middle ${leadCls}`} style={leadSty('grip')} onClick={(e) => e.stopPropagation()}>
            <span onPointerDown={(e) => beginDrag(e, id)} title="Drag to reorder"
              style={{ touchAction: 'none' }}
              className="inline-flex cursor-grab active:cursor-grabbing text-muted2 opacity-0 group-hover:opacity-100 transition"><Icon name="ti-grip-vertical" className="text-sm" /></span>
          </td>
        ) : <td className={`w-7 ${leadCls}`} style={leadSty('grip')} />)}
        {selCol && <td className={`px-3 py-2.5 w-9 align-middle ${leadCls}`} style={leadSty('sel')} onClick={(e) => e.stopPropagation()}><RowCheckbox checked={sel} onChange={() => selection!.toggle(id)} /></td>}
        {prefs.ordered.map((cid, ci) => {
          const isCf = isCustomCol(cid) && !!prefs.cf;
          const ed = isCf ? prefs.cf!.editable[cid] : editable?.[cid];
          const disp = isCf ? prefs.cf!.cell(cid, id) : cell(cid, r);
          const rv = isCf ? prefs.cf!.rawValue(cid, id) : (rawValue ? rawValue(cid, r) : undefined);
          const save = isCf ? (v: string) => prefs.cf!.onEdit(cid, id, v) : (onEdit ? (v: string) => onEdit(r, cid, v) : undefined);
          // Name (primary) column: status circle + name (click → detail) + hover rename / +subtask.
          if (cid === primaryId) {
            let stCircle: ReactNode = null;
            if (canGroupChange && groupOf && groups) {
              const grp = groupOf(r);
              const meta = groups.find((g) => g.value === grp);
              const hex = (meta && PILL_HEX[meta.pill || '']) || '#9ca3af';
              const stOpts = (editable && editable[groupBy] && editable[groupBy].options) || [];
              stCircle = (
                <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <Dropdown value={grp} onChange={(v) => { if (v !== grp && onEdit) onEdit(r, groupBy, v); }} items={stOpts} width={200} search={stOpts.length > 8}
                    trigger={<span title={grp} className="grid place-items-center h-4 w-4 rounded-full cursor-pointer hover:scale-110 transition" style={{ background: hex + '2a', boxShadow: `inset 0 0 0 1.5px ${hex}` }} />} />
                </span>
              );
            }
            return (
              <td key={cid} data-col={cid} style={pinSty(ci)}
                className={`px-4 py-2.5 text-sm align-middle ${pinCls(ci)} ${prefs.wrap[cid] ? 'whitespace-normal break-words' : 'overflow-hidden'}`}>
                <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full group/name" style={depth ? { paddingLeft: depth * 16 } : undefined}>
                  {hasKids
                    ? <button onClick={(e) => { e.stopPropagation(); toggleExpand(id); }} title={expandedRows.has(id) ? 'Collapse' : 'Expand'} className="shrink-0 -ml-1 text-muted2 hover:text-content transition"><Icon name={expandedRows.has(id) ? 'ti-chevron-down' : 'ti-chevron-right'} className="text-sm" /></button>
                    : depth > 0 ? <Icon name="ti-corner-down-right" className="text-muted2 text-sm shrink-0" /> : null}
                  {stCircle}
                  {renaming === id ? (
                    <input autoFocus defaultValue={rawValue ? rawValue(cid, r) : ''} onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); setRenaming(null); if (v && onRename) onRename(r, v); } if (e.key === 'Escape') setRenaming(null); }}
                      onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v && onRename) onRename(r, v); }}
                      className="input h-7 text-sm py-0 min-w-0 flex-1" />
                  ) : (
                    <>
                      <span onClick={onRowClick ? (e) => { e.stopPropagation(); onRowClick(r); } : undefined}
                        className={`truncate min-w-0 ${onRowClick ? 'cursor-pointer' : ''}`}>{disp}</span>
                      {onRename && <button onClick={(e) => { e.stopPropagation(); setRenaming(id); }} title="Rename" className="opacity-0 group-hover/name:opacity-100 text-muted2 hover:text-content shrink-0 transition"><Icon name="ti-pencil" className="text-2xs" /></button>}
                      {onAddSubtask && <button onClick={(e) => { e.stopPropagation(); onAddSubtask(r); }} title="Add subtask" className="opacity-0 group-hover/name:opacity-100 text-muted2 hover:text-accentstrong shrink-0 transition"><Icon name="ti-plus" className="text-2xs" /></button>}
                    </>
                  )}
                </span>
              </td>
            );
          }
          return (
            <td key={cid} data-col={cid} style={pinSty(ci)} className={`px-4 py-2.5 text-sm text-muted align-middle ${pinCls(ci)} ${prefs.wrap[cid] ? 'whitespace-normal break-words' : 'truncate'}`}>
              {ed && save && rv !== undefined
                ? <EditableCell spec={ed} value={rv} display={disp} onSave={save} onInvite={onInvitePerson} />
                : disp}
            </td>
          );
        })}
        <td className="w-9" />
      </tr>
    );
  };

  const renderRows = (list: T[], depth: number): ReactNode[] => list.flatMap((r) => {
    const rid = rowKey(r);
    const kids = childrenOf ? childrenOf(r) : [];
    const rowEl = dataRow(r, depth, kids.length > 0);
    return (kids.length > 0 && expandedRows.has(rid)) ? [rowEl, ...renderRows(kids, depth + 1)] : [rowEl];
  });

  const tableCard = (rs: T[]) => (
    <div className="overflow-x-auto">
      <table className="text-sm" style={{ tableLayout: 'fixed', width: totalW }}>
        {colGroup}
        <thead>{headerRow(true)}</thead>
        <tbody>{renderRows(rs, 0)}</tbody>
      </table>
    </div>
  );

  // Floating chip that sticks to the cursor while dragging (rendered fixed to viewport).
  const floatingChip = drag ? (
    <div style={{ position: 'fixed', left: drag.x + 14, top: drag.y + 6, zIndex: 9999, pointerEvents: 'none' }}
      className="flex items-center gap-2 max-w-xs px-2.5 py-1.5 rounded-md bg-surface border border-borderstrong shadow-xl text-sm text-content">
      <Icon name="ti-grip-vertical" className="text-muted2 text-sm shrink-0" />
      <span className="truncate">{drag.label}</span>
    </div>
  ) : null;

  const grouped = groupBy !== 'none' && !!groupOf && !!groups;
  if (!grouped) return <>{tableCard(orderedRows)}{floatingChip}</>;

  return (
    <div>
      {groups!.map((g) => {
        const gr = orderedRows.filter((r) => groupOf!(r) === g.value);
        if (gr.length === 0) return null;
        const isC = collapsed.has(g.value);
        return (
          <div key={g.value} data-group={g.value}
            className={`mt-5 first:mt-1 rounded-lg transition ${canGroupChange && dropGroup === g.value && dragId ? 'ring-2 ring-accent/40' : ''}`}>
            <div className="px-1 py-2 mb-1 flex items-center gap-2.5">
              <button onClick={() => toggle(g.value)} className="shrink-0 text-muted2 hover:text-content transition" aria-expanded={!isC} title={isC ? 'Expand' : 'Collapse'}>
                <Icon name={isC ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-sm" />
              </button>
              {g.pill
                ? <span className={`pill ${g.pill}`}>{g.label}</span>
                : <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{g.label}</span>}
              <span className="text-2xs font-medium text-muted2 tnum">{gr.length}</span>
              {onAddInGroup && <button onClick={(e) => { e.stopPropagation(); onAddInGroup(g.value); }} className="ml-auto inline-flex items-center gap-1 text-2xs text-muted2 hover:text-content transition"><Icon name="ti-plus" className="text-sm" />Add</button>}
            </div>
            {!isC && tableCard(gr)}
          </div>
        );
      })}
      {floatingChip}
    </div>
  );
}
