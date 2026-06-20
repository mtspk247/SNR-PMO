import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';

// Reusable multi-row selection for any list/table of items with an `id`.
// Pair with the list's *visible* rows so "select all" matches what's on screen.
export function useRowSelection<T extends { id: string }>(items: T[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const allSelected = ids.length > 0 && ids.every((id) => sel.has(id));
  const someSelected = sel.size > 0 && !allSelected;
  const isSelected = (id: string) => sel.has(id);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((p) => (ids.length > 0 && ids.every((id) => p.has(id)) ? new Set<string>() : new Set(ids)));
  const clear = () => setSel(new Set());
  const selected = useMemo(() => items.filter((i) => sel.has(i.id)), [items, sel]);
  return { selected, ids: sel, count: sel.size, allSelected, someSelected, isSelected, toggle, toggleAll, clear };
}

// Header checkbox with indeterminate (some-but-not-all) state.
export function HeadCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate && !checked; }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="accent-accentstrong w-4 h-4 align-middle cursor-pointer"
      aria-label="Select all rows"
    />
  );
}

export function RowCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  // Hover-reveal: hidden until the row (a `group`) is hovered, or the box is checked/focused.
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={`accent-accentstrong w-4 h-4 align-middle cursor-pointer transition-opacity ${checked ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      aria-label="Select row"
    />
  );
}

// Floating action bar shown when rows are selected. Pass action buttons as children.
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children?: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 shadow-sm">
      <Icon name="ti-checkbox" className="text-accentstrong" />
      <span className="text-sm font-medium text-content">{count} selected</span>
      <div className="flex items-center gap-2 ml-auto">{children}</div>
      <button onClick={onClear} className="text-muted hover:text-content" title="Clear selection"><Icon name="ti-x" className="text-base" /></button>
    </div>
  );
}

// Bulk "assign to person" control for the multi-select bar. Pages pass their users
// list + an onAssign that updates the selected rows' owner/assignee via the existing fn.
export function BulkAssign({ users, onAssign, label = 'Assign to…' }: { users: { id: string; full_name: string }[]; onAssign: (userId: string | null) => void; label?: string }) {
  return (
    <Select value="" onChange={(v) => { if (v) onAssign(v === '__un' ? null : v); }} width={190} className="h-8 py-0 text-xs"
      options={[{ value: '', label }, { value: '__un', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
  );
}
