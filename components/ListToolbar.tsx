import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import Dropdown from '@/components/Dropdown';
import { useCustomColumns } from '@/components/useCustomColumns';
import AddColumnForm from '@/components/AddColumnForm';
import { ColumnOptionsEditor } from '@/components/OptionsEditor';
import type { CustomColumnsApi } from '@/components/useCustomColumns';
import { useActiveOrg } from '@/lib/store';

// Shared, config-driven list controls: search + Filter popover + Columns
// (show/hide + reorder), with per-user view persisted to localStorage.
// Reuse across every module list so filters/columns are universally customizable.

export type ColDef = { id: string; label: string; locked?: boolean; width?: number };
export type FilterDef = { id: string; label: string; options: { value: string; label: string }[] };

export type ListPrefs = {
  query: string; setQuery: (v: string) => void;
  filters: Record<string, string>; setFilter: (id: string, v: string) => void; clearFilters: () => void; activeCount: number;
  visible: Set<string>; toggle: (id: string) => void;
  order: string[]; move: (id: string, dir: -1 | 1) => void; setOrderArr: (ids: string[]) => void;
  ordered: string[]; // visible columns, in display order
  allCols: ColDef[]; // base + custom columns merged
  cf?: CustomColumnsApi; // custom-column api when a customEntity is supplied
  widths: Record<string, number>; setWidth: (id: string, w: number) => void;
  wrap: Record<string, boolean>; toggleWrap: (id: string) => void;
  pinned: number; setPinned: (n: number) => void; // # of leading columns frozen (sticky-left)
  storageKey: string;
};

export function useListPrefs(storageKey: string, baseCols: ColDef[], cfOpts?: { entity?: string; orgId?: string; canManage?: boolean }): ListPrefs {
  // Custom columns are GLOBAL by default: any standard `snrpmo.<entity>.cols` list gets the
  // ClickUp-style "+ add column" automatically, with org + role from the active workspace.
  // Explicit cfOpts still overrides (the pages that pass it are unchanged). `tasks` keeps its
  // own dedicated field system, so it's excluded from the auto-default.
  const activeOrg = useActiveOrg();
  const keyEntity = (() => { const m = /^snrpmo\.([a-z0-9_]+)\.cols$/.exec(storageKey); const e = m ? m[1] : ''; return e && e !== 'tasks' ? e : ''; })();
  const effEntity = cfOpts?.entity ?? keyEntity;
  const effOrgId = cfOpts?.orgId ?? activeOrg?.id;
  const effCanManage = cfOpts?.canManage ?? ['owner', 'admin'].includes(activeOrg?.member_role || '');
  const cf = useCustomColumns(effOrgId, effEntity || '', !!effCanManage);
  const cols = effEntity ? [...baseCols, ...cf.cols] : baseCols;
  const ids = cols.map((c) => c.id);
  const idsKey = ids.join('|');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Set<string>>(new Set(ids));
  const [order, setOrder] = useState<string[]>(ids);
  const [known, setKnown] = useState<Set<string>>(new Set(ids));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [wrap, setWrap] = useState<Record<string, boolean>>({});
  const [pinned, setPinned] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw);
        const kn: string[] = Array.isArray(v.known) ? v.known : ids;
        setKnown(new Set(kn));
        if (Array.isArray(v.order)) { const valid = v.order.filter((x: string) => ids.includes(x)); setOrder([...valid, ...ids.filter((x) => !valid.includes(x))]); }
        else setOrder(ids);
        if (Array.isArray(v.visible)) {
          const vis = new Set<string>(v.visible.filter((x: string) => ids.includes(x)));
          ids.forEach((x) => { if (!kn.includes(x)) vis.add(x); });
          setVisible(vis);
        } else setVisible(new Set(ids));
        setFilters(v.filters && typeof v.filters === 'object' ? v.filters : {});
        setWidths(v.widths && typeof v.widths === 'object' ? v.widths : {});
        setWrap(v.wrap && typeof v.wrap === 'object' ? v.wrap : {});
        setPinned(typeof v.pinned === 'number' ? v.pinned : 0);
      } else { setOrder(ids); setVisible(new Set(ids)); setKnown(new Set(ids)); setFilters({}); setWidths({}); setWrap({}); setPinned(0); }
    } catch { /* ignore */ }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Auto-include dynamically-added columns (e.g. custom fields) without re-showing user-hidden ones.
  useEffect(() => {
    if (!loaded.current) return;
    const newIds = ids.filter((i) => !known.has(i));
    if (newIds.length === 0) return;
    setOrder((pr) => [...pr, ...newIds.filter((i) => !pr.includes(i))]);
    setVisible((pr) => { const n = new Set(pr); newIds.forEach((i) => n.add(i)); return n; });
    setKnown((pr) => { const n = new Set(pr); ids.forEach((i) => n.add(i)); return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ order, visible: [...visible], filters, known: [...known], widths, wrap, pinned })); } catch { /* ignore */ }
  }, [storageKey, order, visible, filters, known, widths, wrap, pinned]);

  const setFilter = (id: string, v: string) => setFilters((pr) => ({ ...pr, [id]: v }));
  const clearFilters = () => setFilters({});
  const activeCount = Object.values(filters).filter((v) => v && v !== 'all' && v !== '').length;
  const toggle = (id: string) => setVisible((pr) => { const n = new Set(pr); n.has(id) ? n.delete(id) : n.add(id); if (n.size === 0) n.add(id); return n; });
  const move = (id: string, dir: -1 | 1) => setOrder((pr) => { const i = pr.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= pr.length) return pr; const n = [...pr]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setOrderArr = (idsArr: string[]) => setOrder(idsArr);
  const setWidth = (id: string, w: number) => setWidths((pr) => ({ ...pr, [id]: Math.max(60, Math.round(w)) }));
  const toggleWrap = (id: string) => setWrap((pr) => ({ ...pr, [id]: !pr[id] }));
  const ordered = order.filter((id) => visible.has(id) && ids.includes(id));
  return { query, setQuery, filters, setFilter, clearFilters, activeCount, visible, toggle, order, move, setOrderArr, ordered, allCols: cols, cf: effEntity ? cf : undefined, widths, setWidth, wrap, toggleWrap, pinned, setPinned, storageKey };
}

