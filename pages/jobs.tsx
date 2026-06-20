import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PersonTag, PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listJobs, createJob, updateJob, deleteJob, JobPosting } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta } from '@/components/DataList';

const fmtType = (t: string) => t.replace(/_/g, ' ');
const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  open: 'pill-green',
  on_hold: 'pill-amber',
  closed: 'pill-red',
};
const STATUSES = ['draft', 'open', 'on_hold', 'closed'];
const COLS: ColDef[] = [
  { id: 'title', label: 'Title', locked: true },
  { id: 'department', label: 'Department' },
  { id: 'location', label: 'Location' },
  { id: 'type', label: 'Type' },
  { id: 'openings', label: 'Openings' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
];
const JOB_FILTERS: FilterDef[] = [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: fmtType(s) }))] }];
const JOB_GROUP_ORDER = ['open', 'on_hold', 'draft', 'closed'];
const GROUPS: GroupMeta[] = JOB_GROUP_ORDER.map((st) => ({ value: st, label: fmtType(st), pill: STATUS_PILL[st] || 'pill-gray' }));
const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'temporary'];

type Draft = Partial<JobPosting>;
const emptyDraft = (): Draft => ({ title: '', department: '', location: '', employment_type: 'full_time', openings: 1, status: 'draft', description: '', owner_id: undefined });

export default function JobsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'hr');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.jobs.cols', COLS, { entity: 'jobs', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [groupBy, setGroupBy] = useState<'status' | 'none'>('status');

  const load = () => {
    if (!org) return;
    listJobs(org.id).then(setJobs).catch((e) => { setErr(e.message); setJobs([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() => (jobs || []).filter((j) =>
    (statusF === 'all' || j.status === statusF) &&
    (!q.trim() || `${j.title} ${j.department || ''} ${j.location || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [jobs, q, statusF]);

  const rs = useRowSelection(shown);
  const cell = (id: string, j: JobPosting) => {
    switch (id) {
      case 'title': return <span className="font-medium text-content">{j.title}</span>;
      case 'department': return j.department || '—';
      case 'location': return j.location || '—';
      case 'type': return <span className="pill pill-gray">{fmtType(j.employment_type || '')}</span>;
      case 'openings': return j.openings ?? '—';
      case 'owner': return <PersonTag name={name(j.owner_id)} />;
      case 'status': return <span className={`pill ${STATUS_PILL[j.status] || 'pill-gray'}`}>{fmtType(j.status)}</span>;
      default: return '—';
    }
  };
  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Department', 'Location', 'Type', 'Openings', 'Owner', 'Status'];
    const rows = rs.selected.map((j) => [j.title, j.department, j.location, fmtType(j.employment_type || ''), j.openings, name(j.owner_id), fmtType(j.status)]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'jobs-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} job${rs.count > 1 ? 's' : ''}?`)) return;
    setBusy(true); setErr('');
    try { for (const j of rs.selected) await deleteJob(j.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const kpis = useMemo(() => {
    const all = jobs || [];
    const open = all.filter((j) => j.status === 'open');
    return {
      total: all.length,
      open: open.length,
      openings: open.reduce((t, j) => t + (j.openings || 0), 0),
      closed: all.filter((j) => j.status === 'closed').length,
    };
  }, [jobs]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.title?.trim() || busy) return;
    setBusy(true);
    setErr('');
    const d = editor.draft;
    const payload = {
      title: d.title!.trim(),
      department: d.department || null,
      location: d.location || null,
      employment_type: d.employment_type || 'full_time',
      openings: Number(d.openings) || 1,
      status: d.status || 'draft',
      description: d.description || null,
      owner_id: d.owner_id || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateJob(d.id, payload);
      } else {
        await createJob({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };


  if (!enabled) return (
    <Layout flat title="Jobs">
      <EmptyState icon="ti-briefcase-off" title="HR not in your plan" text="Upgrade to manage job postings." />
    </Layout>
  );

  return (
    <Layout flat title="Jobs">
      <PageHeader help="hr" title="Job Postings" subtitle="Manage open roles, hiring status and headcount" icon="ti-briefcase"
        action={isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add job
          </button>
        )} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total jobs" value={String(kpis.total)} icon="ti-briefcase" />
        <StatCard label="Open" value={String(kpis.open)} icon="ti-circle-check" />
        <StatCard label="Total openings" value={String(kpis.openings)} hint="Open roles only" icon="ti-users" />
        <StatCard label="Closed" value={String(kpis.closed)} icon="ti-circle-x" />
      </div>

      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0"><ListToolbar prefs={prefs} cols={COLS} filters={JOB_FILTERS} placeholder="Search jobs…" /></div>
        <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
          <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
          <button onClick={() => setGroupBy('status')} className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'status' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>Status</button>
          <button onClick={() => setGroupBy('none')} className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}>None</button>
        </div>
      </div>

      <BulkBar count={rs.count} onClear={rs.clear}>
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      {jobs === null ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : shown.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon="ti-briefcase" text="No job postings yet." /></div>
      ) : (
        <DataList rows={shown} rowKey={(j) => j.id} cols={COLS} prefs={prefs} cell={cell} onRowClick={(j) => setEditor({ mode: 'edit', draft: j })} selection={rs} groupBy={groupBy} groupOf={(j) => j.status} groups={GROUPS} />
      )}

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-briefcase"
          title={editor.mode === 'edit' ? 'Edit job posting' : 'Add job posting'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && isAdmin && (
                <ConfirmDelete entityType="job" id={editor.draft.id!} name={editor.draft.title}
                  className="btn btn-danger mr-auto" onDeleted={() => { setEditor(null); load(); }} />
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !editor.draft.title?.trim()} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title" required>
              <input className="input" autoFocus value={editor.draft.title || ''} onChange={(e) => setD({ title: e.target.value })} placeholder="e.g. Senior Engineer" />
            </Field>
            <Field label="Department">
              <input className="input" value={editor.draft.department || ''} onChange={(e) => setD({ department: e.target.value })} placeholder="Engineering" />
            </Field>
            <Field label="Location">
              <input className="input" value={editor.draft.location || ''} onChange={(e) => setD({ location: e.target.value })} placeholder="Remote / City" />
            </Field>
            <Field label="Employment type">
              <Select value={editor.draft.employment_type || 'full_time'} onChange={(v) => setD({ employment_type: v as JobPosting['employment_type'] })} options={[...EMP_TYPES.map((t) => ({ value: t, label: fmtType(t) }))]} />
            </Field>
            <Field label="Openings">
              <input className="input" type="number" min={1} value={editor.draft.openings ?? 1} onChange={(e) => setD({ openings: Number(e.target.value) })} />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'draft'} onChange={(v) => setD({ status: v as JobPosting['status'] })} options={[...STATUSES.map((s) => ({ value: s, label: fmtType(s) }))]} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea className="input min-h-[90px]" value={editor.draft.description || ''} onChange={(e) => setD({ description: e.target.value })} placeholder="Role summary, responsibilities, requirements…" />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
