import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDateTime } from '@/lib/util';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; user?: string }> }) {
  const s = (await getSession())!;
  if (s.role !== 'super_admin') redirect('/');
  const sp = await searchParams;
  const sb = db();
  let q = sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(200);
  if (sp.action) q = q.eq('action', sp.action);
  if (sp.user) q = q.ilike('username', `%${sp.user}%`);
  const { data: logs } = await q;
  const actions = ['LOGIN','LOGOUT','CREATE','UPDATE','DELETE','STATUS_CHANGE','CHECK_IN','CHECK_OUT','LEAVE_APPLY','LEAVE_APPROVE'];

  return (
    <div>
      <h1>Audit Log</h1>
      <form className="card row" style={{ marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label>Action</label><select name="action" defaultValue={sp.action||''}><option value="">All</option>{actions.map(a=><option key={a}>{a}</option>)}</select></div>
        <div className="field" style={{ flex: 1 }}><label>User</label><input name="user" defaultValue={sp.user||''} placeholder="username" /></div>
        <button className="btn">Filter</button>
      </form>
      <div className="card">
        <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead><tbody>
          {(logs||[]).map(l => (
            <tr key={l.id}><td className="small">{fmtDateTime(l.ts)}</td><td className="small">{l.username||'—'}</td>
              <td><span className="b b-blue">{l.action}</span></td>
              <td className="small">{l.entity_type||'—'}</td>
              <td className="small muted" style={{ maxWidth: 280, overflow: 'hidden' }}>{l.new_value ? JSON.stringify(l.new_value).slice(0, 90) : '—'}</td>
              <td className="small muted">{l.ip||'—'}</td></tr>
          ))}
          {(logs||[]).length === 0 && <tr><td colSpan={6}><div className="empty">No log entries.</div></td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
