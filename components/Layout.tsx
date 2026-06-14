import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut, recordGuestActivity } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel, can } from '@/lib/authz';
import { hasFeature, roleAllowsFeature } from '@/lib/entitlements';
import { FeatureKey } from '@/lib/supabase';
import { Icon, Avatar, Spinner } from '@/components/ui';
import NotificationBell from '@/components/NotificationBell';
import RequestsBell from '@/components/RequestsBell';
import GlobalSearch from '@/components/GlobalSearch';
import ChatPanel from '@/components/ChatPanel';
import { TimerChip } from '@/components/TimeTracking';
import RunningTimers from '@/components/RunningTimers';
import Breadcrumbs, { Crumb } from '@/components/Breadcrumbs';
import { applyBranding } from '@/lib/branding';
import { getTheme, toggleTheme, Theme } from '@/lib/theme';

// `feature` gates the item behind the active org's plan entitlement (3.3).
// Items without a feature are core and always shown.
type Item = { href: string; label: string; icon: string; feature?: FeatureKey; adminOnly?: boolean };
type Section =
  | { kind: 'link'; item: Item }
  | { kind: 'menu'; key: string; label: string; icon: string; items: Item[] };

const SECTIONS: Section[] = [
  { kind: 'link', item: { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' } },
  { kind: 'menu', key: 'work', label: 'Work', icon: 'ti-briefcase', items: [
    { href: '/companies', label: 'Companies', icon: 'ti-building' },
    { href: '/portfolios', label: 'Portfolios', icon: 'ti-stack-2', feature: 'portfolios' },
    { href: '/projects', label: 'Projects', icon: 'ti-folder' },
    { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox' },
    { href: '/ideas', label: 'Ideas', icon: 'ti-bulb' },
    { href: '/roadmap', label: 'Roadmap', icon: 'ti-timeline' },
    { href: '/chat', label: 'Chat', icon: 'ti-messages' },
  ]},
  { kind: 'menu', key: 'people', label: 'People', icon: 'ti-users', items: [
    { href: '/teams', label: 'Teams', icon: 'ti-users-group' },
    { href: '/workload', label: 'Workload', icon: 'ti-chart-bar' },
    { href: '/calendar', label: 'Calendar', icon: 'ti-calendar' },
    { href: '/guests', label: 'Guests', icon: 'ti-user-question', adminOnly: true },
  ]},
  { kind: 'menu', key: 'tracking', label: 'Accounting', icon: 'ti-report-money', items: [
    { href: '/risk', label: 'Risk Analysis', icon: 'ti-alert-triangle', feature: 'risk' },
    { href: '/financial', label: 'Financial Data', icon: 'ti-currency-dollar', feature: 'financial' },
    { href: '/accounting', label: 'Ledger', icon: 'ti-report-money', feature: 'financial' },
  ]},
  { kind: 'menu', key: 'crm', label: 'CRM', icon: 'ti-users', items: [
    { href: '/crm', label: 'Sales Pipeline', icon: 'ti-target-arrow', feature: 'crm' },
  ]},
  { kind: 'menu', key: 'hr', label: 'HR', icon: 'ti-heart-handshake', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'ti-user-plus', feature: 'hr' },
    { href: '/employees', label: 'Employees', icon: 'ti-id-badge', feature: 'hr' },
    { href: '/training', label: 'Training & JDs', icon: 'ti-school', feature: 'hr' },
    { href: '/payroll', label: 'Payroll', icon: 'ti-cash', feature: 'hr' },
    { href: '/attendance', label: 'Attendance', icon: 'ti-clock' },
    { href: '/leave', label: 'Leave', icon: 'ti-beach' },
  ]},
  { kind: 'link', item: { href: '/drives', label: 'Drives', icon: 'ti-cloud', feature: 'drives' } },
  { kind: 'link', item: { href: '/docs', label: 'Docs', icon: 'ti-book-2' } },
];
const ADMIN_SECTION: Section = { kind: 'menu', key: 'admin', label: 'Administration', icon: 'ti-shield-cog', items: [
  { href: '/users', label: 'Users', icon: 'ti-user-shield' },
  { href: '/roles', label: 'Roles', icon: 'ti-shield-lock' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'ti-bell-cog' },
  { href: '/integrations', label: 'Integrations', icon: 'ti-plug', feature: 'integrations' },
  { href: '/audit', label: 'Audit log', icon: 'ti-history', feature: 'audit' },
  { href: '/settings', label: 'Settings', icon: 'ti-settings' },
]};
// Super-super-admin (cross-tenant) — gated by platformAdmin, not a plan feature.
const PLATFORM_SECTION: Section = { kind: 'link', item: { href: '/platform', label: 'Platform', icon: 'ti-building-skyscraper' } };

// Flat label lookup for route-derived breadcrumbs.
const ROUTE_LABELS: Record<string, string> = {};
for (const s of [...SECTIONS, ADMIN_SECTION, PLATFORM_SECTION]) {
  if (s.kind === 'link') ROUTE_LABELS[s.item.href] = s.item.label;
  else for (const i of s.items) ROUTE_LABELS[i.href] = i.label;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setTheme(getTheme()); }, []);
  return (
    <button onClick={() => setTheme(toggleTheme())} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
      <Icon name={theme === 'dark' ? 'ti-sun' : 'ti-moon'} className="text-base" />
    </button>
  );
}

