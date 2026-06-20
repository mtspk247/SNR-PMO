import { ReactNode, useState } from 'react';
import { ListToolbar, useListPrefs, ColDef, FilterDef, ListPrefs } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta, EditSpec } from '@/components/DataList';
import { Spinner, EmptyState, Icon } from '@/components/ui';

/**
 * ListView — the single, centralized shell for EVERY module list in the app.
 * Owns the entire list UX: toolbar (search + filters + column drag/show-hide),
 * group-by control, multi-select bulk bar (CSV export + gated delete + custom
 * actions), loading/empty states, and the borderless ClickUp-style DataList.
 *
 * A page supplies only its DATA shape (cols, cell renderer, rows, update fns).
 * All styling/behavior lives here + in DataList → change it once and every list,
 * for every tenant/reseller, updates on the next deploy. New modules inherit it
 * automatically by rendering <ListView/>. Do NOT hand-build list tables anymore.
 *
 * Theming: styles use theme tokens (surface/line/muted/accent CSS vars), so each
 * tenant's white-label skin restyles all lists with no per-page work.
 */

export type Selection<T extends { id: string }> = ReturnType<typeof useRowSelection<T>>;

export type ListViewProps<T extends { id: string }> = {
  // ── data ────────────────────────────────────────────────
  rows: T[] | null;                       // null = loading
  rowKey: (r: T) => string;
  cols: ColDef[];
  prefs: ListPrefs;                       // from useListPrefs (page owns it: query/filters drive `rows`)
  cell: (id: string, r: T) => ReactNode;
  selection: Selection<T>;                // from useRowSelection(rows)
  // ── toolbar ─────────────────────────────────────────────
  filters?: FilterDef[];
  searchPlaceholder?: string;
  toolbarExtra?: ReactNode;
  // ── custom columns (B2.1): "+ Add column" + per-column delete, RBAC-gated ──
  onAddColumn?: (name: string, type: string) => void | Promise<void>;
  customCols?: Set<string>;
  onRemoveColumn?: (id: string) => void;
  canManageColumns?: boolean;               // page-specific buttons rendered inside the toolbar row
  // ── grouping (optional) ─────────────────────────────────
  groupField?: { value: string; label: string };  // presence enables the Group-by control
  groupOf?: (r: T) => string;
  groups?: GroupMeta[];
  defaultGroup?: boolean;                 // start grouped? (default true when groupField set)
  // ── inline edit (optional) ──────────────────────────────
  editable?: Record<string, EditSpec>;
  rawValue?: (id: string, r: T) => string;
  onEdit?: (r: T, id: string, value: string) => void;
  // ── interactions ────────────────────────────────────────
  onRowClick?: (r: T) => void;
  // ── bulk actions ────────────────────────────────────────
  exportName?: string;                    // set → shows "Export" (CSV of selected, visible cols)
  exportValue?: (id: string, r: T) => string;
  bulkActions?: (sel: Selection<T>) => ReactNode;  // extra page-specific bulk buttons
  onDelete?: (sel: Selection<T>) => void; // gated bulk delete (page supplies confirm + loop + reload)
  canDelete?: boolean;                    // RBAC gate for the Delete button
  busy?: boolean;
  // ── empty / loading ─────────────────────────────────────
  emptyIcon?: string;
  emptyText?: string;
};

const csvEsc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };

export function ListView<T extends { id: string }>(p: ListViewProps<T>) {
  const { rows, prefs, cols, selection: rs } = p;
  const canGroup = !!p.groupField && !!p.groupOf && !!p.groups;
  const [grouped, setGrouped] = useState<boolean>(canGroup ? (p.defaultGroup ?? true) : false);
  const groupBy = canGroup && grouped ? p.groupField!.value : 'none';

  const doExport = () => {
    if (!p.exportName) return;
    const ids = prefs.ordered;
    const label = (id: string) => cols.find((c) => c.id === id)?.label || id;
    const val = p.exportValue || (() => '');
    const heads = ids.map(label);
    const body = rs.selected.map((r) => ids.map((id) => val(id, r)));
    const csv = heads.map(csvEsc).join(',') + '\n' + body.map((row) => row.map(csvEsc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${p.exportName}-selected.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const hasBulk = !!(p.exportName || p.bulkActions || (p.onDelete && p.canDelete));

  return (
    <>
      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <ListToolbar prefs={prefs} cols={cols} filters={p.filters} placeholder={p.searchPlaceholder || 'Search…'}
            onAddColumn={p.onAddColumn} customCols={p.customCols} onRemoveColumn={p.onRemoveColumn} canManageColumns={p.canManageColumns}>
            {p.toolbarExtra}
          </ListToolbar>
        </div>
        {canGroup && (
          <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
            <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
            <button onClick={() => setGrouped(true)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${grouped ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>
              {p.groupField!.label}
            </button>
            <button onClick={() => setGrouped(false)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${!grouped ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>
              None
            </button>
          </div>
        )}
      </div>

      {hasBulk && (
        <BulkBar count={rs.count} onClear={rs.clear}>
          {p.exportName && <button onClick={doExport} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>}
          {p.bulkActions?.(rs)}
          {p.onDelete && p.canDelete && <button onClick={() => p.onDelete!(rs)} disabled={p.busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
        </BulkBar>
      )}

      {rows === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon={p.emptyIcon || 'ti-list'} text={p.emptyText || 'Nothing here yet.'} /></div>
      ) : (
        <DataList
          rows={rows}
          rowKey={p.rowKey}
          cols={cols}
          prefs={prefs}
          cell={p.cell}
          onRowClick={p.onRowClick}
          selection={rs}
          groupBy={groupBy}
          groupOf={p.groupOf}
          groups={p.groups}
          editable={p.editable}
          rawValue={p.rawValue}
          onEdit={p.onEdit}
        />
      )}
    </>
  );
}
