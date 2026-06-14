import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { listApprovals, approvalDecide, approvalCancel, getOrgUsers, ApprovalRequest } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const PILL: Record<string, string> = { pending: 'pill-amber', approved: 'pill-green', rejected: 'pill-red', cancelled: 'pill-gray' };

export default function ApprovalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isOrgAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [rows, setRows] = useState<ApprovalRequest[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (!org) return; listApprovals(org.id).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (org?.id) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); } /* eslint-disable-next-line */ }, [org?.id]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || 'Someone';
  const shown = useMemo(() => (rows || []).filter((r) => filter === 'all' || r.status === 'pending'), [rows, filter]);
  const canDecide = (r: ApprovalRequest) => isOrgAdmin || r.approver_id === me?.id;

  const decide = async (r: ApprovalRequest, status: 'approved' | 'rejected') => {
    if (busy) return; setBusy(true); setErr('');
    try { await approvalDecide(r.id, status, noteFor === r.id ? note : undefined); setNoteFor(null); setNote(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cancel = async (r: ApprovalRequest) => {
    if (busy || !confirm('Cancel this request?')) return; setBusy(true); setErr('');
    try { await approvalCancel(r.id); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Approvals">
      <PageHeader title="Approvals" subtitle="Requests awaiting a decision, and the status of your own requests" icon="ti-checks" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="flex items-center gap-2 mb-3">
        {(['pending', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pill capitalize cursor-pointer ${filter === f ? 'bg-accent/15 text-accentstrong font-medium' : 'pill-gray hover:bg-surface2'}`}>{f}</button>
        ))}
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? (
        <div className="card p-8"><EmptyState icon="ti-checks" text="Nothing to approve." /></div>
      ) : (
        <div className="space-y-2.5 max-w-3xl">
          {shown.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="chip capitalize">{r.entity_type}</span>
                <span className={`pill ${PILL[r.status]}`}>{r.status}</span>
                {r.amount != null && <span className="ml-auto text-sm font-semibold tabular-nums">${Number(r.amount).toLocaleString()}</span>}
              </div>
              <p className="text-sm font-medium text-content">{r.title}</p>
              {r.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{r.body}</p>}
              <p className="text-2xs text-muted2 mt-1 inline-flex items-center gap-1.5"><Avatar name={name(r.requested_by)} size={16} />{name(r.requested_by)} · {new Date(r.created_at).toLocaleDateString()}{r.decided_at ? ` · ${r.status} by ${name(r.decided_by)}` : ''}</p>
              {r.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{r.decision_note}&rdquo;</p>}
              {r.status === 'pending' && (canDecide(r) || r.requested_by === me?.id) && (
                <div className="mt-3 pt-3 border-t border-line">
                  {canDecide(r) && noteFor === r.id && <input className="input mb-2" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
                  <div className="flex flex-wrap gap-2">
                    {canDecide(r) && <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => decide(r, 'approved')}><Icon name="ti-check" />Approve</button>}
                    {canDecide(r) && <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => decide(r, 'rejected')}><Icon name="ti-x" />Reject</button>}
                    {canDecide(r) && <button className="btn-ghost h-8 py-0" onClick={() => { setNoteFor(noteFor === r.id ? null : r.id); setNote(''); }}><Icon name="ti-note" />Note</button>}
                    {r.requested_by === me?.id && <button className="btn h-8 py-0 ml-auto" disabled={busy} onClick={() => cancel(r)}>Cancel request</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
