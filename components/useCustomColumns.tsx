import { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { Icon } from '@/components/ui';
import type { ColDef } from '@/components/ListToolbar';
import type { EditSpec } from '@/components/DataList';
import {
  getCustomFieldDefs, createCustomFieldDef, updateCustomFieldDef, deleteCustomFieldDef,
  getCustomFieldValuesByType, upsertCustomFieldValue, computeAiField, getRelationOptions,
} from '@/lib/db';
import { CustomFieldDef, CustomEntityType } from '@/lib/supabase';

const PREFIX = 'cf:';
export const isCustomCol = (id: string) => id.startsWith(PREFIX);
const fmtMoney = (n: number) => '$' + (isNaN(n) ? 0 : n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// ClickUp-style field types offered by "+ Add column".
export const CUSTOM_FIELD_TYPES: { value: string; label: string; icon: string; group: string }[] = [
  { value: 'text', label: 'Text', icon: 'ti-cursor-text', group: 'Basic' },
  { value: 'textarea', label: 'Long text', icon: 'ti-align-left', group: 'Basic' },
  { value: 'date', label: 'Date', icon: 'ti-calendar', group: 'Basic' },
  { value: 'checkbox', label: 'Checkbox', icon: 'ti-checkbox', group: 'Basic' },
  { value: 'number', label: 'Number', icon: 'ti-123', group: 'Numeric' },
  { value: 'currency', label: 'Money', icon: 'ti-currency-dollar', group: 'Numeric' },
  { value: 'percent', label: 'Percent', icon: 'ti-percentage', group: 'Numeric' },
  { value: 'progress', label: 'Progress bar', icon: 'ti-progress', group: 'Numeric' },
  { value: 'rating', label: 'Rating', icon: 'ti-star', group: 'Numeric' },
  { value: 'duration', label: 'Duration (hrs)', icon: 'ti-clock-hour-4', group: 'Numeric' },
  { value: 'dropdown', label: 'Dropdown', icon: 'ti-list-check', group: 'Choice' },
  { value: 'multiselect', label: 'Labels', icon: 'ti-tags', group: 'Choice' },
  { value: 'url', label: 'Website', icon: 'ti-link', group: 'Contact' },
  { value: 'email', label: 'Email', icon: 'ti-mail', group: 'Contact' },
  { value: 'phone', label: 'Phone', icon: 'ti-phone', group: 'Contact' },
  { value: 'location', label: 'Location', icon: 'ti-map-pin', group: 'Contact' },
  { value: 'ai', label: 'AI field', icon: 'ti-sparkles', group: 'AI' },
  { value: 'relationship', label: 'Relationship', icon: 'ti-link', group: 'Connect' },
];
export const AI_TRANSFORMS: { value: string; label: string; hint: string }[] = [
  { value: 'summarize', label: 'Summarize', hint: 'One-line summary of the record' },
  { value: 'categorize', label: 'Categorize', hint: 'Pick one of your categories' },
  { value: 'sentiment', label: 'Sentiment', hint: 'Positive / Neutral / Negative' },
  { value: 'custom', label: 'Custom prompt', hint: 'Your own instruction' },
];
export const NEEDS_OPTIONS = new Set(['dropdown', 'multiselect']);

// Colored, ClickUp-style option pills. Each option may carry an explicit hex in the
// field def's option_meta; otherwise a stable palette colour is derived from the label.
export const OPTION_PALETTE = ['#6366F1', '#0EA5A4', '#EC8C36', '#E1568E', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#7C3AED', '#0891B2', '#64748B'];
export const defaultOptionColor = (label: string) => { let h = 0; for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0; return OPTION_PALETTE[h % OPTION_PALETTE.length]; };
const optColor = (d: CustomFieldDef, v: string) => (d.option_meta && d.option_meta[v]) || defaultOptionColor(v);
const colorPill = (text: string, color: string, key?: string): ReactNode => (
  <span key={key} className="inline-flex items-center rounded-md px-2.5 py-0.5 text-2xs font-medium max-w-full truncate align-middle" style={{ backgroundColor: color + '1f', color, boxShadow: `inset 0 0 0 1px ${color}33` }}>{text}</span>
);

// Relationship cell → link to the target module (deep link for tasks; list page otherwise).
const REL_HREF: Record<string, (id: string) => string> = {
  tasks: (id) => `/tasks?task=${id}`, projects: () => '/projects', clients: () => '/clients', deals: () => '/crm', contacts: () => '/crm',
};

const specFor = (d: CustomFieldDef): EditSpec => {
  switch (d.field_type) {
    case 'dropdown':
    case 'multiselect':
    case 'labels': return { type: 'select', options: [{ value: '', label: '—' }, ...(d.options || []).map((o) => ({ value: o, label: o, dot: optColor(d, o) }))] };
    case 'checkbox': return { type: 'select', options: [{ value: '', label: '—' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] };
    case 'number':
    case 'currency':
    case 'progress':
    case 'percent':
    case 'duration':
    case 'rating': return { type: 'number' };
    case 'date': return { type: 'date' };
    default: return { type: 'text' };
  }
};

const clampNum = (v: string, max: number) => { const n = Number(v); return isNaN(n) ? 0 : Math.max(0, Math.min(max, n)); };

export function useCustomColumns(orgId: string | undefined, entityType: CustomEntityType, canManage: boolean) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const [aiBusy, setAiBusy] = useState<Set<string>>(new Set());
  const aiTextRef = useRef<(id: string) => string>(() => '');
  const [relList, setRelList] = useState<Record<string, { id: string; label: string }[]>>({});
  const [relMap, setRelMap] = useState<Record<string, Record<string, string>>>({});

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

  const relKey = defs.filter((d) => d.field_type === 'relationship').map((d) => d.option_meta?.relation_entity || '').filter(Boolean).sort().join(',');
  useEffect(() => {
    if (!orgId || !relKey) return;
    const entities = relKey.split(',').filter((e, i, a) => a.indexOf(e) === i);
    let active = true;
    Promise.all(entities.map((e) => getRelationOptions(orgId, e).then((rows) => [e, rows] as const))).then((pairs) => {
      if (!active) return;
      const list: Record<string, { id: string; label: string }[]> = {};
      const map: Record<string, Record<string, string>> = {};
      pairs.forEach(([e, rows]) => { list[e] = rows; const m: Record<string, string> = {}; rows.forEach((r) => { m[r.id] = r.label; }); map[e] = m; });
      setRelList(list); setRelMap(map);
    }).catch(() => {});
    return () => { active = false; };
  }, [orgId, relKey]);

  const cols: ColDef[] = defs.map((d) => ({ id: PREFIX + d.id, label: d.name }));
  const defById: Record<string, CustomFieldDef> = {};
  defs.forEach((d) => { defById[PREFIX + d.id] = d; });
  const editable: Record<string, EditSpec> = {};
  defs.forEach((d) => {
    if (d.field_type === 'ai') return;
    if (d.field_type === 'relationship') {
      const ent = d.option_meta?.relation_entity || '';
      editable[PREFIX + d.id] = { type: 'select', options: [{ value: '', label: '—' }, ...((relList[ent] || []).map((o) => ({ value: o.id, label: o.label })))] };
    } else { editable[PREFIX + d.id] = specFor(d); }
  });

  const rawValue = (colId: string, entityId: string) => vals[entityId]?.[colId.slice(PREFIX.length)] ?? '';
  const cell = (colId: string, entityId: string): ReactNode => {
    const d = defById[colId];
    const t = d ? d.field_type : 'text';
    const v = rawValue(colId, entityId);
    if (t === 'checkbox') return v === 'true' ? <Icon name="ti-square-check-filled" className="text-sm text-accentstrong" /> : <span className="text-muted2">—</span>;
    if (t === 'ai') {
      const key = colId + ':' + entityId;
      const cfg = (d?.option_meta || {}) as Record<string, string>;
      const gen = async (e: any) => {
        e.stopPropagation();
        if (!orgId || !d) return;
        const text = (aiTextRef.current(entityId) || Object.entries(vals[entityId] || {}).filter(([fid, val]) => fid !== d.id && val).map(([, val]) => val).join('. ')).trim();
        if (!text) { if (typeof window !== 'undefined') window.alert('Nothing to read for this row yet.'); return; }
        setAiBusy((p2) => new Set(p2).add(key));
        try {
          const res = await computeAiField({ text, transform: cfg['ai_transform'] || 'summarize', categories: d.options || [], instruction: cfg['ai_prompt'] || '' });
          if (res.configured === false) { if (typeof window !== 'undefined') window.alert('Connect an AI key first in Console \u25b8 AI assistant.'); }
          else if (res.error) { if (typeof window !== 'undefined') window.alert('AI field: ' + res.error); }
          else if (orgId) { const nv = res.value || ''; setVals((p2) => ({ ...p2, [entityId]: { ...(p2[entityId] || {}), [d.id]: nv } })); upsertCustomFieldValue({ org_id: orgId, entity_type: entityType, entity_id: entityId, field_id: d.id, value: nv || null }).catch(() => reload()); }
        } finally { setAiBusy((p2) => { const n = new Set(p2); n.delete(key); return n; }); }
      };
      if (aiBusy.has(key)) return <span className="inline-flex items-center gap-1 text-2xs text-muted2"><Icon name="ti-loader-2" className="animate-spin text-xs" />Generating\u2026</span>;
      if (!v) return canManage ? <button onClick={gen} className="inline-flex items-center gap-1 text-2xs font-medium text-violet-500 hover:text-violet-600"><Icon name="ti-sparkles" className="text-xs" />Generate</button> : <span className="text-muted2">—</span>;
      return <span className="inline-flex items-center gap-1 max-w-full"><Icon name="ti-sparkles" className="text-[11px] text-violet-400 shrink-0" /><span className="text-sm text-content truncate max-w-[16rem] align-middle">{v}</span>{canManage && <button onClick={gen} title="Regenerate" className="shrink-0 text-muted2 hover:text-content"><Icon name="ti-refresh" className="text-2xs" /></button>}</span>;
    }
    if (!v) return <span className="text-muted2">—</span>;
    switch (t) {
      case 'currency': return <span className="text-sm tabular-nums text-content">{fmtMoney(Number(v) || 0)}</span>;
      case 'percent': { const n = clampNum(v, 100); return <span className="text-sm tabular-nums text-content">{n}%</span>; }
      case 'duration': return <span className="text-sm tabular-nums text-content">{Number(v) || 0}h</span>;
      case 'location': return <span className="inline-flex items-center gap-1 text-sm text-content"><Icon name="ti-map-pin" className="text-xs text-muted2" />{v}</span>;
      case 'progress': { const n = clampNum(v, 100); return <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden inline-block align-middle"><span className="h-full bg-accent inline-block" style={{ width: `${n}%` }} /></span><span className="text-2xs text-muted2 tabular-nums">{n}%</span></span>; }
      case 'rating': { const n = clampNum(v, 5); return <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Icon key={i} name={i <= n ? 'ti-star-filled' : 'ti-star'} className={`text-xs ${i <= n ? 'text-amber-400' : 'text-muted2'}`} />)}</span>; }
      case 'url': return <a href={/^https?:\/\//.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline truncate inline-block max-w-[12rem] align-middle">{v}</a>;
      case 'email': return <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline">{v}</a>;
      case 'phone': return <a href={`tel:${v}`} onClick={(e) => e.stopPropagation()} className="text-sm text-accentstrong hover:underline">{v}</a>;
      case 'dropdown': return colorPill(v, optColor(d, v));
      case 'multiselect':
      case 'labels': return <span className="inline-flex flex-wrap gap-1">{v.split(',').map((s) => s.trim()).filter(Boolean).map((s) => colorPill(s, optColor(d, s), s))}</span>;
      case 'relationship': {
        const ent = d?.option_meta?.relation_entity || '';
        const label = (relMap[ent] && relMap[ent][v]) || 'Linked record';
        const mk = REL_HREF[ent];
        const pill = colorPill(label, '#6366F1');
        return mk ? <a href={mk(v)} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">{pill}</a> : pill;
      }
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
  const addColumn = async (name: string, type: string, options?: string[], optionMeta?: Record<string, string>) => {
    if (!orgId) return;
    await createCustomFieldDef({ org_id: orgId, entity_type: entityType, name, field_type: type, options: options && options.length ? options : null, option_meta: optionMeta || {}, position: defs.length });
    reload();
  };
  const updateColumnOptions = async (colId: string, options: string[], option_meta: Record<string, string>) => {
    await updateCustomFieldDef(colId.slice(PREFIX.length), { options: options.length ? options : null, option_meta });
    reload();
  };
  const removeColumn = async (colId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this column and its data for all rows?')) return;
    await deleteCustomFieldDef(colId.slice(PREFIX.length));
    reload();
  };
  const customColIds = new Set(cols.map((c) => c.id));
  const exportValue = (colId: string, entityId: string) => rawValue(colId, entityId);

  return { cols, editable, rawValue, cell, onEdit, addColumn, updateColumnOptions, removeColumn, customColIds, canManage, exportValue, defs, reload, setAiText: (fn: (id: string) => string) => { aiTextRef.current = fn; } };
}

export type CustomColumnsApi = ReturnType<typeof useCustomColumns>;
