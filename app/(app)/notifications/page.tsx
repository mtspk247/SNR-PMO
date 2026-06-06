import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { fmtDateTime } from '@/lib/util';
import { markNotificationsRead } from '@/app/actions/ops';
import { ActionButton } from '../ui';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Notifications() {
  const s = (await getSession())!;
  const { data: notes } = await db().from('notifications').select('*').eq('user_id', s.uid).order('created_at', { ascending: false }).limit(100);
  return (
    <div>
      <div className="page-head"><h1>Notifications</h1><ActionButton action={markNotificationsRead} label="Mark all read" variant="alt" /></div>
      <div className="card" style={{ padding: 0 }}>
        {(notes||[]).map(n => {
          const body = (
            <div className={`notif-item ${n.is_read ? '' : 'unread'}`}>
              {!n.is_read && <div className="dot" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{n.urgent && <span className="b b-red" style={{ marginRight: '.4rem' }}>!</span>}{n.title}</div>
                {n.body && <div className="small muted">{n.body}</div>}
                <div className="small muted">{n.type} · {fmtDateTime(n.created_at)}</div>
              </div>
            </div>
          );
          return n.link ? <Link key={n.id} href={n.link}>{body}</Link> : <div key={n.id}>{body}</div>;
        })}
        {(notes||[]).length === 0 && <div className="empty">No notifications.</div>}
      </div>
    </div>
  );
}
