import { sb, Project, Task, Company, OrgCompany, CompanyMember, MemberRole, Portfolio, PortfolioMember, Contact, Deal, CrmActivity, AppUser, OrgUser, MyOrg, Organization, Risk, Financial, Comment, Plan, Feature, PlanFeature, PlatformOrg, OrgPlanInfo } from './supabase';

// ---------------------------------------------------------------------------
// Auth (Supabase Auth)
// ---------------------------------------------------------------------------
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signInWithGoogle(redirectTo?: string) {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo || (typeof window !== 'undefined' ? window.location.origin + '/dashboard' : undefined) },
  });
  if (error) throw new Error(error.message);
}

export async function signUpNewTenant(p: { email: string; password: string; fullName: string; orgName: string; orgSlug: string }) {
  const { data, error } = await sb.auth.signUp({
    email: p.email,
    password: p.password,
    options: { data: { full_name: p.fullName, org_name: p.orgName, org_slug: p.orgSlug } },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return null;
  const { data, error } = await sb
    .from('users')
    .select('id, auth_user_id, username, email, full_name, role, department, feature_access')
    .eq('auth_user_id', sess.session.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as AppUser) ?? null;
}

export async function getMyOrgs(userId: string): Promise<MyOrg[]> {
  // Must filter by user_id: the org_members SELECT policy lets a member see ALL
  // members of their org, so without this we'd get one row per co-member (and the
  // org switcher would show the same org N times).
  const { data, error } = await sb
    .from('org_members')
    .select('role, organizations(id, slug, name, branding, plan)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r.organizations, member_role: r.role })) as MyOrg[];
}

export async function getOrgBranding(slug: string): Promise<Organization | null> {
  const { data, error } = await sb.rpc('org_branding', { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Organization) ?? null;
}

// White-label: owner/admin updates org name + branding. RLS policy `org_update`
// enforces is_org_role(owner|admin); never trust the client gate alone.
export async function updateOrgSettings(
  orgId: string,
  patch: { name?: string; branding?: Record<string, any> }
): Promise<Organization> {
  const fields: Record<string, any> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.branding !== undefined) fields.branding = patch.branding;
  const { data, error } = await sb
    .from('organizations')
    .update(fields)
    .eq('id', orgId)
    .select('id, slug, name, branding, plan')
    .single();
  if (error) throw new Error(error.message);
  return data as Organization;
}

export async function getOrgUsers(): Promise<OrgUser[]> {
  const { data, error } = await sb.from('users').select('id, full_name, email').order('full_name');
  if (error) throw error;
  return (data as OrgUser[]) || [];
}

// ---------------------------------------------------------------------------
// 3.3 Platform layer — entitlements (tenant) + super-super-admin console
// ---------------------------------------------------------------------------

// Feature keys enabled by an org's active plan (falls back to the free plan when
// the org has no active subscription) — mirrors the server org_has_feature logic.
// Client gate only; RLS feature clauses enforce on every write/read path.
export async function getOrgFeatures(orgId: string): Promise<string[]> {
  const { data: sub } = await sb.from('subscriptions')
    .select('plan_id, status').eq('org_id', orgId).maybeSingle();
  let planId = sub?.plan_id as string | undefined;
  const active = sub && (sub.status === 'active' || sub.status === 'trialing');
  if (!active) {
    const { data: free } = await sb.from('plans').select('id').eq('key', 'free').maybeSingle();
    planId = free?.id;
  }
  if (!planId) return [];
  const { data: pf } = await sb.from('plan_features')
    .select('feature_key').eq('plan_id', planId).eq('enabled', true);
  return ((pf || []) as any[]).map((r) => r.feature_key);
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await sb.rpc('is_platform_admin');
  if (error) return false;
  return !!data;
}

// Tenant-facing: current plan + seat usage for the settings page.
export async function getOrgPlanInfo(orgId: string): Promise<OrgPlanInfo> {
  const { data: sub } = await sb.from('subscriptions')
    .select('status, seats, plans(*)').eq('org_id', orgId).maybeSingle();
  const [{ data: cnt }, { data: lim }] = await Promise.all([
    sb.rpc('org_seat_count', { p_org: orgId }),
    sb.rpc('org_seat_limit', { p_org: orgId }),
  ]);
  return {
    plan: ((sub as any)?.plans as Plan) ?? null,
    status: (sub as any)?.status ?? null,
    seat_count: (cnt as number) ?? 0,
    seat_limit: (lim as number) ?? null,
  };
}

// --- super-super-admin console (RLS: platform admin only) ------------------
export async function listPlatformOrgs(): Promise<PlatformOrg[]> {
  const { data, error } = await sb.rpc('platform_list_orgs');
  if (error) throw new Error(error.message);
  return (data as PlatformOrg[]) || [];
}
export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await sb.from('plans').select('*').order('sort_order');
  if (error) throw error; return (data as Plan[]) || [];
}
export async function listFeatures(): Promise<Feature[]> {
  const { data, error } = await sb.from('features').select('*').order('sort_order');
  if (error) throw error; return (data as Feature[]) || [];
}
export async function listPlanFeatures(): Promise<PlanFeature[]> {
  const { data, error } = await sb.from('plan_features').select('plan_id, feature_key, enabled');
  if (error) throw error; return (data as PlanFeature[]) || [];
}
// Toggle a feature on a plan (platform admin). Upsert on the composite PK.
export async function setPlanFeature(planId: string, featureKey: string, enabled: boolean): Promise<void> {
  const { error } = await sb.from('plan_features')
    .upsert({ plan_id: planId, feature_key: featureKey, enabled }, { onConflict: 'plan_id,feature_key' });
  if (error) throw new Error(error.message);
}
// Assign / change a tenant's plan (platform admin). One subscription per org.
export async function setOrgPlan(orgId: string, planId: string, seats?: number | null): Promise<void> {
  const { error } = await sb.from('subscriptions')
    .upsert({ org_id: orgId, plan_id: planId, status: 'active', seats: seats ?? null, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
  if (error) throw new Error(error.message);
}

// Create / edit subscription plans (platform admin). plans_write is a single ALL
// policy (USING == WITH CHECK = is_platform_admin) and plans_select is true,
// so INSERT/UPDATE ... RETURNING is safe here.
export type PlanPatch = {
  key?: string; name?: string; description?: string | null;
  pricing_model?: Plan['pricing_model']; price_cents?: number;
  billing_period?: Plan['billing_period']; user_limit?: number | null;
  is_active?: boolean; sort_order?: number;
};
export async function createPlan(p: PlanPatch & { key: string; name: string }): Promise<Plan> {
  const { data, error } = await sb.from('plans').insert(p).select('*').single();
  if (error) throw new Error(error.message);
  return data as Plan;
}
export async function updatePlan(id: string, patch: PlanPatch): Promise<Plan> {
  const { data, error } = await sb.from('plans').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as Plan;
}

// ---------------------------------------------------------------------------
// Data (RLS-scoped to the user's org + project access)
// ---------------------------------------------------------------------------
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}

// Single project by id (RLS-scoped via proj_select=can_access_project). Returns
// null when the row is absent or not visible to the caller.
export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); return (data as Project) || null;
}

export async function createProject(p: {
  name: string; org_id: string; description?: string | null;
  status?: string; priority?: string; start_date?: string | null; end_date?: string | null;
  company_id?: string | null; portfolio_id?: string | null; pm_id?: string | null; created_by?: string | null;
}): Promise<Project[]> {
  // NB: no .select() here. INSERT ... RETURNING re-applies the proj_select RLS
  // policy (can_access_project) to the new row and rejects it, so we insert with
  // return=minimal, then refetch the RLS-scoped list.
  const { error } = await sb.from('projects').insert({
    name: p.name, org_id: p.org_id, description: p.description || null,
    status: p.status || 'Planning', priority: p.priority || 'Medium',
    start_date: p.start_date || null, end_date: p.end_date || null,
    company_id: p.company_id || null, portfolio_id: p.portfolio_id || null,
    pm_id: p.pm_id || null, created_by: p.created_by || null,
  });
  if (error) throw new Error(error.message);
  return getProjects();
}

export async function updateProject(id: string, patch: Partial<{
  name: string; description: string | null; status: string; priority: string;
  start_date: string | null; end_date: string | null; company_id: string | null;
  portfolio_id: string | null; progress: number;
}>): Promise<Project[]> {
  const { error } = await sb.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return getProjects();
}
export async function deleteProject(id: string): Promise<void> {
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Tenancy companies (Org → Company → Project). RLS: org owner/admin only. ---
export async function getOrgCompanies(): Promise<OrgCompany[]> {
  const { data, error } = await sb.from('companies').select('id, name, description, org_id').order('name');
  if (error) throw error;
  return (data as OrgCompany[]) || [];
}

export async function createOrgCompany(p: { name: string; org_id: string; description?: string | null }): Promise<OrgCompany> {
  // companies insert+select policies are identical (is_org_role owner/admin), so RETURNING is safe.
  const { data, error } = await sb.from('companies')
    .insert({ name: p.name, org_id: p.org_id, description: p.description || null })
    .select('id, name, description, org_id').single();
  if (error) throw new Error(error.message);
  return data as OrgCompany;
}
export async function updateOrgCompany(id: string, patch: { name?: string; description?: string | null }): Promise<OrgCompany> {
  const { data, error } = await sb.from('companies').update(patch).eq('id', id)
    .select('id, name, description, org_id').single();
  if (error) throw new Error(error.message); return data as OrgCompany;
}
export async function deleteOrgCompany(id: string): Promise<void> {
  const { error } = await sb.from('companies').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- 3.4 Company RBAC: per-company membership ---------------------------
// RLS: cm_select=can_access_company, cm_write=manages_company(org owner/admin
// or company 'manager'). Insert is return=minimal then refetch (uniform RLS-safe
// pattern; embeds the added user via the list query).
export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const { data, error } = await sb.from('company_members')
    .select('company_id, user_id, role, created_at, users(full_name, email)')
    .eq('company_id', companyId).order('created_at', { ascending: true });
  if (error) throw error; return (data as CompanyMember[]) || [];
}
export async function addCompanyMember(companyId: string, userId: string, role: MemberRole = 'member'): Promise<CompanyMember[]> {
  const { error } = await sb.from('company_members').insert({ company_id: companyId, user_id: userId, role });
  if (error) throw new Error(error.message);
  return listCompanyMembers(companyId);
}
export async function updateCompanyMemberRole(companyId: string, userId: string, role: MemberRole): Promise<void> {
  const { error } = await sb.from('company_members').update({ role })
    .eq('company_id', companyId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
export async function removeCompanyMember(companyId: string, userId: string): Promise<void> {
  const { error } = await sb.from('company_members').delete()
    .eq('company_id', companyId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
// Company ids the current user manages as a non-org-admin (role='manager') —
// lets the UI surface member management to delegated company managers too.
export async function getMyCompanyManagerships(userId: string): Promise<string[]> {
  const { data, error } = await sb.from('company_members')
    .select('company_id').eq('user_id', userId).eq('role', 'manager');
  if (error) throw error; return ((data || []) as any[]).map((r) => r.company_id);
}

// --- Tenancy portfolios (Org → Company → Portfolio → Project) -------------
// RLS: pf_select = can_access_portfolio AND org_has_feature('portfolios');
// pf_write = (org owner/admin OR company manager) AND feature. Insert with
// return=minimal then refetch (RETURNING re-applies pf_select feature+access).
export async function getPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await sb.from('portfolios')
    .select('id, org_id, company_id, name, description').order('name');
  if (error) throw error; return (data as Portfolio[]) || [];
}
export async function createPortfolio(p: { name: string; org_id: string; company_id: string; description?: string | null }): Promise<Portfolio[]> {
  const { error } = await sb.from('portfolios')
    .insert({ name: p.name, org_id: p.org_id, company_id: p.company_id, description: p.description || null });
  if (error) throw new Error(error.message);
  return getPortfolios();
}
export async function updatePortfolio(id: string, patch: { name?: string; description?: string | null }): Promise<Portfolio[]> {
  const { error } = await sb.from('portfolios').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return getPortfolios();
}
export async function deletePortfolio(id: string): Promise<void> {
  const { error } = await sb.from('portfolios').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
// Per-portfolio members. RLS: pfm_select=can_access_portfolio, pfm_write=manages_portfolio.
export async function listPortfolioMembers(portfolioId: string): Promise<PortfolioMember[]> {
  const { data, error } = await sb.from('portfolio_members')
    .select('portfolio_id, user_id, role, created_at, users(full_name, email)')
    .eq('portfolio_id', portfolioId).order('created_at', { ascending: true });
  if (error) throw error; return (data as PortfolioMember[]) || [];
}
export async function addPortfolioMember(portfolioId: string, userId: string, role: MemberRole = 'member'): Promise<PortfolioMember[]> {
  const { error } = await sb.from('portfolio_members').insert({ portfolio_id: portfolioId, user_id: userId, role });
  if (error) throw new Error(error.message);
  return listPortfolioMembers(portfolioId);
}
export async function updatePortfolioMemberRole(portfolioId: string, userId: string, role: MemberRole): Promise<void> {
  const { error } = await sb.from('portfolio_members').update({ role })
    .eq('portfolio_id', portfolioId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
export async function removePortfolioMember(portfolioId: string, userId: string): Promise<void> {
  const { error } = await sb.from('portfolio_members').delete()
    .eq('portfolio_id', portfolioId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
// Portfolio ids the current user manages directly (role='manager') — lets the UI
// surface member management to delegated portfolio managers (mirrors company side).
export async function getMyPortfolioManagerships(userId: string): Promise<string[]> {
  const { data, error } = await sb.from('portfolio_members')
    .select('portfolio_id').eq('user_id', userId).eq('role', 'manager');
  if (error) throw error; return ((data || []) as any[]).map((r) => r.portfolio_id);
}

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await sb.from('tasks').select('*, projects(name)').order('due_date', { ascending: true });
  if (error) throw error; return (data as Task[]) || [];
}

export async function createTask(t: {
  name: string; org_id: string; project_id?: string | null; parent_task_id?: string | null;
  priority?: string; status?: string; due_date?: string | null; assignee_id?: string | null;
  estimated_hours?: number;
}): Promise<Task> {
  const { data, error } = await sb.from('tasks').insert(t).select('*, projects(name)').single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  const { data, error } = await sb.from('tasks').update(patch).eq('id', id).select('*, projects(name)').single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await sb.from('crm_companies').select('*').order('name');
  if (error) throw error; return data || [];
}

export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await sb.from('crm_contacts').select('*, crm_companies(name)').order('full_name');
  if (error) throw error; return (data as Contact[]) || [];
}

export async function getDeals(): Promise<Deal[]> {
  const { data, error } = await sb.from('crm_deals')
    .select('*, crm_companies(name), crm_contacts(full_name, email)')
    .order('value', { ascending: false });
  if (error) throw error; return (data as Deal[]) || [];
}

// --- CRM create/advance flows. All three crm_* tables have a single ALL policy
// is_org_member(org_id) for both USING + WITH CHECK, so RETURNING (incl. embeds,
// which are same-org → visible) is safe — no return=minimal/refetch needed. ---
export const DEAL_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const;
export type DealStage = typeof DEAL_STAGES[number];

export async function createCrmCompany(p: { name: string; org_id: string; industry?: string | null; website?: string | null; phone?: string | null; owner_id?: string | null }): Promise<Company> {
  const { data, error } = await sb.from('crm_companies')
    .insert({ name: p.name, org_id: p.org_id, industry: p.industry || null, website: p.website || null, phone: p.phone || null, owner_id: p.owner_id || null })
    .select('*').single();
  if (error) throw new Error(error.message); return data as Company;
}

export async function createContact(p: { full_name: string; org_id: string; email?: string | null; phone?: string | null; title?: string | null; company_id?: string | null; status?: string | null; owner_id?: string | null }): Promise<Contact> {
  const { data, error } = await sb.from('crm_contacts')
    .insert({ full_name: p.full_name, org_id: p.org_id, email: p.email || null, phone: p.phone || null, title: p.title || null, company_id: p.company_id || null, status: p.status || 'Lead', owner_id: p.owner_id || null })
    .select('*, crm_companies(name)').single();
  if (error) throw new Error(error.message); return data as Contact;
}

export async function createDeal(p: { title: string; org_id: string; value?: number | null; stage?: string; company_id?: string | null; contact_id?: string | null; expected_close?: string | null; notes?: string | null; owner_id?: string | null }): Promise<Deal> {
  const { data, error } = await sb.from('crm_deals')
    .insert({ title: p.title, org_id: p.org_id, value: p.value ?? 0, stage: p.stage || 'Lead', company_id: p.company_id || null, contact_id: p.contact_id || null, expected_close: p.expected_close || null, notes: p.notes || null, owner_id: p.owner_id || null })
    .select('*, crm_companies(name), crm_contacts(full_name, email)').single();
  if (error) throw new Error(error.message); return data as Deal;
}

export async function updateDeal(id: string, patch: Partial<{ title: string; value: number | null; stage: string; company_id: string | null; contact_id: string | null; expected_close: string | null; notes: string | null }>): Promise<Deal> {
  const { data, error } = await sb.from('crm_deals')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    .select('*, crm_companies(name), crm_contacts(full_name, email)').single();
  if (error) throw new Error(error.message); return data as Deal;
}

// Advance a deal to the next pipeline stage (no-op past Negotiation→Won; Won/Lost are terminal).
export async function advanceDealStage(id: string, current: string): Promise<Deal> {
  const order = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
  const i = order.indexOf(current);
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : current;
  return updateDeal(id, { stage: next });
}
// crm_* = single ALL policy (is_org_member AND feature) → delete is RLS-safe.
export async function deleteDeal(id: string): Promise<void> {
  const { error } = await sb.from('crm_deals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteContact(id: string): Promise<void> {
  const { error } = await sb.from('crm_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- CRM activity log. crm_activities mirrors the crm_* ALL policy
// (is_org_member AND org_has_feature 'crm') for USING + WITH CHECK, so
// insert…RETURNING is RLS-safe (verified by RLS-sim). ---
export async function getDealActivities(dealId: string): Promise<CrmActivity[]> {
  const { data, error } = await sb.from('crm_activities').select('*')
    .eq('deal_id', dealId).order('created_at', { ascending: false });
  if (error) throw error; return (data as CrmActivity[]) || [];
}
export async function createActivity(p: {
  org_id: string; deal_id?: string | null; contact_id?: string | null;
  kind?: string; body: string; created_by?: string | null;
}): Promise<CrmActivity> {
  const { data, error } = await sb.from('crm_activities')
    .insert({ org_id: p.org_id, deal_id: p.deal_id || null, contact_id: p.contact_id || null, kind: p.kind || 'note', body: p.body, created_by: p.created_by || null })
    .select('*').single();
  if (error) throw new Error(error.message); return data as CrmActivity;
}
export async function deleteActivity(id: string): Promise<void> {
  const { error } = await sb.from('crm_activities').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getRisks(): Promise<Risk[]> {
  const { data, error } = await sb.from('risks')
    .select('*, projects(name)')
    .order('impact', { ascending: false });
  if (error) throw error; return (data as Risk[]) || [];
}

export async function getFinancials(): Promise<Financial[]> {
  const { data, error } = await sb.from('financials')
    .select('*, projects(name)')
    .order('period', { ascending: true });
  if (error) throw error; return (data as Financial[]) || [];
}

// Phase 2.2 — @mention comments (entity_type 'task'|'project'); RLS = org member.
export async function getComments(entityType: 'task' | 'project', entityId: string): Promise<Comment[]> {
  const { data, error } = await sb.from('comments').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId).eq('deleted', false)
    .order('created_at', { ascending: true });
  if (error) throw error; return (data as Comment[]) || [];
}
export async function addComment(c: { entity_type: 'task' | 'project'; entity_id: string; org_id: string; author_id: string; body: string; mentions: string[] }): Promise<Comment> {
  const { data, error } = await sb.from('comments').insert(c).select('*').single();
  if (error) throw new Error(error.message); return data as Comment;
}
export async function deleteComment(id: string): Promise<void> {
  const { error } = await sb.from('comments').update({ deleted: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// Phase 2 data access
// ===========================================================================
import { Attendance, Leave, AppNotification, Tag, Integration, AuditEntry, AdminUser, RoleTemplate, OnboardingTemplate, OnboardingTemplateItem, OnboardingTask } from './supabase';

const today = () => new Date().toISOString().slice(0, 10);

// ---- 2.3 Attendance -------------------------------------------------------
export async function getAttendance(): Promise<Attendance[]> {
  const { data, error } = await sb.from('attendance')
    .select('*, users(full_name)').order('work_date', { ascending: false }).limit(200);
  if (error) throw error; return (data as Attendance[]) || [];
}
export async function getMyOpenToday(userId: string): Promise<Attendance | null> {
  const { data, error } = await sb.from('attendance').select('*')
    .eq('user_id', userId).eq('work_date', today()).eq('status', 'OPEN').maybeSingle();
  if (error) throw error; return (data as Attendance) ?? null;
}
export async function checkIn(userId: string, orgId: string): Promise<Attendance> {
  const { data, error } = await sb.from('attendance')
    .insert({ user_id: userId, org_id: orgId, work_date: today(), check_in: new Date().toISOString(), status: 'OPEN' })
    .select('*, users(full_name)').single();
  if (error) throw new Error(error.message); return data as Attendance;
}
export async function checkOut(row: Attendance): Promise<Attendance> {
  const out = new Date();
  const hours = row.check_in
    ? Math.round(((out.getTime() - new Date(row.check_in).getTime()) / 3600000) * 100) / 100 : 0;
  const { data, error } = await sb.from('attendance')
    .update({ check_out: out.toISOString(), hours, status: 'CLOSED' })
    .eq('id', row.id).select('*, users(full_name)').single();
  if (error) throw new Error(error.message); return data as Attendance;
}

// ---- 2.4 Leave ------------------------------------------------------------
const LEAVE_SEL = '*, requester:users!leaves_user_id_fkey(full_name)';
export async function getLeaves(): Promise<Leave[]> {
  const { data, error } = await sb.from('leaves').select(LEAVE_SEL)
    .order('requested_at', { ascending: false });
  if (error) throw error; return (data as Leave[]) || [];
}
export async function requestLeave(p: {
  user_id: string; org_id: string; type: string; start_date: string; end_date: string; days: number; reason?: string;
}): Promise<Leave> {
  const { data, error } = await sb.from('leaves')
    .insert({ ...p, reason: p.reason || null, status: 'Pending' }).select(LEAVE_SEL).single();
  if (error) throw new Error(error.message); return data as Leave;
}
export async function decideLeave(id: string, status: 'Approved' | 'Rejected', approverId: string, comment?: string): Promise<Leave> {
  const { data, error } = await sb.from('leaves')
    .update({ status, approver_id: approverId, decision_comment: comment || null, decided_at: new Date().toISOString() })
    .eq('id', id).select(LEAVE_SEL).single();
  if (error) throw new Error(error.message); return data as Leave;
}
export async function cancelLeave(id: string): Promise<Leave> {
  const { data, error } = await sb.from('leaves')
    .update({ status: 'Cancelled' }).eq('id', id).select(LEAVE_SEL).single();
  if (error) throw new Error(error.message); return data as Leave;
}
// Current user's leave entitlements: approval rights + remaining balances.
// `can_approve_leaves` is enforced server-side (leave_approve RLS + decision
// trigger); this read just lets the UI surface the queue + balances.
export interface MyLeaveProfile {
  can_approve_leaves: boolean;
  annual_balance: number; sick_balance: number; casual_balance: number; unpaid_balance: number;
}
export async function getMyLeaveProfile(userId: string): Promise<MyLeaveProfile> {
  const { data, error } = await sb.from('users')
    .select('can_approve_leaves, annual_balance, sick_balance, casual_balance, unpaid_balance')
    .eq('id', userId).maybeSingle();
  if (error) throw error;
  const d = (data as any) || {};
  return {
    can_approve_leaves: !!d.can_approve_leaves,
    annual_balance: Number(d.annual_balance ?? 0),
    sick_balance: Number(d.sick_balance ?? 0),
    casual_balance: Number(d.casual_balance ?? 0),
    unpaid_balance: Number(d.unpaid_balance ?? 0),
  };
}

// ---- 2.5 Notifications ----------------------------------------------------
export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await sb.from('notifications').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error; return (data as AppNotification[]) || [];
}
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await sb.from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await sb.from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', userId).eq('is_read', false);
  if (error) throw new Error(error.message);
}
// Cross-user notify via SECURITY DEFINER RPC (notif RLS blocks direct peer inserts).
export async function notify(p: {
  org_id: string; user_id: string; type: string; title: string;
  body?: string; link?: string; entity_type?: string; entity_id?: string; urgent?: boolean;
}): Promise<void> {
  const { error } = await sb.rpc('create_notification', {
    p_org: p.org_id, p_user: p.user_id, p_type: p.type, p_title: p.title,
    p_body: p.body ?? null, p_link: p.link ?? null,
    p_entity_type: p.entity_type ?? null, p_entity_id: p.entity_id ?? null, p_urgent: p.urgent ?? false,
  });
  if (error) throw new Error(error.message);
}

// ---- 2.6 Audit log --------------------------------------------------------
export async function getAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await sb.from('audit_log').select('*')
    .order('ts', { ascending: false }).limit(200);
  if (error) throw error; return (data as AuditEntry[]) || [];
}
export async function logAudit(p: {
  org_id: string; action: string; entity_type?: string; entity_id?: string; old_value?: any; new_value?: any;
}): Promise<void> {
  const { error } = await sb.rpc('log_audit', {
    p_org: p.org_id, p_action: p.action, p_entity_type: p.entity_type ?? null,
    p_entity_id: p.entity_id ?? null, p_old: p.old_value ?? null, p_new: p.new_value ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---- 2.7 Users admin / RBAC ----------------------------------------------
const ADMIN_USER_COLS = 'id, full_name, email, username, role, department, status, role_template_id, can_view_all_projects, can_edit_all_projects, can_approve_leaves, can_delete_tasks, can_manage_users, can_view_dashboard, can_export_data, annual_balance, sick_balance, casual_balance';
export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await sb.from('users').select(ADMIN_USER_COLS).order('full_name');
  if (error) throw error; return (data as AdminUser[]) || [];
}
export async function updateUserAdmin(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
  const { data, error } = await sb.from('users').update(patch).eq('id', id).select(ADMIN_USER_COLS).single();
  if (error) throw new Error(error.message); return data as AdminUser;
}

// ---- Custom role templates (RBAC) ----------------------------------------
// rt_select = is_org_member, writes = is_org_role(owner/admin). Admin is a member,
// so RETURNING re-applies the select policy to the new row safely.
export async function listRoleTemplates(): Promise<RoleTemplate[]> {
  const { data, error } = await sb.from('role_templates').select('*')
    .order('is_system', { ascending: false }).order('name');
  if (error) throw error; return (data as RoleTemplate[]) || [];
}
export async function createRoleTemplate(p: { org_id: string; name: string; description?: string | null; permissions: Record<string, boolean>; feature_access: string[] }): Promise<RoleTemplate> {
  const { data, error } = await sb.from('role_templates')
    .insert({ org_id: p.org_id, name: p.name, description: p.description ?? null, permissions: p.permissions, feature_access: p.feature_access })
    .select('*').single();
  if (error) throw new Error(error.message); return data as RoleTemplate;
}
export async function updateRoleTemplate(id: string, patch: Partial<Pick<RoleTemplate, 'name' | 'description' | 'permissions' | 'feature_access'>>): Promise<RoleTemplate> {
  const { data, error } = await sb.from('role_templates').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message); return data as RoleTemplate;
}
export async function deleteRoleTemplate(id: string): Promise<void> {
  const { error } = await sb.from('role_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- 2.8 Tags / entity_tags -------------------------------------------------
export async function getTags(): Promise<Tag[]> {
  const { data, error } = await sb.from('tags').select('*').order('name');
  if (error) throw error; return (data as Tag[]) || [];
}
export async function createTag(p: { name: string; color?: string; scope?: string; org_id: string; created_by: string }): Promise<Tag> {
  const { data, error } = await sb.from('tags')
    .insert({ name: p.name, color: p.color || '#3b82f6', scope: p.scope || 'Personal', org_id: p.org_id, created_by: p.created_by })
    .select('*').single();
  if (error) throw new Error(error.message); return data as Tag;
}
// F1: polymorphic tags — one junction (entity_tags) covers tasks, projects,
// CRM deals, ledger entries, … RLS = is_org_member (USING==CHECK, RETURNING-safe).
export type TagEntityType = 'task' | 'project' | 'crm_deal' | 'crm_contact' | 'crm_company' | 'ledger_entry' | 'employee' | 'idea';
export async function getEntityTags(entityType: TagEntityType, entityId: string): Promise<Tag[]> {
  const { data, error } = await sb.from('entity_tags').select('tags(*)')
    .eq('entity_type', entityType).eq('entity_id', entityId);
  if (error) throw error; return ((data || []) as any[]).map((r) => r.tags).filter(Boolean) as Tag[];
}
export async function addEntityTag(entityType: TagEntityType, entityId: string, tagId: string, orgId: string, userId?: string): Promise<void> {
  const { error } = await sb.from('entity_tags').insert({ entity_type: entityType, entity_id: entityId, tag_id: tagId, org_id: orgId, created_by: userId || null });
  if (error) throw new Error(error.message);
}
export async function removeEntityTag(entityType: TagEntityType, entityId: string, tagId: string): Promise<void> {
  const { error } = await sb.from('entity_tags').delete().eq('entity_type', entityType).eq('entity_id', entityId).eq('tag_id', tagId);
  if (error) throw new Error(error.message);
}

// ---- 3.2 HR Onboarding ----------------------------------------------------
// Templates + their items. insert+select policies on these tables are identical
// (write=is_org_role owner/admin, select=is_org_member; admin is a member), so
// RETURNING is safe — same reasoning as createOrgCompany.
export async function getOnboardingTemplates(): Promise<OnboardingTemplate[]> {
  const { data, error } = await sb.from('onboarding_templates')
    .select('*, items:onboarding_template_items(*, training_doc:training_docs(title,doc_path,doc_name,link_url))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as OnboardingTemplate[]) || []).map((t) => ({
    ...t, items: (t.items || []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));
}
export async function createOnboardingTemplate(p: { name: string; org_id: string; description?: string; created_by?: string }): Promise<OnboardingTemplate> {
  const { data, error } = await sb.from('onboarding_templates')
    .insert({ name: p.name, org_id: p.org_id, description: p.description || null, created_by: p.created_by || null })
    .select('*, items:onboarding_template_items(*)').single();
  if (error) throw new Error(error.message); return data as OnboardingTemplate;
}
export async function deleteOnboardingTemplate(id: string): Promise<void> {
  const { error } = await sb.from('onboarding_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function addTemplateItem(p: { template_id: string; org_id: string; title: string; description?: string; sort_order?: number; offset_days?: number; requires_doc?: boolean; training_doc_id?: string | null }): Promise<OnboardingTemplateItem> {
  const { data, error } = await sb.from('onboarding_template_items')
    .insert({ template_id: p.template_id, org_id: p.org_id, title: p.title, description: p.description || null, sort_order: p.sort_order ?? 0, offset_days: p.offset_days ?? 0, requires_doc: p.requires_doc ?? false, training_doc_id: p.training_doc_id || null })
    .select('*, training_doc:training_docs(title,doc_path,doc_name,link_url)').single();
  if (error) throw new Error(error.message); return data as OnboardingTemplateItem;
}
export async function deleteTemplateItem(id: string): Promise<void> {
  const { error } = await sb.from('onboarding_template_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Per-hire checklist tasks. Two FKs to users → disambiguated embeds (cf. leaves).
const OB_TASK_SEL = '*, hire:users!onboarding_tasks_user_id_fkey(full_name), assignee:users!onboarding_tasks_assignee_id_fkey(full_name), training_doc:training_docs(title,doc_path,doc_name,link_url)';
export async function getOnboardingTasks(): Promise<OnboardingTask[]> {
  const { data, error } = await sb.from('onboarding_tasks').select(OB_TASK_SEL)
    .order('user_id', { ascending: true }).order('sort_order', { ascending: true });
  if (error) throw error; return (data as OnboardingTask[]) || [];
}
// Assign a template to a new hire: bulk-insert its items as tasks. Insert with
// return=minimal (no .select()) then refetch — same RLS-safe pattern as createProject.
export async function assignOnboarding(p: { user_id: string; org_id: string; template: OnboardingTemplate; created_by?: string; start_date?: string }): Promise<OnboardingTask[]> {
  const base = p.start_date ? new Date(p.start_date) : null;
  const rows = (p.template.items || []).map((it, i) => ({
    org_id: p.org_id, user_id: p.user_id, template_id: p.template.id,
    title: it.title, description: it.description, sort_order: it.sort_order ?? i, status: 'Pending',
    requires_doc: it.requires_doc ?? false,
    training_doc_id: it.training_doc_id || null,
    assignee_id: p.created_by || null,
    due_date: base ? new Date(base.getTime() + (it.offset_days || 0) * 86400000).toISOString().slice(0, 10) : null,
    created_by: p.created_by || null,
  }));
  if (rows.length === 0) return getOnboardingTasks();
  const { error } = await sb.from('onboarding_tasks').insert(rows);
  if (error) throw new Error(error.message);
  return getOnboardingTasks();
}
export async function addOnboardingTask(p: { user_id: string; org_id: string; title: string; assignee_id?: string; due_date?: string; created_by?: string; sort_order?: number }): Promise<OnboardingTask> {
  const { data, error } = await sb.from('onboarding_tasks')
    .insert({ user_id: p.user_id, org_id: p.org_id, title: p.title, assignee_id: p.assignee_id || null, due_date: p.due_date || null, created_by: p.created_by || null, sort_order: p.sort_order ?? 0, status: 'Pending' })
    .select(OB_TASK_SEL).single();
  if (error) throw new Error(error.message); return data as OnboardingTask;
}
export async function setOnboardingTaskStatus(id: string, status: 'Pending' | 'Done'): Promise<OnboardingTask> {
  const { data, error } = await sb.from('onboarding_tasks')
    .update({ status, completed_at: status === 'Done' ? new Date().toISOString() : null })
    .eq('id', id).select(OB_TASK_SEL).single();
  if (error) throw new Error(error.message); return data as OnboardingTask;
}
export async function deleteOnboardingTask(id: string): Promise<void> {
  const { error } = await sb.from('onboarding_tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Onboarding document uploads (Storage bucket employee-docs) ------------
// Path convention <org_id>/<hire_user_id>/<task_id>/<filename> — storage RLS
// admits org owner/admin or the hire themself (see migration s1_hr_core_*).
export async function uploadOnboardingDoc(t: { id: string; org_id?: string; user_id: string }, orgId: string, file: File): Promise<OnboardingTask> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${t.org_id || orgId}/${t.user_id}/${t.id}/${safe}`;
  const { error: upErr } = await sb.storage.from('employee-docs').upload(path, file, { upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await sb.from('onboarding_tasks')
    .update({ doc_path: path, doc_name: file.name, doc_uploaded_at: new Date().toISOString() })
    .eq('id', t.id).select(OB_TASK_SEL).single();
  if (error) throw new Error(error.message); return data as OnboardingTask;
}
export async function getOnboardingDocUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('employee-docs').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function removeOnboardingDoc(t: { id: string; doc_path?: string | null }): Promise<OnboardingTask> {
  if (t.doc_path) await sb.storage.from('employee-docs').remove([t.doc_path]);
  const { data, error } = await sb.from('onboarding_tasks')
    .update({ doc_path: null, doc_name: null, doc_uploaded_at: null })
    .eq('id', t.id).select(OB_TASK_SEL).single();
  if (error) throw new Error(error.message); return data as OnboardingTask;
}

// ---- 2.10 Integrations ----------------------------------------------------
export async function getIntegrations(): Promise<Integration[]> {
  const { data, error } = await sb.from('integrations').select('*').order('category', { ascending: true }).order('name', { ascending: true });
  if (error) throw error; return (data as Integration[]) || [];
}
export async function setIntegrationStatus(id: string, status: 'connected' | 'disconnected', userId: string): Promise<Integration> {
  const patch = {
    status,
    connected_by: status === 'connected' ? userId : null,
    connected_at: status === 'connected' ? new Date().toISOString() : null,
  };
  const { data, error } = await sb.from('integrations').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message); return data as Integration;
}

// ===========================================================================
// Phase 4 — HR module: employee directory/profile + payroll
// ===========================================================================
import { Employee, EmployeeCompensation, PayrollRun, Payslip } from './supabase';

// ---- Employee directory + profile -----------------------------------------
const EMPLOYEE_SEL = 'id, full_name, email, role, department, status, reports_to, phone, job_title, hire_date, company_id, address, emergency_contact, manager:users!reports_to(full_name), company:companies!users_company_id_fkey(name)';
export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await sb.from('users').select(EMPLOYEE_SEL).order('full_name');
  if (error) throw error; return (data as unknown as Employee[]) || [];
}
export async function getEmployee(id: string): Promise<Employee | null> {
  const { data, error } = await sb.from('users').select(EMPLOYEE_SEL).eq('id', id).maybeSingle();
  if (error) throw error; return (data as unknown as Employee) ?? null;
}

// Create an UNLINKED employee (auth_user_id null) via SECURITY DEFINER RPC —
// usr_insert RLS can't admit brand-new users (no shared org yet). The RPC
// enforces org owner/admin + hr feature and adds the org_members row (seat
// trigger still applies). Returns the new user id.
export async function createEmployee(p: {
  org_id: string; full_name: string; email: string; role?: string;
  department?: string | null; job_title?: string | null; hire_date?: string | null;
  company_id?: string | null; phone?: string | null; address?: string | null;
  emergency_contact?: string | null; reports_to?: string | null;
}): Promise<string> {
  const { data, error } = await sb.rpc('create_employee', {
    p_org: p.org_id, p_full_name: p.full_name, p_email: p.email,
    p_role: p.role || 'team_member', p_department: p.department || null,
    p_job_title: p.job_title || null, p_hire_date: p.hire_date || null,
    p_company_id: p.company_id || null, p_phone: p.phone || null,
    p_address: p.address || null, p_emergency_contact: p.emergency_contact || null,
    p_reports_to: p.reports_to || null,
  });
  if (error) throw new Error(error.message); return data as string;
}

// Profile edit (admin via can_manage_user, or self) — plain users update.
export type EmployeeProfilePatch = Partial<Pick<Employee,
  'full_name' | 'email' | 'role' | 'department' | 'status' | 'reports_to' |
  'phone' | 'job_title' | 'hire_date' | 'company_id' | 'address' | 'emergency_contact'>>;
export async function updateEmployeeProfile(id: string, patch: EmployeeProfilePatch): Promise<Employee> {
  const { data, error } = await sb.from('users').update(patch).eq('id', id).select(EMPLOYEE_SEL).single();
  if (error) throw new Error(error.message); return data as unknown as Employee;
}

// ---- Compensation -----------------------------------------------------------
// P1: avatars — private bucket; store the storage path on users.avatar_url and
// resolve a signed URL for rendering.
export async function uploadAvatar(orgId: string, userId: string, file: File): Promise<string> {
  const path = `${orgId}/${userId}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from('users').update({ avatar_url: path }).eq('id', userId);
  if (e2) throw new Error(e2.message);
  return path;
}
export async function getAvatarUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from('avatars').createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function getEmployeeCompensation(userId: string): Promise<EmployeeCompensation | null> {
  const { data, error } = await sb.from('employee_compensation').select('*')
    .eq('user_id', userId).order('effective_date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error; return (data as EmployeeCompensation) ?? null;
}
export async function setCompensation(p: {
  org_id: string; user_id: string; base_salary: number; currency?: string;
  pay_schedule?: string; effective_date?: string; notes?: string | null; created_by?: string | null;
  pay_type?: 'monthly' | 'hourly'; hourly_rate?: number | null;
}): Promise<EmployeeCompensation> {
  const { data, error } = await sb.from('employee_compensation')
    .insert({
      org_id: p.org_id, user_id: p.user_id, base_salary: p.base_salary,
      currency: p.currency || 'USD', pay_schedule: p.pay_schedule || 'Monthly',
      pay_type: p.pay_type || 'monthly', hourly_rate: p.hourly_rate ?? null,
      effective_date: p.effective_date || today(), notes: p.notes || null, created_by: p.created_by || null,
    })
    .select('*').single();
  if (error) throw new Error(error.message); return data as EmployeeCompensation;
}

// ---- Payroll runs -------------------------------------------------------------
export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const { data, error } = await sb.from('payroll_runs').select('*')
    .order('period_start', { ascending: false });
  if (error) throw error; return (data as PayrollRun[]) || [];
}
export async function createPayrollRun(p: {
  org_id: string; period_label: string; period_start: string; period_end: string;
  status?: string; notes?: string | null; created_by?: string | null;
}): Promise<PayrollRun> {
  const { data, error } = await sb.from('payroll_runs')
    .insert({
      org_id: p.org_id, period_label: p.period_label, period_start: p.period_start,
      period_end: p.period_end, status: p.status || 'Draft', notes: p.notes || null, created_by: p.created_by || null,
    })
    .select('*').single();
  if (error) throw new Error(error.message); return data as PayrollRun;
}
export async function updatePayrollRunStatus(id: string, status: PayrollRun['status']): Promise<PayrollRun> {
  const { data, error } = await sb.from('payroll_runs').update({ status }).eq('id', id).select('*').single();
  if (error) throw new Error(error.message); return data as PayrollRun;
}
export async function deletePayrollRun(id: string): Promise<void> {
  const { error } = await sb.from('payroll_runs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Payslips -------------------------------------------------------------
const PAYSLIP_SEL = '*, users(full_name, email, job_title, department)';
export async function getPayslips(runId: string): Promise<Payslip[]> {
  const { data, error } = await sb.from('payslips').select(PAYSLIP_SEL)
    .eq('run_id', runId).order('created_at', { ascending: true });
  if (error) throw error; return (data as Payslip[]) || [];
}
export async function getMyPayslips(userId: string): Promise<Payslip[]> {
  const { data, error } = await sb.from('payslips').select(PAYSLIP_SEL)
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error; return (data as Payslip[]) || [];
}
export async function createPayslip(p: {
  org_id: string; run_id: string; user_id: string; gross: number; deductions: number;
  net?: number; breakdown?: Record<string, any>;
}): Promise<Payslip> {
  const { data, error } = await sb.from('payslips')
    .insert({
      org_id: p.org_id, run_id: p.run_id, user_id: p.user_id, gross: p.gross,
      deductions: p.deductions, net: p.net ?? (p.gross - p.deductions), breakdown: p.breakdown || {},
    })
    .select(PAYSLIP_SEL).single();
  if (error) throw new Error(error.message); return data as Payslip;
}
// P2: load all active employees into a Draft run (hours from time_entries, days from attendance)
export async function preparePayrollRun(runId: string): Promise<number> {
  const { data, error } = await sb.rpc('payroll_prepare_run', { p_run: runId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}
export async function updatePayslip(id: string, patch: Partial<Payslip>): Promise<Payslip> {
  const { data, error } = await sb.from('payslips').update(patch).eq('id', id).select(PAYSLIP_SEL).single();
  if (error) throw new Error(error.message); return data as Payslip;
}
export async function deletePayslip(id: string): Promise<void> {
  const { error } = await sb.from('payslips').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Task custom fields (per-project; RLS = can_access_project) ----
import { TaskFieldDef, TaskFieldValue } from './supabase';

export async function getTaskFieldDefs(projectId: string): Promise<TaskFieldDef[]> {
  const { data, error } = await sb.from('task_field_definitions').select('*').eq('project_id', projectId).order('created_at');
  if (error) throw new Error(error.message);
  return (data as TaskFieldDef[]) || [];
}

export async function createTaskFieldDef(d: {
  org_id: string; project_id: string; name: string; field_type: string; options?: string[] | null;
}): Promise<TaskFieldDef> {
  const { data, error } = await sb.from('task_field_definitions').insert(d).select('*').single();
  if (error) throw new Error(error.message);
  return data as TaskFieldDef;
}

export async function deleteTaskFieldDef(id: string): Promise<void> {
  const { error } = await sb.from('task_field_definitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getTaskFieldValues(taskId: string): Promise<TaskFieldValue[]> {
  const { data, error } = await sb.from('task_field_values').select('*').eq('task_id', taskId);
  if (error) throw new Error(error.message);
  return (data as TaskFieldValue[]) || [];
}

export async function upsertTaskFieldValue(v: {
  task_id: string; field_id: string; project_id: string; value: string | null;
}): Promise<void> {
  const { error } = await sb.from('task_field_values').upsert({ ...v, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ---- Generalized custom fields (CRM + HR; RLS = is_org_member + feature; defs gated owner/admin) ----
import { CustomFieldDef, CustomFieldValue, CustomEntityType } from './supabase';

export async function getCustomFieldDefs(orgId: string, entityType: CustomEntityType): Promise<CustomFieldDef[]> {
  const { data, error } = await sb.from('custom_field_definitions').select('*')
    .eq('org_id', orgId).eq('entity_type', entityType).order('position').order('created_at');
  if (error) throw new Error(error.message);
  return (data as CustomFieldDef[]) || [];
}

export async function createCustomFieldDef(d: {
  org_id: string; entity_type: CustomEntityType; name: string; field_type: string;
  options?: string[] | null; position?: number;
}): Promise<CustomFieldDef> {
  const { data, error } = await sb.from('custom_field_definitions').insert(d).select('*').single();
  if (error) throw new Error(error.message);
  return data as CustomFieldDef;
}

export async function deleteCustomFieldDef(id: string): Promise<void> {
  const { error } = await sb.from('custom_field_definitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getCustomFieldValues(entityType: CustomEntityType, entityId: string): Promise<CustomFieldValue[]> {
  const { data, error } = await sb.from('custom_field_values').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId);
  if (error) throw new Error(error.message);
  return (data as CustomFieldValue[]) || [];
}

export async function upsertCustomFieldValue(v: {
  org_id: string; entity_type: CustomEntityType; entity_id: string; field_id: string; value: string | null;
}): Promise<void> {
  const { error } = await sb.from('custom_field_values').upsert({ ...v, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ---- Ledger entries (S2 finance core) -------------------------------------
// RLS `ledger_all` mirrors financials: (project null -> org member, else
// can_access_project) AND org_has_feature 'financial'. Single ALL policy with
// identical WITH CHECK -> INSERT...RETURNING is safe (no return=minimal dance).
import { LedgerEntry } from './supabase';

export const LEDGER_CATEGORIES: Record<'income' | 'expense', string[]> = {
  income: ['Sales', 'Services', 'Retainers', 'Other income'],
  expense: ['Salaries', 'Domains', 'Tools', 'Rent', 'Fuel', 'Food', 'Welfare', 'Marketing', 'Travel', 'Other'],
};
const LEDGER_SEL = '*, project:projects(name), company:companies(name)';

export async function getLedgerEntries(): Promise<LedgerEntry[]> {
  const { data, error } = await sb.from('ledger_entries').select(LEDGER_SEL)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error; return (data as LedgerEntry[]) || [];
}
export async function createLedgerEntry(p: {
  org_id: string; type: 'income' | 'expense'; category: string; amount: number;
  entry_date: string; project_id?: string | null; company_id?: string | null;
  notes?: string | null; created_by?: string | null;
}): Promise<LedgerEntry> {
  const { data, error } = await sb.from('ledger_entries').insert({
    org_id: p.org_id, type: p.type, category: p.category, amount: p.amount,
    entry_date: p.entry_date, project_id: p.project_id || null, company_id: p.company_id || null,
    notes: p.notes || null, created_by: p.created_by || null,
  }).select(LEDGER_SEL).single();
  if (error) throw new Error(error.message); return data as LedgerEntry;
}
export async function updateLedgerEntry(id: string, patch: Partial<Pick<LedgerEntry,
  'type' | 'category' | 'amount' | 'entry_date' | 'project_id' | 'company_id' | 'notes'>>): Promise<LedgerEntry> {
  const { data, error } = await sb.from('ledger_entries').update(patch).eq('id', id).select(LEDGER_SEL).single();
  if (error) throw new Error(error.message); return data as LedgerEntry;
}
export async function deleteLedgerEntry(id: string): Promise<void> {
  const { error } = await sb.from('ledger_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- S3: Ideas (org-scoped backlog; single ALL policy is_org_member -> RETURNING safe) ---
import { Idea, IdeaStatus } from './supabase';

export const IDEA_STATUSES: IdeaStatus[] = ['idea', 'exploring', 'approved', 'building', 'shipped', 'parked'];
const IDEA_SEL = '*, votes:idea_votes(user_id), project:projects(name), creator:users!ideas_created_by_fkey(full_name)';

export async function getIdeas(): Promise<Idea[]> {
  const { data, error } = await sb.from('ideas').select(IDEA_SEL)
    .order('created_at', { ascending: false });
  if (error) throw error; return (data as Idea[]) || [];
}
export async function createIdea(p: {
  org_id: string; title: string; pitch?: string | null; created_by?: string | null;
}): Promise<Idea> {
  const { data, error } = await sb.from('ideas').insert({
    org_id: p.org_id, title: p.title, pitch: p.pitch || null, created_by: p.created_by || null,
  }).select(IDEA_SEL).single();
  if (error) throw new Error(error.message); return data as Idea;
}
export async function updateIdea(id: string, patch: Partial<Pick<Idea,
  'title' | 'pitch' | 'status' | 'project_id'>>): Promise<Idea> {
  const { data, error } = await sb.from('ideas').update(patch).eq('id', id).select(IDEA_SEL).single();
  if (error) throw new Error(error.message); return data as Idea;
}
export async function deleteIdea(id: string): Promise<void> {
  const { error } = await sb.from('ideas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
// Toggle the current user's vote. RLS pins idea_votes.user_id to the caller.
export async function toggleIdeaVote(idea: Idea, userId: string): Promise<void> {
  const voted = (idea.votes || []).some((v) => v.user_id === userId);
  if (voted) {
    const { error } = await sb.from('idea_votes').delete().eq('idea_id', idea.id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('idea_votes').insert({ idea_id: idea.id, user_id: userId });
    if (error) throw new Error(error.message);
  }
}
// Convert an idea into a real project (status -> building, link kept on the idea).
// Reuses createProject (return=minimal + refetch, the projects RLS-safe path),
// then locates the new row in the authoritative list it returns.
export async function convertIdeaToProject(idea: Idea, userId?: string | null):
  Promise<{ idea: Idea; projects: Project[] }> {
  const projects = await createProject({
    name: idea.title, org_id: idea.org_id,
    description: idea.pitch || null, created_by: userId || null,
  });
  const matches = projects.filter((p) => p.name === idea.title);
  const proj = matches.length
    ? matches.reduce((a, b) => ((a.created_at || '') > (b.created_at || '') ? a : b))
    : null;
  const updated = await updateIdea(idea.id, { status: 'building', project_id: proj ? proj.id : null });
  return { idea: updated, projects };
}

// --- S4: Training docs & Job descriptions (HR; Storage bucket training-docs) ---
// RLS: select = org member (+hr feature), writes = org owner/admin -> insert
// RETURNING is safe (admins pass the member select policy). Files live in the
// private bucket 'training-docs' under <org_id>/<table>/<row_id>/<filename>;
// storage policies mirror that split (member read / admin write).
import { TrainingDoc, JobDescription } from './supabase';

const TDOC_SEL = '*, role_template:role_templates(name), creator:users(full_name)';
const JD_SEL = TDOC_SEL;
type HrDocTable = 'training_docs' | 'job_descriptions';

export async function getTrainingDocs(): Promise<TrainingDoc[]> {
  const { data, error } = await sb.from('training_docs').select(TDOC_SEL)
    .order('created_at', { ascending: false });
  if (error) throw error; return (data as TrainingDoc[]) || [];
}
export async function createTrainingDoc(p: {
  org_id: string; title: string; description?: string | null; category?: string | null;
  department?: string | null; role_template_id?: string | null; link_url?: string | null;
  created_by?: string | null;
}): Promise<TrainingDoc> {
  const { data, error } = await sb.from('training_docs').insert({
    org_id: p.org_id, title: p.title, description: p.description || null,
    category: p.category || null, department: p.department || null,
    role_template_id: p.role_template_id || null, link_url: p.link_url || null,
    created_by: p.created_by || null,
  }).select(TDOC_SEL).single();
  if (error) throw new Error(error.message); return data as TrainingDoc;
}
export async function updateTrainingDoc(id: string, patch: Partial<Pick<TrainingDoc,
  'title' | 'description' | 'category' | 'department' | 'role_template_id' | 'link_url'>>): Promise<TrainingDoc> {
  const { data, error } = await sb.from('training_docs').update(patch).eq('id', id).select(TDOC_SEL).single();
  if (error) throw new Error(error.message); return data as TrainingDoc;
}
export async function deleteTrainingDoc(d: { id: string; doc_path?: string | null }): Promise<void> {
  if (d.doc_path) await sb.storage.from('training-docs').remove([d.doc_path]); // best-effort
  const { error } = await sb.from('training_docs').delete().eq('id', d.id);
  if (error) throw new Error(error.message);
}

export async function getJobDescriptions(): Promise<JobDescription[]> {
  const { data, error } = await sb.from('job_descriptions').select(JD_SEL)
    .order('created_at', { ascending: false });
  if (error) throw error; return (data as JobDescription[]) || [];
}
export async function createJobDescription(p: {
  org_id: string; title: string; department?: string | null; role_template_id?: string | null;
  summary?: string | null; responsibilities?: string | null; requirements?: string | null;
  created_by?: string | null;
}): Promise<JobDescription> {
  const { data, error } = await sb.from('job_descriptions').insert({
    org_id: p.org_id, title: p.title, department: p.department || null,
    role_template_id: p.role_template_id || null, summary: p.summary || null,
    responsibilities: p.responsibilities || null, requirements: p.requirements || null,
    created_by: p.created_by || null,
  }).select(JD_SEL).single();
  if (error) throw new Error(error.message); return data as JobDescription;
}
export async function updateJobDescription(id: string, patch: Partial<Pick<JobDescription,
  'title' | 'department' | 'role_template_id' | 'summary' | 'responsibilities' | 'requirements'>>): Promise<JobDescription> {
  const { data, error } = await sb.from('job_descriptions').update(patch).eq('id', id).select(JD_SEL).single();
  if (error) throw new Error(error.message); return data as JobDescription;
}
export async function deleteJobDescription(d: { id: string; doc_path?: string | null }): Promise<void> {
  if (d.doc_path) await sb.storage.from('training-docs').remove([d.doc_path]); // best-effort
  const { error } = await sb.from('job_descriptions').delete().eq('id', d.id);
  if (error) throw new Error(error.message);
}

// Upload/replace the file attached to a training doc or JD (admin-only per storage RLS).
export async function uploadHrDoc<T extends TrainingDoc | JobDescription>(
  table: HrDocTable, row: { id: string; org_id: string }, file: File): Promise<T> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${row.org_id}/${table}/${row.id}/${safe}`;
  const { error: upErr } = await sb.storage.from('training-docs').upload(path, file, { upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await sb.from(table)
    .update({ doc_path: path, doc_name: file.name, doc_uploaded_at: new Date().toISOString() })
    .eq('id', row.id).select(table === 'training_docs' ? TDOC_SEL : JD_SEL).single();
  if (error) throw new Error(error.message); return data as T;
}
export async function removeHrDoc<T extends TrainingDoc | JobDescription>(
  table: HrDocTable, row: { id: string; doc_path?: string | null }): Promise<T> {
  if (row.doc_path) await sb.storage.from('training-docs').remove([row.doc_path]);
  const { data, error } = await sb.from(table)
    .update({ doc_path: null, doc_name: null, doc_uploaded_at: null })
    .eq('id', row.id).select(table === 'training_docs' ? TDOC_SEL : JD_SEL).single();
  if (error) throw new Error(error.message); return data as T;
}
export async function getTrainingDocUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('training-docs').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}

// ---------------------------------------------------------------------------
// S5 Chat — org channel (project_id null) + per-project channels.
// RLS: chat_select = is_org_member AND (org channel OR can_access_project);
// chat_insert pins sender_id = current_app_user_id() (spoof-proof);
// chat_delete = own message OR org owner/admin. RETURNING is safe (the sender
// always passes chat_select on their own new row), so .select() embeds work.
// ---- W6 Guests ------------------------------------------------------------
// SECURITY DEFINER RPC: directory row + guest org membership (seat-exempt) +
// project_members viewer access in one call. Admin-gated server-side.
export async function createGuest(p: { org_id: string; email: string; name: string; project_id: string }): Promise<string> {
  const { data, error } = await sb.rpc('create_guest', {
    p_org: p.org_id, p_email: p.email, p_name: p.name, p_project: p.project_id,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

import { Team } from './supabase';

// ---- W3 Teams -----------------------------------------------------------------
// split policies: member read / owner-admin write => RETURNING safe for admins.
const TEAM_SEL = '*, members:team_members(user_id, users(full_name))';
export async function getTeams(): Promise<Team[]> {
  const { data, error } = await sb.from('teams').select(TEAM_SEL).order('name');
  if (error) throw error; return (data as Team[]) || [];
}
export async function createTeam(p: { org_id: string; name: string; description?: string; color?: string }): Promise<Team> {
  const { data, error } = await sb.from('teams')
    .insert({ org_id: p.org_id, name: p.name, description: p.description || null, color: p.color || null })
    .select(TEAM_SEL).single();
  if (error) throw new Error(error.message); return data as Team;
}
export async function updateTeam(id: string, patch: { name?: string; description?: string | null; color?: string | null }): Promise<Team> {
  const { data, error } = await sb.from('teams').update(patch).eq('id', id).select(TEAM_SEL).single();
  if (error) throw new Error(error.message); return data as Team;
}
export async function deleteTeam(id: string): Promise<void> {
  const { error } = await sb.from('teams').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function addTeamMember(teamId: string, userId: string, orgId: string): Promise<void> {
  const { error } = await sb.from('team_members').insert({ team_id: teamId, user_id: userId, org_id: orgId });
  if (error) throw new Error(error.message);
}
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await sb.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

import { ChecklistItem, Reminder } from './supabase';

// ---- W2 Checklists / Reminders ----------------------------------------------
export async function getTaskChecklist(taskId: string): Promise<ChecklistItem[]> {
  const { data, error } = await sb.from('task_checklist_items').select('*')
    .eq('task_id', taskId).order('sort_order').order('created_at');
  if (error) throw error; return (data as ChecklistItem[]) || [];
}
export async function addChecklistItem(p: { org_id: string; task_id: string; project_id?: string | null; label: string; sort_order?: number }): Promise<ChecklistItem> {
  const { data, error } = await sb.from('task_checklist_items')
    .insert({ org_id: p.org_id, task_id: p.task_id, project_id: p.project_id || null, label: p.label, sort_order: p.sort_order ?? 0 })
    .select('*').single();
  if (error) throw new Error(error.message); return data as ChecklistItem;
}
export async function toggleChecklistItem(id: string, done: boolean): Promise<void> {
  const { error } = await sb.from('task_checklist_items').update({ done }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await sb.from('task_checklist_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function createReminder(p: { org_id: string; user_id: string; note: string; remind_at: string; entity_type?: string; entity_id?: string }): Promise<Reminder> {
  const { data, error } = await sb.from('reminders').insert({
    org_id: p.org_id, user_id: p.user_id, note: p.note, remind_at: p.remind_at,
    entity_type: p.entity_type || null, entity_id: p.entity_id || null,
  }).select('*').single();
  if (error) throw new Error(error.message); return data as Reminder;
}
export async function getMyReminders(userId: string): Promise<Reminder[]> {
  const { data, error } = await sb.from('reminders').select('*')
    .eq('user_id', userId).is('sent_at', null).order('remind_at');
  if (error) throw error; return (data as Reminder[]) || [];
}
export async function deleteReminder(id: string): Promise<void> {
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

import { TimeEntry } from './supabase';

// ---- W1 Time tracking -------------------------------------------------------
// insert pinned to self (RLS time_insert); own rows pass time_select => RETURNING safe.
const TIME_SEL = '*, user:users!time_entries_user_id_fkey(full_name)';

export async function getTaskTimeEntries(taskId: string): Promise<TimeEntry[]> {
  const { data, error } = await sb.from('time_entries').select(TIME_SEL)
    .eq('task_id', taskId).order('started_at', { ascending: false });
  if (error) throw error; return (data as TimeEntry[]) || [];
}
export async function getMyOpenTimer(userId: string): Promise<TimeEntry | null> {
  const { data, error } = await sb.from('time_entries').select(TIME_SEL)
    .eq('user_id', userId).is('ended_at', null).maybeSingle();
  if (error) throw error; return (data as TimeEntry) || null;
}
export async function startTimer(p: { org_id: string; task_id: string; project_id?: string | null; user_id: string }): Promise<TimeEntry> {
  const { data, error } = await sb.from('time_entries')
    .insert({ org_id: p.org_id, task_id: p.task_id, project_id: p.project_id || null, user_id: p.user_id })
    .select(TIME_SEL).single();
  if (error) throw new Error(error.code === '23505' ? 'You already have a running timer — stop it first.' : error.message);
  return data as TimeEntry;
}
export async function stopTimer(entry: TimeEntry): Promise<TimeEntry> {
  const ended = new Date();
  const mins = Math.max(1, Math.round((ended.getTime() - new Date(entry.started_at).getTime()) / 60000));
  const { data, error } = await sb.from('time_entries')
    .update({ ended_at: ended.toISOString(), duration_minutes: mins })
    .eq('id', entry.id).select(TIME_SEL).single();
  if (error) throw new Error(error.message); return data as TimeEntry;
}
export async function addManualTime(p: { org_id: string; task_id: string; project_id?: string | null; user_id: string; minutes: number; date?: string; notes?: string }): Promise<TimeEntry> {
  const start = p.date ? new Date(p.date + 'T09:00:00') : new Date(Date.now() - p.minutes * 60000);
  const { data, error } = await sb.from('time_entries').insert({
    org_id: p.org_id, task_id: p.task_id, project_id: p.project_id || null, user_id: p.user_id,
    started_at: start.toISOString(), ended_at: new Date(start.getTime() + p.minutes * 60000).toISOString(),
    duration_minutes: p.minutes, is_manual: true, notes: p.notes || null,
  }).select(TIME_SEL).single();
  if (error) throw new Error(error.message); return data as TimeEntry;
}
export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await sb.from('time_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
/** Org-wide finished entries in a date range (admin: payroll/reporting). */
export async function getTimeEntriesRange(orgId: string, fromIso: string, toIso: string): Promise<TimeEntry[]> {
  const { data, error } = await sb.from('time_entries').select(TIME_SEL)
    .eq('org_id', orgId).gte('started_at', fromIso).lt('started_at', toIso)
    .not('duration_minutes', 'is', null);
  if (error) throw error; return (data as TimeEntry[]) || [];
}

import { ChatMessage } from './supabase';

const CHAT_SEL = '*, sender:users(full_name)';
const CHAT_PAGE = 50;

export async function getChatMessages(projectId: string | null): Promise<ChatMessage[]> {
  let q = sb.from('chat_messages').select(CHAT_SEL)
    .order('created_at', { ascending: false }).limit(CHAT_PAGE);
  q = projectId === null ? q.is('project_id', null) : q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (((data as ChatMessage[]) || [])).reverse(); // oldest -> newest for rendering
}
export async function sendChatMessage(p: {
  org_id: string; project_id?: string | null; sender_id: string; body: string;
}): Promise<ChatMessage> {
  const { data, error } = await sb.from('chat_messages').insert({
    org_id: p.org_id, project_id: p.project_id || null, sender_id: p.sender_id, body: p.body,
  }).select(CHAT_SEL).single();
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}
export async function deleteChatMessage(id: string): Promise<void> {
  const { error } = await sb.from('chat_messages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}


// ---------------------------------------------------------------------------
// Billing (Stripe) — platform-admin config + org checkout/portal via edge fns.
// Secrets live server-side only; these RPCs never return secret values.
// ---------------------------------------------------------------------------
export interface BillingStatus { publishable_key: string | null; mode: 'test' | 'live'; has_secret: boolean; has_webhook: boolean; updated_at: string | null; }

export async function billingGetStatus(): Promise<BillingStatus | null> {
  const { data, error } = await sb.rpc('billing_get_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function billingSetConfig(p: { secret?: string; publishable?: string; webhook?: string; mode?: string }): Promise<void> {
  const { error } = await sb.rpc('billing_set_config', {
    p_secret: p.secret ?? '', p_publishable: p.publishable ?? '', p_webhook: p.webhook ?? '', p_mode: p.mode ?? '',
  });
  if (error) throw error;
}

export async function billingSetPlanPrice(planId: string, priceId: string): Promise<void> {
  const { error } = await sb.rpc('billing_set_plan_price', { p_plan_id: planId, p_price_id: priceId });
  if (error) throw error;
}

export interface EmailStatus { from_email: string | null; reply_to: string | null; enabled: boolean; has_key: boolean; pending_count: number; sent_count: number; updated_at: string | null; }

export async function emailGetStatus(): Promise<EmailStatus | null> {
  const { data, error } = await sb.rpc('email_get_status');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function emailSetConfig(p: { apiKey?: string; from?: string; replyTo?: string; enabled?: boolean }): Promise<void> {
  const { error } = await sb.rpc('email_set_config', {
    p_api_key: p.apiKey ?? '', p_from: p.from ?? '', p_reply_to: p.replyTo ?? '', p_enabled: p.enabled ?? null,
  });
  if (error) throw error;
}

/** Start a Stripe Checkout session for an org+plan; returns the redirect URL. */
export async function startCheckout(orgId: string, planKey: string): Promise<string> {
  const { data, error } = await sb.functions.invoke('stripe-checkout', { body: { org_id: orgId, plan_key: planKey } });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (!data?.url) throw new Error('No checkout URL returned');
  return data.url as string;
}

/** Open the Stripe billing portal for an org; returns the redirect URL. */
export async function openBillingPortal(orgId: string): Promise<string> {
  const { data, error } = await sb.functions.invoke('stripe-portal', { body: { org_id: orgId } });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (!data?.url) throw new Error('No portal URL returned');
  return data.url as string;
}

// ── Custom task statuses (per-org, ClickUp-style) ───────────────────────────
export interface TaskStatus { id: string; org_id: string; name: string; color: string; category: 'todo' | 'active' | 'done'; position: number; scope?: string; }

export async function getTaskStatuses(orgId: string, scope = 'task'): Promise<TaskStatus[]> {
  const { data, error } = await sb.from('task_statuses').select('*').eq('org_id', orgId).eq('scope', scope).order('position');
  if (error) throw error;
  return (data as TaskStatus[]) || [];
}
/** Returns the org's statuses, seeding the 7 defaults the first time. */
export async function ensureTaskStatuses(orgId: string, scope = 'task'): Promise<TaskStatus[]> {
  let list = await getTaskStatuses(orgId, scope);
  if (list.length === 0) { await sb.rpc('seed_default_statuses', { p_org: orgId, p_scope: scope }); list = await getTaskStatuses(orgId, scope); }
  return list;
}
export async function createTaskStatus(p: { org_id: string; name: string; color: string; category: string; position: number; scope?: string }): Promise<void> {
  const { error } = await sb.from('task_statuses').insert({ ...p, scope: p.scope || 'task' }); // return=minimal (RETURNING-safe)
  if (error) throw error;
}
export async function updateTaskStatusDef(id: string, patch: Partial<{ name: string; color: string; category: string; position: number }>): Promise<void> {
  const { error } = await sb.from('task_statuses').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteTaskStatusDef(id: string): Promise<void> {
  const { error } = await sb.from('task_statuses').delete().eq('id', id);
  if (error) throw error;
}
