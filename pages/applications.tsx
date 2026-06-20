import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PersonTag, PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listApplications, createApplication, updateApplication, deleteApplication, listJobs,
  Application, JobPosting,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STAGE_PILL: Record<string, string> = {
  applied: 'pill-gray',
  screening: 'pill-blue',
  interview: 'pill-amber',
  offer: 'pill-violet',
  hired: 'pill-green',
  rejected: 'pill-red',
};
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
type AppStage = typeof STAGES[number];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ACTIVE_STAGES = new Set(['applied', 'screening', 'interview', 'offer']);

const STAGE_ORDER: AppStage[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const GROUPS: GroupMeta[] = STAGE_ORDER.map((st) => ({
  value: st,
  label: cap(st),
  pill: STAGE_PILL[st] || 'pill-gray',
}));

const COLS: ColDef[] = [
  { id: 'candidate', label: 'Candidate', locked: true },
  { id: 'job', label: 'Job' },
  { id: 'email', label: 'Email' },
  { id: 'stage', label: 'Stage' },
  { id: 'rating', label: 'Rating' },
  { id: 'owner', label: 'Owner' },
];

const APP_FILTERS: FilterDef[] = [
  {
    id: 'stage',
    label: 'Stage',
    options: [
      { value: 'all', label: 'All stages' },
      ...STAGES.map((s) => ({ value: s, label: cap(s) })),
    ],
  },
];

type Draft = Partial<Application>;
const emptyDraft = (): Draft => ({
  candidate_name: '', email: '', phone: '', source: '', stage: 'applied',
  rating: undefined, notes: '', job_id: undefined, owner_id: undefined,
});

export default function ApplicationsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'hr');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [apps, setApps] = useState<Application[] | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const prefs = useListPrefs('snrpmo.applications.cols', COLS, { entity: 'applications', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const stageF = prefs.filters.stage || 'all';
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const [detail, setDetail] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listApplications(org.id).then(setApps).catch((e) => { setErr(e.message); setApps([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      listJobs(org.id).then(setJobs).catch(() => {});
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const jobName = (id?: string | null) => jobs.find((j) => j.id === id)?.title || '—';
  const userName = (id?: string | null) => users.find((u) => u.id === id)?.full_name || '—';

  const shown = useMemo(() => (apps || []).filter((a) =>
    (stageF === 'all' || a.stage === stageF) &&
    (!q.trim() || `${a.candidate_name} ${a.email || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [apps, q, stageF]);

  const rs = useRowSelection(shown);

  const kpis = useMemo(() => {
    const all = apps || [];
    return {
      total: all.length,
      active: all.filter((a) => ACTIVE_STAGES.has(a.stage)).length,
      hired: all.filter((a) => a.stage === 'hired').length,
      rejected: all.filter((a) => a.stage === 'rejected').length,
    };
  }, [apps]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.candidate_name?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload = {
      candidate_name: d.candidate_name!.trim(),
      email: d.email || null,
      phone: d.phone || null,
      source: d.source || null,
      stage: d.stage || 'applied',
      rating: d.rating ? Number(d.rating) : null,
      notes: d.notes || null,
      job_id: d.job_id || null,
      owner_id: d.owner_id || null,
    };
    try {
      await createApplication({ org_id: org.id, created_by: me.id, ...payload });
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} application${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try {
      for (const a of rs.selected) await deleteApplication(a.id);
      rs.clear(); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, a: Application) => {
    switch (id) {
      case 'candidate': return <span className="font-medium text-content">{a.candidate_name}</span>;
      case 'job': return jobName(a.job_id);
      case 'email': return a.email || '—';
      case 'stage': return <span className={`pill capitalize ${STAGE_PILL[a.stage] || 'pill-gray'}`}>{a.stage}</span>;
      case 'rating': return a.rating != null ? `${a.rating}/5` : '—';
      case 'owner': return <PersonTag name={userName(a.owner_id)} />;
      default: return '—';
    }
  };

  const exportValue = (id: string, a: Application) => {
    switch (id) {
      case 'candidate': return a.candidate_name;
      case 'job': return jobName(a.job_id);
      case 'email': return a.email || '';
      case 'stage': return a.stage;
      case 'rating': return a.rating != null ? String(a.rating) : '';
      case 'owner': return userName(a.owner_id);
      default: return '';
    }
  };

  // Stage is editable inline — updateApplication is a plain data update with no
  // separate approval gate; canEdit is enforced via isAdmin guard on onEdit.
  const editable: Record<string, EditSpec> = isAdmin ? {
    candidate: { type: 'text' },
    stage: { type: 'select', options: STAGES.map((s) => ({ value: s, label: cap(s) })) },
  } : {};

  const rawValue = (id: string, a: Application) => {
    switch (id) {
      case 'candidate': return a.candidate_name;
      case 'stage': return a.stage;
      default: return '';
    }
  };

  const onInlineEdit = async (a: Application, id: string, value: string) => {
    const field = id === 'candidate' ? 'candidate_name' : id;
    try { await updateApplication(a.id, { [field]: value || null } as any); load(); } catch (e: any) { setErr(e.message); }
  };

  if (!enabled) return (
    <Layout flat title="Applications">
      <EmptyState icon="ti-files-off" title="HR not in your plan" text="Upgrade to track candidate applications." />
    </Layout>
  );

  return (
    <Layout flat title="Applications">
      <PageHeader help="hr"
        title="Applications"
        subtitle="Track candidates across every stage of hiring"
        icon="ti-users"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add application
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-progress" hint="applied · screening · interview · offer" />
        <StatCard label="Hired" value={String(kpis.hired)} icon="ti-circle-check" />
        <StatCard label="Rejected" value={String(kpis.rejected)} icon="ti-circle-x" />
      </div>

      <ListView
        rows={apps === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={APP_FILTERS}
        searchPlaceholder="Search candidates…"
        groupField={{ value: 'stage', label: 'Stage' }}
        groupOf={(a) => a.stage}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(a) => setDetail(a)}
        exportName="applications"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-users"
        emptyText="No applications found."
      />

      {/* Add modal */}
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-users"
          title="Add application"
          onSubmit={() => save()}
          footer={
            <>
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.candidate_name?.trim()}
                onClick={save}
              >{busy ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Candidate name" required>
              <input className="input" autoFocus value={editor.draft.candidate_name || ''} onChange={(e) => setD({ candidate_name: e.target.value })} placeholder="Jane Smith" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editor.draft.email || ''} onChange={(e) => setD({ email: e.target.value })} placeholder="jane@example.com" />
            </Field>
            <Field label="Phone">
              <input className="input" value={editor.draft.phone || ''} onChange={(e) => setD({ phone: e.target.value })} placeholder="+1 555 0100" />
            </Field>
            <Field label="Source">
              <input className="input" value={editor.draft.source || ''} onChange={(e) => setD({ source: e.target.value })} placeholder="LinkedIn, referral…" />
            </Field>
            <Field label="Job">
              <Select value={editor.draft.job_id || ''} onChange={(v) => setD({ job_id: v || undefined })} search placeholder="No job" options={[{ value: '', label: 'No job' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]} />
            </Field>
            <Field label="Stage">
              <Select value={editor.draft.stage || 'applied'} onChange={(v) => setD({ stage: v as Application['stage'] })} options={STAGES.map((s) => ({ value: s, label: cap(s) }))} />
            </Field>
            <Field label="Rating (1–5)">
              <input className="input" type="number" min={1} max={5} value={editor.draft.rating ?? ''} onChange={(e) => setD({ rating: e.target.value ? Number(e.target.value) : undefined })} placeholder="—" />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} search placeholder="Unassigned" options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className="input h-20 resize-none" value={editor.draft.notes || ''} onChange={(e) => setD({ notes: e.target.value })} placeholder="Any notes about this candidate…" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <DetailModal
          app={detail}
          jobs={jobs}
          users={users}
          me={me?.id}
          canEdit={isAdmin || detail.owner_id === me?.id}
          orgId={org?.id}
          onClose={() => setDetail(null)}
          onSaved={(updated) => { setDetail(updated); load(); }}
          onDeleted={() => { setDetail(null); load(); }}
          jobName={jobName}
          userName={userName}
        />
      )}
    </Layout>
  );
}

function DetailModal({
  app, jobs, users, me, canEdit, orgId, onClose, onSaved, onDeleted, jobName, userName,
}: {
  app: Application;
  jobs: JobPosting[];
  users: OrgUser[];
  me?: string;
  canEdit: boolean;
  orgId?: string;
  onClose: () => void;
  onSaved: (updated: Application) => void;
  onDeleted: () => void;
  jobName: (id?: string | null) => string;
  userName: (id?: string | null) => string;
}) {
  const [draft, setDraft] = useState<Partial<Application>>({ ...app });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setD = (patch: Partial<Application>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.candidate_name?.trim() || busy) return;
    setBusy(true); setErr('');
    const payload = {
      candidate_name: draft.candidate_name!.trim(),
      email: draft.email || null,
      phone: draft.phone || null,
      source: draft.source || null,
      stage: draft.stage || 'applied',
      rating: draft.rating ? Number(draft.rating) : null,
      notes: draft.notes || null,
      job_id: draft.job_id || null,
      owner_id: draft.owner_id || null,
    };
    try {
      await updateApplication(app.id, payload);
      onSaved({ ...app, ...payload } as Application);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete application for "${app.candidate_name}"?`)) return;
    setBusy(true);
    try { await deleteApplication(app.id); onDeleted(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon="ti-users"
      title={app.candidate_name}
      subtitle={app.job_id ? jobName(app.job_id) : undefined}
      footer={
        <>
          {canEdit && (
            <button className="btn btn-danger mr-auto" onClick={remove} disabled={busy}>
              <Icon name="ti-trash" />Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
          {canEdit && (
            <button className="btn btn-primary" disabled={busy || !draft.candidate_name?.trim()} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Candidate name" required>
          <input className="input" value={draft.candidate_name || ''} onChange={(e) => setD({ candidate_name: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={draft.email || ''} onChange={(e) => setD({ email: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Phone">
          <input className="input" value={draft.phone || ''} onChange={(e) => setD({ phone: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Source">
          <input className="input" value={draft.source || ''} onChange={(e) => setD({ source: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Job">
          <Select value={draft.job_id || ''} onChange={(v) => setD({ job_id: v || undefined })} disabled={!canEdit} search placeholder="No job" options={[{ value: '', label: 'No job' }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]} />
        </Field>
        <Field label="Stage">
          <Select value={draft.stage || 'applied'} onChange={(v) => setD({ stage: v as Application['stage'] })} disabled={!canEdit} options={STAGES.map((s) => ({ value: s, label: cap(s) }))} />
        </Field>
        <Field label="Rating (1–5)">
          <input className="input" type="number" min={1} max={5} value={draft.rating ?? ''} onChange={(e) => setD({ rating: e.target.value ? Number(e.target.value) : undefined })} disabled={!canEdit} placeholder="—" />
        </Field>
        <Field label="Owner">
          <Select value={draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} disabled={!canEdit} search placeholder="Unassigned" options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input h-20 resize-none" value={draft.notes || ''} onChange={(e) => setD({ notes: e.target.value })} disabled={!canEdit} />
        </Field>
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <Attachments
          entityType="application"
          entityId={app.id}
          orgId={orgId}
          currentUserId={me}
        />
      </div>
    </Modal>
  );
}
