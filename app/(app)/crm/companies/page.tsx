import { db } from '@/lib/supabase';
import { createCompany } from '@/app/actions/crm';
import { Modal } from '../../ui';
export const dynamic='force-dynamic';
export default async function Companies(){
  const sb=db();
  const {data:companies}=await sb.from('crm_companies').select('*').order('created_at',{ascending:false});
  const {data:contacts}=await sb.from('crm_contacts').select('company_id');
  const count=(id:string)=>(contacts||[]).filter(c=>c.company_id===id).length;
  const form=(<form action={createCompany}>
    <div className="field"><label>Company Name</label><input name="name" required/></div>
    <div className="row"><div className="field"><label>Industry</label><input name="industry"/></div><div className="field"><label>Phone</label><input name="phone"/></div></div>
    <div className="field"><label>Website</label><input name="website" placeholder="https://"/></div>
    <div className="field"><label>Notes</label><textarea name="notes" rows={2}/></div>
    <button className="btn">Add Company</button>
  </form>);
  return(<div>
    <div className="page-head"><div><h1>Companies</h1><p className="muted small">{(companies||[]).length} organizations</p></div><Modal label="+ New Company" title="New Company">{form}</Modal></div>
    <div className="grid cols-3">
      {(companies||[]).map(c=>(<div className="card hover" key={c.id}>
        <div className="lp-ico tint-b" style={{width:42,height:42,marginBottom:'.7rem'}}>🏢</div>
        <h3 style={{marginBottom:'.2rem'}}>{c.name}</h3>
        <p className="muted small" style={{margin:0}}>{c.industry||'—'}</p>
        <div className="row" style={{marginTop:'.8rem',justifyContent:'space-between',alignItems:'center'}}>
          <span className="b b-purple np">{count(c.id)} contacts</span>
          {c.website&&<a href={c.website} target="_blank" className="small" style={{color:'var(--primary)'}}>Website ↗</a>}
        </div>
      </div>))}
      {(companies||[]).length===0&&<div className="card"><div className="empty">No companies yet.</div></div>}
    </div>
  </div>);
}
