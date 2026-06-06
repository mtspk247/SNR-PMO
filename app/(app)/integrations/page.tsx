import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { toggleIntegration } from '@/app/actions/integrations';
export const dynamic='force-dynamic';
export default async function Integrations(){
  const s=(await getSession())!;const isAdmin=s.role==='super_admin';
  const {data:items}=await db().from('integrations').select('*').order('name');
  const connected=(items||[]).filter(i=>i.status==='connected').length;
  return(<div>
    <div className="page-head"><div><h1>Integrations</h1><p className="muted small">{connected} of {(items||[]).length} connected · plug your business tools into Shahzad &amp; Rainer</p></div></div>
    {!isAdmin&&<div className="alert-error" style={{marginBottom:'1rem'}}>Only administrators can connect or disconnect integrations.</div>}
    <div className="grid cols-3">
      {(items||[]).map(i=>{const on=i.status==='connected';return(
        <div className="card hover" key={i.id} style={{display:'flex',flexDirection:'column',gap:'.7rem'}}>
          <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
            <div className="lp-ico tint-p" style={{width:46,height:46,margin:0}}>{i.icon}</div>
            <span className={`b ${on?'b-green':'b-gray'}`}>{on?'Connected':'Not connected'}</span>
          </div>
          <div><h3 style={{marginBottom:'.15rem'}}>{i.name}</h3><span className="b b-blue np small">{i.category}</span></div>
          <p className="muted small" style={{margin:0,flex:1}}>{i.description}</p>
          {isAdmin&&<form action={toggleIntegration}>
            <input type="hidden" name="id" value={i.id}/><input type="hidden" name="connect" value={on?'0':'1'}/>
            <button className={`btn ${on?'alt':''}`} style={{width:'100%'}}>{on?'Disconnect':'Connect'}</button>
          </form>}
        </div>);})}
    </div>
  </div>);
}
