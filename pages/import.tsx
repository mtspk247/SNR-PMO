import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';

// ---- Entity field maps (with enum coercion to satisfy DB CHECK constraints) ----
type Field = { key: string; label: string; required?: boolean; enumv?: string[]; def?: string; type?: 'number' | 'date' };
type Entity = { key: string; table: string; label: string; icon: string; desc: string; needsProject?: boolean; withCreatedBy?: boolean; fields: Field[] };

const ENTITIES: Entity[] = [
  { key: 'projects', table: 'projects', label: 'Projects', icon: 'ti-folder', withCreatedBy: true,
    desc: 'From ClickUp, Asana, monday, Trello…', fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status', def: 'Planning' },
      { key: 'priority', label: 'Priority', enumv: ['Low', 'Medium', 'High', 'Urgent'], def: 'Medium' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'end_date', label: 'Due date', type: 'date' },
    ] },
  { key: 'tasks', table: 'tasks', label: 'Tasks', icon: 'ti-checkbox', needsProject: true,
    desc: 'Import into a project of your choice.', fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'status', label: 'Status', def: 'Backlog' },
      { key: 'priority', label: 'Priority', enumv: ['Low', 'Medium', 'High', 'Urgent'], def: 'Medium' },
      { key: 'due_date', label: 'Due date', type: 'date' },
    ] },
  { key: 'clients', table: 'clients', label: 'Clients', icon: 'ti-friends', withCreatedBy: true,
    desc: 'From HubSpot, GoHighLevel, a spreadsheet…', fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'contact_name', label: 'Contact name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status', enumv: ['prospect', 'active', 'inactive'], def: 'active' },
      { key: 'notes', label: 'Notes' },
    ] },
  { key: 'deals', table: 'crm_deals', label: 'Deals', icon: 'ti-target-arrow',
    desc: 'From any CRM pipeline export.', fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'stage', label: 'Stage', enumv: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'], def: 'Lead' },
      { key: 'expected_close', label: 'Expected close', type: 'date' },
      { key: 'notes', label: 'Notes' },
    ] },
];

const SYN: Record<string, string[]> = {
  name: ['name', 'title', 'project', 'project name', 'task', 'task name', 'client', 'company', 'account', 'full name'],
  title: ['title', 'name', 'deal', 'deal name', 'opportunity'],
  description: ['description', 'desc', 'details', 'summary'],
  status: ['status', 'state'],
  priority: ['priority', 'urgency'],
  stage: ['stage', 'pipeline', 'pipeline stage', 'deal stage', 'status'],
  value: ['value', 'amount', 'deal value', 'price', 'revenue', 'total'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'mobile', 'telephone', 'contact number', 'phone number'],
  contact_name: ['contact', 'contact name', 'primary contact', 'contact person'],
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
  start_date: ['start', 'start date', 'created', 'created date', 'begin'],
  end_date: ['end date', 'due', 'due date', 'deadline', 'finish'],
  due_date: ['due', 'due date', 'deadline', 'end date'],
  expected_close: ['close date', 'expected close', 'close', 'closing date'],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\s-]+/g, ' ').trim();

function guess(field: Field, headers: string[]): number {
  const cands = [field.key, ...(SYN[field.key] || [])].map(norm);
  for (let i = 0; i < headers.length; i++) { if (cands.includes(norm(headers[i]))) return i; }
  for (let i = 0; i < headers.length; i++) { const h = norm(headers[i]); if (cands.some((c) => h.includes(c) || c.includes(h))) return i; }
  return -1;
}

