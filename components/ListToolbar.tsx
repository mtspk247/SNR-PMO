import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import Dropdown from '@/components/Dropdown';

// Shared, config-driven list controls: search + Filter popover + Columns
// (show/hide + reorder), with per-user view persisted to localStorage.
// Reuse across every module list so filters/columns are universally customizable.

export type ColDef = { id: string; label: string; locked?: boolean };
export type FilterDef = { id: string; label: string; options: { value: string; label: string }[] };

export type ListPrefs = {
  query: string; setQuery: (v: string) => void;
  filters: Record<string, string>; setFilter: (id: string, v: string) => void; clearFilters: () => void; activeCount: number;
  visible: Set<string>; toggle: (id: string) => void;
  order: string[]; move: (id: string, dir: -1 | 1) => void; setOrderArr: (ids: string[]) => void;
  ordered: string[]; // visible columns, in display order
};

export function useListPrefs(storageKey: string, cols: ColDef[]): ListPrefs {
  const ids = cols.map((c) => c.id);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Set<string>>(new Set(ids));
  const [order, setOrder] = useState<string[]>(ids);
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v.order)) { const valid = v.order.filter((x: string) => ids.includes(x)); setOrder([...valid, ...ids.filter((x) => !valid.includes(x))]); }
        else setOrder(ids);
        if (Array.isArray(v.visible)) setVisible(new Set(v.visible.filter((x: string) => ids.includes(x))));
        else setVisible(new Set(ids));
        setFilters(v.filters && typeof v.filters === 'object' ? v.filters : {});
      } else { setOrder(ids); setVisible(new Set(ids)); setFilters({}); }
    } catch { /* ignore */ }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ order, visible: [...visible], filters })); } catch { /* ignore */ }
  }, [storageKey, order, visible, filters]);

  const setFilter = (id: string, v: string) => setFilters((p) => ({ ...p, [id]: v }));
  const clearFilters = () => setFilters({});
  const activeCount = Object.values(filters).filter((v) => v && v !== 'all' && v !== '').length;
  const toggle = (id: string) => setVisible((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); if (n.size === 0) n.add(id); return n; });
  const move = (id: string, dir: -1 | 1) => setOrder((p) => { const i = p.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setOrderArr = (ids: string[]) => setOrder(ids);
  const ordered = order.filter((id) => visible.has(id));
  return { query, setQuery, filters, setFilter, clearFilters, activeCount, visible, toggle, order, move, setOrderArr, ordered };
}

export function ListToolbar({ prefs, cols, filters, placeholder = 'Search…', children }:
  { prefs: ListPrefs; cols: ColDef[]; filters?: FilterDef[]; placeholder?: string; children?: React.ReactNode }) {
  const [fOpen, setFOpen] = useState(false);
  const [cOpen, setCOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = (id: string) => cols.find((c) => c.id === id);
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
      {children}
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
              </div>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}
