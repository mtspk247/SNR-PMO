'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { sec: 'Workspace', items: [
    { href: '/', label: 'Dashboard', icon: '▦' },
    { href: '/projects', label: 'Projects', icon: '▣' },
    { href: '/tasks', label: 'Tasks', icon: '✓' },
  ]},
  { sec: 'Operations', items: [
    { href: '/attendance', label: 'Attendance', icon: '◷' },
    { href: '/leave', label: 'Leave', icon: '✈' },
    { href: '/notifications', label: 'Notifications', icon: '🔔' },
  ]},
];
const ADMIN = [
  { href: '/users', label: 'Users', icon: '☷', roles: ['super_admin'] },
  { href: '/audit', label: 'Audit Log', icon: '◫', roles: ['super_admin'] },
  { href: '/settings', label: 'Settings', icon: '⚙', roles: ['super_admin'] },
];

export function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  const is = (h: string) => h === '/' ? path === '/' : path.startsWith(h);
  return (
    <aside className="sidebar">
      <div className="brand">SNR<span>-PMO</span></div>
      <nav className="nav">
        {NAV.map(g => (
          <div key={g.sec}>
            <div className="sec">{g.sec}</div>
            {g.items.map(i => (
              <Link key={i.href} href={i.href} className={is(i.href) ? 'active' : ''}>
                <span style={{width:18,display:'inline-block'}}>{i.icon}</span><span>{i.label}</span>
              </Link>
            ))}
          </div>
        ))}
        {role === 'super_admin' && (
          <div>
            <div className="sec">Admin</div>
            {ADMIN.map(i => (
              <Link key={i.href} href={i.href} className={is(i.href) ? 'active' : ''}>
                <span style={{width:18,display:'inline-block'}}>{i.icon}</span><span>{i.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

export function LogoutButton() {
  const r = useRouter();
  async function out() { await fetch('/api/auth/logout', { method: 'POST' }); r.push('/login'); r.refresh(); }
  return <button onClick={out} className="btn gray" style={{padding:'.35rem .7rem'}}>Logout</button>;
}
