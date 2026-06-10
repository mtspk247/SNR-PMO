import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, EmptyState, Pill, Icon, Avatar } from '@/components/ui';
import { getLeaves, requestLeave, decideLeave, cancelLeave, notify, getMyLeaveProfile, MyLeaveProfile } from '@/lib/db';
import { Leave } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const TYPES = ['Annual', 'Sick', 'Casual', 'Unpaid', 'Work From Home'];
const daysBetween = (a: string, b: string) => { const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1; return d > 0 ? d : 0; };

export default function LeavePage() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const [rows, setRows] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [profile, setProfile] = useState<MyLeaveProfile | null>(null);
  const [f, setF] = useState({ type: 'Annual', start_date: '', end_date: '', reason: '' });

  useEffect(() => { setLoading(true); getLeaves().then(setRows).finally(() => setLoading(false)); }, [org?.id]);
  useEffect(() => { if (me?.id) getMyLeaveProfile(me.id).then(setProfile).catch(() => {}); }, [me?.id]);

  // Approvers = org owner/admin OR a delegated approver (can_approve_leaves).
  // Both are enforced server-side; this just decides who sees the queue.
  const isApprover = can.manageMembers(org) || !!profile?.can_approve_leaves;
  const mine = useMemo(() => rows.filter((r) => r.user_id === me?.id), [rows, me?.id]);
  const queue = useMemo(() => rows.filter((r) => r.status === 'Pending' && r.user_id !== me?.id), [rows, me?.id]);
  const days = f.start_date && f.end_date ? daysBetween(f.start_date, f.end_date) : 0;

  const submit = async () => {
    if (!me || !org || days <= 0) return; setBusy(true);
    try {
      const l = await requestLeave({ user_id: me.id, org_id: org.id, type: f.type, start_date: f.start_date, end_date: f.end_date, days, reason: f.reason });
      setRows((p) => [l, ...p]); setShow(false); setF({ type: 'Annual', start_date: '', end_date: '', reason: '' });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const decide = async (l: Leave, status: 'Approved' | 'Rejected') => {
    if (!me || !org) return; setBusy(true);
    try {
      const u = await decideLeave(l.id, status, me.id); setRows((p) => p.map((x) => (x.id === u.id ? u : x)));
      if (l.user_id) notify({ org_id: org.id, user_id: l.user_id, type: 'LEAVE_STATUS', title: `Leave ${status.toLowerCase()}`, body: `${l.type} leave ${l.start_date}→${l.end_date} was ${status.toLowerCase()}.`, link: '/leave', entity_type: 'leave', entity_id: l.id }).catch(() => {});
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const cancel = async (l: Leave) => {
    setBusy(true);
    try { const u = await cancelLeave(l.id); setRows((p) => p.map((x) => (x.id === u.id ? u : x))); }
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
          <button onClick={() => cancel(l)} disabled={busy} className="btn h-7 px-2 text-xs text-neutral-500">Cancel</button>
        ) : null}
      </td>
    </tr>
  );

  return (
    <Layout title="Leave">
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
            <div className="grid grid-cols-3 gap-3 mb-5">
              <StatCard label="Annual balance" value={profile.annual_balance} icon="ti-calendar" />
              <StatCard label="Sick balance" value={profile.sick_balance} icon="ti-vaccine" />
              <StatCard label="Casual balance" value={profile.casual_balance} icon="ti-coffee" />
            </div>
          )}

          {isApprover && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Approval queue {queue.length > 0 && <span className="pill pill-amber ml-1">{queue.length}</span>}</p>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="text-2xs uppercase tracking-wide text-neutral-400 border-b border-line">
                    <th className="text-left font-medium px-4 py-2.5">Person</th><th className="text-left font-medium px-4 py-2.5">Type</th><th className="text-left font-medium px-4 py-2.5">Dates</th><th className="text-left font-medium px-4 py-2.5">Days</th><th className="text-left font-medium px-4 py-2.5">Status</th><th></th>
                  </tr></thead>
                  <tbody>{queue.map((l) => <Row key={l.id} l={l} withPerson actions />)}</tbody>
                </table>
                {queue.length === 0 && <EmptyState icon="ti-inbox" text="No pending requests" />}
              </div>
            </div>
          )}

          <p className="text-sm font-medium mb-2">My requests</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-2xs uppercase tracking-wide text-neutral-400 border-b border-line">
                <th className="text-left font-medium px-4 py-2.5">Type</th><th className="text-left font-medium px-4 py-2.5">Dates</th><th className="text-left font-medium px-4 py-2.5">Days</th><th className="text-left font-medium px-4 py-2.5">Status</th><th></th>
              </tr></thead>
              <tbody>{mine.map((l) => <Row key={l.id} l={l} />)}</tbody>
            </table>
            {mine.length === 0 && <EmptyState icon="ti-beach" text="No leave requests yet" />}
          </div>
        </>
      )}

      {show && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">Request leave</h3>
            <div className="space-y-3">
              <div><label className="label">Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="input">{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="label">From</label><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className="input" /></div>
                <div className="flex-1"><label className="label">To</label><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} className="input" /></div>
              </div>
              <p className="text-2xs text-neutral-500">{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Select a valid date range'}</p>
              <div><label className="label">Reason</label><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} className="input h-auto py-2 resize-none" placeholder="Optional" /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShow(false)} className="btn flex-1">Cancel</button>
              <button onClick={submit} disabled={busy || days <= 0} className="btn btn-primary flex-1">Submit request</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
