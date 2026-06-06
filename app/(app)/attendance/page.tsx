import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate, fmtTime, todayISO } from '@/lib/util';
import { checkIn, checkOut } from '@/app/actions/ops';
import { ActionButton, StatusBadge } from '../ui';

export const dynamic = 'force-dynamic';

export default async function Attendance() {
  const s = (await getSession())!;
  const sb = db();
  const today = todayISO();
  const { data: todayRec } = await sb.from('attendance').select('*').eq('user_id', s.uid).eq('work_date', today).maybeSingle();
  const { data: history } = await sb.from('attendance').select('*').eq('user_id', s.uid).order('work_date', { ascending: false }).limit(30);
  const isOpen = todayRec && todayRec.status === 'OPEN';
  const isDone = todayRec && todayRec.status !== 'OPEN' && todayRec.check_out;

  return (
    <div>
      <h1>Attendance</h1>
      <div className="card" style={{ textAlign: 'center', padding: '2rem', marginBottom: '1rem' }}>
        <div className="muted" style={{ marginBottom: '.5rem' }}>{fmtDate(today)} · EST</div>
        {!todayRec && <ActionButton action={checkIn} label="● Check In" variant="green bigbtn" />}
        {isOpen && <div>
          <div className="b b-green" style={{ marginBottom: '1rem', fontSize: '.9rem' }}>Checked in at {fmtTime(todayRec.check_in)}</div><br/>
          <ActionButton action={checkOut} label="○ Check Out" variant="red bigbtn" />
        </div>}
        {isDone && <div className="b b-blue" style={{ fontSize: '.9rem' }}>Done for today · {todayRec.hours}h ({fmtTime(todayRec.check_in)} → {fmtTime(todayRec.check_out)})</div>}
      </div>

      <div className="card">
        <h3>History (30 days)</h3>
        <table><thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead><tbody>
          {(history||[]).map(a => (
            <tr key={a.id}><td>{fmtDate(a.work_date)}</td><td>{fmtTime(a.check_in)}</td><td>{a.check_out?fmtTime(a.check_out):'—'}</td>
              <td>{a.hours ?? '—'}</td><td>{a.status==='AUTO_CHECKOUT'?<span className="b b-amber">Auto</span>:<StatusBadge s={a.status==='OPEN'?'In Progress':'Done'} />}</td></tr>
          ))}
          {(history||[]).length === 0 && <tr><td colSpan={5}><div className="empty">No attendance records.</div></td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
