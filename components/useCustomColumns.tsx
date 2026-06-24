import { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { Icon, Avatar } from '@/components/ui';
import type { ColDef } from '@/components/ListToolbar';
import type { EditSpec } from '@/components/DataList';
import {
  getCustomFieldDefs, createCustomFieldDef, updateCustomFieldDef, deleteCustomFieldDef,
  getCustomFieldValuesByType, upsertCustomFieldValue, computeAiField, getRelationOptions, getRollupValues, ROLLUP_TARGETS,
} from '@/lib/db';
import { CustomFieldDef, CustomEntityType } from '@/lib/supabase';
import { evalFormula, type FormulaValue } from '@/lib/formula';

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
  { value: 'rollup', label: 'Rollup', icon: 'ti-arrow-bar-to-right', group: 'Connect' },
  { value: 'formula', label: 'Formula', icon: 'ti-math-function', group: 'Advanced' },
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
  tasks: (id) => `/tasks?task=${id}`, projects: () => '/projects', clients: () => '/clients', deals: () => '/crm', contacts: () => '/crm', people: (id) => `/users/${id}`,
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
  const [rollupVals, setRollupVals] = useState<Record<string, Record<string, string>>>({});

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

  // Rollup columns: fetch the target field across the linked entity's rows, keyed `entity:field`.
  const rollupKey = defs.filter((d) => d.field_type === 'rollup').map((d) => {
    const src = defs.find((x) => x.id === (d.option_meta?.rollup_source || ''));
    const ent = src?.option_meta?.relation_entity || ''; const tgt = d.option_meta?.rollup_target || '';
    return ent && tgt ? ent + ':' + tgt : '';
  }).filter(Boolean).filter((k, i, a) => a.indexOf(k) === i).sort().join(',');
  useEffect(() => {
    if (!orgId || !rollupKey) { setRollupVals({}); return; }
    const keys = rollupKey.split(',').filter(Boolean);
    let active = true;
    Promise.all(keys.map((k) => { const [ent, tgt] = k.split(':'); return getRollupValues(orgId, ent, tgt).then((m) => [k, m] as const); })).then((pairs) => {
      if (!active) return;
      const out: Record<string, Record<string, string>> = {};
      pairs.forEach(([k, m]) => { out[k] = m; });
      setRollupVals(out);
    }).catch(() => {});
    return () => { active = false; };
  }, [orgId, rollupKey]);

  const cols: ColDef[] = defs.map((d) => ({ id: PREFIX + d.id, label: d.name }));
  const defById: Record<string, CustomFieldDef> = {};
  defs.forEach((d) => { defById[PREFIX + d.id] = d; });
  const editable: Record<string, EditSpec> = {};
  defs.forEach((d) => {
    if (d.field_type === 'ai' || d.field_type === 'rollup' || d.field_type === 'formula') return;
    if (d.field_type === 'relationship') {
      const ent = d.option_meta?.relation_entity || '';
      const multi = d.option_meta?.multi === '1';
      const base = (relList[ent] || []).map((o) => ({ value: o.id, label: o.label }));
      if (ent === 'people') {
        editable[PREFIX + d.id] = { type: 'person', options: base, multi };
      } else {
        editable[PREFIX + d.id] = multi ? { type: 'select', multi: true, options: base } : { type: 'select', options: [{ value: '', label: '—' }, ...base] };
      }
    } else { editable[PREFIX + d.id] = specFor(d); }
  });

  const rawValue = (colId: string, entityId: string) => vals[entityId]?.[colId.slice(PREFIX.length)] ?? '';
  // Compute a rollup cell: follow the source relationship's linked id(s), look up the target
  // field for each, and aggregate per option_meta.rollup_agg (show|count|sum|avg|min|max|list).
  const rollupCompute = (d: CustomFieldDef, entityId: string): { value: string; kind: 'number' | 'text' | 'date' } => {
    const cfg = (d.option_meta || {}) as Record<string, string>;
    const srcDef = defs.find((x) => x.id === (cfg.rollup_source || ''));
    const ent = srcDef?.option_meta?.relation_entity || ''; const tgt = cfg.rollup_target || '';
    if (!srcDef || !ent || !tgt) return { value: '', kind: 'text' };
    const kind = ((ROLLUP_TARGETS[ent] || []).find((x) => x.value === tgt)?.kind || 'text') as 'number' | 'text' | 'date';
    const ids = (vals[entityId]?.[srcDef.id] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const agg = cfg.rollup_agg || 'show';
    if (agg === 'count') return { value: ids.length ? String(ids.length) : '', kind: 'number' };
    if (!ids.length) return { value: '', kind };
    const map = rollupVals[ent + ':' + tgt] || {};
    const raws = ids.map((id) => map[id]).filter((x) => x !== undefined && x !== '') as string[];
    if (!raws.length) return { value: '', kind };
    if (kind === 'number' && (agg === 'sum' || agg === 'avg' || agg === 'min' || agg === 'max')) {
      const nums = raws.map(Number).filter((nn) => !isNaN(nn));
      if (!nums.length) return { value: '', kind };
      const sum = nums.reduce((s, x) => s + x, 0);
      const out = agg === 'sum' ? sum : agg === 'avg' ? sum / nums.length : agg === 'min' ? Math.min(...nums) : Math.max(...nums);
      return { value: String(out), kind: 'number' };
    }
    if (agg === 'min' || agg === 'max') { const sorted = raws.slice().sort(); return { value: agg === 'min' ? sorted[0] : sorted[sorted.length - 1], kind }; }
    return { value: Array.from(new Set(raws)).join(', '), kind };
  };
  // Resolve a formula's {Field name} ref to its value: stored fields, rollups, and nested
  // formulas (cycle-guarded via `visited`). Returns null for blank/unknown (engine treats as 0).
  const resolveFormulaRef = (entityId: string, name: string, visited: Set<string>): FormulaValue => {
    const dd = defs.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
    if (!dd) return null;
    if (dd.field_type === 'rollup') { const s = rollupCompute(dd, entityId).value; return s === '' ? null : s; }
    if (dd.field_type === 'formula') {
      if (visited.has(dd.id)) return null;
      const v2 = new Set(visited); v2.add(dd.id);
      const r = evalFormula(dd.option_meta?.formula || '', (nm) => resolveFormulaRef(entityId, nm, v2));
      return r.error ? null : r.value;
    }
    const s = vals[entityId]?.[dd.id] ?? '';
    return s === '' ? null : s;
  };
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
    if (t === 'rollup') {
      const { value: rv, kind } = rollupCompute(d!, entityId);
      if (rv === '') return <span className="text-muted2">—</span>;
      let shown = rv;
      if (kind === 'number') { const n = Number(rv); shown = isNaN(n) ? rv : n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
      else if (kind === 'date') { const dt = new Date(rv); shown = isNaN(dt.getTime()) ? rv : dt.toLocaleDateString(); }
      return <span className="inline-flex items-center gap-1 max-w-full" title="Rolled up from the linked record(s)"><Icon name="ti-arrow-bar-to-right" className="text-[11px] text-muted2 shrink-0" /><span className={`text-sm text-content truncate max-w-[14rem] align-middle ${kind === 'number' ? 'tabular-nums' : ''}`}>{shown}</span></span>;
    }
    if (t === 'formula') {
      const expr = (d?.option_meta?.formula || '').trim();
      if (!expr) return <span className="text-muted2">—</span>;
      const res = evalFormula(expr, (nm) => resolveFormulaRef(entityId, nm, new Set([d!.id])));
      if (res.error) return <span className="text-2xs text-rose-400 cursor-help" title={res.error}>#ERR</span>;
      if (res.value === null || res.value === '') return <span className="text-muted2">—</span>;
      const shown = typeof res.value === 'number' ? res.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(res.value);
      return <span className="inline-flex items-center gap-1 max-w-full" title="Computed by formula"><Icon name="ti-math-function" className="text-[11px] text-muted2 shrink-0" /><span className="text-sm text-content truncate max-w-[14rem] align-middle tabular-nums">{shown}</span></span>;
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
        const mk = REL_HREF[ent];
        const ids = v.split(',').map((s) => s.trim()).filter(Boolean);
        const renderOne = (id: string) => {
          const label = (relMap[ent] && relMap[ent][id]) || 'Linked record';
          const inner = ent === 'people'
            ? <span className="inline-flex items-center gap-1.5"><Avatar name={label} size={20} /><span className="text-sm text-content truncate max-w-[10rem] align-middle">{label}</span></span>
            : colorPill(label, '#6366F1');
          return mk ? <a key={id} href={mk(id)} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">{inner}</a> : <span key={id}>{inner}</span>;
        };
        if (ids.length <= 1) return renderOne(ids[0] || v);
        return <span className="inline-flex flex-wrap items-center gap-1">{ids.slice(0, 4).map(renderOne)}{ids.length > 4 && <span className="text-2xs text-muted2 self-center">+{ids.length - 4}</span>}</span>;
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
