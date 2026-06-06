'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function createCompany(fd:FormData){
  const s=await getSession();if(!s)return;
  const row={name:String(fd.get('name')||'').trim(),industry:String(fd.get('industry')||''),website:String(fd.get('website')||''),phone:String(fd.get('phone')||''),notes:String(fd.get('notes')||''),owner_id:s.uid};
  if(!row.name)return;
  await db().from('crm_companies').insert(row);
  await audit({user_id:s.uid,username:s.username,action:'CREATE',entity_type:'company',new_value:{name:row.name}});
  revalidatePath('/crm/companies');revalidatePath('/crm');
}
export async function createContact(fd:FormData){
  const s=await getSession();if(!s)return;
  const row={full_name:String(fd.get('full_name')||'').trim(),email:String(fd.get('email')||''),phone:String(fd.get('phone')||''),title:String(fd.get('title')||''),company_id:fd.get('company_id')||null,status:String(fd.get('status')||'Lead'),notes:String(fd.get('notes')||''),owner_id:s.uid};
  if(!row.full_name)return;
  await db().from('crm_contacts').insert(row);
  await audit({user_id:s.uid,username:s.username,action:'CREATE',entity_type:'contact',new_value:{name:row.full_name}});
  revalidatePath('/crm');
}
export async function createDeal(fd:FormData){
  const s=await getSession();if(!s)return;
  const row={title:String(fd.get('title')||'').trim(),company_id:fd.get('company_id')||null,contact_id:fd.get('contact_id')||null,value:Number(fd.get('value')||0),stage:String(fd.get('stage')||'Lead'),expected_close:fd.get('expected_close')||null,owner_id:s.uid};
  if(!row.title)return;
  await db().from('crm_deals').insert(row);
  await audit({user_id:s.uid,username:s.username,action:'CREATE',entity_type:'deal',new_value:{title:row.title,value:row.value}});
  revalidatePath('/crm/deals');
}
export async function updateDealStage(fd:FormData){
  const s=await getSession();if(!s)return;
  const id=String(fd.get('id'));const stage=String(fd.get('stage'));
  await db().from('crm_deals').update({stage,updated_at:new Date().toISOString()}).eq('id',id);
  await audit({user_id:s.uid,username:s.username,action:'STATUS_CHANGE',entity_type:'deal',entity_id:id,new_value:{stage}});
  revalidatePath('/crm/deals');
}
