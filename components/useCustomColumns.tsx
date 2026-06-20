import { useCallback, useEffect, useState, ReactNode } from 'react';
import { ColDef } from '@/components/ListToolbar';
import { EditSpec } from '@/components/DataList';
import {
  getCustomFieldDefs, createCustomFieldDef, deleteCustomFieldDef,
  getCustomFieldValuesByType, upsertCustomFieldValue,
} from '@/lib/db';
import { CustomFieldDef, CustomEntityType } from '@/lib/supabase';

// Per-entity custom columns for any list. RBAC: only owner/admin can add/remove
// (enforced by RLS on custom_field_definitions); any member can edit values.
const PREFIX = 'cf:';
export const isCustomCol = (id: string) => id.startsWith(PREFIX);

const specFor = (d: CustomFieldDef): EditSpec => {
  switch (d.field_type) {
    case 'dropdown':
    case 'multiselect': return { type: 'select', options: [{ value: '', label: '—' }, ...(d.options || []).map((o) => ({ value: o, label: o }))] };
    case 'checkbox': return { type: 'select', options: [{ value: '', label: '—' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
    case 'number': return { type: 'number' };
    case 'date': return { type: 'date' };
    default: return { type: 'text' };
  }
};

export function useCustomColumns(orgId: string | undefined, entityType: CustomEntityType, canManage: boolean) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({}); // entityId -> fieldId -> value

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
  const editable: Record<string, EditSpec> = {};
  defs.forEach((d) => { editable[PREFIX + d.id] = specFor(d); });

  const rawValue = (colId: string, entityId: string) => vals[entityId]?.[colId.slice(PREFIX.length)] ?? '';
  const cell = (colId: string, entityId: string): ReactNode => {
    const v = rawValue(colId, entityId);
    if (!v) return <span className="text-muted2">—</span>;
    if (v === 'true') return <span className="text-sm">✓</span>;
    if (v === 'false') return <span className="text-muted2">—</span>;
    return <span className="text-sm text-muted">{v}</span>;
  };
  const onEdit = async (colId: string, entityId: string, value: string) => {
    if (!orgId) return;
    const fieldId = colId.slice(PREFIX.length);
    setVals((p) => ({ ...p, [entityId]: { ...(p[entityId] || {}), [fieldId]: value } }));
    try { await upsertCustomFieldValue({ org_id: orgId, entity_type: entityType, entity_id: entityId, field_id: fieldId, value: value || null }); }
    catch { reload(); }
  };
  const addColumn = async (name: string, type: string) => {
    if (!orgId) return;
    await createCustomFieldDef({ org_id: orgId, entity_type: entityType, name, field_type: type, position: defs.length });
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
