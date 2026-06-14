import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listJobs, createJob, updateJob, deleteJob, JobPosting } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  open: 'pill-green',
  on_hold: 'pill-amber',
  closed: 'pill-red',
};
const STATUSES = ['draft', 'open', 'on_hold', 'closed'];
const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'temporary'];
const fmtType = (t: string) => t.replace(/_/g, ' ');

type Draft = Partial<JobPosting>;
const emptyDraft = (): Draft => ({ title: '', department: '', location: '', employment_type: 'full_time', openings: 1, status: 'draft', description: '', owner_id: undefined });

export default function JobsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'hr');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  const remove = async (j: JobPosting) => {
    if (!confirm(`Delete "${j.title}"?`)) return;
    setBusy(true);
    try { await deleteJob(j.id); setEditor(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Jobs">
      <EmptyState icon="ti-briefcase-off" title="HR not in your plan" text="Upgrade to manage job postings." />
    </Layout>
  );

  return (
    <Layout flat title="Jobs">
      <PageHeader title="Job Postings" subtitle="Manage open roles, hiring status and headcount" icon="ti-briefcase"
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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="input h-9 w-56" placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-9 w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{fmtType(s)}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {jobs === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-briefcase" text="No job postings yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Openings</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => (
                  <tr key={j.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => setEditor({ mode: 'edit', draft: j })}>
                    <td className="px-4 py-3 font-medium text-content">{j.title}</td>
                    <td className="px-4 py-3 text-muted">{j.department || '—'}</td>
                    <td className="px-4 py-3 text-muted">{j.location || '—'}</td>
                    <td className="px-4 py-3"><span className="pill pill-gray">{fmtType(j.employment_type || '')}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{j.openings ?? '—'}</td>
                    <td className="px-4 py-3 text-2xs text-muted">{name(j.owner_id)}</td>
                    <td className="px-4 py-3"><span className={`pill ${STATUS_PILL[j.status] || 'pill-gray'}`}>{fmtType(j.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-briefcase"
          title={editor.mode === 'edit' ? 'Edit job posting' : 'Add job posting'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && isAdmin && (
                <button className="btn btn-danger mr-auto" disabled={busy} onClick={() => editor.draft.id && remove(editor.draft as JobPosting)}>
                  <Icon name="ti-trash" />Delete
                </button>
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
              <select className="input" value={editor.draft.employment_type || 'full_time'} onChange={(e) => setD({ employment_type: e.target.value as JobPosting['employment_type'] })}>
                {EMP_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
            </Field>
            <Field label="Openings">
              <input className="input" type="number" min={1} value={editor.draft.openings ?? 1} onChange={(e) => setD({ openings: Number(e.target.value) })} />
            </Field>
            <Field label="Owner">
              <select className="input" value={editor.draft.owner_id || ''} onChange={(e) => setD({ owner_id: e.target.value || undefined })}>
                <option value="">—</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={editor.draft.status || 'draft'} onChange={(e) => setD({ status: e.target.value as JobPosting['status'] })}>
                {STATUSES.map((s) => <option key={s} value={s}>{fmtType(s)}</option>)}
              </select>
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
