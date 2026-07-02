import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listForms, createForm, updateForm, deleteForm, listFormSubmissions,
  FormDef, FormField, FormSubmissionRow,
} from '@/lib/db';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'name', label: 'Name' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];
const STATUS_PILL: Record<string, string> = { draft: 'pill-amber', published: 'pill-green', archived: 'pill-gray' };
const STATUS_HEX: Record<string, string> = { draft: '#d97706', published: '#16a34a', archived: '#6b7280' };

const COLS: ColDef[] = [
  { id: 'name', label: 'Form', locked: true },
  { id: 'status', label: 'Status' },
  { id: 'fields', label: 'Fields' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'link', label: 'Public link' },
  { id: 'created', label: 'Created' },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'form';
const randId = () => Math.random().toString(36).slice(2, 8);
const keyFromLabel = (label: string, existing: string[]) => {
  const base = (slugify(label).replace(/-/g, '_')) || 'field';
  let k = base, i = 1; while (existing.includes(k)) k = base + '_' + (++i); return k;
};

type Draft = { id?: string; name: string; slug: string; status: string; fields: FormField[]; settings: Record<string, any> };
const emptyDraft = (): Draft => ({
  name: '', slug: '', status: 'draft',
  fields: [
    { key: 'full_name', label: 'Name', type: 'name', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
  ],
  settings: { submit_label: 'Submit', success_message: 'Thanks — we’ll be in touch shortly.' },
});

export default function FormsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'forms');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [forms, setForms] = useState<FormDef[] | null>(null);
  const prefs = useListPrefs('snrpmo.forms.cols', COLS, { entity: 'forms', orgId: org?.id, canManage: isAdmin });
  const q = prefs.query;
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; initial: string } | null>(null);
  const [subs, setSubs] = useState<{ form: FormDef; rows: FormSubmissionRow[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = () => { if (!org) return; listForms(org.id, 'form').then(setForms).catch((e) => { setErr(e.message); setForms([]); }); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const shown = useMemo(() => (forms || []).filter((f) => !q.trim() || f.name.toLowerCase().includes(q.toLowerCase())), [forms, q]);
  const rs = useRowSelection(shown);
  const publicUrl = (f: FormDef | Draft) => `${origin}/f/${f.slug}`;
  const embedCode = (f: FormDef | Draft) => `<iframe src="${origin}/f/${f.slug}" width="100%" height="600" frameborder="0" style="border:0;max-width:560px"></iframe>`;
  const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* noop */ } };

  const openSubs = (f: FormDef) => { setSubs({ form: f, rows: null }); listFormSubmissions(f.id).then((r) => setSubs({ form: f, rows: r })).catch(() => setSubs({ form: f, rows: [] })); };

  const cell = (id: string, f: FormDef) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{f.name}</span>;
      case 'status': return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium capitalize" style={{ backgroundColor: STATUS_HEX[f.status] + '1f', color: STATUS_HEX[f.status], boxShadow: `inset 0 0 0 1px ${STATUS_HEX[f.status]}33` }}>{f.status}</span>;
      case 'fields': return <span className="tabular-nums text-muted">{(f.fields || []).length}</span>;
      case 'submissions': return <button className="text-accentstrong hover:underline tabular-nums" onClick={(e) => { e.stopPropagation(); openSubs(f); }}>{f.submit_count || 0}</button>;
      case 'link': return f.status === 'published'
        ? <button className="inline-flex items-center gap-1 text-2xs text-muted hover:text-content" onClick={(e) => { e.stopPropagation(); copy(publicUrl(f)); }}><Icon name="ti-link" className="text-sm" />Copy</button>
        : <span className="text-2xs text-muted2">—</span>;
      case 'created': return <span className="text-2xs text-muted2">{new Date(f.created_at).toLocaleDateString()}</span>;
      default: return '—';
    }
  };

  const setD = (patch: Partial<Draft>) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });
  const setS = (patch: Record<string, any>) => setEditor((e) => e && { ...e, draft: { ...e.draft, settings: { ...e.draft.settings, ...patch } } });
  const addField = () => setEditor((e) => { if (!e) return e; const keys = e.draft.fields.map((x) => x.key); return { ...e, draft: { ...e.draft, fields: [...e.draft.fields, { key: keyFromLabel('Field', keys), label: 'New field', type: 'text', required: false }] } }; });
  const updField = (i: number, patch: Partial<FormField>) => setEditor((e) => { if (!e) return e; const fields = e.draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)); return { ...e, draft: { ...e.draft, fields } }; });
  const removeField = (i: number) => setEditor((e) => e && { ...e, draft: { ...e.draft, fields: e.draft.fields.filter((_, idx) => idx !== i) } });
  const moveField = (i: number, dir: number) => setEditor((e) => { if (!e) return e; const fields = [...e.draft.fields]; const j = i + dir; if (j < 0 || j >= fields.length) return e; [fields[i], fields[j]] = [fields[j], fields[i]]; return { ...e, draft: { ...e.draft, fields } }; });

  const openEditor = (f?: FormDef) => {
    if (f) setEditor({ mode: 'edit', draft: { id: f.id, name: f.name, slug: f.slug, status: f.status, fields: f.fields || [], settings: f.settings || {} }, initial: JSON.stringify(f) });
    else { const d = emptyDraft(); setEditor({ mode: 'add', draft: d, initial: JSON.stringify(d) }); }
  };

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const seen: string[] = [];
    const fields = d.fields.map((f) => { let k = f.key || keyFromLabel(f.label || 'field', seen); if (seen.includes(k)) k = keyFromLabel(f.label || 'field', seen); seen.push(k); return { ...f, key: k, label: (f.label || k) }; });
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateForm(d.id, { name: d.name.trim(), status: d.status as any, fields, settings: d.settings });
      } else {
        const slug = `${slugify(d.name)}-${randId()}`;
        await createForm({ org_id: org.id, created_by: me.id, name: d.name.trim(), slug, status: d.status, fields, settings: d.settings });
      }
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} form${rs.count > 1 ? 's' : ''}? Their submissions are deleted too.`)) return;
    setBusy(true); setErr('');
    try { for (const f of rs.selected) await deleteForm(f.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportValue = (id: string, f: FormDef) =>
    id === 'name' ? f.name : id === 'status' ? f.status : id === 'fields' ? String((f.fields || []).length)
    : id === 'submissions' ? String(f.submit_count || 0) : id === 'link' ? (f.status === 'published' ? publicUrl(f) : '') : id === 'created' ? f.created_at : '';

  if (!enabled) return (
    <Layout flat title="Forms"><EmptyState icon="ti-forms" title="Forms not in your plan" text="Upgrade your plan to build lead-capture forms." /></Layout>
  );

  const GROUPS: GroupMeta[] = ['draft', 'published', 'archived'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), pill: STATUS_PILL[s] }));
  const kpis = { total: (forms || []).length, published: (forms || []).filter((f) => f.status === 'published').length, subs: (forms || []).reduce((a, f) => a + (f.submit_count || 0), 0) };
  const draft = editor?.draft;

  return (
    <Layout flat title="Forms">
      <PageHeader title="Forms" subtitle="Build hosted & embeddable forms that capture leads straight into your CRM" icon="ti-forms" help="forms"
        action={<button className="btn btn-primary" onClick={() => openEditor()}><Icon name="ti-plus" />New form</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Forms" value={String(kpis.total)} icon="ti-forms" />
        <StatCard label="Published" value={String(kpis.published)} icon="ti-rocket" />
        <StatCard label="Submissions" value={String(kpis.subs)} icon="ti-inbox" />
      </div>

      <ListView
        rows={forms === null ? null : shown}
        rowKey={(f) => f.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search forms…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(f) => f.status}
        groups={GROUPS}
        onRowClick={(f) => openEditor(f)}
        exportName="forms"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-forms"
        emptyText="No forms yet — create one to start capturing leads."
      />

      {editor && draft && (
        <Modal open onClose={() => setEditor(null)} dirty={JSON.stringify(editor.draft) !== editor.initial} size="lg" icon="ti-forms"
          title={editor.mode === 'edit' ? 'Edit form' : 'New form'} onSubmit={save}
          footer={<><button className="btn" onClick={() => setEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save form'}</button></>}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Form name" required><input className="input" autoFocus value={draft.name} onChange={(e) => setD({ name: e.target.value })} placeholder="Contact us" /></Field>
              <Field label="Status"><Select value={draft.status} onChange={(v) => setD({ status: v })} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} /></Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted2">Fields</span>
                <button className="btn h-7 py-0 text-xs" onClick={addField}><Icon name="ti-plus" className="text-sm" />Add field</button>
              </div>
              <div className="space-y-2">
                {draft.fields.map((f, i) => (
                  <div key={i} className="rounded-lg border border-line p-2 flex flex-wrap items-center gap-2">
                    <input className="input h-8 py-0 flex-1 min-w-[8rem]" value={f.label} onChange={(e) => updField(i, { label: e.target.value })} placeholder="Field label" />
                    <Select width={150} value={f.type} onChange={(v) => updField(i, { type: v })} options={FIELD_TYPES} />
                    {f.type === 'select' && <input className="input h-8 py-0 flex-1 min-w-[10rem]" value={(f.options || []).join(', ')} onChange={(e) => updField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Option 1, Option 2" />}
                    <label className="inline-flex items-center gap-1 text-2xs text-muted"><input type="checkbox" checked={!!f.required} onChange={(e) => updField(i, { required: e.target.checked })} />Required</label>
                    <button className="text-muted2 hover:text-content" onClick={() => moveField(i, -1)} title="Move up"><Icon name="ti-chevron-up" className="text-sm" /></button>
                    <button className="text-muted2 hover:text-content" onClick={() => moveField(i, 1)} title="Move down"><Icon name="ti-chevron-down" className="text-sm" /></button>
                    <button className="text-muted2 hover:text-rose-500" onClick={() => removeField(i)} title="Remove"><Icon name="ti-trash" className="text-sm" /></button>
                  </div>
                ))}
                {draft.fields.length === 0 && <p className="text-2xs text-muted2">No fields yet — add at least one.</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Submit button label"><input className="input" value={draft.settings.submit_label || ''} onChange={(e) => setS({ submit_label: e.target.value })} placeholder="Submit" /></Field>
              <Field label="New-lead status"><input className="input" value={draft.settings.lead_status || ''} onChange={(e) => setS({ lead_status: e.target.value })} placeholder="new" /></Field>
              <Field label="Success message" className="sm:col-span-2"><input className="input" value={draft.settings.success_message || ''} onChange={(e) => setS({ success_message: e.target.value })} placeholder="Thanks — we’ll be in touch." /></Field>
              <Field label="Redirect URL (optional)" className="sm:col-span-2"><input className="input" value={draft.settings.redirect_url || ''} onChange={(e) => setS({ redirect_url: e.target.value })} placeholder="https://yoursite.com/thank-you" /></Field>
            </div>

            {editor.mode === 'edit' && draft.id && (
              <div className="rounded-lg border border-line p-3 space-y-2">
                <span className="text-2xs uppercase tracking-wide text-muted2">Share &amp; embed</span>
                {draft.status === 'published' ? (
                  <>
                    <div className="flex items-center gap-2"><input readOnly className="input h-8 py-0 flex-1 text-2xs" value={publicUrl(draft)} onFocus={(e) => e.currentTarget.select()} /><button className="btn h-8 py-0" onClick={() => copy(publicUrl(draft))}>Copy link</button></div>
                    <div className="flex items-start gap-2"><textarea readOnly className="input flex-1 text-2xs min-h-[58px] font-mono" value={embedCode(draft)} onFocus={(e) => e.currentTarget.select()} /><button className="btn h-8 py-0" onClick={() => copy(embedCode(draft))}>Copy embed</button></div>
                  </>
                ) : <p className="text-2xs text-muted2">Publish this form to get its public link and embed code.</p>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {subs && (
        <Modal open onClose={() => setSubs(null)} size="lg" icon="ti-inbox" title={`Submissions — ${subs.form.name}`}
          footer={<button className="btn" onClick={() => setSubs(null)}>Close</button>}>
          {subs.rows === null ? <p className="text-sm text-muted">Loading…</p> : subs.rows.length === 0 ? <EmptyState icon="ti-inbox" text="No submissions yet." /> : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {subs.rows.map((s) => (
                <div key={s.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between mb-1"><span className="text-2xs text-muted2">{new Date(s.created_at).toLocaleString()}</span>{s.lead_id && <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#16a34a1f', color: '#16a34a' }}>Lead created</span>}</div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {Object.entries(s.data || {}).map(([k, v]) => (<div key={k} className="text-sm"><span className="text-muted2">{k}:</span> <span className="text-content">{String(v)}</span></div>))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}
