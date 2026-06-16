import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, EmptyState, Pill, Icon, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useLeaves } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { requestLeave, decideLeave, cancelLeave, notify, getMyLeaveProfile, MyLeaveProfile } from '@/lib/db';
import { Leave } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const TYPES = ['Annual', 'Sick', 'Casual', 'Unpaid', 'Work From Home'];
const LEAVE_COLS: ColDef[] = [{ id: 'type', label: 'Type', locked: true }, { id: 'dates', label: 'Dates' }, { id: 'days', label: 'Days' }, { id: 'status', label: 'Status' }];
const daysBetween = (a: string, b: string) => { const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1; return d > 0 ? d : 0; };

export default function LeavePage() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const qc = useQueryClient();
  const { data: rows = [], isLoading: loading } = useLeaves();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [profile, setProfile] = useState<MyLeaveProfile | null>(null);
  const [f, setF] = useState({ type: 'Annual', start_date: '', end_date: '', reason: '' });

  useEffect(() => { if (me?.id) getMyLeaveProfile(me.id).then(setProfile).catch(() => {}); }, [me?.id]);

  // Approvers = org owner/admin OR a delegated approver (can_approve_leaves).
  // Both are enforced server-side; this just decides who sees the queue.
  const isApprover = can.manageMembers(org) || !!profile?.can_approve_leaves;
  const mine = useMemo(() => rows.filter((r) => r.user_id === me?.id), [rows, me?.id]);
  const queue = useMemo(() => rows.filter((r) => r.status === 'Pending' && r.user_id !== me?.id), [rows, me?.id]);
  const days = f.start_date && f.end_date ? daysBetween(f.start_date, f.end_date) : 0;

  const lp = useListPrefs(`snr-leave-view-${me?.id || 'anon'}`, LEAVE_COLS);
  const FILTERS: FilterDef[] = [
    { id: 'type', label: 'Type', options: [{ value: 'all', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: t }))] },
    { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...['Pending', 'Approved', 'Rejected', 'Cancelled'].map((x) => ({ value: x, label: x }))] },
  ];
  const mineFiltered = useMemo(() => {
    const term = lp.query.trim().toLowerCase();
    return mine.filter((l) => {
      if (term && !(`${l.type} ${l.reason || ''}`.toLowerCase().includes(term))) return false;
      if (lp.filters.type && lp.filters.type !== 'all' && l.type !== lp.filters.type) return false;
      if (lp.filters.status && lp.filters.status !== 'all' && l.status !== lp.filters.status) return false;
      return true;
    });
  }, [mine, lp.query, lp.filters]);
  const minePg = usePagination(mineFiltered, 25);

  const submit = async () => {
    if (!me || !org || days <= 0) return; setBusy(true);
    try {
      await requestLeave({ user_id: me.id, org_id: org.id, type: f.type, start_date: f.start_date, end_date: f.end_date, days, reason: f.reason });
      qc.invalidateQueries({ queryKey: qk.leaves(org?.id) });
      setShow(false); setF({ type: 'Annual', start_date: '', end_date: '', reason: '' });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const decide = async (l: Leave, status: 'Approved' | 'Rejected') => {
    if (!me || !org) return; setBusy(true);
    try {
      await decideLeave(l.id, status, me.id);
      qc.invalidateQueries({ queryKey: qk.leaves(org?.id) });
      if (l.user_id) notify({ org_id: org.id, user_id: l.user_id, type: 'LEAVE_STATUS', title: `Leave ${status.toLowerCase()}`, body: `${l.type} leave ${l.start_date}→${l.end_date} was ${status.toLowerCase()}.`, link: '/leave', entity_type: 'leave', entity_id: l.id }).catch(() => {});
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const cancel = async (l: Leave) => {
    setBusy(true);
    try { await cancelLeave(l.id); qc.invalidateQueries({ queryKey: qk.leaves(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const pending = mine.filter((r) => r.status === 'Pending').length;
  const approved = mine.filter((r) => r.status === 'Approved').length;
  const approvedDays = mine.filter((r) => r.status === 'Approved').reduce((a, r) => a + (Number(r.days) || 0), 0);

  const Row = ({ l, withPerson, actions }: { l: Leave; withPerson?: boolean; actions?: boolean }) => (
    <tr className="border-b border-line last:border-0">
      {withPerson && <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><Avatar name={l.requester?.full_name || '?'} size={22} />{l.requester?.full_name || '—'}</span></td>}
      <td className="px-4 py-2.5">{l.type}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">{l.start_date} → {l.end_date}</td>
      <td className="px-4 py-2.5">{l.days}</td>
      <td className="px-4 py-2.5"><Pill label={l.status} /></td>
      <td className="px-4 py-2.5 text-right">
        {actions ? (
          <span className="inline-flex gap-1">
            <button onClick={() => decide(l, 'Approved')} disabled={busy} className="btn h-7 px-2 text-xs text-emerald-600"><Icon name="ti-check" />Approve</button>
            <button onClick={() => decide(l, 'Rejected')} disabled={busy} className="btn h-7 px-2 text-xs text-rose-600"><Icon name="ti-x" />Reject</button>
          </span>
        ) : (l.status === 'Pending' && l.user_id === me?.id) ? (
          <button onClick={() => cancel(l)} disabled={busy} className="btn h-7 px-2 text-xs text-muted">Cancel</button>
        ) : null}
      </td>
    </tr>
  );

  return (
    <Layout flat title="Leave">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Leave" subtitle="Request time off and track approvals"
            action={<button onClick={() => setShow(true)} className="btn btn-primary"><Icon name="ti-plus" />Request leave</button>} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Pending" value={pending} icon="ti-clock" />
            <StatCard label="Approved" value={approved} icon="ti-circle-check" />
            <StatCard label="Days approved" value={approvedDays} icon="ti-beach" />
            <StatCard label="Requests" value={mine.length} icon="ti-files" />
          </div>

          {profile && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <StatCard label="Annual balance" value={profile.annual_balance} icon="ti-calendar" />
              <StatCard label="Sick balance" value={profile.sick_balance} icon="ti-vaccine" />
              <StatCard label="Casual balance" value={profile.casual_balance} icon="ti-coffee" />
            </div>
          )}

          {isApprover && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Approval queue {queue.length > 0 && <span className="pill pill-amber ml-1">{queue.length}</span>}</p>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="text-2xs uppercase tracking-wide text-muted2 border-b border-line">
                    <th className="text-left font-medium px-4 py-2.5">Person</th><th className="text-left font-medium px-4 py-2.5">Type</th><th className="text-left font-medium px-4 py-2.5">Dates</th><th className="text-left font-medium px-4 py-2.5">Days</th><th className="text-left font-medium px-4 py-2.5">Status</th><th></th>
                  </tr></thead>
                  <tbody>{queue.map((l) => <Row key={l.id} l={l} withPerson actions />)}</tbody>
                </table></div>
                {queue.length === 0 && <EmptyState icon="ti-inbox" text="No pending requests" />}
              </div>
            </div>
          )}

          <p className="text-sm font-medium mb-2">My requests</p>
          <ListToolbar prefs={lp} cols={LEAVE_COLS} filters={FILTERS} placeholder="Search my requests…" />
          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-2xs uppercase tracking-wide text-muted2 border-b border-line">
                {lp.ordered.map((id) => <th key={id} className="text-left font-medium px-4 py-2.5">{LEAVE_COLS.find((c) => c.id === id)?.label}</th>)}<th></th>
              </tr></thead>
              <tbody>{minePg.pageItems.map((l) => {
                const cell = (id: string) => {
                  switch (id) {
                    case 'type': return l.type;
                    case 'dates': return <span className="whitespace-nowrap">{l.start_date} → {l.end_date}</span>;
                    case 'days': return l.days;
                    case 'status': return <Pill label={l.status} />;
                    default: return null;
                  }
                };
                return (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    {lp.ordered.map((id) => <td key={id} className="px-4 py-2.5">{cell(id)}</td>)}
                    <td className="px-4 py-2.5 text-right">{(l.status === 'Pending' && l.user_id === me?.id) ? <button onClick={() => cancel(l)} disabled={busy} className="btn h-7 px-2 text-xs text-muted">Cancel</button> : null}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {mineFiltered.length === 0 && <EmptyState icon="ti-beach" text="No leave requests yet" />}
            <Pagination page={minePg.page} pageCount={minePg.pageCount} total={minePg.total} start={minePg.start} end={minePg.end} onPage={minePg.setPage} />
          </div>
        </>
      )}

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title="Request leave"
        subtitle="Submit a time-off request for approval."
        icon="ti-beach"
        onSubmit={() => { if (!busy && days > 0) submit(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to submit</span>
            <button onClick={() => setShow(false)} className="btn">Cancel</button>
            <button onClick={submit} disabled={busy || days <= 0} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Submitting…' : 'Submit request'}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[...TYPES.map((t) => ({ value: t, label: t }))]} /></Field>
          <div className="flex gap-3">
            <Field label="From" required className="flex-1"><input autoFocus type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className="input" /></Field>
            <Field label="To" required className="flex-1"><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} className="input" /></Field>
          </div>
          <p className="text-2xs text-muted">{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Select a valid date range'}</p>
          <Field label="Reason" hint="Optional"><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className="textarea h-20" placeholder="Optional" /></Field>
        </div>
      </Modal>
    </Layout>
  );
}
