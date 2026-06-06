import { db } from '@/lib/supabase';
import { createDeal } from '@/app/actions/crm';
import { Modal } from '../../ui';
import { StageSelect } from '../stage';
export const dynamic='force-dynamic';
const STAGES=['Lead','Qualified','Proposal','Negotiation','Won','Lost'];
const fmt=(n:number)=>'$'+(n||0).toLocaleString();
export default async function Deals(){
  const sb=db();
  const [{data:deals},{data:companies},{data:contacts}]=await Promise.all([
    sb.from('crm_deals').select('*').order('created_at',{ascending:false}),
    sb.from('crm_companies').select('id,name'),
    sb.from('crm_contacts').select('id,full_name'),
  ]);
  const cName=(id:string)=>(companies||[]).find(c=>c.id===id)?.name||'';
  const open=(deals||[]).filter(d=>d.stage!=='Won'&&d.stage!=='Lost');
  const pipeline=open.reduce((a,d)=>a+Number(d.value||0),0);
  const won=(deals||[]).filter(d=>d.stage==='Won').reduce((a,d)=>a+Number(d.value||0),0);
  const form=(<form action={createDeal}>
    <div className="field"><label>Deal Title</label><input name="title" required/></div>
    <div className="row"><div className="field"><label>Value ($)</label><input name="value" type="number" defaultValue={0}/></div><div className="field"><label>Stage</label><select name="stage">{STAGES.map(x=><option key={x}>{x}</option>)}</select></div></div>
    <div className="row"><div className="field"><label>Company</label><select name="company_id"><option value="">—</option>{(companies||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Contact</label><select name="contact_id"><option value="">—</option>{(contacts||[]).map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div></div>
    <div className="field"><label>Expected Close</label><input type="date" name="expected_close"/></div>
    <button className="btn">Add Deal</button>
  </form>);
  return(<div>
    <div className="page-head"><div><h1>Deals Pipeline</h1><p className="muted small">{open.length} open · {fmt(pipeline)} in pipeline · {fmt(won)} won</p></div><Modal label="+ New Deal" title="New Deal">{form}</Modal></div>
    <div className="grid cols-3" style={{marginBottom:'1.2rem'}}>
      <div className="card stat tint-p"><span className="ic">📈</span><span className="num">{open.length}</span><span className="lbl">Open Deals</span></div>
      <div className="card stat tint-b"><span className="ic">💰</span><span className="num">{fmt(pipeline)}</span><span className="lbl">Pipeline Value</span></div>
      <div className="card stat tint-g"><span className="ic">🏆</span><span className="num">{fmt(won)}</span><span className="lbl">Won Revenue</span></div>
    </div>
    <div className="kanban">
      {STAGES.map(st=>{const list=(deals||[]).filter(d=>d.stage===st);const sum=list.reduce((a,d)=>a+Number(d.value||0),0);
       return(<div className="kcol" key={st}>
        <h4>{st} <span className="kcount">{list.length}</span></h4>
        <div className="small muted" style={{margin:'-.4rem .3rem .6rem'}}>{fmt(sum)}</div>
        {list.map(d=>(<div className="ktask" key={d.id}>
          <span className="t">{d.title}</span>
          <div className="small muted">{d.company_id?cName(d.company_id):'—'}</div>
          <div className="row" style={{justifyContent:'space-between',alignItems:'center',marginTop:'.4rem'}}>
            <span className="b b-green np" style={{fontWeight:700}}>{fmt(Number(d.value))}</span>
            <StageSelect id={d.id} current={d.stage}/>
          </div>
        </div>))}
       </div>);})}
    </div>
  </div>);
}
