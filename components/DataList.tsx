import { useState, useEffect, ReactNode } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import type { ColDef, ListPrefs } from '@/components/ListToolbar';
import { HeadCheckbox, RowCheckbox } from '@/components/RowSelection';
import AddColumnForm from '@/components/AddColumnForm';

// One reusable, ClickUp-style list: PLAIN borderless rows that highlight on hover,
// a left 6-dot grip handle that drags rows with a floating chip that STICKS TO THE
// CURSOR (pointer-based, realtime) to reorder up/down and move across status groups,
// draggable column headers (reorder) + "+ add column", dynamic columns, multi-select,
// and collapsible grouping. Single source of truth so every module behaves identically.

const CF_PREFIX = 'cf:';
const isCustomCol = (id: string) => id.startsWith(CF_PREFIX);

export type GroupMeta = { value: string; label: string; pill?: string };
export type EditSpec = { type: 'text' | 'number' | 'date' | 'select'; options?: { value: string; label: string }[] };

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
};

function EditableCell({ spec, value, display, onSave }: { spec: EditSpec; value: string; display: ReactNode; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (spec.type === 'select') {
    return (
      <span onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[12rem]">
        <Select value={value} onChange={(v) => { if (v !== value) onSave(v); }} options={spec.options || []} className="h-7 py-0 text-xs" />
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

export function DataList<T>({ rows, rowKey, cols, prefs, cell, onRowClick, selection, groupBy = 'none', groupOf, groups, editable, rawValue, onEdit, onAddInGroup, orderKey }: DataListProps<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [colDrag, setColDrag] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
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
  const selCol = !!selection;

  const headerRow = (selectAll: boolean) => (
    <tr className="border-b border-line text-muted2">
      {rowDnD && <th className="w-7" />}
      {selCol && (selectAll
        ? <th className="px-3 py-2 w-9"><HeadCheckbox checked={selection!.allSelected} indeterminate={selection!.someSelected} onChange={selection!.toggleAll} /></th>
        : <th className="px-3 py-2 w-9" />)}
      {prefs.ordered.map((id) => (
        <th key={id} draggable
          onDragStart={(e) => { e.stopPropagation(); setColDrag(id); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (colDrag) reorderCols(colDrag, id); setColDrag(null); }}
          onDragEnd={() => setColDrag(null)}
          className={`group/col px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-grab select-none transition ${colDrag === id ? 'opacity-40' : 'hover:text-content'}`}>
          <span className="inline-flex items-center gap-1">
            <Icon name="ti-grip-vertical" className="text-2xs text-muted2 opacity-0 group-hover/col:opacity-60" />
            {labelOf(id)}
          </span>
        </th>
      ))}
      <th className="px-2 py-2 w-9 text-left"><AddColHeader prefs={prefs} /></th>
    </tr>
  );

  const dataRow = (r: T) => {
    const id = rowKey(r);
    const sel = selection?.isSelected(id) || false;
    const dropHi = overId === id && !!dragId && dragId !== id;
    return (
      <tr key={id} data-rowid={id}
        className={`group relative transition border-b border-line/50 last:border-0 ${onRowClick ? 'cursor-pointer' : ''} ${dragId === id ? 'opacity-50' : ''} ${dropHi ? 'bg-accent/10' : sel ? 'bg-accent/5' : 'hover:bg-surface2'}`}
        onClick={onRowClick ? () => onRowClick(r) : undefined}>
        {rowDnD && (
          <td className="w-7 pl-1.5 pr-0 align-middle" onClick={(e) => e.stopPropagation()}>
            <span onPointerDown={(e) => beginDrag(e, id)} title="Drag to reorder"
              style={{ touchAction: 'none' }}
              className="inline-flex cursor-grab active:cursor-grabbing text-muted2 opacity-0 group-hover:opacity-100 transition"><Icon name="ti-grip-vertical" className="text-sm" /></span>
          </td>
        )}
        {selCol && <td className="px-3 py-2.5 w-9 align-middle" onClick={(e) => e.stopPropagation()}><RowCheckbox checked={sel} onChange={() => selection!.toggle(id)} /></td>}
        {prefs.ordered.map((cid) => {
          const isCf = isCustomCol(cid) && !!prefs.cf;
          const ed = isCf ? prefs.cf!.editable[cid] : editable?.[cid];
          const disp = isCf ? prefs.cf!.cell(cid, id) : cell(cid, r);
          const rv = isCf ? prefs.cf!.rawValue(cid, id) : (rawValue ? rawValue(cid, r) : undefined);
          const save = isCf ? (v: string) => prefs.cf!.onEdit(cid, id, v) : (onEdit ? (v: string) => onEdit(r, cid, v) : undefined);
          return (
            <td key={cid} className="px-4 py-2.5 text-sm text-muted align-middle">
              {ed && save && rv !== undefined
                ? <EditableCell spec={ed} value={rv} display={disp} onSave={save} />
                : disp}
            </td>
          );
        })}
        <td className="w-9" />
      </tr>
    );
  };

  const tableCard = (rs: T[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>{headerRow(true)}</thead>
        <tbody>{rs.map(dataRow)}</tbody>
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
