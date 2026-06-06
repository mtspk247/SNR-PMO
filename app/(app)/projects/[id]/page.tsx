import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate, fmtDateTime, initials } from '@/lib/util';
import { updateProject, deleteProject } from '@/app/actions/projects';
import { createTask } from '@/app/actions/tasks';
import { Modal, StatusBadge } from '../../ui';
import { CommentBox } from '../../comments';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const sb = db();
  const { data: p } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const [{ data: tasks }, { data: users }, { data: comments }] = await Promise.all([
    sb.from('tasks').select('*').eq('project_id', id).is('parent_task_id', null).order('created_at'),
    sb.from('users').select('id,full_name').eq('status', 'active'),
    sb.from('comments').select('*').eq('entity_type', 'project').eq('entity_id', id).eq('deleted', false).order('created_at', { ascending: false }),
  ]);
  const uname = (uid: string) => (users || []).find(u => u.id === uid)?.full_name || 'Unknown';
  const canEdit = s.role === 'super_admin' || p.pm_id === s.uid;

  return (
    <div>
      <div className="page-head">
        <div><Link href="/projects" className="small muted">← Projects</Link><h1 style={{ margin: '.2rem 0' }}>{p.name}</h1>
          <div className="row"><StatusBadge s={p.status} /><StatusBadge s={p.priority} /><span className="small muted">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</span></div>
        </div>
        <div className="row">
          {canEdit && <Modal label="Edit" title="Edit Project" variant="alt">
            <form action={updateProject}>
              <input type="hidden" name="id" value={p.id} />
              <div className="field"><label>Name</label><input name="name" defaultValue={p.name} /></div>
              <div className="field"><label>Description</label><textarea name="description" defaultValue={p.description} rows={2} /></div>
              <div className="row">
                <div className="field"><label>Status</label><select name="status" defaultValue={p.status}>{['Planning','Active','On Hold','Completed','Cancelled'].map(x=><option key={x}>{x}</option>)}</select></div>
                <div className="field"><label>Priority</label><select name="priority" defaultValue={p.priority}>{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></div>
              </div>
              <div className="row">
                <div className="field"><label>Start</label><input type="date" name="start_date" defaultValue={p.start_date||''} /></div>
                <div className="field"><label>End</label><input type="date" name="end_date" defaultValue={p.end_date||''} /></div>
              </div>
              <div className="field"><label>PM</label><select name="pm_id" defaultValue={p.pm_id||''}>{(users||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
              <button className="btn">Save</button>
            </form>
          </Modal>}
          {s.role === 'super_admin' && <form action={deleteProject}><input type="hidden" name="id" value={p.id} /><button className="btn red">Delete</button></form>}
        </div>
      </div>

      {p.description && <div className="card" style={{ marginBottom: '1rem' }}>{p.description}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div className="page-head"><h3 style={{ margin: 0 }}>Tasks ({(tasks||[]).length})</h3>
            {p.status === 'Active' && <Modal label="+ Task" title="New Task">
              <form action={createTask}>
                <input type="hidden" name="project_id" value={p.id} />
                <div className="field"><label>Name</label><input name="name" required /></div>
                <div className="field"><label>Description</label><textarea name="description" rows={2} /></div>
                <div className="row">
                  <div className="field"><label>Status</label><select name="status">{['Backlog','To Do','In Progress','Review','Done','On Hold'].map(x=><option key={x}>{x}</option>)}</select></div>
                  <div className="field"><label>Priority</label><select name="priority" defaultValue="Medium">{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></div>
                </div>
                <div className="row">
                  <div className="field"><label>Assignee</label><select name="assignee_id"><option value="">—</option>{(users||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  <div className="field"><label>Due</label><input type="date" name="due_date" /></div>
                </div>
                <div className="field"><label>Estimated Hours</label><input type="number" step="0.5" name="estimated_hours" defaultValue={0} /></div>
                <button className="btn">Add Task</button>
              </form>
            </Modal>}
          </div>
          <table><thead><tr><th>Task</th><th>Status</th><th>Assignee</th><th>Due</th></tr></thead><tbody>
            {(tasks||[]).map(t => (
              <tr key={t.id}><td><Link href={`/tasks/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link></td>
                <td><StatusBadge s={t.status} /></td><td className="small">{t.assignee_id ? uname(t.assignee_id) : '—'}</td>
                <td className="small">{fmtDate(t.due_date)}</td></tr>
            ))}
            {(tasks||[]).length === 0 && <tr><td colSpan={4}><div className="empty">{p.status==='Active'?'No tasks yet.':'Only Active projects accept tasks.'}</div></td></tr>}
          </tbody></table>
        </div>

        <div className="card">
          <h3>Discussion</h3>
          <CommentBox entityType="project" entityId={p.id} />
          <div style={{ marginTop: '.8rem' }}>
            {(comments||[]).map(c => (
              <div key={c.id} className="notif-item">
                <div className="avatar" style={{ width: 30, height: 30 }}>{initials(uname(c.author_id))}</div>
                <div><div className="small"><strong>{uname(c.author_id)}</strong> <span className="muted">{fmtDateTime(c.created_at)}</span></div><div>{c.body}</div></div>
              </div>
            ))}
            {(comments||[]).length === 0 && <div className="empty">No comments yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
