import { useState, ReactNode } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import type { ColDef, ListPrefs } from '@/components/ListToolbar';
import { HeadCheckbox, RowCheckbox } from '@/components/RowSelection';

// One reusable, ClickUp-style list: borderless comfortable rows, dynamic columns
// (driven by ListToolbar `prefs`), optional multi-row selection (hover-reveal),
// and optional collapsible grouping. Single source of truth so every module looks
// and behaves identically and fixes land everywhere at once.

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
};

function EditableCell({ spec, value, display, onSave }: { spec: EditSpec; value: string; display: ReactNode; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  // Status / select columns render as the same always-interactive styled Select the Tasks list uses.
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

export function DataList<T>({ rows, rowKey, cols, prefs, cell, onRowClick, selection, groupBy = 'none', groupOf, groups, editable, rawValue, onEdit }: DataListProps<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const labelOf = (id: string) => cols.find((c) => c.id === id)?.label;
  const selCol = !!selection;

  const headerRow = (selectAll: boolean) => (
    <tr className="bg-surface2/60 border-b border-line">
      {selCol && (selectAll
        ? <th className="px-4 py-2 w-10"><HeadCheckbox checked={selection!.allSelected} indeterminate={selection!.someSelected} onChange={selection!.toggleAll} /></th>
        : <th className="px-4 py-2 w-10" />)}
      {prefs.ordered.map((id) => (
        <th key={id} className="px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted2 whitespace-nowrap">{labelOf(id)}</th>
      ))}
    </tr>
  );

  const dataRow = (r: T) => {
    const id = rowKey(r);
    const sel = selection?.isSelected(id) || false;
    return (
      <tr key={id}
        className={`group relative transition border-b border-line/70 last:border-0 ${onRowClick ? 'cursor-pointer' : ''} ${sel ? 'bg-accent/5 border-l-2 border-l-accent' : 'bg-surface hover:bg-surface2 hover:shadow-md hover:z-10 border-l-2 border-l-transparent'}`}
        onClick={onRowClick ? () => onRowClick(r) : undefined}>
        {selCol && <td className="px-4 py-2.5 w-10 align-middle" onClick={(e) => e.stopPropagation()}><RowCheckbox checked={sel} onChange={() => selection!.toggle(id)} /></td>}
        {prefs.ordered.map((cid) => {
          const ed = editable?.[cid];
          return (
            <td key={cid} className="px-4 py-2.5 text-sm text-muted align-middle">
              {ed && onEdit && rawValue
                ? <EditableCell spec={ed} value={rawValue(cid, r)} display={cell(cid, r)} onSave={(v) => onEdit(r, cid, v)} />
                : cell(cid, r)}
            </td>
          );
        })}
      </tr>
    );
  };

  // One bordered "card" containing the column header + rows — matches the Tasks list look.
  const tableCard = (rs: T[]) => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>{headerRow(true)}</thead>
          <tbody>{rs.map(dataRow)}</tbody>
        </table>
      </div>
    </div>
  );

  const grouped = groupBy !== 'none' && !!groupOf && !!groups;
  if (!grouped) return tableCard(rows);

  return (
    <div>
      {groups!.map((g) => {
        const gr = rows.filter((r) => groupOf!(r) === g.value);
        if (gr.length === 0) return null;
        const isC = collapsed.has(g.value);
        return (
          <div key={g.value} className="mt-5 first:mt-1">
            {/* Group title sits ABOVE the card (collapse chevron + colored status pill + count) */}
            <div className="px-1 py-2 mb-2 flex items-center gap-2.5">
              <button onClick={() => toggle(g.value)} className="shrink-0 text-muted2 hover:text-content transition" aria-expanded={!isC} title={isC ? 'Expand' : 'Collapse'}>
                <Icon name={isC ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-sm" />
              </button>
              {g.pill
                ? <span className={`pill ${g.pill}`}>{g.label}</span>
                : <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{g.label}</span>}
              <span className="text-2xs font-medium text-muted2 tnum">{gr.length}</span>
            </div>
            {!isC && tableCard(gr)}
          </div>
        );
      })}
    </div>
  );
}
