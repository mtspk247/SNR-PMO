import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { initials } from '@/lib/util';
import { Sidebar, LogoutButton } from './nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { count } = await db().from('notifications')
    .select('id', { count: 'exact', head: true }).eq('user_id', s.uid).eq('is_read', false);
  return (
    <div className="shell">
      <Sidebar role={s.role} />
      <div className="main">
        <div className="topbar">
          <div className="pagetitle">Welcome, {s.full_name.split(' ')[0]}</div>
          <div className="right">
            <a href="/notifications" className="bell">🔔{count ? <span className="badge">{count}</span> : null}</a>
            <div className="avatar" title={s.full_name}>{initials(s.full_name)}</div>
            <LogoutButton />
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
