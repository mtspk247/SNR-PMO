import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel, can } from '@/lib/authz';
import { hasFeature, roleAllowsFeature } from '@/lib/entitlements';
import { FeatureKey } from '@/lib/supabase';
import { Icon, Avatar, Spinner } from '@/components/ui';
import NotificationBell from '@/components/NotificationBell';
import { applyBranding } from '@/lib/branding';
import { getTheme, toggleTheme, Theme } from '@/lib/theme';

// `feature` gates the item behind the active org's plan entitlement (3.3).
// Items without a feature are core and always shown.
type Item = { href: string; label: string; icon: string; feature?: FeatureKey };
const GROUPS: { heading: string; items: Item[] }[] = [
  { heading: 'Workspace', items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
    { href: '/companies', label: 'Companies', icon: 'ti-building' },
    { href: '/portfolios', label: 'Portfolios', icon: 'ti-stack-2', feature: 'portfolios' },
    { href: '/projects', label: 'Projects', icon: 'ti-folder' },
    { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox' },
  ]},
  { heading: 'Tracking', items: [
    { href: '/risk', label: 'Risk Analysis', icon: 'ti-alert-triangle', feature: 'risk' },
    { href: '/financial', label: 'Financial Data', icon: 'ti-currency-dollar', feature: 'financial' },
  ]},
  { heading: 'Relations', items: [
    { href: '/crm', label: 'CRM', icon: 'ti-users', feature: 'crm' },
  ]},
  { heading: 'People', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'ti-user-plus', feature: 'hr' },
    { href: '/employees', label: 'Employees', icon: 'ti-id-badge', feature: 'hr' },
    { href: '/attendance', label: 'Attendance', icon: 'ti-clock' },
    { href: '/leave', label: 'Leave', icon: 'ti-beach' },
  ]},
];
const ADMIN_GROUP: { heading: string; items: Item[] } = { heading: 'Admin', items: [
  { href: '/users', label: 'Users', icon: 'ti-user-shield' },
  { href: '/roles', label: 'Roles', icon: 'ti-shield-lock' },
  { href: '/payroll', label: 'Payroll', icon: 'ti-cash', feature: 'hr' },
  { href: '/integrations', label: 'Integrations', icon: 'ti-plug', feature: 'integrations' },
  { href: '/audit', label: 'Audit log', icon: 'ti-history', feature: 'audit' },
  { href: '/settings', label: 'Settings', icon: 'ti-settings' },
]};
// Super-super-admin (cross-tenant) — gated by platformAdmin, not a plan feature.
const PLATFORM_GROUP: { heading: string; items: Item[] } = { heading: 'Platform', items: [
  { href: '/platform', label: 'Tenants & Plans', icon: 'ti-building-skyscraper' },
]};

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setTheme(getTheme()); }, []);
  return (
    <button onClick={() => setTheme(toggleTheme())} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="h-9 w-9 grid place-items-center rounded-md border border-line text-muted hover:text-content hover:bg-surface2 transition">
      <Icon name={theme === 'dark' ? 'ti-sun' : 'ti-moon'} className="text-base" />
    </button>
  );
}

