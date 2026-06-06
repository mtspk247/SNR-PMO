'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function toggleIntegration(fd:FormData){
  const s=await getSession();if(!s||s.role!=='super_admin')return {error:'Admin only'};
  const id=String(fd.get('id'));const connect=String(fd.get('connect'))==='1';
  await db().from('integrations').update({status:connect?'connected':'disconnected',connected_by:connect?s.uid:null,connected_at:connect?new Date().toISOString():null}).eq('id',id);
  await audit({user_id:s.uid,username:s.username,action:'UPDATE',entity_type:'integration',entity_id:id,new_value:{status:connect?'connected':'disconnected'}});
  revalidatePath('/integrations');
}
