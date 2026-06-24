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
  feature?: FeatureKey; adminOnly?: boolean; platformOnly?: boolean; exact?: boolean; search?: SearchSpec;
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

// Generic single-column ilike search spec (covers most list/register modules).
function simpleSpec(o: { key: string; label: string; icon: string; table: string; col: string; titleCol?: string; href: (r: any) => string; subtitle?: (r: any) => string | undefined }): SearchSpec {
  return {
    key: o.key, label: o.label, icon: o.icon,
    run: async (like) => (await grab(sb.from(o.table).select('*').ilike(o.col, like).limit(8)))
      .map((r: any) => ({ id: r.id, key: o.key, title: String(r[o.titleCol || o.col] ?? ''), subtitle: o.subtitle ? o.subtitle(r) : undefined, href: o.href(r), icon: o.icon })),
  };
}
const searchLeads = simpleSpec({ key: 'lead', label: 'Leads', icon: 'ti-filter', table: 'leads', col: 'name', href: () => '/leads' });
const searchClients = simpleSpec({ key: 'client', label: 'Clients', icon: 'ti-friends', table: 'clients', col: 'name', href: () => '/clients' });
const searchProposals = simpleSpec({ key: 'proposal', label: 'Proposals', icon: 'ti-file-description', table: 'proposals', col: 'title', href: () => '/proposals' });
const searchContracts = simpleSpec({ key: 'contract', label: 'Contracts', icon: 'ti-file-certificate', table: 'contracts', col: 'title', href: () => '/contracts' });
const searchJobs = simpleSpec({ key: 'job', label: 'Jobs', icon: 'ti-briefcase-2', table: 'job_postings', col: 'title', href: () => '/jobs' });
const searchApplications = simpleSpec({ key: 'application', label: 'Applications', icon: 'ti-files', table: 'applications', col: 'candidate_name', href: () => '/applications' });
const searchOffers = simpleSpec({ key: 'offer_letter', label: 'Offer letters', icon: 'ti-mail-check', table: 'offer_letters', col: 'candidate_name', href: () => '/offers' });
const searchInvoices = simpleSpec({ key: 'invoice', label: 'Invoices', icon: 'ti-file-invoice', table: 'invoices', col: 'invoice_number', href: () => '/invoicing', subtitle: (r) => r.client_name || undefined });
const searchCreditNotes = simpleSpec({ key: 'credit_note', label: 'Credit notes', icon: 'ti-receipt-refund', table: 'credit_notes', col: 'credit_number', href: () => '/credit-notes', subtitle: (r) => r.client_name || undefined });
const searchIdeas = simpleSpec({ key: 'idea', label: 'Ideas', icon: 'ti-bulb', table: 'ideas', col: 'title', href: (r) => `/ideas/${r.id}` });
const searchPortfolios = simpleSpec({ key: 'portfolio', label: 'Portfolios', icon: 'ti-stack-2', table: 'portfolios', col: 'name', href: () => '/portfolios' });
const searchSubscriptions = simpleSpec({ key: 'subscription', label: 'Subscriptions', icon: 'ti-credit-card', table: 'vendor_subscriptions', col: 'service', href: () => '/subscriptions' });
const searchRecurring = simpleSpec({ key: 'recurring', label: 'Recurring', icon: 'ti-repeat', table: 'recurring_expenses', col: 'name', href: () => '/recurring' });
const searchDomains = simpleSpec({ key: 'domain', label: 'Domains', icon: 'ti-world-www', table: 'domains', col: 'domain', href: () => '/domains' });
const searchAssets = simpleSpec({ key: 'asset', label: 'Assets', icon: 'ti-building-warehouse', table: 'assets', col: 'name', href: () => '/assets' });
const searchBankAccounts = simpleSpec({ key: 'bank_account', label: 'Bank accounts', icon: 'ti-building-bank', table: 'bank_accounts', col: 'label', href: () => '/bank-accounts' });
const searchTeams = simpleSpec({ key: 'team', label: 'Teams', icon: 'ti-users-group', table: 'teams', col: 'name', href: (r) => `/teams/${r.id}` });