function coerce(field: Field, raw: string): any {
  const v = (raw ?? '').trim();
  if (field.type === 'number') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  if (field.type === 'date') { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  if (field.enumv) { const m = field.enumv.find((e) => e.toLowerCase() === v.toLowerCase()); return m || field.def || field.enumv[0]; }
  if (!v) return field.def ?? null;
  return v;
}

// Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, commas, CRLF).
function parseCSV(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let f = ''; let q = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}

// Stable dedupe key per row: clients by email (else name), deals by title, else name.
function rowKey(entKey: string, o: any): string {
  if (entKey === 'clients') { const e = String(o.email || '').trim().toLowerCase(); return e ? 'e:' + e : 'n:' + String(o.name || '').trim().toLowerCase(); }
  if (entKey === 'deals') return 't:' + String(o.title || '').trim().toLowerCase();
  return 'n:' + String(o.name || '').trim().toLowerCase();
}

export default function ImportPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [entKey, setEntKey] = useState<string>('');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Record<string, number>>({});
  const [dedupe, setDedupe] = useState(true);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; dup: number; req: number; failed: number } | null>(null);
  const [err, setErr] = useState('');

  const entity = ENTITIES.find((e) => e.key === entKey) || null;

  useEffect(() => {
    if (org?.id) sb.from('projects').select('id, name').eq('org_id', org.id).order('name').then(({ data }) => setProjects((data as any) || []));
  }, [org?.id]);

  // Load existing keys for duplicate detection (re-imports stay clean).
  useEffect(() => {
    if (!org?.id || !entity) { setExisting(new Set()); return; }
    let alive = true;
    (async () => {
      const s = new Set<string>();
      if (entity.key === 'clients') { const { data } = await sb.from('clients').select('name, email').eq('org_id', org.id); (data || []).forEach((r: any) => s.add(rowKey('clients', r))); }
      else if (entity.key === 'deals') { const { data } = await sb.from('crm_deals').select('title').eq('org_id', org.id); (data || []).forEach((r: any) => s.add(rowKey('deals', r))); }
      else if (entity.key === 'projects') { const { data } = await sb.from('projects').select('name').eq('org_id', org.id); (data || []).forEach((r: any) => s.add(rowKey('projects', r))); }
      else if (entity.key === 'tasks' && projectId) { const { data } = await sb.from('tasks').select('name').eq('org_id', org.id).eq('project_id', projectId); (data || []).forEach((r: any) => s.add(rowKey('tasks', r))); }
      if (alive) setExisting(s);
    })();
    return () => { alive = false; };
  }, [org?.id, entKey, projectId]);

  const onFile = async (file: File) => {
    setErr(''); setResult(null);
    const text = await file.text();
    const grid = parseCSV(text);
    if (grid.length < 2) { setErr('That file has no data rows.'); return; }
    const hs = grid[0].map((h) => h.trim());
    setHeaders(hs); setRows(grid.slice(1)); setFileName(file.name);
    if (entity) { const m: Record<string, number> = {}; entity.fields.forEach((f) => { m[f.key] = guess(f, hs); }); setMap(m); }
  };

  const reqField = entity?.fields.find((f) => f.required);

  const prepared = useMemo(() => {
    if (!entity || !org || rows.length === 0) return { rows: [] as any[], req: 0, dup: 0 };
    let req = 0, dup = 0; const seen = new Set<string>(); const out: any[] = [];
    for (const r of rows) {
      const o: any = { org_id: org.id };
      entity.fields.forEach((f) => { const ci = map[f.key]; o[f.key] = coerce(f, ci != null && ci >= 0 ? r[ci] : ''); });
      if (entity.withCreatedBy && me) o.created_by = me.id;
      if (entity.needsProject) o.project_id = projectId;
      if (!reqField || !o[reqField.key] || !String(o[reqField.key]).trim()) { req++; continue; }
      if (dedupe) { const k = rowKey(entity.key, o); if (existing.has(k) || seen.has(k)) { dup++; continue; } seen.add(k); }
      out.push(o);
    }
    return { rows: out, req, dup };
  }, [entity, org, rows, map, projectId, me, reqField, dedupe, existing]);

  const canImport = !!entity && prepared.rows.length > 0 && (!entity.needsProject || !!projectId) && (map[reqField?.key || ''] ?? -1) >= 0;

  const runImport = async () => {
    if (!entity || !canImport) return;
    setBusy(true); setErr(''); setResult(null);
    const list = prepared.rows; let imported = 0, failed = 0;
    try {
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const { error } = await sb.from(entity.table).insert(chunk);
        if (!error) imported += chunk.length;
        else { for (const row of chunk) { const { error: e2 } = await sb.from(entity.table).insert(row); if (e2) failed++; else imported++; } }
      }
      setResult({ imported, dup: prepared.dup, req: prepared.req, failed });
    } catch (e: any) { setErr(e.message || 'Import failed.'); } finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    if (!entity) return;
    const hs = entity.fields.map((f) => f.label);
    const ex = entity.fields.map((f) => f.enumv ? (f.def || f.enumv[0]) : f.type === 'date' ? '2026-07-01' : f.type === 'number' ? '1000' : `Example ${f.label.toLowerCase()}`);
    const esc = (v: string) => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const csv = hs.join(',') + '\n' + ex.map(esc).join(',') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${entity.key}-template.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const reset = () => { setHeaders([]); setRows([]); setFileName(''); setMap({}); setResult(null); setErr(''); };
  const destHref: Record<string, string> = { projects: '/projects', tasks: '/tasks', clients: '/clients', deals: '/crm' };

  return (
    <Layout flat title="Import data">
      <PageHeader title="Import data" subtitle="Bring your projects, tasks, clients and deals over from any tool — export a CSV, map the columns, done." />

      {/* Step 1 — entity */}
      <div className="card p-5 mb-4">
        <p className="text-sm font-semibold text-content mb-3"><span className="text-accentstrong">1.</span> What are you importing?</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ENTITIES.map((e) => {
            const on = entKey === e.key;
            return (
              <button key={e.key} onClick={() => { setEntKey(e.key); reset(); }}
                className={`text-left rounded-xl border p-3 transition ${on ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-surface2'}`}>
                <span className={`w-9 h-9 rounded-lg grid place-items-center mb-2 ${on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted'}`}><Icon name={e.icon} className="text-lg" /></span>
                <p className="text-sm font-medium text-content">{e.label}</p>
                <p className="text-2xs text-muted mt-0.5 leading-snug">{e.desc}</p>
              </button>
            );
          })}
        </div>
        {entity && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button onClick={downloadTemplate} className="text-2xs text-accentstrong font-medium inline-flex items-center gap-1"><Icon name="ti-download" className="text-xs" />Download a sample {entity.label} CSV</button>
            {entity.needsProject && (
              <div className="flex items-center gap-2">
                <label className="label">Into project</label>
                <select className="input h-8" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Select a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2 — upload */}
      {entity && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-semibold text-content mb-3"><span className="text-accentstrong">2.</span> Upload your CSV</p>
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line hover:border-accent/50 cursor-pointer py-8 transition">
            <Icon name="ti-cloud-upload" className="text-2xl text-muted2" />
            <span className="text-sm text-content">{fileName || 'Choose a .csv file'}</span>
            <span className="text-2xs text-muted">{fileName ? `${rows.length} rows · ${headers.length} columns` : 'Exported from ClickUp, monday, HubSpot, Excel, anything'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
        </div>
      )}

      {/* Step 3 — map */}
      {entity && headers.length > 0 && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-semibold text-content mb-1"><span className="text-accentstrong">3.</span> Map columns</p>
          <p className="text-2xs text-muted mb-4">We auto-matched what we could. Adjust anything that&apos;s off. Unmapped fields are skipped.</p>
          <div className="space-y-2.5 max-w-xl">
            {entity.fields.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <span className="text-sm text-content">{f.label}</span>
                  {f.required && <span className="pill pill-gray ml-1.5 text-2xs">required</span>}
                </div>
                <select className="input flex-1" value={map[f.key] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f.key]: parseInt(e.target.value, 10) }))}>
                  <option value={-1}>— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4 — preview + import */}
      {entity && headers.length > 0 && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-semibold text-content mb-3"><span className="text-accentstrong">4.</span> Preview &amp; import</p>
          <label className="flex items-center gap-2 text-sm text-content cursor-pointer mb-3 w-fit">
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="accent-accent w-4 h-4" />
            Skip duplicates already in this workspace{prepared.dup > 0 ? ` (${prepared.dup} found)` : ''}
          </label>
          {prepared.rows.length === 0 ? (
            <p className="text-sm text-muted">Nothing to import — map the required field ({reqField?.label}){dedupe ? ', or everything matched an existing record' : ''}.</p>
          ) : (
            <>
              <p className="text-2xs text-muted mb-3">{prepared.rows.length} ready{prepared.dup ? ` · ${prepared.dup} duplicate${prepared.dup > 1 ? 's' : ''} skipped` : ''}{prepared.req ? ` · ${prepared.req} missing ${reqField?.label}` : ''}. First few:</p>
              <div className="space-y-2 mb-4">
                {prepared.rows.slice(0, 4).map((r, i) => (
                  <div key={i} className="rounded-lg bg-surface2 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                    {entity.fields.filter((f) => (map[f.key] ?? -1) >= 0).map((f) => (
                      <span key={f.key} className="text-2xs text-muted"><span className="text-muted2">{f.label}:</span> <span className="text-content">{String(r[f.key] ?? '—') || '—'}</span></span>
                    ))}
                  </div>
                ))}
              </div>
              {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
              {result ? (
                <div className="rounded-lg bg-accent/10 border border-accent/20 px-4 py-3 flex items-center gap-3">
                  <Icon name="ti-circle-check" className="text-lg text-accentstrong" />
                  <div className="text-sm text-content">
                    Imported <b>{result.imported}</b> {entity.label.toLowerCase()}{result.dup ? ` · ${result.dup} duplicates skipped` : ''}{result.req ? ` · ${result.req} incomplete` : ''}{result.failed ? ` · ${result.failed} failed` : ''}.
                    <Link href={destHref[entity.key] || '/'} className="text-accentstrong font-medium ml-1.5">View →</Link>
                  </div>
                </div>
              ) : (
                <button onClick={runImport} disabled={!canImport || busy} className={`btn btn-primary ${!canImport ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {busy ? <><Icon name="ti-loader-2" className="animate-spin" />Importing…</> : <>Import {prepared.rows.length} {entity.label.toLowerCase()}</>}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
