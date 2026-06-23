import { ReactNode, useState, useMemo, useEffect, useRef } from 'react';
import { ListToolbar, useListPrefs, ColDef, FilterDef, ListPrefs } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta, EditSpec } from '@/components/DataList';
import { Spinner, EmptyState, Icon } from '@/components/ui';
import Dropdown from '@/components/Dropdown';
import { Board } from '@/components/Board';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

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
  toolbarExtra?: ReactNode;               // page-specific buttons rendered inside the toolbar row
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
  nameCol?: string;                       // primary/name column id (defaults to first col)
  onInvitePerson?: (email: string) => void | Promise<void>;  // invite-by-email from person cells
  onRename?: (r: T, name: string) => void;                   // inline rename from the name cell
  onAddSubtask?: (r: T) => void;                             // "+" add-subtask on the name cell
  onAddInGroup?: (groupValue: string) => void;
  groupAggregate?: (rows: T[]) => ReactNode;
  orderKey?: string;                      // enables persisted drag-to-reorder of rows
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
  const org = useActiveOrg();
  const canExportAll = !!p.exportName && can.manageMembers(org);  // RBAC: export = admin (matches nav adminOnly)
  const canGroup = !!p.groupField && !!p.groupOf && !!p.groups;
  const [grouped, setGrouped] = useState<boolean>(canGroup ? (p.defaultGroup ?? true) : false);
  const groupBy = canGroup && grouped ? p.groupField!.value : 'none';
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [view, setView] = useState<'list' | 'board'>('list');
  // Persist sort + view + grouping per-user (last-used), keyed off the list's prefs storage key.
  const vsKey = prefs.storageKey + ':vs';
  const vsLoaded = useRef(false);
  useEffect(() => {
    vsLoaded.current = false;
    try {
      const raw = localStorage.getItem(vsKey);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.sortBy === 'string') setSortBy(v.sortBy);
        if (v.sortDir === 'asc' || v.sortDir === 'desc') setSortDir(v.sortDir);
        if (canGroup && typeof v.grouped === 'boolean') setGrouped(v.grouped);
        if (canGroup && (v.view === 'list' || v.view === 'board')) setView(v.view);
      }
    } catch { /* ignore */ }
    vsLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsKey]);
  useEffect(() => {
    if (!vsLoaded.current) return;
    try { localStorage.setItem(vsKey, JSON.stringify({ sortBy, sortDir, grouped, view })); } catch { /* ignore */ }
  }, [vsKey, sortBy, sortDir, grouped, view]);
  const sorted = useMemo<T[] | null>(() => {
    if (rows === null) return null;
    if (!sortBy) return rows;
    const get = (r: T) => (p.exportValue ? p.exportValue(sortBy, r) : p.rawValue ? p.rawValue(sortBy, r) : '');
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = get(a) ?? '', bv = get(b) ?? '';
      const an = parseFloat(av), bn = parseFloat(bv);
      const num = !isNaN(an) && !isNaN(bn) && av.trim() !== '' && bv.trim() !== '';
      const c = num ? an - bn : av.localeCompare(bv);
      return sortDir === 'asc' ? c : -c;
    });
    return arr;
  }, [rows, sortBy, sortDir, p.exportValue, p.rawValue]);

  const doExport = (scope: 'selected' | 'all' = 'selected') => {
    if (!p.exportName) return;
    const ids = prefs.ordered;
    const label = (id: string) => cols.find((c) => c.id === id)?.label || id;
    const val = (id: string, r: T) => (id.startsWith('cf:') && prefs.cf ? prefs.cf.exportValue(id, p.rowKey(r)) : (p.exportValue ? p.exportValue(id, r) : ''));
    const heads = ids.map(label);
    const source = scope === 'all' ? (sorted || []) : rs.selected;
    const body = source.map((r) => ids.map((id) => val(id, r)));
    const csv = heads.map(csvEsc).join(',') + '\n' + body.map((row) => row.map(csvEsc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${p.exportName}-${scope === 'all' ? 'export' : 'selected'}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const hasBulk = !!(p.exportName || p.bulkActions || (p.onDelete && p.canDelete));

  return (
    <>
      <ListToolbar prefs={prefs} cols={cols} filters={p.filters} placeholder={p.searchPlaceholder || 'Search…'}
        rightControls={<>
          {canExportAll && (
            <button onClick={() => doExport('all')} title="Export all rows to CSV"
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-line bg-surface text-sm text-muted hover:text-content hover:border-borderstrong shrink-0 whitespace-nowrap">
              <Icon name="ti-download" className="text-sm" /><span className="hidden md:inline">Export</span>
            </button>
          )}
          {canGroup && (
            <Dropdown value={grouped ? 'group' : 'none'} onChange={(v) => setGrouped(v === 'group')} width={190}
              items={[{ value: 'none', label: 'No grouping' }, { value: 'group', label: `Group: ${p.groupField!.label}` }]}
              trigger={<span className="inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-line bg-surface text-sm text-content hover:border-borderstrong cursor-pointer whitespace-nowrap">{grouped ? `Group: ${p.groupField!.label}` : 'No grouping'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
          )}
          <Dropdown value={sortBy} onChange={setSortBy} width={190}
            items={[{ value: '', label: 'No sort' }, ...prefs.ordered.map((id) => ({ value: id, label: `Sort: ${cols.find((c) => c.id === id)?.label || id}` }))]}
            trigger={<span className="inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-line bg-surface text-sm text-content hover:border-borderstrong cursor-pointer whitespace-nowrap">{sortBy ? `Sort: ${cols.find((c) => c.id === sortBy)?.label || sortBy}` : 'No sort'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
          {sortBy && <button onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} title={sortDir === 'asc' ? 'Ascending' : 'Descending'} className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-line bg-surface text-muted hover:text-content hover:border-borderstrong shrink-0"><Icon name={sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} className="text-sm" /></button>}
          {canGroup && (
            <div className="flex items-center rounded-md border border-line overflow-hidden h-9 shrink-0">
              {(['list', 'board'] as const).map((vw) => (
                <button key={vw} onClick={() => setView(vw)}
                  className={`h-full px-3 text-xs capitalize inline-flex items-center gap-1.5 transition ${view === vw ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}>
                  <Icon name={vw === 'list' ? 'ti-list' : 'ti-layout-board'} className="text-sm" />{vw}
                </button>
              ))}
            </div>
          )}
        </>}>
        {p.toolbarExtra}
      </ListToolbar>

      {hasBulk && (
        <BulkBar count={rs.count} onClear={rs.clear}>
          {p.exportName && <button onClick={() => doExport('selected')} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>}
          {p.bulkActions?.(rs)}
          {p.onDelete && p.canDelete && <button onClick={() => p.onDelete!(rs)} disabled={p.busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
        </BulkBar>
      )}

      {rows === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : (view === 'board' && canGroup) ? (
        <Board
          rows={sorted as T[]}
          rowKey={p.rowKey}
          cols={cols}
          prefs={prefs}
          cell={p.cell}
          groups={p.groups!}
          groupOf={p.groupOf!}
          statusCol={p.groupField!.value}
          onRowClick={p.onRowClick}
          onMove={p.editable && p.editable[p.groupField!.value] && p.onEdit ? (r, target) => p.onEdit!(r, p.groupField!.value, target) : undefined}
          onAddInGroup={p.onAddInGroup}
          groupAggregate={p.groupAggregate}
        />
      ) : rows.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon={p.emptyIcon || 'ti-list'} text={p.emptyText || 'Nothing here yet.'} /></div>
      ) : (
        <DataList
          rows={sorted as T[]}
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
          onAddInGroup={p.onAddInGroup}
          groupAggregate={p.groupAggregate}
          orderKey={p.orderKey}
          nameCol={p.nameCol}
          onInvitePerson={p.onInvitePerson}
          onRename={p.onRename}
          onAddSubtask={p.onAddSubtask}
        />
      )}
    </>
  );
}
