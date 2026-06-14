// Single navigation + search manifest.
// -------------------------------------------------------------------------
// THIS IS THE ONE PLACE to register a feature page. Adding an entry here makes
// the page appear automatically in: the sidebar nav, route-derived breadcrumbs,
// and (if it carries a `search` spec) the global search scope picker + queries.
// Consumers (components/Layout.tsx, components/GlobalSearch.tsx) derive from
// these exports — never maintain a parallel list elsewhere.
import { sb, FeatureKey } from '@/lib/supabase';

// A live-search result row.
export type SearchHit = {
  id: string; key: string; title: string; subtitle?: string; href: string; icon: string; avatar?: boolean;
};
// Declarative search behaviour for a navigable module. `run` returns hits for a
// query; `label`/`icon` drive the scope picker and result group headers.
export type SearchSpec = {
  key: string; label: string; icon: string;
  run: (like: string, safe: string) => Promise<SearchHit[]>;
};

// `feature` gates the item behind the active org's plan entitlement.
// Items without a feature are core and always shown.
// `search` (optional) makes the page searchable from the header.
export type NavItem = {
  href: string; label: string; icon: string;
  feature?: FeatureKey; adminOnly?: boolean; search?: SearchSpec;
};
export type NavSection =
  | { kind: 'link'; item: NavItem }
  | { kind: 'menu'; key: string; label: string; icon: string; items: NavItem[] };

// Tolerant fetch: resolve to rows or [] on error so one failing module can't
// break the combined search.
const grab = (p: any): Promise<any[]> => p.then((r: any) => r.data || [], () => []);

// --- Search specs (one per searchable module) ---------------------------
const searchTasks: SearchSpec = { key: 'task', label: 'Tasks', icon: 'ti-checkbox',
  run: async (like) => (await grab(sb.from('tasks').select('id, name, projects(name)').ilike('name', like).limit(8)))
    .map((t: any) => ({ id: t.id, key: 'task', title: t.name, subtitle: t.projects?.name, href: `/tasks?task=${t.id}`, icon: 'ti-checkbox' })) };
const searchProjects: SearchSpec = { key: 'project', label: 'Projects', icon: 'ti-folder',
  run: async (like) => (await grab(sb.from('projects').select('id, name, status').ilike('name', like).limit(8)))
    .map((p: any) => ({ id: p.id, key: 'project', title: p.name, subtitle: p.status, href: `/projects/${p.id}`, icon: 'ti-folder' })) };
const searchDeals: SearchSpec = { key: 'deal', label: 'Deals', icon: 'ti-target-arrow',
  run: async (like) => (await grab(sb.from('crm_deals').select('id, title, stage').ilike('title', like).limit(8)))
    .map((d: any) => ({ id: d.id, key: 'deal', title: d.title, subtitle: d.stage, href: `/crm/deal/${d.id}`, icon: 'ti-target-arrow' })) };
const searchCompanies: SearchSpec = { key: 'company', label: 'Companies', icon: 'ti-building',
  run: async (like) => (await grab(sb.from('companies').select('id, name').ilike('name', like).limit(8)))
    .map((c: any) => ({ id: c.id, key: 'company', title: c.name, href: `/companies/${c.id}`, icon: 'ti-building' })) };
const searchPeople: SearchSpec = { key: 'employee', label: 'People', icon: 'ti-id-badge',
  run: async (_like, safe) => (await grab(sb.from('users').select('id, full_name, email').or(`full_name.ilike.*${safe}*,email.ilike.*${safe}*`).limit(8)))
    .map((u: any) => ({ id: u.id, key: 'employee', title: u.full_name || u.email, subtitle: u.full_name ? u.email : undefined, href: `/employees/${u.id}`, icon: 'ti-id-badge', avatar: true })) };