export default function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, orgs, platformAdmin, sidebarCollapsed, toggleSidebar, setActiveOrg, clear } = useAuthStore();
  const activeOrg = useActiveOrg();
  // Compose nav: admin group for org admins, platform group for platform admins,
  // then drop any item the active org's plan doesn't entitle (and empty groups).
  const groups = [
    ...GROUPS,
    ...(can.manageMembers(activeOrg) ? [ADMIN_GROUP] : []),
    ...(platformAdmin ? [PLATFORM_GROUP] : []),
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => hasFeature(activeOrg, i.feature) && roleAllowsFeature(user, i.feature)) }))
    .filter((g) => g.items.length > 0);
  const [checking, setChecking] = useState(true);
  const [orgMenu, setOrgMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);  // off-canvas drawer (< lg)
  const [isLg, setIsLg] = useState(true);                // collapse is a desktop-only concept

  // Re-apply branding when the active org changes (covers org switch + apex domain).
  useEffect(() => { applyBranding(activeOrg); }, [activeOrg?.id, JSON.stringify(activeOrg?.branding)]);

  // Track the lg breakpoint so the rail only collapses on desktop; mobile is always full-width.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsLg(mq.matches);
    sync(); mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Close the drawer whenever the route changes (mobile nav tap).
  useEffect(() => { setMobileOpen(false); }, [router.pathname]);

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

  if (checking) return <div className="h-screen bg-bg"><Spinner /></div>;

  const logout = async () => { await signOut(); clear(); router.replace('/login'); };
  const collapsed = isLg && sidebarCollapsed;   // never collapse the mobile drawer

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
    <div className="flex h-screen bg-bg text-content">
      {/* Mobile drawer backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden />}
      <aside className={`side shrink-0 flex flex-col z-40 fixed inset-y-0 left-0 w-60 transition-transform duration-200
        lg:static lg:z-auto lg:transition-[width] ${collapsed ? 'lg:w-16' : 'lg:w-60'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Brand + org switcher */}
        <div className="relative h-14 flex items-center gap-2.5 px-3 border-b border-line">
          {activeOrg?.branding?.logo_url
            ? <img src={activeOrg.branding.logo_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
            : <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-semibold shrink-0 text-accentfg"
                style={{ background: 'var(--brand-primary, #3ECF8E)' }}>
                {(activeOrg?.name || 'S').charAt(0).toUpperCase()}
              </span>}
          {!collapsed && (
            <button onClick={() => setOrgMenu((v) => !v)} className="flex-1 min-w-0 flex items-center gap-1 text-left side-fg">
              <span className="font-semibold truncate">{activeOrg?.name || 'SNR-PMO'}</span>
              {orgs.length > 1 && <Icon name="ti-selector" className="side-dim text-sm" />}
            </button>
          )}
          {!collapsed && orgMenu && orgs.length > 0 && (
            <div className="absolute left-2 right-2 top-14 z-20 bg-surface text-content rounded-md border border-line shadow-lg py-1">
              {orgs.map((o) => (
                <button key={o.id} onClick={() => { setActiveOrg(o.id); setOrgMenu(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface2 ${o.id === activeOrg?.id ? 'font-medium' : ''}`}>
                  <span className="truncate">{o.name}</span>
                  <span className="text-2xs text-muted2">{roleLabel(o.member_role)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.heading} className="pt-2">
              {!collapsed && <p className="px-2.5 pb-1 text-2xs uppercase tracking-wider side-faint">{g.heading}</p>}
              {collapsed && <div className="mx-2 my-2 h-px side-divider" />}
              {g.items.map((i) => <NavLink key={i.href} {...i} />)}
            </div>
          ))}
        </nav>

        {/* Collapse toggle + user */}
        <button onClick={toggleSidebar} className="sb-item mx-2 mb-1 hidden lg:flex">
          <Icon name={collapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'} className="text-base" />
          {!collapsed && <span>Collapse</span>}
        </button>
        <div className="p-2 border-t border-line">
          <div className={`flex items-center gap-2.5 px-1 ${collapsed ? 'justify-center' : ''}`}>
            <Avatar name={user?.full_name || 'U'} size={32} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate side-fg">{user?.full_name}</p>
                <p className="text-2xs side-dim truncate">{roleLabel(activeOrg?.member_role)}</p>
              </div>
            )}
            <button onClick={logout} title="Sign out" className="p-1.5 rounded-md side-dim hover:text-content hover:bg-surface2">
              <Icon name="ti-logout" className="text-base" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-surface/80 backdrop-blur flex items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
              className="lg:hidden h-9 w-9 -ml-1.5 grid place-items-center rounded-md text-muted hover:text-content hover:bg-surface2 transition">
              <Icon name="ti-menu-2" className="text-lg" />
            </button>
            <h2 className="font-medium truncate">{title}</h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-md border border-line text-sm text-muted2">
              <Icon name="ti-search" />Search
            </div>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
