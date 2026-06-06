import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDateTime } from '@/lib/util';
import { createUser, updateUser } from '@/app/actions/admin';
import { Modal, StatusBadge } from '../ui';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
const ROLES = [['super_admin','Super Admin'],['pm','Project Manager'],['team_member','Team Member'],['viewer','Viewer']];

export default async function Users() {
  const s = (await getSession())!;
  if (s.role !== 'super_admin') redirect('/');
  const { data: users } = await db().from('users').select('*').order('created_at');
  const uName = (id: string) => (users || []).find(u => u.id === id)?.full_name || '—';
  const roleLabel = (r: string) => (ROLES.find(x => x[0] === r) || [r, r])[1];

  const userForm = (u?: any) => (
    <form action={u ? updateUser : createUser}>
      {u && <input type="hidden" name="id" value={u.id} />}
      {!u && <><div className="row">
        <div className="field"><label>Username</label><input name="username" required /></div>
        <div className="field"><label>Email</label><input name="email" type="email" required /></div>
      </div></>}
      <div className="field"><label>Full Name</label><input name="full_name" defaultValue={u?.full_name} required /></div>
      {u && <div className="field"><label>Email</label><input name="email" defaultValue={u.email} /></div>}
      <div className="row">
        <div className="field"><label>Role</label><select name="role" defaultValue={u?.role||'team_member'}>{ROLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Department</label><input name="department" defaultValue={u?.department} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Reports To</label><select name="reports_to" defaultValue={u?.reports_to||''}><option value="">—</option>{(users||[]).filter(x=>!u||x.id!==u.id).map(x=><option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div>
        {u && <div className="field"><label>Status</label><select name="status" defaultValue={u.status}><option value="active">Active</option><option value="suspended">Suspended</option></select></div>}
      </div>
      <div className="field"><label>{u?'Reset Password (blank = keep)':'Password'}</label><input name="password" placeholder={u?'leave blank':'Welcome@2026'} /></div>
      {u && <>
        <div className="row">
          <div className="field"><label>Annual</label><input type="number" name="annual_balance" defaultValue={u.annual_balance} /></div>
          <div className="field"><label>Sick</label><input type="number" name="sick_balance" defaultValue={u.sick_balance} /></div>
          <div className="field"><label>Casual</label><input type="number" name="casual_balance" defaultValue={u.casual_balance} /></div>
        </div>
        <label className="small" style={{ fontWeight: 600 }}>Custom Permissions</label>
        <div className="grid cols-2 small" style={{ gap: '.2rem', margin: '.3rem 0' }}>
          {[['can_view_all_projects','View all projects'],['can_edit_all_projects','Edit all projects'],['can_approve_leaves','Approve leaves'],['can_delete_tasks','Delete tasks'],['can_manage_users','Manage users'],['can_export_data','Export data']].map(([k,l])=>(
            <label key={k}><input type="checkbox" name={k} defaultChecked={u[k]} style={{width:'auto'}} /> {l}</label>
          ))}
        </div>
      </>}
      <button className="btn">{u?'Save':'Create User'}</button>
    </form>
  );

  return (
    <div>
      <div className="page-head"><h1>User Management</h1><Modal label="+ New User" title="Create User">{userForm()}</Modal></div>
      <div className="card">
        <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Dept</th><th>Reports To</th><th>Status</th><th>Last Login</th><th></th></tr></thead><tbody>
          {(users||[]).map(u => (
            <tr key={u.id}><td style={{fontWeight:600}}>{u.full_name}</td><td className="small">{u.username}</td><td>{roleLabel(u.role)}</td>
              <td className="small">{u.department||'—'}</td><td className="small">{u.reports_to?uName(u.reports_to):'—'}</td>
              <td><StatusBadge s={u.status==='active'?'Active':'On Hold'} /></td><td className="small muted">{u.last_login?fmtDateTime(u.last_login):'Never'}</td>
              <td><Modal label="Edit" title={`Edit ${u.full_name}`} variant="alt">{userForm(u)}</Modal></td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
