import { useState, ReactNode } from 'react';
import { Icon } from '@/components/ui';
import type { ColDef, ListPrefs } from '@/components/ListToolbar';
import { HeadCheckbox, RowCheckbox } from '@/components/RowSelection';

// One reusable, ClickUp-style list: borderless comfortable rows, dynamic columns
// (driven by ListToolbar `prefs`), optional multi-row selection (hover-reveal),
// and optional collapsible grouping. Single source of truth so every module looks
// and behaves identically and fixes land everywhere at once.

export type GroupMeta = { value: string; label: string; pill?: string };

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
};

export function DataList<T>({ rows, rowKey, cols, prefs, cell, onRowClick, selection, groupBy = 'none', groupOf, groups }: DataListProps<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCollapsed((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const labelOf = (id: string) => cols.find((c) => c.id === id)?.label;
  const selCol = !!selection;
  const colSpan = prefs.ordered.length + (selCol ? 1 : 0);

  const headerCells = (selectAll: boolean) => (
    <>
      {selCol && (selectAll
        ? <th className="px-4 py-2.5 w-10"><HeadCheckbox checked={selection!.allSelected} indeterminate={selection!.someSelected} onChange={selection!.toggleAll} /></th>
        : <th className="px-4 py-1.5 w-10" />)}
      {prefs.ordered.map((id) => (
        <th key={id} className="px-4 py-2.5 text-left text-2xs font-medium uppercase tracking-wider text-muted2">{labelOf(id)}</th>
      ))}
    </>
  );

  const dataRow = (r: T) => {
    const id = rowKey(r);
    const sel = selection?.isSelected(id) || false;
    return (
      <tr key={id}
        className={`group transition-colors hover:bg-surface2/40 ${onRowClick ? 'cursor-pointer' : ''} ${sel ? 'bg-accent/5' : ''}`}
        onClick={onRowClick ? () => onRowClick(r) : undefined}>
        {selCol && <td className="px-4 py-2.5 w-10" onClick={(e) => e.stopPropagation()}><RowCheckbox checked={sel} onChange={() => selection!.toggle(id)} /></td>}
        {prefs.ordered.map((cid) => <td key={cid} className="px-4 py-2.5 text-sm text-muted">{cell(cid, r)}</td>)}
      </tr>
    );
  };

  const grouped = groupBy !== 'none' && !!groupOf && !!groups;

  return (
    <div className="card overflow-hidden border border-line/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {!grouped ? (
            <>
              <thead><tr className="border-b border-line/40">{headerCells(true)}</tr></thead>
              <tbody>{rows.map(dataRow)}</tbody>
            </>
          ) : (
            groups!.map((g) => {
              const gr = rows.filter((r) => groupOf!(r) === g.value);
              if (gr.length === 0) return null;
              const isC = collapsed.has(g.value);
              return (
                <tbody key={g.value}>
                  <tr className="border-t border-line/30 first:border-t-0 bg-surface2/60">
                    <td colSpan={colSpan} className="px-3 py-2">
                      <button className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity" onClick={() => toggle(g.value)} aria-expanded={!isC}>
                        <Icon name={isC ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-xs text-muted2 shrink-0" />
                        {g.pill ? <span className={`pill ${g.pill} text-2xs`}>{g.label}</span> : <span className="text-xs font-medium text-content">{g.label}</span>}
                        <span className="text-2xs text-muted2 ml-1">{gr.length}</span>
                      </button>
                    </td>
                  </tr>
                  {!isC && <tr className="border-b border-line/30">{headerCells(false)}</tr>}
                  {!isC && gr.map(dataRow)}
                </tbody>
              );
            })
          )}
        </table>
      </div>
    </div>
  );
}
