import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { signOut, recordGuestActivity, avatarSrc } from '@/lib/db';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { roleLabel, can } from '@/lib/authz';
import { hasFeature, navVisible, isUpsellLocked, pageReadable } from '@/lib/entitlements';
import { NavItem as Item, NavSection as Section, SECTIONS, ADMIN_SECTION, PLATFORM_SECTION, RESELLER_SECTION, DOCS_LINK, ROADMAP_LINK, ROUTE_LABELS, featureForRoute, isPageHidden, navHrefForRoute } from '@/lib/nav';
import { Icon, Avatar, Spinner } from '@/components/ui';
import HeaderActions from '@/components/HeaderActions';
import ShortcutsFab from '@/components/ShortcutsFab';
import FeedbackWidget from '@/components/FeedbackWidget';
import AppFooter from '@/components/AppFooter';
import CheckInPopup from '@/components/CheckInPopup';
import PollPopup from '@/components/PollPopup';
import HelpAssistant from '@/components/HelpAssistant';
import GlobalSearch from '@/components/GlobalSearch';
import ActivityTicker from '@/components/ActivityTicker';
import ChatPanel from '@/components/ChatPanel';
import { TimerChip } from '@/components/TimeTracking';
import UpgradeScreen from '@/components/UpgradeScreen';
import Toaster from '@/components/Toaster';
import Breadcrumbs, { Crumb } from '@/components/Breadcrumbs';
import { applyBranding } from '@/lib/branding';
import SidebarPlanBadge from '@/components/SidebarPlanBadge';
import { effectiveSkin } from '@/lib/skin';
import StorageNudge from '@/components/StorageNudge';

