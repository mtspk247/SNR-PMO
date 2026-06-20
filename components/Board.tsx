import { ReactNode, useState } from 'react';
import { Icon } from '@/components/ui';
import type { ColDef, ListPrefs } from '@/components/ListToolbar';
import type { GroupMeta } from '@/components/DataList';

// Shared kanban board for any list: one column per status group, draggable cards
// (drop in another column -> onMove changes the status). Reuses the page's cell()
// for card content. Rendered by ListView when the Board view is selected.
export function Board<T>({ rows, rowKey, cols, prefs, cell, groups, groupOf, statusCol, onRowClick, onMove, onAddInGroup }: {
  rows: T[];
  rowKey: (r: T) => string;
  cols: ColDef[];
  prefs: ListPrefs;
  cell: (colId: string, r: T) => ReactNode;
  groups: GroupMeta[];
  groupOf: (r: T) => string;
  statusCol?: string;
  onRowClick?: (r: T) => void;
  onMove?: (r: T, groupValue: string) => void;
  onAddInGroup?: (groupValue: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const titleCol = prefs.ordered[0];
  const bodyCols = prefs.ordered.slice(1).filter((id) => id !== statusCol);
  const label = (id: string) => (prefs.allCols || cols).find((c) => c.id === id)?.label || id;
  const drop = (target: string) => {
    setOver(null);
    const r = rows.find((x) => rowKey(x) === dragId);
    setDragId(null);
    if (r && onMove && groupOf(r) !== target) onMove(r, target);
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {groups.map((g) => {
        const items = rows.filter((r) => groupOf(r) === g.value);
        return (
          <div key={g.value}
            className={`w-72 shrink-0 flex flex-col rounded-lg transition ${over === g.value && dragId ? 'ring-2 ring-accent/40' : ''}`}
            onDragOver={onMove ? (e) => { e.preventDefault(); if (over !== g.value) setOver(g.value); } : undefined}
            onDrop={onMove ? () => drop(g.value) : undefined}>
            <div className="flex items-center gap-2 px-1 py-2 mb-1">
              {g.pill ? <span className={`pill ${g.pill}`}>{g.label}</span> : <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{g.label}</span>}
              <span className="text-2xs font-medium text-muted2 tnum">{items.length}</span>
              {onAddInGroup && <button onClick={() => onAddInGroup(g.value)} className="ml-auto text-muted2 hover:text-content transition" title="Add"><Icon name="ti-plus" className="text-sm" /></button>}
            </div>
            <div className="space-y-2 min-h-[40px]">
              {items.map((r) => {
                const id = rowKey(r);
                return (
                  <div key={id} draggable={!!onMove}
                    onDragStart={onMove ? () => setDragId(id) : undefined}
                    onDragEnd={onMove ? () => { setDragId(null); setOver(null); } : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={`card p-3 transition ${onRowClick ? 'cursor-pointer hover:shadow-md' : ''} ${dragId === id ? 'opacity-40' : ''}`}>
                    <div className="text-sm font-medium text-content">{cell(titleCol, r)}</div>
                    {bodyCols.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {bodyCols.slice(0, 4).map((cid) => (
                          <div key={cid} className="flex items-center justify-between gap-2 text-2xs">
                            <span className="text-muted2 shrink-0">{label(cid)}</span>
                            <span className="text-muted truncate text-right">{cell(cid, r)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && <div className="text-2xs text-muted2 px-1 py-3 text-center">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
