import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listInterviews, createInterview, updateInterview, deleteInterview, listApplications,
  Interview, Application,
} from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { getOrgUsers } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta, EditSpec } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUS_PILL: Record<string, string> = {
  scheduled: 'pill-blue',
  completed: 'pill-green',
  cancelled: 'pill-gray',
  no_show: 'pill-red',
};
const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
const MODES = ['onsite', 'phone', 'video'] as const;

const STATUS_ORDER = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
const GROUPS: GroupMeta[] = STATUS_ORDER.map((s) => ({
  value: s,
  label: s === 'no_show' ? 'No-show' : titleCase(s),
  pill: STATUS_PILL[s] || 'pill-gray',
}));

const COLS: ColDef[] = [
  { id: 'candidate', label: 'Candidate', locked: true },
  { id: 'when', label: 'When' },
  { id: 'mode', label: 'Mode' },
  { id: 'stage', label: 'Stage' },
  { id: 'interviewer', label: 'Interviewer' },
  { id: 'rating', label: 'Rating' },
  { id: 'status', label: 'Status' },
];

const INTERVIEW_FILTERS: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All statuses' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'no_show', label: 'No-show' },
    ],
  },
];

type Draft = {
  application_id: string;
  interviewer_id: string | null;
  scheduled_at_local: string;
  mode: string;
  stage_label: string;
  status: string;
  rating: number | null;
  feedback: string;
};

const emptyDraft = (): Draft => ({
  application_id: '',
  interviewer_id: null,
  scheduled_at_local: '',
  mode: 'video',
  stage_label: '',
  status: 'scheduled',
  rating: null,
  feedback: '',
});

const toLocalInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 16) : '';

const toISO = (val: string): string | null =>
  val ? new Date(val).toISOString() : null;

const isUpcomingSoon = (iv: Interview): boolean => {
  if (iv.status !== 'scheduled' || !iv.scheduled_at) return false;
  const diff = new Date(iv.scheduled_at).getTime() - Date.now();
  return diff > 0 && diff <= 2 * 24 * 60 * 60 * 1000;
};