export default function Layout({ title, children, flat = false }: { title: string; children: React.ReactNode; flat?: boolean }) {
  const router = useRouter();
  const { user, orgs, platformAdmin, sidebarCollapsed, toggleSidebar, setActiveOrg, clear } = useAuthStore();
  const activeOrg = useActiveOrg();
  const routeFeature = featureForRoute(router.pathname);

  const isActive = (href: string) => router.pathname === href || router.pathname.startsWith(href + '/');

  // Compose nav: admin section for org admins, platform link for platform admins,
  // then drop any item the active org's plan doesn't entitle (and empty menus).
  // W6: guests only see project-scoped surfaces
  const isGuest = activeOrg?.member_role === 'guest';
  const GUEST_HREFS = ['/', '/projects', '/tasks', '/chat', '/calendar', '/docs', '/portal'];
  const guestOk = (href: string) => !isGuest || GUEST_HREFS.includes(href);
  const hiddenPages = activeOrg?.hidden_pages;   // #10 per-page visibility (Settings ▸ Modules)
  const lockFull = !!(user?.is_platform_primary || activeOrg?.member_is_primary);   // primary owner: un-restrictable full access
  const routeHref = navHrefForRoute(router.pathname);   // #roles-crud per-page read guard
  const pageBlocked = !lockFull && !!routeHref && !pageReadable(user, routeHref);
  const sections = [
    ...SECTIONS,
    ...(can.manageMembers(activeOrg) ? [ADMIN_SECTION] : []),
    DOCS_LINK,
    ROADMAP_LINK,
  ]
    .map((s) => s.kind === 'menu'
      ? { ...s, items: s.items.filter((i) => navVisible(activeOrg, i.feature) && guestOk(i.href) && !isPageHidden(hiddenPages, i.href) && (lockFull || pageReadable(user, i.href)) && (!i.adminOnly || can.manageMembers(activeOrg)) && (!i.platformOnly || platformAdmin)) }
      : s)
    .filter((s) => s.kind === 'link'
      ? navVisible(activeOrg, s.item.feature) && guestOk(s.item.href) && !isPageHidden(hiddenPages, s.item.href) && (lockFull || pageReadable(user, s.item.href))
      : s.items.length > 0);

  const [checking, setChecking] = useState(true);
  const [orgMenu, setOrgMenu] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);
  // Close the workspace switcher when clicking outside it.
  useEffect(() => {
    if (!orgMenu) return;
    const onDown = (e: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) setOrgMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [orgMenu]);
  const [mobileOpen, setMobileOpen] = useState(false);  // off-canvas drawer (< lg)
  const [chatOpen, setChatOpen] = useState(false);       // S5 slide-in chat panel
  const [isLg, setIsLg] = useState(true);                // collapse is a desktop-only concept

  // Accordion: only the menu containing the current page stays expanded.
  // Manual toggles live until the next route change re-syncs to the active menu.
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const operatorMenus = [RESELLER_SECTION, PLATFORM_SECTION].filter((s) => s.kind === 'menu');
    const active = [...sections, ...operatorMenus].find((s) => s.kind === 'menu' && s.items.some((i) => isActive(i.href)));
    setOpenMenus(active && active.kind === 'menu' ? { [active.key]: true } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname, sections.length]);

  // Re-apply branding when the active org changes (covers org switch + apex domain).
  useEffect(() => {
    if (!activeOrg) return;
    applyBranding(activeOrg, effectiveSkin(activeOrg.theme_skin, activeOrg.allow_user_themes));
  }, [activeOrg?.id, JSON.stringify(activeOrg?.branding), activeOrg?.allow_user_themes]);

  // Lightweight guest check-in (once per browser session per org).
  useEffect(() => {
    if (activeOrg?.member_role === 'guest' && user?.id && activeOrg?.id) {
      try { const k = 'g_checkin_' + activeOrg.id; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); recordGuestActivity(activeOrg.id, user.id, null, 'checkin', 'Signed in'); } } catch { /* ignore */ }
    }
  }, [activeOrg?.id, user?.id, activeOrg?.member_role]);

  // Shortcuts-FAB can request the team chat panel from anywhere.
  useEffect(() => {
    const open = () => setChatOpen(true);
    window.addEventListener('snr:open-chat', open);
    return () => window.removeEventListener('snr:open-chat', open);
  }, []);

  // Guests land on their branded /portal (their home), not the operator dashboard.
  // Guarded by the portal feature so we never bounce them into an upsell screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isGuest && hasFeature(activeOrg, 'portal') && router.pathname === '/dashboard') router.replace('/portal');
  }, [isGuest, activeOrg?.id, router.pathname]);

  // Track the lg breakpoint so the rail only collapses on desktop; mobile is always full-width.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsLg(mq.matches);
    sync(); mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Close the drawer whenever the route changes (mobile nav tap).
  useEffect(() => { setMobileOpen(false); }, [router.pathname]);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Layout remounts per page + the accordion re-expands the active menu after the
    // first render, so restore scroll AFTER layout settles by scrolling the active
    // item into view (robust to the height change). Double rAF = post-commit.
    const t = requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = navRef.current?.querySelector('[data-nav-active="true"]') as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }));
    return () => cancelAnimationFrame(t);
  }, []);

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

  const NavLink = ({ href, label, icon, feature, exact, sub = false }: Item & { sub?: boolean }) => {
    const active = exact ? router.pathname === href : isActive(href);
    const locked = isUpsellLocked(activeOrg, feature);
    return (
      <Link href={href} title={collapsed ? label : undefined} data-nav-active={active ? 'true' : undefined}
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
            {s.items.map((i, idx) => {
              const showGroup = !collapsed && !!i.group && i.group !== s.items[idx - 1]?.group;
              return (
                <Fragment key={i.href}>
                  {showGroup && <div className="px-2 pt-2 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted2 select-none">{i.group}</div>}
                  <NavLink {...i} sub />
                </Fragment>
              );
            })}
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
        <div ref={orgMenuRef} className="relative h-14 shrink-0 flex items-center gap-2.5 px-3 border-b border-line">
          <Link href="/dashboard" title="Dashboard" className="flex items-center shrink-0">
            {activeOrg?.branding?.logo_url && activeOrg.branding.logo_url.startsWith('preset:')
              ? <span className="w-7 h-7 rounded-md grid place-items-center text-base shrink-0" style={{ background: ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#14b8a6','#f97316','#22c55e','#3b82f6','#a855f7'][activeOrg.branding.logo_url.slice(7).split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 12] }}>{activeOrg.branding.logo_url.slice(7)}</span>
              : activeOrg?.branding?.logo_url
              ? <img src={activeOrg.branding.logo_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
              : <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-semibold shrink-0 text-accentfg"
                  style={{ background: 'var(--brand-primary, #3ECF8E)' }}>
                  {(activeOrg?.name || 'S').charAt(0).toUpperCase()}
                </span>}
          </Link>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1 leading-tight">
              <Link href="/dashboard" title="Dashboard" className="font-semibold truncate side-fg">{activeOrg?.name || 'SNR-PMO'}</Link>
              <SidebarPlanBadge />
            </div>
          )}
          {!collapsed && orgs.length > 1 && (
            <button onClick={() => setOrgMenu((v) => !v)} title="Switch workspace" className="shrink-0 side-dim hover:text-content p-1 -mr-1">
              <Icon name="ti-chevron-down" className={`text-sm transition-transform ${orgMenu ? 'rotate-180' : ''}`} />
            </button>
          )}
          {!collapsed && orgMenu && orgs.length > 0 && (
            <div className="absolute left-2 right-2 top-14 z-20 bg-surface text-content rounded-md border border-line shadow-lg py-1">
              {orgs.map((o) => (
                <button key={o.id} onClick={() => { setOrgMenu(false); if (o.id !== activeOrg?.id) { setActiveOrg(o.id); router.push('/dashboard'); } }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface2 ${o.id === activeOrg?.id ? 'font-medium' : ''}`}>
                  <span className="truncate">{o.name}</span>
                  <span className="text-2xs text-muted2">{roleLabel(o.member_role)}</span>
                </button>
              ))}
            </div>
          )}
        </div>


        {/* Categorized nav: top-level links + accordion menus (flat icon rail when collapsed) */}
        <nav ref={navRef} className="flex-1 p-2 space-y-1 overflow-y-auto">
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
          {activeOrg?.is_reseller && can.manageMembers(activeOrg) && RESELLER_SECTION.kind === 'menu' && (
            <div className="mt-3 pt-3 border-t border-line">
              <Menu section={RESELLER_SECTION} />
            </div>
          )}
          {platformAdmin && PLATFORM_SECTION.kind === 'menu' && (
            <div className="mt-3 pt-3 border-t border-line">
              <Menu section={PLATFORM_SECTION} />
            </div>
          )}
        </nav>

        {/* User */}
        <div className="p-2 border-t border-line">
          <div className={`flex items-center gap-2.5 px-1 ${collapsed ? 'justify-center' : ''}`}>
            <Link href="/settings" title="Your profile" className={`flex items-center gap-2.5 min-w-0 rounded-md p-1 -m-1 hover:bg-surface2 transition ${collapsed ? '' : 'flex-1'}`}>
              <Avatar name={user?.full_name || 'U'} size={32} src={avatarSrc(user?.avatar_url)} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate side-fg">{user?.full_name}</p>
                  <p className="text-2xs side-dim truncate">{platformAdmin ? 'Platform owner' : roleLabel(activeOrg?.member_role)}</p>
                </div>
              )}
            </Link>
            <Link href="/install" title="Install app / get the link & QR" className="p-1.5 rounded-md side-dim hover:text-content hover:bg-surface2 shrink-0"><Icon name="ti-device-mobile" className="text-base" /></Link>
            <button onClick={logout} title="Sign out" className="p-1.5 rounded-md side-dim hover:text-content hover:bg-surface2 shrink-0">
              <Icon name="ti-logout" className="text-base" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-surface backdrop-blur relative z-20 flex items-center justify-between gap-2 px-4 sm:px-6">
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
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <GlobalSearch />
            <TimerChip />
            <HeaderActions onOpenChat={() => setChatOpen(true)} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6"><div className={`mx-auto w-full${flat ? ' flat-surfaces' : ''}`} style={{ maxWidth: 'var(--container-max, 1400px)' }}><StorageNudge />{routeFeature && isUpsellLocked(activeOrg, routeFeature) ? <UpgradeScreen feature={routeFeature} canManage={can.manageBilling(activeOrg)} /> : pageBlocked ? (<div className="card p-10 text-center max-w-md mx-auto mt-10"><Icon name="ti-lock" className="text-3xl text-muted2 block mb-3" /><h2 className="text-base font-semibold text-content mb-1">No access to this page</h2><p className="text-sm text-muted">Your role does not have read access here. An admin can grant it in Users ▸ a member or role ▸ Page access.</p></div>) : children}</div></main>
        <AppFooter />
      </div>
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
      <ShortcutsFab />
      <FeedbackWidget />
      <HelpAssistant />
      <CheckInPopup />
      <PollPopup />
      <Toaster />
    </div>
  );
}
