import { useCallback, useEffect, useState, ReactNode } from 'react';
import { Icon } from '@/components/ui';
import type { ColDef } from '@/components/ListToolbar';
import type { EditSpec } from '@/components/DataList';
import {
  getCustomFieldDefs, createCustomFieldDef, deleteCustomFieldDef,
  getCustomFieldValuesByType, upsertCustomFieldValue,
} from '@/lib/db';
import { CustomFieldDef, CustomEntityType } from '@/lib/supabase';

const PREFIX = 'cf:';
export const isCustomCol = (id: string) => id.startsWith(PREFIX);
const fmtMoney = (n: number) => '$' + (isNaN(n) ? 0 : n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// ClickUp-style field types offered by "+ Add column".
export const CUSTOM_FIELD_TYPES: { value: string; label: string; icon: string }[] = [
  { value: 'text', label: 'Text', icon: 'ti-cursor-text' },
  { value: 'textarea', label: 'Long text', icon: 'ti-align-left' },
  { value: 'number', label: 'Number', icon: 'ti-123' },
  { value: 'currency', label: 'Money', icon: 'ti-currency-dollar' },
  { value: 'progress', label: 'Progress bar', icon: 'ti-progress' },
  { value: 'rating', label: 'Rating', icon: 'ti-star' },
  { value: 'date', label: 'Date', icon: 'ti-calendar' },
  { value: 'checkbox', label: 'Checkbox', icon: 'ti-checkbox' },
  { value: 'dropdown', label: 'Dropdown', icon: 'ti-list-check' },
  { value: 'multiselect', label: 'Labels', icon: 'ti-tags' },
  { value: 'url', label: 'Website', icon: 'ti-link' },
  { value: 'email', label: 'Email', icon: 'ti-mail' },
  { value: 'phone', label: 'Phone', icon: 'ti-phone' },
];
export const NEEDS_OPTIONS = new Set(['dropdown', 'multiselect']);

const specFor = (d: CustomFieldDef): EditSpec => {
  switch (d.field_type) {
    case 'dropdown':
    case 'multiselect':
    case 'labels': return { type: 'select', options: [{ value: '', label: '—' }, ...(d.options || []).map((o) => ({ value: o, label: o }))] };
    case 'checkbox': return { type: 'select', options: [{ value: '', label: '—' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
    case 'number':
    case 'currency':
    case 'progress':
    case 'rating': return { type: 'number' };
    case 'date': return { type: 'date' };
    default: return { type: 'text' };
  }
};

const clampNum = (v: string, max: number) => { const n = Number(v); return isNaN(n) ? 0 : Math.max(0, Math.min(max, n)); };

export function useCustomColumns(orgId: string | undefined, entityType: CustomEntityType, canManage: boolean) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});

  const reload = useCallback(() => {
    if (!orgId) { setDefs([]); setVals({}); return; }
    getCustomFieldDefs(orgId, entityType).then(setDefs).catch(() => setDefs([]));
    getCustomFieldValuesByType(orgId, entityType).then((rows) => {
      const m: Record<string, Record<string, string>> = {};
      rows.forEach((r) => { (m[r.entity_id] ||= {})[r.field_id] = r.value ?? ''; });
      setVals(m);
    }).catch(() => setVals({}));
  }, [orgId, entityType]);

  useEffect(() => { reload(); }, [reload]);

  const cols: ColDef[] = defs.map((d) => ({ id: PREFIX + d.id, label: d.name }));
  const defById: Record<string, CustomFieldDef> = {};
  defs.forEach((d) => { defById[PREFIX + d.id] = d; });
  const editable: Record<string, EditSpec> = {};
  defs.forEach((d) => { editable[PREFIX + d.id] = specFor(d); });

  const rawValue = (colId: string, entityId: string) => vals[entityId]?.[colId.slice(PREFIX.length)] ?? '';
  const cell = (colId: string, entityId: string): ReactNode => {
    const d = defById[colId];
    const t = d ? d.field_type : 'text';
    const v = rawValue(colId, entityId);
    if (t === 'checkbox') return v === 'true' ? <Icon name="ti-square-check-filled" className="text-sm text-accentstrong" /> : <span className="text-muted2">—</span>;
    if (!v) return <span className="text-muted2">—</span>;
    switch (t) {
      case 'currency': return <span className="text-sm tabular-nums text-content">{fmtMoney(Number(v) || 0)}</span>;
      case 'progress': { const n = clampNum(v, 100); return <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden inline-block align-middle"><span className="h-full bg-accent inline-block" style={{ width: `${n}%` }} /></span><span className="text-2xs text-muted2 tabular-nums">{n}%</span></span>; }
      case 'rating': { const n = clampNum(v, 5); return <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Icon key={i} name={i <= n ? 'ti-star-filled' : 'ti-star'} className={`text-xs ${i <= n ? 'text-amber-400' : 'text-muted2'}`} />)}</span>; }
      case 'url': return <a href={/^https?:\/\//.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline truncate inline-block max-w-[12rem] align-middle">{v}</a>;
      case 'email': return <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline">{v}</a>;
      case 'phone': return <a href={`tel:${v}`} onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline">{v}</a>;
      case 'dropdown': return <span className="pill pill-gray">{v}</span>;
      case 'multiselect':
      case 'labels': return <span className="inline-flex flex-wrap gap-1">{v.split(',').map((s) => s.trim()).filter(Boolean).map((s) => <span key={s} className="pill pill-gray">{s}</span>)}</span>;
      default: return <span className="text-sm text-muted">{v}</span>;
    }
  };
  const onEdit = async (colId: string, entityId: string, value: string) => {
    if (!orgId) return;
    const fieldId = colId.slice(PREFIX.length);
    setVals((p) => ({ ...p, [entityId]: { ...(p[entityId] || {}), [fieldId]: value } }));
    try { await upsertCustomFieldValue({ org_id: orgId, entity_type: entityType, entity_id: entityId, field_id: fieldId, value: value || null }); }
    catch { reload(); }
  };
  const addColumn = async (name: string, type: string, options?: string[]) => {
    if (!orgId) return;
    await createCustomFieldDef({ org_id: orgId, entity_type: entityType, name, field_type: type, options: options && options.length ? options : null, position: defs.length });
    reload();
  };
  const removeColumn = async (colId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this column and its data for all rows?')) return;
    await deleteCustomFieldDef(colId.slice(PREFIX.length));
    reload();
  };
  const customColIds = new Set(cols.map((c) => c.id));
  const exportValue = (colId: string, entityId: string) => rawValue(colId, entityId);

  return { cols, editable, rawValue, cell, onEdit, addColumn, removeColumn, customColIds, canManage, exportValue, defs, reload };
}

export type CustomColumnsApi = ReturnType<typeof useCustomColumns>;
