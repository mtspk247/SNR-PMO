import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate, todayISO } from '@/lib/util';
import { createTask } from '@/app/actions/tasks';
import { Modal, StatusBadge } from '../ui';
import { StatusChanger } from '../task-status';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
const COLS = ['Backlog','To Do','In Progress','Review','Done'];

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string; mine?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  const sb = db();
  const view = sp.view || 'board';
  const mine = sp.mine === '1';
  let q = sb.from('tasks').select('*').is('parent_task_id', null).order('created_at', { ascending: false });
  if (mine) q = q.eq('assignee_id', s.uid);
  const [{ data: tasks }, { data: projects }, { data: users }] = await Promise.all([
    q,
    sb.from('projects').select('id,name,status'),
    sb.from('users').select('id,full_name').eq('status', 'active'),
  ]);
  const today = todayISO();
  const pName = (id: string) => (projects || []).find(p => p.id === id)?.name || '—';
  const uName = (id: string) => (users || []).find(u => u.id === id)?.full_name || '—';
  const activeProjects = (projects || []).filter(p => p.status === 'Active');

  return (
    <div>
      <div className="page-head">
        <h1>Tasks</h1>
        <div className="row">
          <Link className={`btn ${view==='board'?'':'alt'}`} href="/tasks?view=board">Board</Link>
          <Link className={`btn ${view==='list'?'':'alt'}`} href="/tasks?view=list">List</Link>
          <Link className={`btn ${mine?'':'alt'}`} href={`/tasks?view=${view}&mine=1`}>My Tasks</Link>
          <Modal label="+ New Task" title="New Task">
            <form action={createTask}>
              <div className="field"><label>Project</label><select name="project_id" required>{activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="field"><label>Name</label><input name="name" required /></div>
              <div className="field"><label>Description</label><textarea name="description" rows={2} /></div>
              <div className="row">
                <div className="field"><label>Status</label><select name="status">{['Backlog','To Do','In Progress','Review','Done'].map(x=><option key={x}>{x}</option>)}</select></div>
                <div className="field"><label>Priority</label><select name="priority" defaultValue="Medium">{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></div>
              </div>
              <div className="row">
                <div className="field"><label>Assignee</label><select name="assignee_id"><option value="">—</option>{(users||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                <div className="field"><label>Due</label><input type="date" name="due_date" /></div>
              </div>
              <button className="btn">Create</button>
            </form>
          </Modal>
        </div>
      </div>

      {view === 'board' ? (
        <div className="kanban">
          {COLS.map(col => (
            <div className="kcol" key={col}>
              <h4>{col} ({(tasks||[]).filter(t=>t.status===col).length})</h4>
              {(tasks||[]).filter(t=>t.status===col).map(t => (
                <div className="ktask" key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="t">{t.name}</Link>
                  <div className="small muted" style={{ margin: '.25rem 0' }}>{pName(t.project_id)}</div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge s={t.priority} />
                    <span className={t.due_date && t.due_date < today && t.status!=='Done' ? 'b b-red' : 'small muted'}>{fmtDate(t.due_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead><tbody>
            {(tasks||[]).map(t => (
              <tr key={t.id}><td><Link href={`/tasks/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link></td>
                <td className="small">{pName(t.project_id)}</td><td className="small">{t.assignee_id?uName(t.assignee_id):'—'}</td>
                <td><StatusBadge s={t.priority} /></td>
                <td className={t.due_date && t.due_date < today && t.status!=='Done' ? 'b b-red' : 'small'}>{fmtDate(t.due_date)}</td>
                <td><StatusChanger id={t.id} current={t.status} /></td></tr>
            ))}
            {(tasks||[]).length === 0 && <tr><td colSpan={6}><div className="empty">No tasks.</div></td></tr>}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
