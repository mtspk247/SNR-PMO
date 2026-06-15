import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut, recordGuestActivity } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel, can } from '@/lib/authz';
import { hasFeature, roleAllowsFeature, navVisible, isUpsellLocked } from '@/lib/entitlements';
import { NavItem as Item, NavSection as Section, SECTIONS, ADMIN_SECTION, PLATFORM_SECTION, ROUTE_LABELS, featureForRoute } from '@/lib/nav';
import { Icon, Avatar, Spinner } from '@/components/ui';
import NotificationBell from '@/components/NotificationBell';
import RequestsBell from '@/components/RequestsBell';
import NoticeBoardIcon from '@/components/NoticeBoardIcon';
import StickyNotesFab from '@/components/StickyNotesFab';
import GlobalSearch from '@/components/GlobalSearch';
import ActivityTicker from '@/components/ActivityTicker';
import ChatPanel from '@/components/ChatPanel';
import { TimerChip } from '@/components/TimeTracking';
import RunningTimers from '@/components/RunningTimers';
import UpgradeScreen from '@/components/UpgradeScreen';
import Toaster from '@/components/Toaster';
import Breadcrumbs, { Crumb } from '@/components/Breadcrumbs';
import { applyBranding } from '@/lib/branding';
import { getTheme, toggleTheme, Theme } from '@/lib/theme';
import { normalizeSkin } from '@/lib/skin';


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
  const routeFeature = featureForRoute(router.pathname);

  // Per-tenant skin. 'atlas' uses a Jira-style top nav; the rest use the sidebar.
  const skin = normalizeSkin(activeOrg?.theme_skin);
  const topNav = skin === 'atlas';

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
      ? { ...s, items: s.items.filter((i) => navVisible(activeOrg, i.feature) && roleAllowsFeature(user, i.feature) && guestOk(i.href) && (!i.adminOnly || can.manageMembers(activeOrg))) }
      : s)
    .filter((s) => s.kind === 'link'
      ? navVisible(activeOrg, s.item.feature) && roleAllowsFeature(user, s.item.feature) && guestOk(s.item.href)
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
  const collapsed = !topNav && isLg && sidebarCollapsed;   // never collapse the mobile drawer; n/a in top-nav

  // Route-derived breadcrumb default; dynamic pages override via useSetCrumbs.
  const parts = router.pathname.split('/').filter(Boolean);
  const rootHref = '/' + (parts[0] || '');
  const rootLabel = ROUTE_LABELS[rootHref];
  const defaultCrumbs: Crumb[] = parts.length > 1 && rootLabel
    ? [{ label: rootLabel, href: rootHref }, { label: title }]
    : [{ label: title }];

  const NavLink = ({ href, label, icon, feature, sub = false }: Item & { sub?: boolean }) => {
    const active = isActive(href);
    const locked = isUpsellLocked(activeOrg, feature);
    return (
      <Link href={href} title={collapsed ? label : undefined}
        className={`sb-item ${active ? 'sb-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''} ${sub && !collapsed ? 'py-1.5' : ''}`}>
        <Icon name={icon} className={`shrink-0 ${sub && !collapsed ? 'text-sm' : 'text-base'}`} />
        {!collapsed && <span className="truncate flex-1">{label}</span>}
        {!collapsed && locked && <Icon name="ti-lock" className="text-xs text-muted2 shrink-0" />}
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

  // ---- Top-nav (Jira-style) horizontal primitives ----
  const TopLink = ({ href, label, icon, feature }: Item) => {
    const active = isActive(href);
    const locked = isUpsellLocked(activeOrg, feature);
    return (
      <Link href={href}
        className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm whitespace-nowrap transition-colors ${active ? 'bg-accent/12 text-accentstrong font-semibold' : 'text-contentsoft hover:bg-surface2 hover:text-content'}`}>
        <Icon name={icon} className="text-base shrink-0" />
        <span>{label}</span>
        {locked && <Icon name="ti-lock" className="text-xs text-muted2" />}
      </Link>
    );
  };

  const TopMenu = ({ section: s }: { section: Extract<Section, { kind: 'menu' }> }) => {
    const open = !!openMenus[s.key];
    const containsActive = s.items.some((i) => isActive(i.href));
    return (
      <div className="relative">
        <button onClick={() => setOpenMenus((p) => ({ [s.key]: !p[s.key] }))}
          className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm whitespace-nowrap transition-colors ${containsActive ? 'bg-accent/12 text-accentstrong font-semibold' : 'text-contentsoft hover:bg-surface2 hover:text-content'}`}>
          <Icon name={s.icon} className="text-base shrink-0" />
          <span>{s.label}</span>
          <Icon name="ti-chevron-down" className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpenMenus({})} aria-hidden />
            <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-surface border border-line rounded-lg shadow-lg p-1 space-y-0.5">
              {s.items.map((i) => <NavLink key={i.href} {...i} />)}
            </div>
          </>
        )}
      </div>
    );
  };

  const BrandMark = () => (
    <Link href="/dashboard" title="Dashboard" className="flex items-center gap-2.5 min-w-0">
      {activeOrg?.branding?.logo_url
        ? <img src={activeOrg.branding.logo_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
        : <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-semibold shrink-0 text-accentfg"
            style={{ background: 'var(--brand-primary, #3ECF8E)' }}>
            {(activeOrg?.name || 'S').charAt(0).toUpperCase()}
          </span>}
      <span className="font-semibold truncate side-fg hidden sm:block">{activeOrg?.name || 'SNR-PMO'}</span>
    </Link>
  );

  const HeaderActions = () => (
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
      <NoticeBoardIcon />
      <NotificationBell />
    </div>
  );

  const contentInner = (
    <div className={`mx-auto w-full${flat ? ' flat-surfaces' : ''}`} style={{ maxWidth: 'var(--container-max, 1400px)' }}>
      {routeFeature && isUpsellLocked(activeOrg, routeFeature) ? <UpgradeScreen feature={routeFeature} canManage={can.manageBilling(activeOrg)} /> : children}
    </div>
  );

  // The sidebar/drawer aside is reused for mobile in every skin. In top-nav skins
  // it is hidden on desktop (lg) because navigation lives in the header.
  const aside = (
    <aside className={`side shrink-0 flex flex-col z-40 fixed inset-y-0 left-0 w-60 transition-transform duration-200
      ${topNav ? 'lg:hidden' : `lg:relative lg:z-auto lg:transition-[width] ${collapsed ? 'lg:w-16' : 'lg:w-60'}`}
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      {!topNav && (
        <button onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:grid absolute -right-3 top-[4.5rem] z-50 h-6 w-6 place-items-center rounded-full
            border border-line bg-surface shadow-sm text-muted hover:text-content hover:border-accent/60 transition">
          <Icon name={collapsed ? 'ti-chevron-right' : 'ti-chevron-left'} className="text-xs" />
        </button>
      )}

      {/* Brand + org switcher */}
      <div className="relative h-14 shrink-0 flex items-center gap-2.5 px-3 border-b border-line">
        <Link href="/dashboard" title="Dashboard" className={`flex items-center gap-2.5 min-w-0 ${collapsed ? '' : 'flex-1'}`}>
          {activeOrg?.branding?.logo_url
            ? <img src={activeOrg.branding.logo_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
            : <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-semibold shrink-0 text-accentfg"
                style={{ background: 'var(--brand-primary, #3ECF8E)' }}>
                {(activeOrg?.name || 'S').charAt(0).toUpperCase()}
              </span>}
          {!collapsed && <span className="font-semibold truncate side-fg">{activeOrg?.name || 'SNR-PMO'}</span>}
        </Link>
        {!collapsed && orgs.length > 1 && (
          <button onClick={() => setOrgMenu((v) => !v)} title="Switch workspace" className="shrink-0 side-dim hover:text-content p-1 -mr-1">
            <Icon name="ti-selector" className="text-sm" />
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
  );

  // ---- TOP-NAV LAYOUT (Atlas / Jira-style) ----
  if (topNav) {
    // Keep the bar usable: show the first few sections inline, fold the rest into "More".
    const TOP_INLINE = 6;
    const inlineSections = sections.slice(0, TOP_INLINE);
    const overflowSections = sections.slice(TOP_INLINE);

    const MoreMenu = ({ secs }: { secs: typeof sections }) => {
      const open = !!openMenus['__more'];
      const containsActive = secs.some((s) => s.kind === 'link' ? isActive(s.item.href) : s.items.some((i) => isActive(i.href)));
      return (
        <div className="relative">
          <button onClick={() => setOpenMenus((p) => ({ ['__more']: !p['__more'] }))}
            className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm whitespace-nowrap transition-colors ${containsActive ? 'bg-accent/12 text-accentstrong font-semibold' : 'text-contentsoft hover:bg-surface2 hover:text-content'}`}>
            <Icon name="ti-dots" className="text-base shrink-0" />
            <span>More</span>
            <Icon name="ti-chevron-down" className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpenMenus({})} aria-hidden />
              <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-surface border border-line rounded-lg shadow-lg p-1 space-y-0.5 max-h-[70vh] overflow-y-auto">
                {secs.map((s) => s.kind === 'link'
                  ? <NavLink key={s.item.href} {...s.item} />
                  : (
                    <div key={s.key} className="pt-1 first:pt-0">
                      <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted2">{s.label}</div>
                      {s.items.map((i) => <NavLink key={i.href} {...i} />)}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      );
    };

    return (
      <div className="flex flex-col h-screen bg-bg text-content">
        {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden />}
        {aside}
        <header className="shrink-0 border-b border-line bg-surface/80 backdrop-blur relative z-20">
          {/* Row 1 — brand + global actions */}
          <div className="h-14 flex items-center gap-3 px-4 sm:px-6">
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
              className="lg:hidden h-9 w-9 -ml-1.5 grid place-items-center rounded-md text-muted hover:text-content hover:bg-surface2 transition">
              <Icon name="ti-menu-2" className="text-lg" />
            </button>
            <div className="relative shrink-0">
              <div className="flex items-center gap-1.5">
                <BrandMark />
                {orgs.length > 1 && (
                  <button onClick={() => setOrgMenu((v) => !v)} title="Switch workspace" className="shrink-0 text-muted hover:text-content p-1">
                    <Icon name="ti-selector" className="text-sm" />
                  </button>
                )}
              </div>
              {orgMenu && orgs.length > 0 && (
                <div className="absolute left-0 top-12 z-30 w-56 bg-surface text-content rounded-md border border-line shadow-lg py-1">
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
            <div className="ml-auto"><HeaderActions /></div>
          </div>
          {/* Row 2 — module navigation (desktop; mobile uses the drawer) */}
          <nav className="hidden lg:flex items-center gap-1 h-11 px-4 sm:px-6 border-t border-line">
            {inlineSections.map((s) => s.kind === 'link'
              ? <TopLink key={s.item.href} {...s.item} />
              : <TopMenu key={s.key} section={s} />)}
            {overflowSections.length > 0 && <MoreMenu secs={overflowSections} />}
          </nav>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full mb-3" style={{ maxWidth: 'var(--container-max, 1400px)' }}><Breadcrumbs fallback={defaultCrumbs} /></div>
          {contentInner}
        </main>
        {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
        <StickyNotesFab />
        <Toaster />
      </div>
    );
  }


  // ---- SIDEBAR LAYOUT (Classic / Nebula / Coral) ----
  return (
    <div className="flex h-screen bg-bg text-content">
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden />}
      {aside}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-surface/80 backdrop-blur relative z-20 flex items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
              className="lg:hidden h-9 w-9 -ml-1.5 grid place-items-center rounded-md text-muted hover:text-content hover:bg-surface2 transition">
              <Icon name="ti-menu-2" className="text-lg" />
            </button>
            <Breadcrumbs fallback={defaultCrumbs} />
          </div>
          {can.manageMembers(activeOrg) && (
            <div className="hidden md:flex flex-1 min-w-0 items-center border-l border-line pl-4 ml-3 mr-3">
              <ActivityTicker />
            </div>
          )}
          <HeaderActions />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{contentInner}</main>
      </div>
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
      <StickyNotesFab />
      <Toaster />
    </div>
  );
}