export default function Layout({ title, children, flat = false }: { title: string; children: React.ReactNode; flat?: boolean }) {
  const router = useRouter();
  const { user, orgs, platformAdmin, sidebarCollapsed, toggleSidebar, setActiveOrg, clear } = useAuthStore();
  const activeOrg = useActiveOrg();

  const isActive = (href: string) => router.pathname === href || router.pathname.startsWith(href + '/');

  // Compose nav: admin section for org admins, platform link for platform admins,
  // then drop any item the active org's plan doesn't entitle (and empty menus).
  // W6: guests only see project-scoped surfaces
  const isGuest = activeOrg?.member_role === 'guest';
  const GUEST_HREFS = ['/', '/projects', '/tasks', '/chat', '/calendar', '/docs'];
  const guestOk = (href: string) => !isGuest || GUEST_HREFS.includes(href);
  const sections = [
    ...SECTIONS,
    ...(can.manageMembers(activeOrg) ? [ADMIN_SECTION] : []),
    ...(platformAdmin ? [PLATFORM_SECTION] : []),
  ]
    .map((s) => s.kind === 'menu'
      ? { ...s, items: s.items.filter((i) => hasFeature(activeOrg, i.feature) && roleAllowsFeature(user, i.feature) && guestOk(i.href) && (!i.adminOnly || can.manageMembers(activeOrg))) }
      : s)
    .filter((s) => s.kind === 'link'
      ? hasFeature(activeOrg, s.item.feature) && roleAllowsFeature(user, s.item.feature) && guestOk(s.item.href)
      : s.items.length > 0);

  const [checking, setChecking] = useState(true);
  const [orgMenu, setOrgMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);  // off-canvas drawer (< lg)
  const [chatOpen, setChatOpen] = useState(false);       // S5 slide-in chat panel
  const [isLg, setIsLg] = useState(true);                // collapse is a desktop-only concept

  // Accordion: only the menu containing the current page stays expanded.
  // Manual toggles live until the next route change re-syncs to the active menu.
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const active = sections.find((s) => s.kind === 'menu' && s.items.some((i) => isActive(i.href)));
    setOpenMenus(active && active.kind === 'menu' ? { [active.key]: true } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname, sections.length]);

  // Re-apply branding when the active org changes (covers org switch + apex domain).
  useEffect(() => { applyBranding(activeOrg); }, [activeOrg?.id, JSON.stringify(activeOrg?.branding)]);

  // Lightweight guest check-in (once per browser session per org).
  useEffect(() => {
    if (activeOrg?.member_role === 'guest' && user?.id && activeOrg?.id) {
      try { const k = 'g_checkin_' + activeOrg.id; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); recordGuestActivity(activeOrg.id, user.id, null, 'checkin', 'Signed in'); } } catch { /* ignore */ }
    }
  }, [activeOrg?.id, user?.id, activeOrg?.member_role]);

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

  // Route-derived breadcrumb default; dynamic pages override via useSetCrumbs.
  const parts = router.pathname.split('/').filter(Boolean);
  const rootHref = '/' + (parts[0] || '');
  const rootLabel = ROUTE_LABELS[rootHref];
  const defaultCrumbs: Crumb[] = parts.length > 1 && rootLabel
    ? [{ label: rootLabel, href: rootHref }, { label: title }]
    : [{ label: title }];

  const NavLink = ({ href, label, icon, sub = false }: Item & { sub?: boolean }) => {
    const active = isActive(href);
    return (
      <Link href={href} title={collapsed ? label : undefined}
        className={`sb-item ${active ? 'sb-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''} ${sub && !collapsed ? 'py-1.5' : ''}`}>
        <Icon name={icon} className={`shrink-0 ${sub && !collapsed ? 'text-sm' : 'text-base'}`} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  const Menu = ({ section: s }: { section: Extract<Section, { kind: 'menu' }> }) => {
    const open = !!openMenus[s.key];
    const containsActive = s.items.some((i) => isActive(i.href));
    return (
      <div>
        <button onClick={() => setOpenMenus((p) => ({ ...p, [s.key]: !p[s.key] }))}
          className={`sb-item w-full ${containsActive && !open ? 'sb-item-active' : ''}`}>
          <Icon name={s.icon} className="text-base shrink-0" />
          <span className="flex-1 text-left truncate font-medium">{s.label}</span>
          <Icon name="ti-chevron-down" className={`text-xs text-muted2 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {open && (
          <div className="ml-[1.05rem] pl-2 border-l border-line space-y-0.5 mt-0.5">
            {s.items.map((i) => <NavLink key={i.href} {...i} sub />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-bg text-content">
      {/* Mobile drawer backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden />}
      <aside className={`side shrink-0 flex flex-col z-40 fixed inset-y-0 left-0 w-60 transition-transform duration-200
        lg:relative lg:z-auto lg:transition-[width] ${collapsed ? 'lg:w-16' : 'lg:w-60'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Edge collapse toggle — sits on the sidebar's right border (desktop only). */}
        <button onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:grid absolute -right-3 top-[4.5rem] z-50 h-6 w-6 place-items-center rounded-full
            border border-line bg-surface shadow-sm text-muted hover:text-content hover:border-accent/60 transition">
          <Icon name={collapsed ? 'ti-chevron-right' : 'ti-chevron-left'} className="text-xs" />
        </button>

        {/* Brand + org switcher */}
        <div className="relative h-14 shrink-0 flex items-center gap-2.5 px-3 border-b border-line">
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

        {/* Categorized nav: top-level links + accordion menus (flat icon rail when collapsed) */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {sections.map((s, idx) => {
            if (collapsed) {
              // Collapsed: every leaf as an icon, thin divider between sections.
              const items = s.kind === 'link' ? [s.item] : s.items;
              return (
                <div key={s.kind === 'link' ? s.item.href : s.key}>
                  {idx > 0 && <div className="mx-2 my-2 h-px side-divider" />}
                  {items.map((i) => <NavLink key={i.href} {...i} />)}
                </div>
              );
            }
            return s.kind === 'link'
              ? <NavLink key={s.item.href} {...s.item} />
              : <Menu key={s.key} section={s} />;
          })}
        </nav>

        {/* User */}
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
            <Breadcrumbs fallback={defaultCrumbs} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <GlobalSearch />
            <TimerChip />
            <RunningTimers />
            <button onClick={() => setChatOpen(true)} title="Chat"
              className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
              <Icon name="ti-messages" className="text-base" />
            </button>
            <ThemeToggle />
            <RequestsBell />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6"><div className={`mx-auto w-full max-w-[1400px]${flat ? ' flat-surfaces' : ''}`}>{children}</div></main>
      </div>
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}
