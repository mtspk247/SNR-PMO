import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate } from '@/lib/util';
import { decideLeave } from '@/app/actions/ops';
import { Modal, StatusBadge } from '../../ui';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Approvals() {
  const s = (await getSession())!;
  if (!['super_admin', 'pm'].includes(s.role)) redirect('/');
  const sb = db();
  const { data: pending } = await sb.from('leaves').select('*').eq('approver_id', s.uid).eq('status', 'Pending').order('requested_at');
  const { data: users } = await sb.from('users').select('id,full_name');
  const uName = (id: string) => (users || []).find(u => u.id === id)?.full_name || '—';
  const { data: history } = await sb.from('leaves').select('*').eq('approver_id', s.uid).neq('status', 'Pending').order('decided_at', { ascending: false }).limit(20);

  return (
    <div>
      <h1>Leave Approvals</h1>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Pending ({(pending||[]).length})</h3>
        <table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Action</th></tr></thead><tbody>
          {(pending||[]).map(l => (
            <tr key={l.id}>
              <td>{uName(l.user_id)}</td><td>{l.type}</td><td className="small">{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td><td>{l.days}</td>
              <td className="small">{l.reason||'—'}</td>
              <td><Modal label="Decide" title={`${uName(l.user_id)} · ${l.type} (${l.days}d)`}>
                <form action={decideLeave}>
                  <input type="hidden" name="id" value={l.id} />
                  <div className="field"><label>Comment</label><input name="comment" placeholder="Optional" /></div>
                  <label className="small"><input type="checkbox" name="override" style={{width:'auto'}} /> Admin override (bypass balance)</label>
                  <div className="row" style={{ marginTop: '.7rem' }}>
                    <button className="btn green" name="decision" value="Approved">Approve</button>
                    <button className="btn red" name="decision" value="Rejected">Reject</button>
                  </div>
                </form>
              </Modal></td>
            </tr>
          ))}
          {(pending||[]).length === 0 && <tr><td colSpan={6}><div className="empty">No pending requests.</div></td></tr>}
        </tbody></table>
      </div>
      <div className="card">
        <h3>Recent Decisions</h3>
        <table><thead><tr><th>Employee</th><th>Type</th><th>Days</th><th>Status</th></tr></thead><tbody>
          {(history||[]).map(l => <tr key={l.id}><td>{uName(l.user_id)}</td><td>{l.type}</td><td>{l.days}</td><td><StatusBadge s={l.status} /></td></tr>)}
          {(history||[]).length === 0 && <tr><td colSpan={4}><div className="empty">No history.</div></td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
