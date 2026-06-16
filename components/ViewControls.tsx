import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import Dropdown from '@/components/Dropdown';

// Shared, reusable view + grouping controls for every module list.
// View = how rows render (table / cards / …). GroupBy = how they're sectioned.
// Both persist per-user to localStorage. Pair with the grouping helper below.

export type ViewDef = { id: string; icon: string; label: string };
export interface ViewPrefs {
  view: string; setView: (v: string) => void;
  groupBy: string; setGroupBy: (v: string) => void;
}

export function useViewPrefs(storageKey: string, def: { view: string; groupBy?: string }): ViewPrefs {
  const [view, setViewS] = useState(def.view);
  const [groupBy, setGroupByS] = useState(def.groupBy || 'none');
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false;
    try { const raw = localStorage.getItem(storageKey); if (raw) { const v = JSON.parse(raw); if (v.view) setViewS(v.view); if (v.groupBy) setGroupByS(v.groupBy); } } catch { /* ignore */ }
    loaded.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ view, groupBy })); } catch { /* ignore */ }
  }, [storageKey, view, groupBy]);
  return { view, setView: setViewS, groupBy, setGroupBy: setGroupByS };
}

export function ViewControls({ prefs, views, groupOptions }:
  { prefs: ViewPrefs; views: ViewDef[]; groupOptions?: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      {groupOptions && groupOptions.length > 0 && (
        <Dropdown value={prefs.groupBy} onChange={prefs.setGroupBy} width={200}
          items={groupOptions.map((o) => ({ value: o.value, label: o.label }))}
          trigger={
            <span className="btn h-9 cursor-pointer">
              <Icon name="ti-layout-rows" className="text-sm" />
              <span className="hidden md:inline">{groupOptions.find((o) => o.value === prefs.groupBy)?.label || 'Group'}</span>
              <Icon name="ti-chevron-down" className="text-2xs text-muted2" />
            </span>
          } />
      )}
      {views.length > 1 && (
        <div className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5 h-9">
          {views.map((v) => (
            <button key={v.id} onClick={() => prefs.setView(v.id)} title={v.label}
              className={`h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-sm transition ${prefs.view === v.id ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:text-content'}`}>
              <Icon name={v.icon} className="text-sm" /><span className="hidden lg:inline">{v.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Generic grouping: getKey returns a stable bucket key; labelFor maps it to a display
// label. `order` optionally fixes section order (else alphabetical by label).
export function buildGroups<T>(items: T[], getKey: (t: T) => string, labelFor: (k: string) => string, order?: string[]):
  { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) { const k = getKey(it); const arr = map.get(k); if (arr) arr.push(it); else map.set(k, [it]); }
  const groups = [...map.entries()].map(([key, gi]) => ({ key, label: labelFor(key), items: gi }));
  if (order && order.length) groups.sort((a, b) => { const ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  else groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}