// --- The manifest --------------------------------------------------------
export const SECTIONS: NavSection[] = [
  { kind: 'link', item: { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' } },
  { kind: 'menu', key: 'work', label: 'Work', icon: 'ti-briefcase', items: [
    { href: '/companies', label: 'Companies', icon: 'ti-building', feature: 'companies', search: searchCompanies },
    { href: '/portfolios', label: 'Portfolios', icon: 'ti-stack-2', feature: 'portfolios', search: searchPortfolios },
    { href: '/projects', label: 'Projects', icon: 'ti-folder', feature: 'projects', search: searchProjects },
    { href: '/portal', label: 'Client Portal', icon: 'ti-layout-dashboard', feature: 'portal' },
    { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox', feature: 'projects', search: searchTasks },
    { href: '/ideas', label: 'Ideas', icon: 'ti-bulb', feature: 'ideas', search: searchIdeas },
    { href: '/roadmap', label: 'Roadmap', icon: 'ti-timeline', feature: 'projects' },
    { href: '/chat', label: 'Chat', icon: 'ti-messages', feature: 'chat' },
    { href: '/approvals', label: 'Approvals', icon: 'ti-checks', adminOnly: true },
  ]},
  { kind: 'menu', key: 'people', label: 'People', icon: 'ti-users', items: [
    { href: '/teams', label: 'Teams', icon: 'ti-users-group', feature: 'teams', search: searchTeams },
    { href: '/workload', label: 'Workload', icon: 'ti-chart-bar', feature: 'teams' },
    { href: '/calendar', label: 'Calendar', icon: 'ti-calendar', feature: 'calendar' },
    { href: '/guests', label: 'Guests', icon: 'ti-user-question', adminOnly: true },
  ]},
  { kind: 'menu', key: 'tracking', label: 'Accounting', icon: 'ti-report-money', items: [
    // Core ledger & reporting
    { href: '/ledger', label: 'General Ledger', icon: 'ti-book-2', feature: 'financial' },
    { href: '/financial', label: 'Financial Data', icon: 'ti-currency-dollar', feature: 'financial' },
    // Receivables
    { href: '/invoicing', label: 'Invoicing', icon: 'ti-file-invoice', feature: 'financial', search: searchInvoices },
    { href: '/credit-notes', label: 'Credit notes', icon: 'ti-receipt-refund', feature: 'financial', search: searchCreditNotes },
    { href: '/recurring-billing', label: 'Recurring Billing', icon: 'ti-refresh', feature: 'financial' },
    { href: '/revenue-recognition', label: 'Revenue Recognition', icon: 'ti-calendar-stats', feature: 'financial' },
    // Payables
    { href: '/bills', label: 'Bills / Purchases', icon: 'ti-file-dollar', feature: 'financial' },
    { href: '/expense-claims', label: 'Expense Claims', icon: 'ti-receipt-2', feature: 'financial' },
    { href: '/recurring', label: 'Recurring Expenses', icon: 'ti-repeat', feature: 'financial', search: searchRecurring },
    { href: '/subscriptions', label: 'Vendor Subscriptions', icon: 'ti-credit-card', feature: 'subscriptions', search: searchSubscriptions },
    // Catalog & stock
    { href: '/products', label: 'Products & Services', icon: 'ti-box', feature: 'financial' },
    { href: '/inventory', label: 'Inventory', icon: 'ti-packages', feature: 'financial' },
    // Registers (balance sheet)
    { href: '/bank-accounts', label: 'Bank accounts', icon: 'ti-building-bank', feature: 'financial', search: searchBankAccounts },
    { href: '/assets', label: 'Assets', icon: 'ti-building-warehouse', feature: 'financial', search: searchAssets },
    { href: '/liabilities', label: 'Liabilities', icon: 'ti-businessplan', feature: 'financial' },
    { href: '/domains', label: 'Domains', icon: 'ti-world-www', feature: 'financial', search: searchDomains },
    // Analysis
    { href: '/risk', label: 'Risk Analysis', icon: 'ti-alert-triangle', feature: 'risk' },
  ]},
  { kind: 'menu', key: 'crm', label: 'CRM', icon: 'ti-users', items: [
    { href: '/crm', label: 'Sales Pipeline', icon: 'ti-target-arrow', feature: 'crm', search: searchDeals },
    { href: '/leads', label: 'Leads', icon: 'ti-filter', feature: 'crm', search: searchLeads },
    { href: '/forms', label: 'Forms', icon: 'ti-forms', feature: 'forms' },
    { href: '/clients', label: 'Clients', icon: 'ti-friends', feature: 'crm', search: searchClients },
    { href: '/proposals', label: 'Proposals', icon: 'ti-file-description', feature: 'crm', search: searchProposals },
    { href: '/contracts', label: 'Contracts', icon: 'ti-file-certificate', feature: 'crm', search: searchContracts },
  ]},
  { kind: 'menu', key: 'hr', label: 'HR', icon: 'ti-heart-handshake', items: [
    { href: '/onboarding', label: 'Onboarding', icon: 'ti-user-plus', feature: 'hr' },
    { href: '/jobs', label: 'Jobs', icon: 'ti-briefcase-2', feature: 'hr', search: searchJobs },
    { href: '/applications', label: 'Applications', icon: 'ti-files', feature: 'hr', search: searchApplications },
    { href: '/interviews', label: 'Interviews', icon: 'ti-calendar-event', feature: 'hr' },
    { href: '/offers', label: 'Offer letters', icon: 'ti-mail-check', feature: 'hr', search: searchOffers },
    { href: '/employees', label: 'Employees', icon: 'ti-id-badge', feature: 'hr', search: searchPeople },
    { href: '/appraisals', label: 'Appraisals', icon: 'ti-clipboard-check', feature: 'appraisals' },
    { href: '/training', label: 'Training & JDs', icon: 'ti-school', feature: 'hr' },
    { href: '/payroll', label: 'Payroll', icon: 'ti-cash', feature: 'hr' },
    { href: '/attendance', label: 'Attendance', icon: 'ti-clock', feature: 'attendance' },
    { href: '/leave', label: 'Leave', icon: 'ti-beach', feature: 'attendance' },
  ]},
  { kind: 'link', item: { href: '/drives', label: 'Drives', icon: 'ti-cloud', feature: 'drives' } },
  { kind: 'menu', key: 'support', label: 'Support', icon: 'ti-lifebuoy', items: [
    { href: '/support', label: 'Support', icon: 'ti-lifebuoy', feature: 'support' },
    { href: '/admin/support-agents', label: 'Support Agents', icon: 'ti-headset', platformOnly: true },
    { href: '/admin/support', label: 'Support Queue', icon: 'ti-list-check', platformOnly: true },
  ]},
  { kind: 'menu', key: 'agents', label: 'Agents', icon: 'ti-robot', items: [
    { href: '/agents', label: 'Agents', icon: 'ti-robot', feature: 'agents' },
    { href: '/agent-approvals', label: 'Agent Approvals', icon: 'ti-checks', feature: 'agents' },
    { href: '/agent-activity', label: 'Activity & ROI', icon: 'ti-chart-line', feature: 'agents' },
  ]},
  { kind: 'link', item: { href: '/notes', label: 'Notes', icon: 'ti-notes' } },
  { kind: 'link', item: { href: '/trash', label: 'Trash', icon: 'ti-trash' } },
];

export const ADMIN_SECTION: NavSection = { kind: 'menu', key: 'admin', label: 'Administration', icon: 'ti-shield-cog', items: [
  { href: '/users', label: 'Users', icon: 'ti-user-shield' },
  { href: '/billing', label: 'Billing', icon: 'ti-credit-card' },
  { href: '/developer', label: 'Developer', icon: 'ti-code', adminOnly: true, feature: 'api' },
  { href: '/automations', label: 'Automations', icon: 'ti-bolt', adminOnly: true, feature: 'automations' },
  { href: '/templates', label: 'Templates', icon: 'ti-files' },
  { href: '/integrations', label: 'Integrations', icon: 'ti-plug', feature: 'integrations' },
  { href: '/import', label: 'Import data', icon: 'ti-file-import', adminOnly: true },
  { href: '/export', label: 'Export data', icon: 'ti-file-export', adminOnly: true },
  { href: '/settings', label: 'Settings', icon: 'ti-settings' },
]};

// Super-super-admin (cross-tenant) — gated by platformAdmin, not a plan feature.
export const PLATFORM_SECTION: NavSection = { kind: 'menu', key: 'platform', label: 'Platform', icon: 'ti-building-skyscraper', items: [
  { href: '/platform', label: 'Console', icon: 'ti-dashboard' },
  { href: '/tenants', label: 'Tenants', icon: 'ti-building-community' },
] };

export const RESELLER_LINK: NavSection = { kind: 'link', item: { href: '/reseller', label: 'Reseller', icon: 'ti-building-community' } };
export const RESELLER_SECTION: NavSection = { kind: 'menu', key: 'reseller', label: 'Reseller', icon: 'ti-building-community', items: [
  { href: '/reseller', label: 'Console', icon: 'ti-dashboard', exact: true },
  { href: '/reseller/clients', label: 'Clients', icon: 'ti-buildings' },
] };

export const DOCS_LINK: NavSection = { kind: 'link', item: { href: '/docs', label: 'Docs', icon: 'ti-book-2' } };

// --- Derived lookups (do not hand-maintain) -----------------------------
export const ALL_SECTIONS: NavSection[] = [...SECTIONS, ADMIN_SECTION, DOCS_LINK, PLATFORM_SECTION];

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

// Map a route to the plan feature that gates it (longest-prefix match over SECTIONS).
export function featureForRoute(pathname: string): FeatureKey | undefined {
  const items: NavItem[] = [];
  for (const sec of SECTIONS) {
    if (sec.kind === 'link') items.push(sec.item);
    else items.push(...sec.items);
  }
  let best: NavItem | undefined;
  for (const it of items) {
    if (pathname === it.href || pathname.startsWith(it.href + '/')) {
      if (!best || it.href.length > best.href.length) best = it;
    }
  }
  return best?.feature;
}

// --- #10 Per-page visibility (Settings ▸ Modules tree) ------------------
// Pages that can never be hidden — hiding them would lock an admin out of the
// controls needed to unhide anything. Always rendered regardless of hidden_pages.
export const UNHIDEABLE: ReadonlySet<string> = new Set(['/dashboard', '/settings']);

// True if `href` is hidden for the org (per organizations.hidden_pages). Pure — pass
// the org's array. Visibility only; never an access check (RLS is the wall).
export function isPageHidden(hidden: readonly string[] | null | undefined, href: string): boolean {
  if (!hidden || hidden.length === 0) return false;
  if (UNHIDEABLE.has(href)) return false;
  return hidden.includes(href);
}

// Tenant-facing nav items (excludes platform/reseller operator nav). Powers the
// Settings ▸ Modules visibility tree. platformOnly items are operator-only.
export const TENANT_ITEMS: NavItem[] = [...SECTIONS, ADMIN_SECTION, DOCS_LINK]
  .flatMap((s) => (s.kind === 'link' ? [s.item] : s.items))
  .filter((i) => !i.platformOnly);
