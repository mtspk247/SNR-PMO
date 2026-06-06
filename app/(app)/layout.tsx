import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { Shell } from './shell';

export default async function AppLayout({ children }:{children:React.ReactNode}) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { count } = await db().from('notifications').select('id',{count:'exact',head:true}).eq('user_id',s.uid).eq('is_read',false);
  return <Shell role={s.role} fullName={s.full_name} unread={count||0}>{children}</Shell>;
}
