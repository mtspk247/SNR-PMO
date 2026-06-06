import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDate } from '@/lib/util';
import { createProject } from '@/app/actions/projects';
import { Modal, StatusBadge } from '../ui';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Projects() {
  const s = (await getSession())!;
  const sb = db();
  const [{ data: projects }, { data: pms }] = await Promise.all([
    sb.from('projects').select('*').order('created_at', { ascending: false }),
    sb.from('users').select('id,full_name').eq('status', 'active'),
  ]);
  const pmName = (id: string) => (pms || []).find(u => u.id === id)?.full_name || '—';
  const canCreate = ['super_admin', 'pm'].includes(s.role);

  return (
    <div>
      <div className="page-head">
        <h1>Projects</h1>
        {canCreate && (
          <Modal label="+ New Project" title="Create Project">
            <form action={createProject}>
              <div className="field"><label>Name</label><input name="name" required /></div>
              <div className="field"><label>Description</label><textarea name="description" rows={2} /></div>
              <div className="row">
                <div className="field"><label>Status</label><select name="status" defaultValue="Planning">{['Planning','Active','On Hold','Completed','Cancelled'].map(x=><option key={x}>{x}</option>)}</select></div>
                <div className="field"><label>Priority</label><select name="priority" defaultValue="Medium">{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></div>
              </div>
              <div className="row">
                <div className="field"><label>Start</label><input type="date" name="start_date" /></div>
                <div className="field"><label>End</label><input type="date" name="end_date" /></div>
              </div>
              <div className="field"><label>Project Manager</label><select name="pm_id" defaultValue={s.uid}>{(pms||[]).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
              <button className="btn" type="submit">Create</button>
            </form>
          </Modal>
        )}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Project</th><th>Status</th><th>Priority</th><th>PM</th><th>Progress</th><th>Due</th></tr></thead>
          <tbody>
            {(projects || []).map(p => (
              <tr key={p.id}>
                <td><Link href={`/projects/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link></td>
                <td><StatusBadge s={p.status} /></td>
                <td><StatusBadge s={p.priority} /></td>
                <td className="small">{pmName(p.pm_id)}</td>
                <td style={{ width: 140 }}><div className="progress"><div style={{ width: `${p.progress || 0}%` }} /></div><span className="small muted">{p.progress || 0}%</span></td>
                <td className="small">{fmtDate(p.end_date)}</td>
              </tr>
            ))}
            {(projects || []).length === 0 && <tr><td colSpan={6}><div className="empty">No projects yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
