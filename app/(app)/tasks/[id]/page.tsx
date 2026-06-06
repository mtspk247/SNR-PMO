import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate, fmtDateTime, initials } from '@/lib/util';
import { updateTask, createTask, deleteTask } from '@/app/actions/tasks';
import { Modal, StatusBadge } from '../../ui';
import { StatusChanger } from '../../task-status';
import { CommentBox } from '../../comments';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const sb = db();
  const { data: t } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  if (!t) notFound();
  const [{ data: subs }, { data: users }, { data: comments }, { data: project }] = await Promise.all([
    sb.from('tasks').select('*').eq('parent_task_id', id).order('created_at'),
    sb.from('users').select('id,full_name').eq('status', 'active'),
    sb.from('comments').select('*').eq('entity_type', 'task').eq('entity_id', id).eq('deleted', false).order('created_at', { ascending: false }),
    t.project_id ? sb.from('projects').select('id,name').eq('id', t.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const uName = (uid: string) => (users || []).find(u => u.id === uid)?.full_name || '—';

  return (
    <div>
      <div className="page-head">
        <div>
          {project ? <Link href={`/projects/${project.id}`} className="small muted">← {project.name}</Link> : <Link href="/tasks" className="small muted">← Tasks</Link>}
          <h1 style={{ margin: '.2rem 0' }}>{t.name}</h1>
          <div className="row"><StatusBadge s={t.status} /><StatusBadge s={t.priority} /><span className="small muted">Due {fmtDate(t.due_date)}</span></div>
        </div>
        <div className="row">
          <Modal label="Edit" title="Edit Task" variant="alt">
            <form action={updateTask}>
              <input type="hidden" name="id" value={t.id} />
              <div className="field"><label>Name</label><input name="name" defaultValue={t.name} /></div>
              <div className="field"><label>Description</label><textarea name="description" defaultValue={t.description} rows={3} /></div>
              <div className="row">
                <div className="field"><label>Priority</label><select name="priority" defaultValue={t.priority}>{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></div>
                <div className="field"><label>Assignee</label><select name="assignee_id" defaultValue={t.assignee_id||''}><option value="">—</option>{(users||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
              </div>
              <div className="row">
                <div className="field"><label>Due</label><input type="date" name="due_date" defaultValue={t.due_date||''} /></div>
                <div className="field"><label>Est. Hours</label><input type="number" step="0.5" name="estimated_hours" defaultValue={t.estimated_hours} /></div>
                <div className="field"><label>Actual Hours</label><input type="number" step="0.5" name="actual_hours" defaultValue={t.actual_hours} /></div>
              </div>
              <button className="btn">Save</button>
            </form>
          </Modal>
          <form action={deleteTask}><input type="hidden" name="id" value={t.id} /><button className="btn red">Delete</button></form>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>Details</h3>
            <p>{t.description || <span className="muted">No description.</span>}</p>
            <table><tbody>
              <tr><td className="muted">Assignee</td><td>{t.assignee_id?uName(t.assignee_id):'—'}</td></tr>
              <tr><td className="muted">Status</td><td><StatusChanger id={t.id} current={t.status} /></td></tr>
              <tr><td className="muted">Estimated / Actual</td><td>{t.estimated_hours||0}h / {t.actual_hours||0}h</td></tr>
              <tr><td className="muted">Created</td><td>{fmtDateTime(t.created_at)}</td></tr>
            </tbody></table>
          </div>

          <div className="card">
            <div className="page-head"><h3 style={{ margin: 0 }}>Subtasks ({(subs||[]).length})</h3>
              <Modal label="+ Subtask" title="New Subtask">
                <form action={createTask}>
                  <input type="hidden" name="parent_task_id" value={t.id} />
                  <input type="hidden" name="project_id" value={t.project_id||''} />
                  <div className="field"><label>Name</label><input name="name" required /></div>
                  <div className="row">
                    <div className="field"><label>Status</label><select name="status">{['Backlog','To Do','In Progress','Review','Done'].map(x=><option key={x}>{x}</option>)}</select></div>
                    <div className="field"><label>Assignee</label><select name="assignee_id"><option value="">—</option>{(users||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  </div>
                  <button className="btn">Add</button>
                </form>
              </Modal>
            </div>
            <table><tbody>
              {(subs||[]).map(st => (
                <tr key={st.id}><td>{st.name}</td><td className="small">{st.assignee_id?uName(st.assignee_id):'—'}</td><td><StatusChanger id={st.id} current={st.status} /></td></tr>
              ))}
              {(subs||[]).length === 0 && <tr><td><div className="empty">No subtasks. Parent can be marked Done freely.</div></td></tr>}
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <h3>Discussion</h3>
          <CommentBox entityType="task" entityId={t.id} />
          <div style={{ marginTop: '.8rem' }}>
            {(comments||[]).map(c => (
              <div key={c.id} className="notif-item">
                <div className="avatar" style={{ width: 30, height: 30 }}>{initials(uName(c.author_id))}</div>
                <div><div className="small"><strong>{uName(c.author_id)}</strong> <span className="muted">{fmtDateTime(c.created_at)}</span></div><div>{c.body}</div></div>
              </div>
            ))}
            {(comments||[]).length === 0 && <div className="empty">No comments yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
