import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, EmptyState, Icon, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { hasFeature } from '@/lib/entitlements';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { OrgUser } from '@/lib/supabase';
import {
  getOrgUsers, getAppraisalCycles, createAppraisalCycle, updateAppraisalCycle,
  getAppraisals, createAppraisal, updateAppraisal, deleteAppraisal,
  AppraisalCycle, Appraisal,
} from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  pending: 'pill-gray', self_review: 'pill-amber', in_review: 'pill-amber', completed: 'pill-green',
};
const STATUS_ORDER = ['pending', 'self_review', 'in_review', 'completed'] as const;
type ApprStatus = typeof STATUS_ORDER[number];
const statusLabel = (s: string) => titleCase(s.replace('_', ' '));
const GROUPS: GroupMeta[] = STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s), pill: STATUS_PILL[s] || 'pill-gray' }));
const CYCLE_PILL: Record<string, string> = { draft: 'pill-gray', active: 'pill-green', closed: 'pill-amber' };

const COLS: ColDef[] = [
  { id: 'employee', label: 'Employee', locked: true },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'rating', label: 'Rating' },
  { id: 'updated', label: 'Updated' },
  { id: 'status', label: 'Status' },
];

const Stars = ({ v }: { v: number | null }) => {
  if (v == null) return <span className="text-muted2">—</span>;
  return <span className="inline-flex items-center gap-1 tabular-nums"><Icon name="ti-star-filled" className="text-amber-500 text-xs" />{v}<span className="text-muted2">/5</span></span>;
};

type Draft = Partial<Appraisal> & { employee_id?: string };