export default function InterviewsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'hr');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const prefs = useListPrefs('snrpmo.interviews.cols', COLS);
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';

  const load = () => {
    if (!org) return;
    listInterviews(org.id).then(setInterviews).catch((e) => { setErr(e.message); setInterviews([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      listApplications(org.id).then(setApplications).catch(() => {});
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, enabled]);

  const candidateName = (appId: string) =>
    applications.find((a) => a.id === appId)?.candidate_name || appId || '—';

  const userName = (uid: string | null | undefined) =>
    users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() => {
    const list = interviews || [];
    return list.filter((iv) => {
      if (statusF !== 'all' && iv.status !== statusF) return false;
      if (!q.trim()) return true;
      const haystack = `${candidateName(iv.application_id)} ${iv.stage_label || ''}`.toLowerCase();
      return haystack.includes(q.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, applications, q, statusF]);

  const rs = useRowSelection(shown);

  const kpis = useMemo(() => {
    const list = interviews || [];
    const now = Date.now();
    return {
      upcoming: list.filter((iv) => iv.status === 'scheduled' && iv.scheduled_at && new Date(iv.scheduled_at).getTime() > now).length,
      completed: list.filter((iv) => iv.status === 'completed').length,
      cancelled: list.filter((iv) => iv.status === 'cancelled' || iv.status === 'no_show').length,
      total: list.length,
    };
  }, [interviews]);

  const cell = (id: string, iv: Interview) => {
    switch (id) {
      case 'candidate': return <span className="font-medium text-content">{candidateName(iv.application_id)}</span>;
      case 'when': {
        if (!iv.scheduled_at) return <span className="text-muted2">—</span>;
        const soon = isUpcomingSoon(iv);
        return (
          <span className={soon ? 'text-amber-600 font-medium text-2xs' : 'text-muted text-2xs'}>
            {new Date(iv.scheduled_at).toLocaleString()}{soon && ' · Soon'}
          </span>
        );
      }
      case 'mode': return <span className="pill pill-gray capitalize">{iv.mode}</span>;
      case 'stage': return <span className="text-muted">{iv.stage_label || '—'}</span>;
      case 'interviewer': return <span className="text-2xs text-muted">{userName(iv.interviewer_id)}</span>;
      case 'rating': return iv.rating != null ? String(iv.rating) : '—';
      case 'status': return (
        <span className={`pill ${STATUS_PILL[iv.status] || 'pill-gray'}`}>
          {iv.status === 'no_show' ? 'No-show' : iv.status}
        </span>
      );
      default: return '—';
    }
  };

  const exportValue = (id: string, iv: Interview) => {
    switch (id) {
      case 'candidate': return candidateName(iv.application_id);
      case 'when': return iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : '';
      case 'mode': return iv.mode;
      case 'stage': return iv.stage_label || '';
      case 'interviewer': return userName(iv.interviewer_id);
      case 'rating': return iv.rating != null ? String(iv.rating) : '';
      case 'status': return iv.status === 'no_show' ? 'No-show' : iv.status;
      default: return '';
    }
  };

  const editable: Record<string, EditSpec> = {
    status: { type: 'select', options: STATUSES.map((s) => ({ value: s, label: s === 'no_show' ? 'No-show' : titleCase(s) })) },
  };
  const rawValue = (id: string, iv: Interview) => id === 'status' ? iv.status : '';
  const onInlineEdit = async (iv: Interview, id: string, value: string) => {
    if (id !== 'status') return;
    try { await updateInterview(iv.id, { status: value as Interview['status'] }); load(); } catch (e: any) { setErr(e.message); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} interview${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const iv of rs.selected) await deleteInterview(iv.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const setD = (patch: Partial<Draft>) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const openAdd = () => setEditor({ mode: 'add', draft: emptyDraft() });
  const openEdit = (iv: Interview) =>
    setEditor({
      mode: 'edit',
      id: iv.id,
      draft: {
        application_id: iv.application_id,
        interviewer_id: iv.interviewer_id || null,
        scheduled_at_local: toLocalInput(iv.scheduled_at),
        mode: iv.mode,
        stage_label: iv.stage_label || '',
        status: iv.status,
        rating: iv.rating ?? null,
        feedback: iv.feedback || '',
      },
    });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.application_id || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload = {
      application_id: d.application_id,
      interviewer_id: d.interviewer_id || null,
      scheduled_at: toISO(d.scheduled_at_local),
      mode: d.mode as Interview['mode'],
      stage_label: d.stage_label || null,
      status: d.status as Interview['status'],
      rating: d.rating ? Number(d.rating) : null,
      feedback: d.feedback || null,
    };
    try {
      if (editor.mode === 'edit' && editor.id) {
        await updateInterview(editor.id, payload);
      } else {
        await createInterview({ org_id: org.id, created_by: me.id, ...payload });
      }
      setEditor(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editor?.id || !confirm('Delete this interview?')) return;
    setBusy(true);
    try {
      await deleteInterview(editor.id);
      setEditor(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled)
    return (
      <Layout flat title="Interviews">
        <EmptyState icon="ti-calendar-off" title="HR not in your plan" text="Upgrade to use the Interviews module." />
      </Layout>
    );

  return (
    <Layout flat title="Interviews">
      <PageHeader help="hr"
        title="Interviews"
        subtitle="Schedule interviews and collect feedback against candidate applications"
        icon="ti-calendar-event"
        action={
          <button className="btn btn-primary" onClick={openAdd}>
            <Icon name="ti-plus" />Schedule interview
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Upcoming" value={String(kpis.upcoming)} icon="ti-calendar-event" />
        <StatCard label="Completed" value={String(kpis.completed)} icon="ti-circle-check" />
        <StatCard label="Cancelled / No-show" value={String(kpis.cancelled)} icon="ti-calendar-x" hintTone={kpis.cancelled ? 'down' : 'muted'} />
        <StatCard label="Total" value={String(kpis.total)} icon="ti-list" />
      </div>

      <ListView
        rows={interviews === null ? null : shown}
        rowKey={(iv) => iv.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={INTERVIEW_FILTERS}
        searchPlaceholder="Search candidate / stage…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(iv) => iv.status}
        groups={GROUPS}
        editable={editable}
        rawValue={rawValue}
        onEdit={onInlineEdit}
        onRowClick={(iv) => openEdit(iv)}
        exportName="interviews"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-calendar-event"
        emptyText="No interviews found."
      />

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-calendar-event"
          title={editor.mode === 'edit' ? 'Edit interview' : 'Schedule interview'}
          onSubmit={save}
          footer={
            <>
              {editor.mode === 'edit' && (
                <button className="btn btn-danger mr-auto" disabled={busy} onClick={remove}>
                  <Icon name="ti-trash" />Delete
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !editor.draft.application_id} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Candidate" required>
              <Select value={editor.draft.application_id} onChange={(v) => setD({ application_id: v })} options={[{ value: '', label: '— select candidate —' }, ...applications.map((a) => ({ value: a.id, label: a.candidate_name }))]} />
            </Field>
            <Field label="Interviewer">
              <Select value={editor.draft.interviewer_id || ''} onChange={(v) => setD({ interviewer_id: v || null })} options={[{ value: '', label: 'None' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Scheduled at">
              <input
                className="input"
                type="datetime-local"
                value={editor.draft.scheduled_at_local}
                onChange={(e) => setD({ scheduled_at_local: e.target.value })}
              />
            </Field>
            <Field label="Mode">
              <Select value={editor.draft.mode} onChange={(v) => setD({ mode: v })} options={[...MODES.map((m) => ({ value: m, label: titleCase(m) }))]} />
            </Field>
            <Field label="Stage label">
              <input
                className="input"
                value={editor.draft.stage_label}
                onChange={(e) => setD({ stage_label: e.target.value })}
                placeholder="e.g. Tech round"
              />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status} onChange={(v) => setD({ status: v })} options={[...STATUSES.map((s) => ({ value: s, label: s === 'no_show' ? 'No-show' : titleCase(s) }))]} />
            </Field>
            <Field label="Rating (1–5)">
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                value={editor.draft.rating ?? ''}
                onChange={(e) => setD({ rating: e.target.value ? Number(e.target.value) : null })}
                placeholder="—"
              />
            </Field>
            <Field label="Feedback" className="sm:col-span-2">
              <textarea
                className="input"
                rows={3}
                value={editor.draft.feedback}
                onChange={(e) => setD({ feedback: e.target.value })}
                placeholder="Notes from the interview…"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