// --- The manifest --------------------------------------------------------
export const SECTIONS: NavSection[] = [
  { kind: 'link', item: { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' } },
  { kind: 'menu', key: 'work', label: 'Work', icon: 'ti-briefcase', items: [
    { href: '/companies', label: 'Companies', icon: 'ti-building', search: searchCompanies },
    { href: '/portfolios', label: 'Portfolios', icon: 'ti-stack-2', feature: 'portfolios' },
    { href: '/projects', label: 'Projects', icon: 'ti-folder', search: searchProjects },
    { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox', search: searchTasks },
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
    { href: '/subscriptions', label: 'Subscriptions', icon: 'ti-credit-card', feature: 'subscriptions' },
    { href: '/recurring', label: 'Recurring', icon: 'ti-repeat', feature: 'financial' },
    { href: '/domains', label: 'Domains', icon: 'ti-world-www', feature: 'financial' },
    { href: '/assets', label: 'Assets', icon: 'ti-building-warehouse', feature: 'financial' },
    { href: '/bank-accounts', label: 'Bank accounts', icon: 'ti-building-bank', feature: 'financial' },
    { href: '/invoicing', label: 'Invoicing', icon: 'ti-file-invoice', feature: 'financial' },
    { href: '/credit-notes', label: 'Credit notes', icon: 'ti-receipt-refund', feature: 'financial' },
  ]},
  { kind: 'menu', key: 'crm', label: 'CRM', icon: 'ti-users', items: [
    { href: '/crm', label: 'Sales Pipeline', icon: 'ti-target-arrow', feature: 'crm', search: searchDeals },
    { href: '/leads', label: 'Leads', icon: 'ti-filter', feature: 'crm' },
    { href: '/clients', label: 'Clients', icon: 'ti-friends', feature: 'crm' },
    { href: '/proposals', label: 'Proposals', icon: 'ti-file-description', feature: 'crm' },
    { href: '/contracts', label: 'Contracts', icon: 'ti-file-certificate', feature: 'crm' },
  ]},
  { kind: 'menu', key: 'hr', label: 'HR', icon: 'ti-heart-handshake', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'ti-user-plus', feature: 'hr' },
    { href: '/jobs', label: 'Jobs', icon: 'ti-briefcase-2', feature: 'hr' },
    { href: '/applications', label: 'Applications', icon: 'ti-files', feature: 'hr' },
    { href: '/interviews', label: 'Interviews', icon: 'ti-calendar-event', feature: 'hr' },
    { href: '/offers', label: 'Offer letters', icon: 'ti-mail-check', feature: 'hr' },
    { href: '/employees', label: 'Employees', icon: 'ti-id-badge', feature: 'hr', search: searchPeople },
    { href: '/training', label: 'Training & JDs', icon: 'ti-school', feature: 'hr' },
    { href: '/payroll', label: 'Payroll', icon: 'ti-cash', feature: 'hr' },
    { href: '/attendance', label: 'Attendance', icon: 'ti-clock' },
    { href: '/leave', label: 'Leave', icon: 'ti-beach' },
  ]},
  { kind: 'link', item: { href: '/drives', label: 'Drives', icon: 'ti-cloud', feature: 'drives' } },
  { kind: 'link', item: { href: '/support', label: 'Support', icon: 'ti-lifebuoy', feature: 'support' } },
  { kind: 'link', item: { href: '/notes', label: 'Notes', icon: 'ti-notes' } },
  { kind: 'link', item: { href: '/trash', label: 'Trash', icon: 'ti-trash' } },
  { kind: 'link', item: { href: '/docs', label: 'Docs', icon: 'ti-book-2' } },
];

export const ADMIN_SECTION: NavSection = { kind: 'menu', key: 'admin', label: 'Administration', icon: 'ti-shield-cog', items: [
  { href: '/users', label: 'Users', icon: 'ti-user-shield' },
  { href: '/roles', label: 'Roles', icon: 'ti-shield-lock' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'ti-bell-cog' },
  { href: '/approvals', label: 'Approvals', icon: 'ti-checks' },
  { href: '/integrations', label: 'Integrations', icon: 'ti-plug', feature: 'integrations' },
  { href: '/audit', label: 'Audit log', icon: 'ti-history', feature: 'audit' },
  { href: '/settings', label: 'Settings', icon: 'ti-settings' },
]};

// Super-super-admin (cross-tenant) — gated by platformAdmin, not a plan feature.
export const PLATFORM_SECTION: NavSection = { kind: 'menu', key: 'platform', label: 'Platform', icon: 'ti-building-skyscraper', items: [
  { href: '/platform', label: 'Console', icon: 'ti-dashboard' },
  { href: '/tenants', label: 'Tenants', icon: 'ti-building-community' },
] };

// --- Derived lookups (do not hand-maintain) -----------------------------
export const ALL_SECTIONS: NavSection[] = [...SECTIONS, ADMIN_SECTION, PLATFORM_SECTION];

// Flat list of every nav item across all sections.
export const ALL_ITEMS: NavItem[] = ALL_SECTIONS.flatMap((s) => s.kind === 'link' ? [s.item] : s.items);

// Flat label lookup for route-derived breadcrumbs.
export const ROUTE_LABELS: Record<string, string> = Object.fromEntries(ALL_ITEMS.map((i) => [i.href, i.label]));

// Searchable modules, in nav order. Powers the global search scope picker.
export const SEARCH_SPECS: SearchSpec[] = ALL_ITEMS.filter((i) => i.search).map((i) => i.search!);

// Map a route to the search module it represents (for the "This page" scope).
export function pageModuleFor(path: string): string | null {
  const item = ALL_ITEMS.find((i) => i.search && (path === i.href || path.startsWith(i.href + '/')));
  return item?.search?.key ?? null;
}
