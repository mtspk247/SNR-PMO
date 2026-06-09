import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel, can } from '@/lib/authz';
import { Icon, Avatar, Spinner } from '@/components/ui';
import NotificationBell from '@/components/NotificationBell';
import { applyBranding } from '@/lib/branding';

type Item = { href: string; label: string; icon: string };
const GROUPS: { heading: string; items: Item[] }[] = [
  { heading: 'Workspace', items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
    { href: '/companies', label: 'Companies', icon: 'ti-building' },
    { href: '/projects', label: 'Projects', icon: 'ti-folder' },
    { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox' },
  ]},
  { heading: 'Tracking', items: [
    { href: '/risk', label: 'Risk Analysis', icon: 'ti-alert-triangle' },
    { href: '/financial', label: 'Financial Data', icon: 'ti-currency-dollar' },
  ]},
  { heading: 'Relations', items: [
    { href: '/crm', label: 'CRM', icon: 'ti-users' },
  ]},
  { heading: 'Operations', items: [
    { href: '/attendance', label: 'Attendance', icon: 'ti-clock' },
    { href: '/leave', label: 'Leave', icon: 'ti-beach' },
  ]},
];
const ADMIN_GROUP: { heading: string; items: Item[] } = { heading: 'Admin', items: [
  { href: '/users', label: 'Users', icon: 'ti-user-shield' },
  { href: '/integrations', label: 'Integrations', icon: 'ti-plug' },
  { href: '/audit', label: 'Audit log', icon: 'ti-history' },
  { href: '/settings', label: 'Settings', icon: 'ti-settings' },
]};

export default function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, orgs, sidebarCollapsed, toggleSidebar, setActiveOrg, clear } = useAuthStore();
  const activeOrg = useActiveOrg();
  const groups = can.manageMembers(activeOrg) ? [...GROUPS, ADMIN_GROUP] : GROUPS;
  const [checking, setChecking] = useState(true);
  const [orgMenu, setOrgMenu] = useState(false);

  // Re-apply branding when the active org changes (covers org switch + apex domain).
  useEffect(() => { applyBranding(activeOrg); }, [activeOrg?.id, JSON.stringify(activeOrg?.branding)]);

  // Auth guard straight from the Supabase session (avoids store-timing flicker).
  useEffect(() => {
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) router.replace('/login');
      else setChecking(false);
    });
    return () => { active = false; };
  }, [router]);

  if (checking) return <div className="h-screen bg-paper"><Spinner /></div>;

  const logout = async () => { await signOut(); clear(); router.replace('/login'); };
  const collapsed = sidebarCollapsed;

  const NavLink = ({ href, label, icon }: Item) => {
    const active = router.pathname === href;
    return (
      <Link href={href} title={collapsed ? label : undefined}
        className={`sb-item ${active ? 'sb-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
        <Icon name={icon} className="text-base shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-paper text-ink">
      <aside className={`shrink-0 flex flex-col text-white transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}
        style={{ background: 'var(--brand-ink, #0E2233)' }}>
        {/* Brand + org switcher */}
        <div className="relative h-14 flex items-center gap-2.5 px-3 border-b border-white/10">
          {activeOrg?.branding?.logo_url
            ? <img src={activeOrg.branding.logo_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
            : <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-semibold shrink-0"
                style={{ background: 'var(--brand-primary, #2D7FF9)' }}>
                {(activeOrg?.name || 'S').charAt(0).toUpperCase()}
              </span>}
          {!collapsed && (
            <button onClick={() => setOrgMenu((v) => !v)} className="flex-1 min-w-0 flex items-center gap-1 text-left">
              <span className="font-semibold truncate">{activeOrg?.name || 'SNR-PMO'}</span>
              {orgs.length > 1 && <Icon name="ti-selector" className="text-white/50 text-sm" />}
            </button>
          )}
          {!collapsed && orgMenu && orgs.length > 0 && (
            <div className="absolute left-2 right-2 top-14 z-20 bg-white text-ink rounded-md border border-line shadow-lg py-1">
              {orgs.map((o) => (
                <button key={o.id} onClick={() => { setActiveOrg(o.id); setOrgMenu(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-paper ${o.id === activeOrg?.id ? 'font-medium' : ''}`}>
                  <span className="truncate">{o.name}</span>
                  <span className="text-2xs text-neutral-400">{roleLabel(o.member_role)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.heading} className="pt-2">
              {!collapsed && <p className="px-2.5 pb-1 text-2xs uppercase tracking-wider text-white/35">{g.heading}</p>}
              {collapsed && <div className="mx-2 my-2 h-px bg-white/10" />}
              {g.items.map((i) => <NavLink key={i.href} {...i} />)}
            </div>
          ))}
        </nav>

        {/* Collapse toggle + user */}
        <button onClick={toggleSidebar} className="sb-item mx-2 mb-1 text-white/60 hover:text-white">
          <Icon name={collapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} className="text-base" />
          {!collapsed && <span>Collapse</span>}
        </button>
        <div className="p-2 border-t border-white/10">
          <div className={`flex items-center gap-2.5 px-1 ${collapsed ? 'justify-center' : ''}`}>
            <Avatar name={user?.full_name || 'U'} size={32} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-2xs text-white/50 truncate">{roleLabel(activeOrg?.member_role)}</p>
              </div>
            )}
            <button onClick={logout} title="Sign out" className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10">
              <Icon name="ti-logout" className="text-base" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-white/80 backdrop-blur flex items-center justify-between px-6">
          <h2 className="font-medium">{title}</h2>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-md border border-line text-sm text-neutral-400">
              <Icon name="ti-search" />Search
            </div>
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
