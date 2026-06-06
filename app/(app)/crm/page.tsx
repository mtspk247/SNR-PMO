import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { createContact } from '@/app/actions/crm';
import { Modal, StatusBadge } from '../ui';
export const dynamic='force-dynamic';
export default async function Contacts(){
  const s=(await getSession())!;const sb=db();
  const [{data:contacts},{data:companies}]=await Promise.all([
    sb.from('crm_contacts').select('*').order('created_at',{ascending:false}),
    sb.from('crm_companies').select('id,name'),
  ]);
  const cName=(id:string)=>(companies||[]).find(c=>c.id===id)?.name||'—';
  const form=(<form action={createContact}>
    <div className="field"><label>Full Name</label><input name="full_name" required/></div>
    <div className="row"><div className="field"><label>Email</label><input name="email" type="email"/></div><div className="field"><label>Phone</label><input name="phone"/></div></div>
    <div className="row"><div className="field"><label>Title</label><input name="title"/></div><div className="field"><label>Status</label><select name="status">{['Lead','Active','Customer','Inactive'].map(x=><option key={x}>{x}</option>)}</select></div></div>
    <div className="field"><label>Company</label><select name="company_id"><option value="">—</option>{(companies||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <button className="btn">Add Contact</button>
  </form>);
  return(<div>
    <div className="page-head"><div><h1>Contacts</h1><p className="muted small">{(contacts||[]).length} people in your CRM</p></div><Modal label="+ New Contact" title="New Contact">{form}</Modal></div>
    <div className="card" style={{padding:0}}>
      <table><thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>
        {(contacts||[]).map(c=>(<tr key={c.id}><td style={{fontWeight:600}}>{c.full_name}</td><td className="small muted">{c.title||'—'}</td><td className="small">{c.company_id?cName(c.company_id):'—'}</td><td className="small">{c.email||'—'}</td><td className="small">{c.phone||'—'}</td><td><StatusBadge s={c.status}/></td></tr>))}
        {(contacts||[]).length===0&&<tr><td colSpan={6}><div className="empty">No contacts yet. Add your first one.</div></td></tr>}
      </tbody></table>
    </div>
  </div>);
}
