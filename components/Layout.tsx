import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel } from '@/lib/authz';
import { Icon, Avatar, Spinner } from '@/components/ui';

type Item = { href: string; label: string; icon: string };
const GROUPS: { heading: string; items: Item[] }[] = [
  { heading: 'Workspace', items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
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

export default function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, orgs, sidebarCollapsed, toggleSidebar, setActiveOrg, clear } = useAuthStore();
  const activeOrg = useActiveOrg();
  const [checking, setChecking] = useState(true);
  const [orgMenu, setOrgMenu] = useState(false);

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
         