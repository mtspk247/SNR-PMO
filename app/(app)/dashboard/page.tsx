import { getSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { fmtDate, fmtTime, todayISO, initials } from '@/lib/util';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function StatusBadge({ s }: { s: string }) {
  const map: any = { Done: 'b-green', Active: 'b-green', 'In Progress': 'b-amber', Review: 'b-blue', Planning: 'b-blue', 'On Hold': 'b-gray', Cancelled: 'b-gray', Backlog: 'b-gray', 'To Do': 'b-blue' };
  return <span className={`b ${map[s] || 'b-gray'}`}>{s}</span>;
}

export default async function Dashboard() {
  const s = (await getSession())!;
  const sb = db();
  const today = todayISO();
  const isLead = s.role === 'super_admin' || s.role === 'pm';

  const [{ data: activeProjects }, { data: myTasks }, { data: attendance }, { data: users }] = await Promise.all([
    sb.from('projects').select('id,name,status,progress,priority').eq('status', 'Active').order('created_at', { ascending: false }),
    sb.from('tasks').select('id,name,status,due_date,project_id').eq('assignee_id', s.uid).is('parent_task_id', null),
    sb.from('attendance').select('user_id,status,hours,check_in,check_out').eq('work_date', today),
    sb.from('users').select('id,full_name,role,department,reports_to,status').eq('status', 'active'),
  ]);

  const mine = myTasks || [];
  const overdue = mine.filter(t => t.due_date && t.due_date < today && t.status !== 'Done' && t.status !== 'Cancelled');
  const soon = mine.filter(t => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7) && t.status !== 'Done');
  const completedWeek = mine.filter(t => t.status === 'Done');
  const attMap = new Map((attendance || []).map(a => [a.user_id, a]));

  // team = direct reports for PM; all for admin; self for others
  const team = isLead ? (users || []).filter(u => s.role === 'super_admin' || u.reports_to === s.uid || u.id === s.uid) : (users || []).filter(u => u.id === s.uid);

  let pendingLeaves: any[] = [];
  if (isLead) {
    const { data } = await sb.from('leaves').select('id,user_id,type,days,start_date').eq('approver_id', s.uid).eq('status', 'Pending');
    pendingLeaves = data || [];
  }

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
        <div className="card stat"><span className="num">{(activeProjects || []).length}</span><span className="lbl">Active Projects</span></div>
        <div className="card stat"><span className="num" style={{ color: 'var(--red)' }}>{overdue.length}</span><span className="lbl">My Overdue Tasks</span></div>
        <div className="card stat"><span className="num" style={{ color: 'var(--amber)' }}>{soon.length}</span><span className="lbl">Due in 7 Days</span></div>
        <div className="card stat"><span className="num" style={{ color: 'var(--green)' }}>{completedWeek.length}</span><span className="lbl">Completed (mine)</span></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Active Projects</h3>
          {(activeProjects || []).length === 0 ? <div className="empty">No active projects.</div> :
            (activeProjects || []).map(p => (
              <div key={p.id} style={{ marginBottom: '.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Link href={`/projects/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                  <span className="small muted">{p.progress || 0}%</span>
                </div>
                <div className="progress"><div style={{ width: `${p.progress || 0}%` }} /></div>
              </div>
            ))}
        </div>

        <div className="card">
          <h3>My Overdue & Upcoming</h3>
          {[...overdue, ...soon].length === 0 ? <div className="empty">Nothing due. 🎉</div> :
            <table><tbody>
              {[...overdue, ...soon].slice(0, 8).map(t => (
                <tr key={t.id}><td><Link href={`/tasks/${t.id}`}>{t.name}</Link></td>
                  <td><StatusBadge s={t.status} /></td>
                  <td className={t.due_date! < today ? 'b b-red' : 'small muted'}>{fmtDate(t.due_date)}</td></tr>
              ))}
            </tbody></table>}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Who's {isLead ? 'Working' : 'Checked In'}</h3>
        <div className="grid cols-4">
          {team.map(u => {
            const a = attMap.get(u.id);
            const on = a && a.status === 'OPEN';
            const done = a && a.status !== 'OPEN' && a.check_out;
            return (
              <div key={u.id} className="card" style={{ padding: '.8rem' }}>
                <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
                  <div className="avatar">{initials(u.full_name)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                    <div className="small muted">{roleLabel(u.role)}</div>
                  </div>
                </div>
                <div style={{ marginTop: '.5rem' }}>
                  {on ? <span className="b b-green">● In ({fmtTime(a.check_in)})</span> :
                   done ? <span className="b b-blue">✓ {a.hours}h</span> :
                   <span className="b b-gray">○ Not in</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isLead && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Pending Leave Approvals</h3>
          {pendingLeaves.length === 0 ? <div className="empty">No pending approvals.</div> :
            <table><thead><tr><th>Type</th><th>Days</th><th>Start</th><th></th></tr></thead><tbody>
              {pendingLeaves.map(l => (
                <tr key={l.id}><td>{l.type}</td><td>{l.days}</td><td>{fmtDate(l.start_date)}</td>
                  <td><Link className="btn alt" href="/leave/approvals">Review</Link></td></tr>
              ))}
            </tbody></table>}
        </div>
      )}
    </div>
  );
}

function addDays(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function roleLabel(r: string) { return ({ super_admin: 'Super Admin', pm: 'Project Manager', team_member: 'Team Member', viewer: 'Viewer' } as any)[r] || r; }
