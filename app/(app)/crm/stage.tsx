'use client';
import { useRouter } from 'next/navigation';
import { updateDealStage } from '@/app/actions/crm';
const STAGES=['Lead','Qualified','Proposal','Negotiation','Won','Lost'];
export function StageSelect({id,current}:{id:string;current:string}){
  const r=useRouter();
  async function ch(v:string){const fd=new FormData();fd.set('id',id);fd.set('stage',v);await updateDealStage(fd);r.refresh();}
  return <select defaultValue={current} onChange={e=>ch(e.target.value)} style={{width:'auto',padding:'.2rem .4rem',fontSize:'.75rem'}}>{STAGES.map(s=><option key={s}>{s}</option>)}</select>;
}