export function ListToolbar({ prefs, cols, filters, placeholder = 'Search…', children, rightControls }:
  { prefs: ListPrefs; cols: ColDef[]; filters?: FilterDef[]; placeholder?: string; children?: React.ReactNode; rightControls?: React.ReactNode }) {
  const [fOpen, setFOpen] = useState(false);
  const [cOpen, setCOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = (id: string) => prefs.allCols.find((c) => c.id === id) || cols.find((c) => c.id === id);
  const onDrop = (dropId: string) => {
    if (!dragId || dragId === dropId) { setDragId(null); return; }
    const arr = [...prefs.order]; const from = arr.indexOf(dragId); const to = arr.indexOf(dropId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    arr.splice(from, 1); arr.splice(to, 0, dragId); prefs.setOrderArr(arr); setDragId(null);
  };
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface w-full sm:w-72">
        <Icon name="ti-search" className="text-muted2" />
        <input value={prefs.query} onChange={(e) => prefs.setQuery(e.target.value)} placeholder={placeholder}
          className="bg-transparent outline-none text-sm w-full text-content placeholder:text-muted2" />
      </div>
      <div className="hidden sm:block flex-1" />
      {filters && filters.length > 0 && (
        <div className="relative">
          <button onClick={() => setFOpen((v) => !v)} className={`btn h-9 ${prefs.activeCount ? 'border-accent text-accentstrong' : ''}`}>
            <Icon name="ti-filter" className="text-sm" />Filter{prefs.activeCount > 0 && <span className="ml-0.5 text-2xs bg-accent/15 text-accentstrong rounded-full px-1.5">{prefs.activeCount}</span>}
          </button>
          {fOpen && <div className="fixed inset-0 z-10" onClick={() => setFOpen(false)} aria-hidden />}
          {fOpen && (
            <div className="absolute right-0 top-10 z-20 w-64 bg-surface border border-line rounded-lg shadow-lg p-3 space-y-3">
              {filters.map((f) => { const cur = prefs.filters[f.id] || (f.options[0]?.value ?? ''); return (
                <div key={f.id}><label className="label">{f.label}</label>
                  <Dropdown value={cur} onChange={(v) => prefs.setFilter(f.id, v)} width={232}
                    items={f.options.map((o) => ({ value: o.value, label: o.label }))}
                    trigger={<span className="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-line bg-surface text-sm cursor-pointer hover:border-borderstrong"><span className="truncate">{f.options.find((o) => o.value === cur)?.label || f.options[0]?.label}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} /></div>
              ); })}
              {prefs.activeCount > 0 && <button onClick={prefs.clearFilters} className="text-2xs text-muted hover:text-content underline">Clear all filters</button>}
            </div>
          )}
        </div>
      )}
      <div className="relative">
        <button onClick={() => setCOpen((v) => !v)} className="btn h-9"><Icon name="ti-columns-3" className="text-sm" /><span className="hidden md:inline">Columns</span></button>
        {cOpen && <div className="fixed inset-0 z-10" onClick={() => setCOpen(false)} aria-hidden />}
        {cOpen && (
          <div className="absolute right-0 top-10 z-20 w-56 bg-surface border border-line rounded-lg shadow-lg p-1">
            <p className="px-2 py-1 text-2xs text-muted2">Drag to reorder · tick to show/hide</p>
            <div className="flex items-center justify-between gap-2 px-2 py-1 mb-1 border-b border-line/60">
              <span className="text-2xs text-muted2 inline-flex items-center gap-1"><Icon name="ti-pin" className="text-sm" />Freeze columns</span>
              <span className="inline-flex items-center gap-1.5">
                <button onClick={() => prefs.setPinned(Math.max(0, prefs.pinned - 1))} disabled={prefs.pinned <= 0} className="text-muted2 hover:text-content disabled:opacity-30"><Icon name="ti-minus" className="text-sm" /></button>
                <span className="text-xs tnum w-4 text-center">{prefs.pinned}</span>
                <button onClick={() => prefs.setPinned(Math.min(prefs.ordered.length, prefs.pinned + 1))} disabled={prefs.pinned >= prefs.ordered.length} className="text-muted2 hover:text-content disabled:opacity-30"><Icon name="ti-plus" className="text-sm" /></button>
              </span>
            </div>
            {prefs.order.map((id, idx) => { const c = byId(id); if (!c) return null; return (
              <div key={id} draggable onDragStart={() => setDragId(id)} onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface2 ${dragId === id ? 'opacity-40' : ''}`}>
                <Icon name="ti-grip-vertical" className="text-sm text-muted2 cursor-grab shrink-0" title="Drag to reorder" />
                <label className="flex items-center gap-2 text-sm flex-1 cursor-pointer">
                  <input type="checkbox" checked={prefs.visible.has(id)} disabled={c.locked} onChange={() => prefs.toggle(id)} className="accent-accentstrong" />{c.label}
                </label>
                <button onClick={() => prefs.move(id, -1)} disabled={idx === 0} className="text-muted2 hover:text-content disabled:opacity-30"><Icon name="ti-chevron-up" className="text-sm" /></button>
                <button onClick={() => prefs.move(id, 1)} disabled={idx === prefs.order.length - 1} className="text-muted2 hover:text-content disabled:opacity-30"><Icon name="ti-chevron-down" className="text-sm" /></button>
                <button onClick={() => prefs.toggleWrap(id)} title={prefs.wrap[id] ? 'Text wrapping: on' : 'Text wrapping: off'} className={prefs.wrap[id] ? 'text-accentstrong' : 'text-muted2 hover:text-content'}><Icon name="ti-text-wrap" className="text-sm" /></button>
                {prefs.cf && (() => { const cf = prefs.cf!; const def = cf.defs.find((d) => 'cf:' + d.id === id); return def && ['dropdown', 'multiselect', 'labels'].includes(def.field_type) ? <ColumnOptionsEditor def={def} cf={cf} /> : null; })()}
                {prefs.cf?.customColIds.has(id) && <button onClick={() => prefs.cf!.removeColumn(id)} title="Delete column" className="text-muted2 hover:text-rose-500"><Icon name="ti-trash" className="text-sm" /></button>}
              </div>
            ); })}
            {prefs.cf?.canManage && (
              <div className="border-t border-line/60 mt-1 pt-1">
                {!addOpen ? (
                  <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-accentstrong hover:bg-surface2"><Icon name="ti-plus" className="text-sm" />Add column</button>
                ) : (
                  <div className="p-2"><AddColumnForm cf={prefs.cf!} onDone={() => setAddOpen(false)} /></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {children}
      {rightControls}
    </div>
  );
}
