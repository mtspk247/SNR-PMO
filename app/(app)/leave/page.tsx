import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate } from '@/lib/util';
import { requestLeave, cancelLeave } from '@/app/actions/ops';
import { Modal, StatusBadge } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Leave() {
  const s = (await getSession())!;
  const sb = db();
  const [{ data: me }, { data: leaves }] = await Promise.all([
    sb.from('users').select('annual_balance,sick_balance,casual_balance').eq('id', s.uid).single(),
    sb.from('leaves').select('*').eq('user_id', s.uid).order('requested_at', { ascending: false }),
  ]);
  return (
    <div>
      <div className="page-head"><h1>My Leave</h1>
        <Modal label="+ Request Leave" title="Leave Request">
          <form action={requestLeave}>
            <div className="field"><label>Type</label><select name="type">{['Annual','Sick','Casual','Unpaid','Work From Home'].map(x=><option key={x}>{x}</option>)}</select></div>
            <div className="row">
              <div className="field"><label>Start</label><input type="date" name="start_date" required /></div>
              <div className="field"><label>End</label><input type="date" name="end_date" required /></div>
            </div>
            <div className="field"><label>Reason</label><textarea name="reason" rows={2} /></div>
            <button className="btn">Submit</button>
          </form>
        </Modal>
      </div>
      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <div className="card stat"><span className="num">{me?.annual_balance ?? 0}</span><span className="lbl">Annual Days</span></div>
        <div className="card stat"><span className="num">{me?.sick_balance ?? 0}</span><span className="lbl">Sick Days</span></div>
        <div className="card stat"><span className="num">{me?.casual_balance ?? 0}</span><span className="lbl">Casual Days</span></div>
      </div>
      <div className="card">
        <h3>My Requests</h3>
        <table><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead><tbody>
          {(leaves||[]).map(l => (
            <tr key={l.id}><td>{l.type}</td><td className="small">{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td><td>{l.days}</td>
              <td><StatusBadge s={l.status} />{l.decision_comment && <div className="small muted">{l.decision_comment}</div>}</td>
              <td>{l.status==='Pending' && <form action={cancelLeave}><input type="hidden" name="id" value={l.id} /><button className="btn gray" style={{padding:'.3rem .6rem'}}>Cancel</button></form>}</td></tr>
          ))}
          {(leaves||[]).length === 0 && <tr><td colSpan={5}><div className="empty">No leave requests.</div></td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
