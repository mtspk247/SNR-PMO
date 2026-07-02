import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listForms, createForm, updateForm, deleteForm, listFormSubmissions, surveyResults,
  FormDef, FormField, FormJump, FormSubmissionRow, SurveyResults,
} from '@/lib/db';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const FIELD_TYPES = [
  { value: 'nps', label: 'NPS (0–10)' },
  { value: 'csat', label: 'CSAT (1–5)' },
  { value: 'rating', label: 'Star rating (1–5)' },
  { value: 'select', label: 'Single choice' },
  { value: 'multiselect', label: 'Multiple choice' },
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'email', label: 'Email' },
];
const JUMP_OPS = [
  { value: 'eq', label: 'is' },
  { value: 'ne', label: 'is not' },
  { value: 'lte', label: '≤' },
  { value: 'gte', label: '≥' },
  { value: 'includes', label: 'includes' },
];
const STATUS_PILL: Record<string, string> = { draft: 'pill-amber', published: 'pill-green', archived: 'pill-gray' };
const STATUS_HEX: Record<string, string> = { draft: '#d97706', published: '#16a34a', archived: '#6b7280' };

const COLS: ColDef[] = [
  { id: 'name', label: 'Survey', locked: true },
  { id: 'status', label: 'Status' },
  { id: 'questions', label: 'Questions' },
  { id: 'responses', label: 'Responses' },
  { id: 'link', label: 'Public link' },
  { id: 'created', label: 'Created' },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'survey';
const randId = () => Math.random().toString(36).slice(2, 8);
const keyFromLabel = (label: string, existing: string[]) => {
  const base = (slugify(label).replace(/-/g, '_')) || 'question';
  let k = base, i = 1; while (existing.includes(k)) k = base + '_' + (++i); return k;
};

type Draft = { id?: string; name: string; slug: string; status: string; fields: FormField[]; settings: Record<string, any> };
const emptyDraft = (): Draft => ({
  name: '', slug: '', status: 'draft',
  fields: [
    { key: 'q_nps', label: 'How likely are you to recommend us?', type: 'nps', required: true, jumps: [{ op: 'gte', value: '9', to: 'q_praise' }] },
    { key: 'q_improve', label: 'What could we do better?', type: 'textarea', next: '_end' },
    { key: 'q_praise', label: 'What did you love most?', type: 'textarea' },
  ],
  settings: { submit_label: 'Finish', success_message: 'Thanks for your feedback!' },
});

export default function SurveysPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'surveys');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [rows, setRows] = useState<FormDef[] | null>(null);
  const prefs = useListPrefs('snrpmo.surveys.cols', COLS, { entity: 'surveys', orgId: org?.id, canManage: isAdmin });
  const q = prefs.query;
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; initial: string } | null>(null);
  const [logicFor, setLogicFor] = useState<number | null>(null);
  const [results, setResults] = useState<{ form: FormDef; roll: SurveyResults | null; subs: FormSubmissionRow[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = () => { if (!org) return; listForms(org.id, 'survey').then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  // Deep link from the Chief of Staff: /surveys?open=<id> opens that survey's editor once.
  useEffect(() => {
    const target = typeof router.query.open === 'string' ? router.query.open : '';
    if (!target || !rows) return;
    const row = rows.find((r) => r.id === target);
    if (row) openEditor(row);
    router.replace('/surveys', undefined, { shallow: true });
    // eslint-disable-next-line
  }, [rows, router.query.open]);

  const shown = useMemo(() => (rows || []).filter((f) => !q.trim() || f.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const rs = useRowSelection(shown);
  const publicUrl = (f: FormDef | Draft) => `${origin}/f/${f.slug}`;
  const embedCode = (f: FormDef | Draft) => `<iframe src="${origin}/f/${f.slug}" width="100%" height="640" frameborder="0" style="border:0;max-width:560px"></iframe>`;
  const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* noop */ } };

  const openResults = (f: FormDef) => {
    setResults({ form: f, roll: null, subs: null });
    surveyResults(f.id).then((roll) => setResults((r) => (r && r.form.id === f.id ? { ...r, roll } : r))).catch(() => setResults((r) => (r && r.form.id === f.id ? { ...r, roll: { form_id: f.id, kind: 'survey', total: 0, questions: [] } } : r)));
    listFormSubmissions(f.id).then((subs) => setResults((r) => (r && r.form.id === f.id ? { ...r, subs } : r))).catch(() => setResults((r) => (r && r.form.id === f.id ? { ...r, subs: [] } : r)));
  };

  const cell = (id: string, f: FormDef) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{f.name}</span>;
      case 'status': return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium capitalize" style={{ backgroundColor: STATUS_HEX[f.status] + '1f', color: STATUS_HEX[f.status], boxShadow: `inset 0 0 0 1px ${STATUS_HEX[f.status]}33` }}>{f.status}</span>;
      case 'questions': return <span className="tabular-nums text-muted">{(f.fields || []).length}</span>;
      case 'responses': return <button className="text-accentstrong hover:underline tabular-nums" onClick={(e) => { e.stopPropagation(); openResults(f); }}>{f.submit_count || 0}</button>;
      case 'link': return f.status === 'published'
        ? <button className="inline-flex items-center gap-1 text-2xs text-muted hover:text-content" onClick={(e) => { e.stopPropagation(); copy(publicUrl(f)); }}><Icon name="ti-link" className="text-sm" />Copy</button>
        : <span className="text-2xs text-muted2">—</span>;
      case 'created': return <span className="text-2xs text-muted2">{new Date(f.created_at).toLocaleDateString()}</span>;
      default: return '—';
    }
  };

  const setD = (patch: Partial<Draft>) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });
  const setS = (patch: Record<string, any>) => setEditor((e) => e && { ...e, draft: { ...e.draft, settings: { ...e.draft.settings, ...patch } } });
  const addField = () => setEditor((e) => { if (!e) return e; const keys = e.draft.fields.map((x) => x.key); return { ...e, draft: { ...e.draft, fields: [...e.draft.fields, { key: keyFromLabel('Question', keys), label: 'New question', type: 'nps', required: false }] } }; });
  const updField = (i: number, patch: Partial<FormField>) => setEditor((e) => { if (!e) return e; const fields = e.draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)); return { ...e, draft: { ...e.draft, fields } }; });
  const removeField = (i: number) => { setLogicFor(null); setEditor((e) => e && { ...e, draft: { ...e.draft, fields: e.draft.fields.filter((_, idx) => idx !== i) } }); };
  const moveField = (i: number, dir: number) => setEditor((e) => { if (!e) return e; const fields = [...e.draft.fields]; const j = i + dir; if (j < 0 || j >= fields.length) return e; [fields[i], fields[j]] = [fields[j], fields[i]]; return { ...e, draft: { ...e.draft, fields } }; });
  const updJump = (i: number, ji: number, patch: Partial<FormJump>) => setEditor((e) => { if (!e) return e; const fields = e.draft.fields.map((f, idx) => idx === i ? { ...f, jumps: (f.jumps || []).map((j, k) => (k === ji ? { ...j, ...patch } : j)) } : f); return { ...e, draft: { ...e.draft, fields } }; });
  const addJump = (i: number) => setEditor((e) => { if (!e) return e; const fields = e.draft.fields.map((f, idx) => idx === i ? { ...f, jumps: [...(f.jumps || []), { op: 'gte', value: '', to: '_end' } as FormJump] } : f); return { ...e, draft: { ...e.draft, fields } }; });
  const removeJump = (i: number, ji: number) => setEditor((e) => { if (!e) return e; const fields = e.draft.fields.map((f, idx) => idx === i ? { ...f, jumps: (f.jumps || []).filter((_, k) => k !== ji) } : f); return { ...e, draft: { ...e.draft, fields } }; });

  const openEditor = (f?: FormDef) => {
    setLogicFor(null);
    if (f) setEditor({ mode: 'edit', draft: { id: f.id, name: f.name, slug: f.slug, status: f.status, fields: f.fields || [], settings: f.settings || {} }, initial: JSON.stringify(f) });
    else { const d = emptyDraft(); setEditor({ mode: 'add', draft: d, initial: JSON.stringify(d) }); }
  };

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const seen: string[] = [];
    const fields = d.fields.map((f) => { let k = f.key || keyFromLabel(f.label || 'question', seen); if (seen.includes(k)) k = keyFromLabel(f.label || 'question', seen); seen.push(k); return { ...f, key: k, label: (f.label || k) }; });
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateForm(d.id, { name: d.name.trim(), status: d.status as any, fields, settings: d.settings });
      } else {
        const slug = `${slugify(d.name)}-${randId()}`;
        await createForm({ org_id: org.id, created_by: me.id, name: d.name.trim(), slug, status: d.status, kind: 'survey', fields, settings: d.settings });
      }
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} survey${rs.count > 1 ? 's' : ''}? Their responses are deleted too.`)) return;
    setBusy(true); setErr('');
    try { for (const f of rs.selected) await deleteForm(f.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportValue = (id: string, f: FormDef) =>
    id === 'name' ? f.name : id === 'status' ? f.status : id === 'questions' ? String((f.fields || []).length)
    : id === 'responses' ? String(f.submit_count || 0) : id === 'link' ? (f.status === 'published' ? publicUrl(f) : '') : id === 'created' ? f.created_at : '';

  if (!enabled) return (
    <Layout flat title="Surveys"><EmptyState icon="ti-mood-smile" title="Surveys not in your plan" text="Upgrade your plan to run NPS, CSAT and feedback surveys." /></Layout>
  );

  const GROUPS: GroupMeta[] = ['draft', 'published', 'archived'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), pill: STATUS_PILL[s] }));
  const kpis = { total: (rows || []).length, published: (rows || []).filter((f) => f.status === 'published').length, subs: (rows || []).reduce((a, f) => a + (f.submit_count || 0), 0) };
  const draft = editor?.draft;
  const maxDist = (d: Record<string, number> | null) => Math.max(1, ...Object.values(d || {}));

  return (
    <Layout flat title="Surveys">
      <PageHeader title="Surveys" subtitle="NPS, CSAT and feedback surveys with logic jumps and live result rollups" icon="ti-mood-smile" help="surveys"
        action={<button className="btn btn-primary" onClick={() => openEditor()}><Icon name="ti-plus" />New survey</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Surveys" value={String(kpis.total)} icon="ti-mood-smile" />
        <StatCard label="Published" value={String(kpis.published)} icon="ti-rocket" />
        <StatCard label="Responses" value={String(kpis.subs)} icon="ti-inbox" />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(f) => f.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search surveys…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(f) => f.status}
        groups={GROUPS}
        onRowClick={(f) => openEditor(f)}
        exportName="surveys"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-mood-smile"
        emptyText="No surveys yet — create one to start collecting feedback."
      />

      {editor && draft && (
        <Modal open onClose={() => setEditor(null)} dirty={JSON.stringify(editor.draft) !== editor.initial} size="lg" icon="ti-mood-smile"
          title={editor.mode === 'edit' ? 'Edit survey' : 'New survey'} onSubmit={save}
          footer={<><button className="btn" onClick={() => setEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save survey'}</button></>}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Survey name" required><input className="input" autoFocus value={draft.name} onChange={(e) => setD({ name: e.target.value })} placeholder="Customer NPS — Q3" /></Field>
              <Field label="Status"><Select value={draft.status} onChange={(v) => setD({ status: v })} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} /></Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted2">Questions — asked one at a time</span>
                <button className="btn h-7 py-0 text-xs" onClick={addField}><Icon name="ti-plus" className="text-sm" />Add question</button>
              </div>
              <div className="space-y-2">
                {draft.fields.map((f, i) => {
                  const targets = [
                    ...draft.fields.slice(i + 1).map((t) => ({ value: t.key, label: t.label || t.key })),
                    { value: '_end', label: 'End of survey' },
                  ];
                  return (
                    <div key={i} className="rounded-lg border border-line p-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-2xs text-muted2 tabular-nums w-5 text-right">{i + 1}.</span>
                        <input className="input h-8 py-0 flex-1 min-w-[8rem]" value={f.label} onChange={(e) => updField(i, { label: e.target.value })} placeholder="Question" />
                        <Select width={150} value={f.type} onChange={(v) => updField(i, { type: v })} options={FIELD_TYPES} />
                        {(f.type === 'select' || f.type === 'multiselect') && <input className="input h-8 py-0 flex-1 min-w-[10rem]" value={(f.options || []).join(', ')} onChange={(e) => updField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Option 1, Option 2" />}
                        <label className="inline-flex items-center gap-1 text-2xs text-muted"><input type="checkbox" checked={!!f.required} onChange={(e) => updField(i, { required: e.target.checked })} />Required</label>
                        <button className={`text-2xs ${(f.jumps || []).length || f.next ? 'text-accentstrong' : 'text-muted2'} hover:text-content`} onClick={() => setLogicFor(logicFor === i ? null : i)}>
                          <Icon name="ti-arrow-ramp-right" className="text-sm" /> Logic{(f.jumps || []).length ? ` (${(f.jumps || []).length})` : ''}
                        </button>
                        <button className="text-muted2 hover:text-content" onClick={() => moveField(i, -1)} title="Move up"><Icon name="ti-chevron-up" className="text-sm" /></button>
                        <button className="text-muted2 hover:text-content" onClick={() => moveField(i, 1)} title="Move down"><Icon name="ti-chevron-down" className="text-sm" /></button>
                        <button className="text-muted2 hover:text-rose-500" onClick={() => removeField(i)} title="Remove"><Icon name="ti-trash" className="text-sm" /></button>
                      </div>
                      {logicFor === i && (
                        <div className="rounded-md bg-surface2 p-2 space-y-2">
                          {(f.jumps || []).map((j, ji) => (
                            <div key={ji} className="flex flex-wrap items-center gap-2 text-2xs">
                              <span className="text-muted2">If answer</span>
                              <Select width={100} value={j.op || 'eq'} onChange={(v) => updJump(i, ji, { op: v as FormJump['op'] })} options={JUMP_OPS} />
                              <input className="input h-7 py-0 w-24" value={j.value || ''} onChange={(e) => updJump(i, ji, { value: e.target.value })} placeholder="9" />
                              <span className="text-muted2">go to</span>
                              <Select width={180} value={j.to || '_end'} onChange={(v) => updJump(i, ji, { to: v })} options={targets} />
                              <button className="text-muted2 hover:text-rose-500" onClick={() => removeJump(i, ji)}><Icon name="ti-x" className="text-sm" /></button>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center gap-2 text-2xs">
                            <button className="btn h-7 py-0 text-xs" onClick={() => addJump(i)}><Icon name="ti-plus" className="text-sm" />Add rule</button>
                            <span className="text-muted2">Otherwise go to</span>
                            <Select width={180} value={f.next || ''} onChange={(v) => updField(i, { next: v || undefined })} options={[{ value: '', label: 'Next question' }, ...targets]} />
                            <span className="text-muted2">· Rules only jump forward</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {draft.fields.length === 0 && <p className="text-2xs text-muted2">No questions yet — add at least one.</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Finish button label"><input className="input" value={draft.settings.submit_label || ''} onChange={(e) => setS({ submit_label: e.target.value })} placeholder="Finish" /></Field>
              <Field label="Thank-you message"><input className="input" value={draft.settings.success_message || ''} onChange={(e) => setS({ success_message: e.target.value })} placeholder="Thanks for your feedback!" /></Field>
              <Field label="Redirect URL (optional)" className="sm:col-span-2"><input className="input" value={draft.settings.redirect_url || ''} onChange={(e) => setS({ redirect_url: e.target.value })} placeholder="https://yoursite.com/thanks" /></Field>
              <label className="inline-flex items-center gap-2 text-sm text-muted sm:col-span-2">
                <input type="checkbox" checked={!!draft.settings.create_lead} onChange={(e) => setS({ create_lead: e.target.checked })} />
                Create a CRM lead from each response (add an Email question so it can be matched)
              </label>
            </div>

            {editor.mode === 'edit' && draft.id && (
              <div className="rounded-lg border border-line p-3 space-y-2">
                <span className="text-2xs uppercase tracking-wide text-muted2">Distribute</span>
                {draft.status === 'published' ? (
                  <>
                    <div className="flex items-center gap-2"><input readOnly className="input h-8 py-0 flex-1 text-2xs" value={publicUrl(draft)} onFocus={(e) => e.currentTarget.select()} /><button className="btn h-8 py-0" onClick={() => copy(publicUrl(draft))}>Copy link</button></div>
                    <div className="flex items-start gap-2"><textarea readOnly className="input flex-1 text-2xs min-h-[58px] font-mono" value={embedCode(draft)} onFocus={(e) => e.currentTarget.select()} /><button className="btn h-8 py-0" onClick={() => copy(embedCode(draft))}>Copy embed</button></div>
                    <p className="text-2xs text-muted2">Tip: create a QR code for this link under Marketing → QR Codes to collect responses from print.</p>
                  </>
                ) : <p className="text-2xs text-muted2">Publish this survey to get its public link and embed code.</p>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {results && (
        <Modal open onClose={() => setResults(null)} size="lg" icon="ti-chart-bar" title={`Results — ${results.form.name}`}
          footer={<button className="btn" onClick={() => setResults(null)}>Close</button>}>
          {results.roll === null ? <p className="text-sm text-muted">Loading…</p> : (
            <div className="space-y-4 max-h-[65vh] overflow-auto pr-1">
              <p className="text-sm text-muted">{results.roll.total} response{results.roll.total === 1 ? '' : 's'}</p>
              {(results.roll.questions || []).map((qr) => (
                <div key={qr.key} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-content">{qr.label}</span>
                    <span className="text-2xs text-muted2">{qr.answered} answered</span>
                  </div>
                  {qr.type === 'nps' && qr.nps && (
                    <div className="flex flex-wrap items-center gap-4">
                      <div><div className="text-2xl font-semibold text-content tabular-nums">{qr.nps.score ?? '—'}</div><div className="text-2xs text-muted2">NPS score</div></div>
                      <div className="text-2xs text-muted space-y-0.5">
                        <div><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#16a34a' }} />Promoters (9–10): <span className="tabular-nums">{qr.nps.promoters}</span></div>
                        <div><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#d97706' }} />Passives (7–8): <span className="tabular-nums">{qr.nps.passives}</span></div>
                        <div><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#dc2626' }} />Detractors (0–6): <span className="tabular-nums">{qr.nps.detractors}</span></div>
                      </div>
                    </div>
                  )}
                  {qr.type === 'csat' && (
                    <div className="flex items-center gap-4"><div><div className="text-2xl font-semibold text-content tabular-nums">{qr.csat_pct ?? '—'}%</div><div className="text-2xs text-muted2">satisfied (4–5)</div></div>{qr.avg != null && <div className="text-2xs text-muted">avg {qr.avg}</div>}</div>
                  )}
                  {qr.type === 'rating' && (
                    <div className="flex items-center gap-2"><span className="text-2xl font-semibold text-content tabular-nums">{qr.avg ?? '—'}</span><span className="text-amber-500">★</span><span className="text-2xs text-muted2">average</span></div>
                  )}
                  {qr.dist && ['select', 'multiselect', 'checkbox', 'rating', 'csat', 'nps'].includes(qr.type) && Object.keys(qr.dist).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(qr.dist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([val, cnt]) => (
                        <div key={val} className="flex items-center gap-2 text-2xs">
                          <span className="w-28 truncate text-muted" title={val}>{val}</span>
                          <div className="flex-1 h-2 rounded bg-surface2 overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.round((cnt / maxDist(qr.dist)) * 100)}%`, background: 'var(--accent)' }} /></div>
                          <span className="tabular-nums text-muted2 w-8 text-right">{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {['text', 'textarea', 'email', 'phone', 'name'].includes(qr.type) && (
                    <div className="space-y-1">
                      {(results.subs || []).map((s) => s.data?.[qr.key]).filter((x) => x != null && String(x).trim() !== '').slice(0, 5).map((x, xi) => (
                        <p key={xi} className="text-2xs text-muted border-l-2 border-line pl-2">{String(x)}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(results.roll.questions || []).length === 0 && <EmptyState icon="ti-chart-bar" text="No responses yet — share the survey link to start collecting." />}
              {(results.subs || []).length > 0 && (
                <div>
                  <span className="text-2xs uppercase tracking-wide text-muted2">Recent responses</span>
                  <div className="space-y-2 mt-1.5">
                    {(results.subs || []).slice(0, 20).map((s) => (
                      <div key={s.id} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between mb-1"><span className="text-2xs text-muted2">{new Date(s.created_at).toLocaleString()}</span>{s.lead_id && <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#16a34a1f', color: '#16a34a' }}>Lead created</span>}</div>
                        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                          {Object.entries(s.data || {}).map(([k, val]) => (<div key={k} className="text-sm"><span className="text-muted2">{k}:</span> <span className="text-content">{String(val)}</span></div>))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}