export default function AppraisalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'appraisals');
  const isManager = can.manageMembers(org) || !!me?.can_manage_appraisals;

  const [cycles, setCycles] = useState<AppraisalCycle[] | null>(null);
  const [cycleId, setCycleId] = useState<string>('');
  const [rows, setRows] = useState<Appraisal[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [cycleEditor, setCycleEditor] = useState<{ mode: 'add' | 'edit'; draft: Partial<AppraisalCycle> } | null>(null);

  const prefs = useListPrefs('snrpmo.appraisals.cols', COLS, { entity: 'appraisals', orgId: org?.id, canManage: isManager });

  const loadCycles = () => {
    if (!org) return;
    getAppraisalCycles(org.id).then((cs) => {
      setCycles(cs);
      setCycleId((prev) => prev || cs.find((c) => c.status === 'active')?.id || cs[0]?.id || '');
    }).catch((e) => { setErr(e.message); setCycles([]); });
  };
  const loadAppraisals = () => {
    if (!org) return;
    getAppraisals(org.id, cycleId || undefined).then(setRows).catch((e) => { setErr(e.message); setRows([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) { loadCycles(); getOrgUsers(org.id).then(setUsers).catch(() => {}); }
    // eslint-disable-next-line
  }, [org?.id, enabled]);
  useEffect(() => { if (org?.id && enabled) loadAppraisals(); /* eslint-disable-next-line */ }, [org?.id, enabled, cycleId]);

  const cycle = cycles?.find((c) => c.id === cycleId) || null;

  const shown = useMemo(() => {
    const term = prefs.query.trim().toLowerCase();
    return (rows || []).filter((a) => {
      const sf = prefs.filters.status;
      if (sf && sf !== 'all' && a.status !== sf) return false;
      if (term && !`${a.employee?.full_name || ''} ${a.reviewer?.full_name || ''} ${a.summary || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, prefs.query, prefs.filters]);

  const rs = useRowSelection(shown);

  const FILTERS: FilterDef[] = [
    { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) }))] },
  ];

  const cell = (id: string, a: Appraisal) => {
    switch (id) {
      case 'employee': return <span className="inline-flex items-center gap-2 font-medium text-content"><Avatar name={a.employee?.full_name || '?'} src={a.employee?.avatar_url || undefined} size={22} />{a.employee?.full_name || '—'}</span>;
      case 'reviewer': return a.reviewer ? <span className="inline-flex items-center gap-2"><Avatar name={a.reviewer.full_name || '?'} src={a.reviewer.avatar_url || undefined} size={20} />{a.reviewer.full_name || '—'}</span> : <span className="text-muted2">Unassigned</span>;
      case 'rating': return <Stars v={a.overall_rating} />;
      case 'updated': return <span className="text-muted whitespace-nowrap">{(a.updated_at || '').slice(0, 10) || '—'}</span>;
      case 'status': return <span className={`pill ${STATUS_PILL[a.status] || 'pill-gray'}`}>{statusLabel(a.status)}</span>;
      default: return null;
    }
  };
  const exportValue = (id: string, a: Appraisal) => {
    switch (id) {
      case 'employee': return a.employee?.full_name || '';
      case 'reviewer': return a.reviewer?.full_name || '';
      case 'rating': return a.overall_rating == null ? '' : String(a.overall_rating);
      case 'updated': return (a.updated_at || '').slice(0, 10);
      case 'status': return statusLabel(a.status);
      default: return '';
    }
  };

  const kpis = useMemo(() => {
    const all = rows || [];
    const rated = all.filter((a) => a.overall_rating != null);
    const avg = rated.length ? (rated.reduce((s, a) => s + (a.overall_rating || 0), 0) / rated.length) : null;
    return {
      total: all.length,
      completed: all.filter((a) => a.status === 'completed').length,
      inReview: all.filter((a) => a.status === 'in_review' || a.status === 'self_review').length,
      avg: avg == null ? '—' : avg.toFixed(1),
    };
  }, [rows]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || busy) return;
    const d = editor.draft;
    if (editor.mode === 'add' && (!cycleId || !d.employee_id)) { setErr('Pick a cycle and an employee.'); return; }
    setBusy(true); setErr('');
    const rating = d.overall_rating == null || (d.overall_rating as any) === '' ? null : Number(d.overall_rating);
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateAppraisal(d.id, { status: d.status as ApprStatus, overall_rating: rating, summary: d.summary || null, reviewer_id: d.reviewer_id || null });
      } else {
        await createAppraisal({ org_id: org.id, cycle_id: cycleId, employee_id: d.employee_id!, reviewer_id: d.reviewer_id || me.id, status: (d.status as ApprStatus) || 'pending', overall_rating: rating, summary: d.summary || null });
      }
      setEditor(null); loadAppraisals();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveCycle = async () => {
    if (!org || !cycleEditor || busy || !cycleEditor.draft.name?.trim()) return;
    setBusy(true); setErr('');
    const d = cycleEditor.draft;
    try {
      if (cycleEditor.mode === 'edit' && d.id) {
        await updateAppraisalCycle(d.id, { name: d.name!.trim(), period_start: d.period_start || null, period_end: d.period_end || null, status: d.status as AppraisalCycle['status'] });
      } else {
        const c = await createAppraisalCycle({ org_id: org.id, name: d.name!.trim(), period_start: d.period_start || null, period_end: d.period_end || null, status: (d.status as AppraisalCycle['status']) || 'active' });
        setCycleId(c.id);
      }
      setCycleEditor(null); loadCycles();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const bulkDelete = async (sel: typeof rs) => {
    if (!sel.count || !confirm(`Delete ${sel.count} appraisal${sel.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const a of sel.selected) await deleteAppraisal(a.id); sel.clear(); loadAppraisals(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Appraisals">
      <EmptyState icon="ti-clipboard-check" title="Appraisals not in your plan" text="Upgrade to run performance reviews, or enable the module in Settings ▸ Modules." />
    </Layout>
  );

  const userOpts = [{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))];

  return (
    <Layout flat title="Appraisals">
      <PageHeader help="appraisals" title="Performance appraisals" subtitle="Run review cycles, rate employees, and track sign-off"
        icon="ti-clipboard-check"
        action={isManager ? (
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setCycleEditor({ mode: 'add', draft: { status: 'active' } })}><Icon name="ti-calendar-plus" />New cycle</button>
            <button className="btn btn-primary" disabled={!cycleId} onClick={() => setEditor({ mode: 'add', draft: { status: 'pending', reviewer_id: me?.id } })}><Icon name="ti-plus" />Add appraisal</button>
          </div>
        ) : undefined}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Appraisals" value={String(kpis.total)} icon="ti-clipboard-list" />
        <StatCard label="Completed" value={String(kpis.completed)} icon="ti-circle-check" />
        <StatCard label="In progress" value={String(kpis.inReview)} icon="ti-progress" />
        <StatCard label="Avg rating" value={String(kpis.avg)} icon="ti-star" />
      </div>

      {/* Cycle selector */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-2xs text-muted2 uppercase tracking-wide">Cycle</span>
        {cycles === null ? <span className="text-sm text-muted">Loading…</span>
          : cycles.length === 0 ? <span className="text-sm text-muted">No cycles yet{isManager ? ' — create one to start.' : '.'}</span>
          : (
            <>
              <div className="min-w-[220px]"><Select value={cycleId} onChange={setCycleId} options={cycles.map((c) => ({ value: c.id, label: `${c.name} · ${statusLabel(c.status)}` }))} /></div>
              {cycle && <span className={`pill ${CYCLE_PILL[cycle.status] || 'pill-gray'}`}>{statusLabel(cycle.status)}</span>}
              {cycle && (cycle.period_start || cycle.period_end) && <span className="text-2xs text-muted2">{cycle.period_start || '…'} → {cycle.period_end || '…'}</span>}
              {isManager && cycle && <button className="btn-ghost text-2xs" onClick={() => setCycleEditor({ mode: 'edit', draft: cycle })}><Icon name="ti-pencil" />Edit</button>}
            </>
          )}
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={FILTERS}
        searchPlaceholder="Search appraisals…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(a) => a.status}
        groups={GROUPS}
        exportName="appraisals"
        exportValue={exportValue}
        onRowClick={(a) => setEditor({ mode: 'edit', draft: a })}
        onDelete={isManager ? bulkDelete : undefined}
        canDelete={isManager}
        busy={busy}
        emptyIcon="ti-clipboard-check"
        emptyText={cycleId ? 'No appraisals in this cycle yet.' : 'Select or create a cycle.'}
      />

      {/* Appraisal editor */}
      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-clipboard-check"
          title={editor.mode === 'edit' ? 'Appraisal' : 'Add appraisal'}
          onSubmit={isManager ? save : undefined}
          footer={isManager ? (
            <>
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            </>
          ) : <button className="btn" onClick={() => setEditor(null)}>Close</button>}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Employee" required>
              {editor.mode === 'edit'
                ? <input className="input" disabled value={editor.draft.employee?.full_name || '—'} />
                : <Select value={editor.draft.employee_id || ''} onChange={(v) => setD({ employee_id: v })} options={[{ value: '', label: 'Select employee…' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />}
            </Field>
            <Field label="Reviewer">
              {isManager
                ? <Select value={editor.draft.reviewer_id || ''} onChange={(v) => setD({ reviewer_id: v || null })} options={userOpts} />
                : <input className="input" disabled value={editor.draft.reviewer?.full_name || 'Unassigned'} />}
            </Field>
            <Field label="Status">
              {isManager
                ? <Select value={editor.draft.status || 'pending'} onChange={(v) => setD({ status: v as ApprStatus })} options={STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) }))} />
                : <input className="input" disabled value={statusLabel(editor.draft.status || 'pending')} />}
            </Field>
            <Field label="Overall rating (0–5)">
              <input className="input" type="number" min={0} max={5} step={0.5} disabled={!isManager}
                value={editor.draft.overall_rating == null ? '' : String(editor.draft.overall_rating)}
                onChange={(e) => setD({ overall_rating: e.target.value === '' ? null : (Number(e.target.value) as any) })} placeholder="e.g. 4.5" />
            </Field>
            <Field label="Summary / feedback" className="sm:col-span-2">
              <textarea className="input min-h-[110px] resize-y" disabled={!isManager}
                value={editor.draft.summary || ''} onChange={(e) => setD({ summary: e.target.value })}
                placeholder="Strengths, areas to develop, goals for next period…" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Cycle editor */}
      {cycleEditor && (
        <Modal open onClose={() => setCycleEditor(null)} size="md" icon="ti-calendar"
          title={cycleEditor.mode === 'edit' ? 'Edit cycle' : 'New appraisal cycle'}
          onSubmit={saveCycle}
          footer={<>
            <button className="btn" onClick={() => setCycleEditor(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !cycleEditor.draft.name?.trim()} onClick={saveCycle}>{busy ? 'Saving…' : 'Save'}</button>
          </>}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Cycle name" required className="sm:col-span-2">
              <input className="input" autoFocus value={cycleEditor.draft.name || ''} onChange={(e) => setCycleEditor((c) => c && { ...c, draft: { ...c.draft, name: e.target.value } })} placeholder="e.g. H1 2026 Review" />
            </Field>
            <Field label="Period start">
              <input className="input" type="date" value={cycleEditor.draft.period_start || ''} onChange={(e) => setCycleEditor((c) => c && { ...c, draft: { ...c.draft, period_start: e.target.value || null } })} />
            </Field>
            <Field label="Period end">
              <input className="input" type="date" value={cycleEditor.draft.period_end || ''} onChange={(e) => setCycleEditor((c) => c && { ...c, draft: { ...c.draft, period_end: e.target.value || null } })} />
            </Field>
            <Field label="Status">
              <Select value={cycleEditor.draft.status || 'active'} onChange={(v) => setCycleEditor((c) => c && { ...c, draft: { ...c.draft, status: v as AppraisalCycle['status'] } })} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }]} />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
