import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
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

const STAGE_PILL: Record<string, string> = {
  applied: 'pill-gray',
  screening: 'pill-blue',
  interview: 'pill-amber',
  offer: 'pill-violet',
  hired: 'pill-green',
  rejected: 'pill-red',
};
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ACTIVE_STAGES = new Set(['applied', 'screening', 'interview', 'offer']);

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
  const [q, setQ] = useState('');
  const [stageF, setStageF] = useState('all');
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

  if (!enabled) return (
    <Layout flat title="Applications">
      <EmptyState icon="ti-files-off" title="HR not in your plan" text="Upgrade to track candidate applications." />
    </Layout>
  );

  return (
    <Layout flat title="Applications">
      <PageHeader
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-users" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-progress" hint="applied · screening · interview · offer" />
        <StatCard label="Hired" value={String(kpis.hired)} icon="ti-circle-check" />
        <StatCard label="Rejected" value={String(kpis.rejected)} icon="ti-circle-x" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search candidates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-40"><Select value={stageF} onChange={setStageF} options={[{ value: 'all', label: 'All stages' }, ...STAGES.map((s) => ({ value: s, label: cap(s) }))]} /></div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {apps === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-users" text="No applications found." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm list-card">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setDetail(a)}
                  >
                    <td className="px-4 py-3 font-medium text-content">{a.candidate_name}</td>
                    <td className="px-4 py-3 text-muted">{jobName(a.job_id)}</td>
                    <td className="px-4 py-3 text-muted">{a.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`pill capitalize ${STAGE_PILL[a.stage] || 'pill-gray'}`}>{a.stage}</span>
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {a.rating != null ? `${a.rating}/5` : '—'}
                    </td>
                    <td className="px-4 py-3 text-2xs text-muted">{userName(a.owner_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add editor modal (no attachments — entity not yet created) */}
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
