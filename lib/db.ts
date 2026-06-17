import { sb, Project, Task, Company, OrgCompany, CompanyMember, MemberRole, Portfolio, PortfolioMember, Contact, Deal, CrmActivity, AppUser, OrgUser, MyOrg, Organization, Risk, Financial, Comment, Plan, Feature, PlanFeature, PlatformOrg, OrgPlanInfo, OrgProfile, ORG_PROFILE_KEYS } from './supabase';
import { buildDemoPayload } from './demoSeed';

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
    .select('id, auth_user_id, username, email, full_name, role, department, feature_access, avatar_url')
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
    .select('role, organizations(id, slug, name, branding, plan, onboarding, theme_skin, allow_user_themes)')
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

export async function getOrgBrandingByHost(host: string): Promise<Organization | null> {
  const { data, error } = await sb.rpc('org_branding_by_host', { p_host: host });
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

// ---- #8 Self-serve industry demo seed ----
export async function seedDemoData(orgId: string, industry: string | null): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo', { p_org: orgId, p_payload: buildDemoPayload(industry) });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, number>;
}

// ---- #5 Tenant profile (contact / web / location / classification) ----
// Owner/admin path: org_select RLS lets a member read; org_update lets owner/admin write.
const PROFILE_SELECT = ORG_PROFILE_KEYS.join(', ');
export async function getOrgProfile(orgId: string): Promise<OrgProfile> {
  const { data, error } = await sb.from('organizations').select(PROFILE_SELECT).eq('id', orgId).single();
  if (error) throw new Error(error.message);
  return data as unknown as OrgProfile;
}
export async function saveOrgProfile(orgId: string, patch: Partial<OrgProfile>): Promise<void> {
  const fields: Record<string, any> = {};
  for (const k of ORG_PROFILE_KEYS) if (k in patch) fields[k] = (patch[k] ?? '') === '' ? null : patch[k];
  const { error } = await sb.from('organizations').update(fields).eq('id', orgId);
  if (error) throw new Error(error.message);
}
// Operator path: platform admins aren't org members, so they go through SECURITY DEFINER RPCs.
export async function platformGetOrgProfile(orgId: string): Promise<OrgProfile> {
  const { data, error } = await sb.rpc('platform_org_profile', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data || {}) as OrgProfile;
}
export async function platformSaveOrgProfile(orgId: string, patch: Partial<OrgProfile>): Promise<void> {
  const { error } = await sb.rpc('platform_update_org_profile', { p_org: orgId, p_patch: patch });
  if (error) throw new Error(error.message);
}

// Theme skin is a free, per-tenant UI preference (NOT white-label branding, which is
// plan-gated by the fn_enforce_white_label trigger). Stored in its own column so any
// owner/admin can change it without the white_label feature. RLS org_update gates it.
export async function setOrgTheme(orgId: string, skin: string): Promise<{ id: string; theme_skin: string | null }> {
  const { data, error } = await sb
    .from('organizations')
    .update({ theme_skin: skin })
    .eq('id', orgId)
    .select('id, theme_skin')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; theme_skin: string | null };
}
// Tenant toggle: let members pick their own skin (ungated column; owner/admin via org_update RLS).
export async function setOrgAllowUserThemes(orgId: string, allow: boolean): Promise<void> {
  const { error } = await sb.from('organizations').update({ allow_user_themes: allow }).eq('id', orgId);
  if (error) throw new Error(error.message);
}

// ---- Customizable dashboard layouts (per-user + per-tenant default) ----
export interface DashboardLayouts { personal: string[] | null; orgDefault: string[] | null; }
export async function getDashboardLayouts(orgId: string, userId: string): Promise<DashboardLayouts> {
  const { data, error } = await sb.from('dashboard_layouts').select('user_id, widget_keys').eq('org_id', orgId);
  if (error) throw new Error(error.message);
  const rows = (data || []) as { user_id: string | null; widget_keys: string[] }[];
  return {
    personal: rows.find((r) => r.user_id === userId)?.widget_keys ?? null,
    orgDefault: rows.find((r) => r.user_id === null)?.widget_keys ?? null,
  };
}
export async function saveUserDashboard(orgId: string, keys: string[]): Promise<void> {
  const { error } = await sb.rpc('dashboard_save_user_layout', { p_org: orgId, p_keys: keys });
  if (error) throw new Error(error.message);
}
export async function saveOrgDashboard(orgId: string, keys: string[]): Promise<void> {
  const { error } = await sb.rpc('dashboard_save_org_layout', { p_org: orgId, p_keys: keys });
  if (error) throw new Error(error.message);
}
export async function resetUserDashboard(orgId: string): Promise<void> {
  const { error } = await sb.rpc('dashboard_reset_user_layout', { p_org: orgId });
  if (error) throw new Error(error.message);
}

export async function getOrgUsers(): Promise<OrgUser[]> {
  const { data, error } = await sb.from('users').select('id, full_name, email, avatar_url').order('full_name');
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
  const set = new Set(((pf || []) as any[]).map((r) => r.feature_key as string));
  // Per-tenant overrides win over the plan default (operator toggles in /tenants/[id]).
  const { data: ov } = await sb.from('org_feature_overrides').select('feature_key, enabled').eq('org_id', orgId);
  for (const o of (ov || []) as any[]) { if (o.enabled) set.add(o.feature_key); else set.delete(o.feature_key); }
  return [...set];
}

export async function ensurePersonalWorkspace(): Promise<{ created: boolean; org_id?: string; workspace?: string; reason?: string }> {
  const { data, error } = await sb.rpc('ensure_personal_workspace');
  if (error) throw new Error(error.message);
  return data as { created: boolean; org_id?: string; workspace?: string; reason?: string };
}
export interface PlatformAccount { user_id: string; email: string; full_name: string | null; role: string; created_at: string | null; org_count: number; orgs: string[]; }
export async function platformAccounts(): Promise<PlatformAccount[]> {
  const { data, error } = await sb.rpc('platform_accounts');
  if (error) throw new Error(error.message);
  return (data as PlatformAccount[]) || [];
}
export interface TenantUser { user_id: string; email: string; full_name: string | null; avatar_url: string | null; job_title: string | null; status: string | null; org_role: string; guest_level: string | null; last_login: string | null; joined_at: string | null; }
export async function tenantUsers(orgId: string): Promise<TenantUser[]> {
  const { data, error } = await sb.rpc('tenant_users', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data as TenantUser[]) || [];
}
export async function saveOnboarding(orgId: string, name: string, meta: Record<string, any>): Promise<void> {
  const { error } = await sb.rpc('save_onboarding', { p_org: orgId, p_name: name, p_meta: meta });
  if (error) throw new Error(error.message);
}
export interface MyProfile { id: string; full_name: string | null; phone: string | null; job_title: string | null; avatar_url: string | null; }
export async function getMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await sb.from('users').select('id, full_name, phone, job_title, avatar_url').eq('id', userId).single();
  if (error) throw error; return data as MyProfile;
}
export async function updateMyProfile(userId: string, patch: Partial<Omit<MyProfile, 'id'>>): Promise<void> {
  const { error } = await sb.from('users').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}
export interface OrgOption { id: string; label: string; sort_order: number; active: boolean; }
export async function getOrgOptions(orgId: string, key: string): Promise<OrgOption[]> {
  const { data, error } = await sb.rpc('options_list', { p_org: orgId, p_key: key });
  if (error) throw new Error(error.message); return (data as OrgOption[]) || [];
}
export async function addOption(orgId: string, key: string, label: string): Promise<void> {
  const { error } = await sb.rpc('option_add', { p_org: orgId, p_key: key, p_label: label }); if (error) throw new Error(error.message);
}
export async function updateOption(id: string, label: string, active: boolean): Promise<void> {
  const { error } = await sb.rpc('option_update', { p_id: id, p_label: label, p_active: active }); if (error) throw new Error(error.message);
}
export async function deleteOption(id: string): Promise<void> {
  const { error } = await sb.rpc('option_delete', { p_id: id }); if (error) throw new Error(error.message);
}
export async function reorderOptions(ids: string[]): Promise<void> {
  const { error } = await sb.rpc('option_reorder', { p_ids: ids }); if (error) throw new Error(error.message);
}
export async function getOrgPlanFeatures(orgId: string): Promise<string[]> {
  const { data: sub } = await sb.from('subscriptions').select('plan_id, status').eq('org_id', orgId).maybeSingle();
  let planId = sub?.plan_id as string | undefined;
  const active = sub && (sub.status === 'active' || sub.status === 'trialing');
  if (!active) { const { data: free } = await sb.from('plans').select('id').eq('key', 'free').maybeSingle(); planId = free?.id; }
  if (!planId) return [];
  const { data: pf } = await sb.from('plan_features').select('feature_key').eq('plan_id', planId).eq('enabled', true);
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
// #35: push the FE FEATURES catalog into the DB features table (platform admin).
// Idempotent upsert — new/future catalog keys auto-appear in Plans & features.
export async function syncFeatures(features: readonly { key: string; label: string }[]): Promise<void> {
  const { error } = await sb.rpc('features_sync', { p_features: features });
  if (error) throw new Error(error.message);
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
export interface PlanLimit { plan_id: string; key: string; value: number; }
export async function listPlanLimits(): Promise<PlanLimit[]> {
  const { data, error } = await sb.rpc('plan_limits_all');
  if (error) throw new Error(error.message);
  return (data as PlanLimit[]) || [];
}
export async function setPlanLimit(planId: string, key: string, value: number | null): Promise<void> {
  const { error } = await sb.rpc('plan_limit_set', { p_plan_id: planId, p_key: key, p_value: value });
  if (error) throw new Error(error.message);
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
  return softDelete('project', id);
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
  return softDelete('company', id);
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
  return softDelete('portfolio', id);
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
  return softDelete('deal', id);
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
export async function getComments(entityType: 'task' | 'project' | 'idea', entityId: string): Promise<Comment[]> {
  const { data, error } = await sb.from('comments').select('*')
    .eq('entity_type', entityType).eq('entity_id', entityId).eq('deleted', false)
    .order('created_at', { ascending: true });
  if (error) throw error; return (data as Comment[]) || [];
}
export async function addComment(c: { entity_type: 'task' | 'project' | 'idea'; entity_id: string; org_id: string; author_id: string; body: string; mentions: string[] }): Promise<Comment> {
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
import { Attendance, Leave, AppNotification, Tag, Integration, AuditEntry, AdminUser, RoleTemplate, OnboardingTemplate, OnboardingTemplateItem, OnboardingTask, OrgInvite } from './supabase';

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
export async function getRecentSystemNotifications(userId: string, sinceIso: string): Promise<AppNotification[]> {
  const { data, error } = await sb.from('notifications').select('*')
    .eq('user_id', userId).eq('type', 'SYSTEM').eq('is_read', false)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: true }).limit(5);
  if (error) throw error; return (data as AppNotification[]) || [];
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

// Comment fan-out: notify mentions + assignee + project members, mirror to project chat (server-side).
export async function commentFanout(commentId: string): Promise<void> {
  const { error } = await sb.rpc('comment_fanout', { p_comment_id: commentId });
  if (error) throw new Error(error.message);
}

// Per-user notification preferences (absent type = enabled; explicit false = muted).
export async function getNotificationPrefs(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await sb.from('notification_preferences').select('prefs').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.prefs as Record<string, boolean>) || {};
}
export async function saveNotificationPrefs(userId: string, prefs: Record<string, boolean>): Promise<void> {
  const { error } = await sb.from('notification_preferences')
    .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

// Centralized notification catalog (RBAC + org policy aware).
export interface NotifSetting { key: string; label: string; description: string | null; category: string; locked: boolean; enabled: boolean; }
export async function getMyNotifSettings(orgId: string): Promise<NotifSetting[]> {
  const { data, error } = await sb.rpc('notif_settings_me', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data as NotifSetting[]) || [];
}
export interface NotifPolicyRow { key: string; label: string; description: string | null; category: string; policy: string; }
export async function listOrgNotifPolicies(orgId: string): Promise<NotifPolicyRow[]> {
  const { data, error } = await sb.rpc('notif_policy_list', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data as NotifPolicyRow[]) || [];
}
export async function setOrgNotifPolicy(orgId: string, typeKey: string, policy: string): Promise<void> {
  const { error } = await sb.rpc('notif_policy_set', { p_org: orgId, p_type: typeKey, p_policy: policy });
  if (error) throw new Error(error.message);
}

// Entitlements & limits (F1)
export async function tenantLimit(orgId: string, key: string): Promise<number | null> {
  const { data, error } = await sb.rpc('tenant_limit', { p_org: orgId, p_key: key });
  if (error) throw new Error(error.message);
  return data == null ? null : Number(data);
}
export async function setTenantFeatureOverride(orgId: string, feature: string, enabled: boolean | null): Promise<void> {
  const { error } = await sb.rpc('tenant_set_feature_override', { p_org: orgId, p_feature: feature, p_enabled: enabled });
  if (error) throw new Error(error.message);
}
export async function setTenantLimitOverride(orgId: string, key: string, value: number | null): Promise<void> {
  const { error } = await sb.rpc('tenant_set_limit_override', { p_org: orgId, p_key: key, p_value: value });
  if (error) throw new Error(error.message);
}

// ---- Drives (F2) ----
export interface Drive { id: string; org_id: string; name: string; description: string | null; created_by: string | null; created_at: string; }
export interface DriveFolder { id: string; org_id: string; drive_id: string; parent_id: string | null; name: string; created_at: string; }
export interface DriveFile { id: string; org_id: string; drive_id: string; folder_id: string | null; name: string; kind: string; storage_path: string | null; mime_type: string | null; size_bytes: number; created_at: string; }

export async function listDrives(orgId: string): Promise<Drive[]> {
  const { data, error } = await sb.from('drives').select('*').eq('org_id', orgId).order('created_at');
  if (error) throw new Error(error.message); return (data as Drive[]) || [];
}
export async function createDrive(p: { org_id: string; name: string; description?: string; created_by: string }): Promise<Drive> {
  const { data, error } = await sb.from('drives').insert({ org_id: p.org_id, name: p.name, description: p.description || null, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as Drive;
}
export async function renameDrive(id: string, name: string): Promise<void> {
  const { error } = await sb.from('drives').update({ name }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteDrive(id: string): Promise<void> {
  const { error } = await sb.from('drives').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listFolders(driveId: string): Promise<DriveFolder[]> {
  const { data, error } = await sb.from('drive_folders').select('*').eq('drive_id', driveId).order('name');
  if (error) throw new Error(error.message); return (data as DriveFolder[]) || [];
}
export async function createFolder(p: { org_id: string; drive_id: string; parent_id: string | null; name: string; created_by: string }): Promise<DriveFolder> {
  const { data, error } = await sb.from('drive_folders').insert({ org_id: p.org_id, drive_id: p.drive_id, parent_id: p.parent_id, name: p.name, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as DriveFolder;
}
export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await sb.from('drive_folders').update({ name }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await sb.from('drive_folders').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listFiles(driveId: string, folderId: string | null): Promise<DriveFile[]> {
  let q = sb.from('drive_files').select('*').eq('drive_id', driveId);
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as DriveFile[]) || [];
}
export async function uploadDriveFile(p: { org_id: string; drive_id: string; folder_id: string | null; file: File; created_by: string }): Promise<DriveFile> {
  const safe = p.file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  // insert first so the quota trigger runs before we upload bytes
  const { data: row, error: insErr } = await sb.from('drive_files')
    .insert({ org_id: p.org_id, drive_id: p.drive_id, folder_id: p.folder_id, name: p.file.name, kind: 'file', mime_type: p.file.type || null, size_bytes: p.file.size, created_by: p.created_by })
    .select('*').single();
  if (insErr) throw new Error(insErr.message);
  const rec = row as DriveFile;
  const path = `${p.org_id}/${p.drive_id}/${rec.id}_${safe}`;
  const { error: upErr } = await sb.storage.from('drives').upload(path, p.file, { upsert: false });
  if (upErr) { await sb.from('drive_files').delete().eq('id', rec.id); throw new Error(upErr.message); }
  const { error: updErr } = await sb.from('drive_files').update({ storage_path: path }).eq('id', rec.id);
  if (updErr) throw new Error(updErr.message);
  return { ...rec, storage_path: path };
}
export async function driveFileUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('drives').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function deleteDriveFile(file: DriveFile): Promise<void> {
  if (file.storage_path) { await sb.storage.from('drives').remove([file.storage_path]); }
  const { error } = await sb.from('drive_files').delete().eq('id', file.id); if (error) throw new Error(error.message);
}
export async function getDriveUsage(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('drive_usage', { p_org: orgId });
  if (error) throw new Error(error.message); return Number(data || 0);
}

// ---- Approvals (F3) ----
export interface ApprovalRequest { id: string; org_id: string; entity_type: string; entity_id: string | null; kind: string | null; title: string; body: string | null; amount: number | null; requested_by: string; approver_id: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string; }
export async function listApprovals(orgId: string, opts?: { status?: string; entityType?: string }): Promise<ApprovalRequest[]> {
  let q = sb.from('approval_requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (opts?.status) q = q.eq('status', opts.status);
  if (opts?.entityType) q = q.eq('entity_type', opts.entityType);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as ApprovalRequest[]) || [];
}
export async function approvalCreate(p: { org_id: string; entity_type: string; entity_id?: string | null; kind?: string | null; title: string; body?: string | null; amount?: number | null; approver_id?: string | null }): Promise<string> {
  const { data, error } = await sb.rpc('approval_create', { p_org: p.org_id, p_entity_type: p.entity_type, p_entity_id: p.entity_id ?? null, p_kind: p.kind ?? null, p_title: p.title, p_body: p.body ?? null, p_amount: p.amount ?? null, p_approver: p.approver_id ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function approvalDecide(id: string, status: 'approved' | 'rejected', note?: string): Promise<void> {
  const { error } = await sb.rpc('approval_decide', { p_id: id, p_status: status, p_note: note ?? null }); if (error) throw new Error(error.message);
}
export async function approvalCancel(id: string): Promise<void> {
  const { error } = await sb.rpc('approval_cancel', { p_id: id }); if (error) throw new Error(error.message);
}

// ---- Attachments (F4) ----
export interface Attachment { id: string; org_id: string; entity_type: string; entity_id: string; file_name: string; storage_path: string | null; url: string | null; mime_type: string | null; size_bytes: number; created_by: string | null; created_at: string; }
export async function listAttachments(entityType: string, entityId: string): Promise<Attachment[]> {
  const { data, error } = await sb.from('attachments').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as Attachment[]) || [];
}
export async function addAttachmentFile(p: { org_id: string; entity_type: string; entity_id: string; file: File; created_by: string }): Promise<Attachment> {
  const safe = p.file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${p.org_id}/${p.entity_type}/${p.entity_id}/${crypto.randomUUID()}_${safe}`;
  const { error: upErr } = await sb.storage.from('attachments').upload(path, p.file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await sb.from('attachments').insert({ org_id: p.org_id, entity_type: p.entity_type, entity_id: p.entity_id, file_name: p.file.name, storage_path: path, mime_type: p.file.type || null, size_bytes: p.file.size, created_by: p.created_by }).select('*').single();
  if (error) { await sb.storage.from('attachments').remove([path]); throw new Error(error.message); }
  return data as Attachment;
}
export async function addAttachmentLink(p: { org_id: string; entity_type: string; entity_id: string; name: string; url: string; created_by: string }): Promise<Attachment> {
  const { data, error } = await sb.from('attachments').insert({ org_id: p.org_id, entity_type: p.entity_type, entity_id: p.entity_id, file_name: p.name, url: p.url, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as Attachment;
}
export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('attachments').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function deleteAttachment(a: Attachment): Promise<void> {
  if (a.storage_path) await sb.storage.from('attachments').remove([a.storage_path]);
  const { error } = await sb.from('attachments').delete().eq('id', a.id); if (error) throw new Error(error.message);
}

// ---- Subscriptions (vendor SaaS tracker) ----
export interface VendorSubscription {
  id: string; org_id: string; service: string; category: string | null; plan_type: string | null; plan_name: string | null;
  cost: number; currency: string; email: string | null; subscribed_on: string | null; next_renewal: string | null;
  shared_with: string[]; total_spending: number; payment_method: string | null; paid_by_company: string | null;
  status: string; owner_id: string | null; remarks: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface VendorSubReconciliation { id: string; org_id: string; subscription_id: string; recon_date: string; amount: number; note: string | null; created_by: string | null; created_at: string; }
export type VendorSubInput = Partial<Omit<VendorSubscription, 'id' | 'created_at' | 'updated_at'>>;

export async function listVendorSubscriptions(orgId: string): Promise<VendorSubscription[]> {
  const { data, error } = await sb.from('vendor_subscriptions').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as VendorSubscription[]) || [];
}
export async function createVendorSubscription(p: VendorSubInput & { org_id: string; service: string; created_by: string }): Promise<VendorSubscription> {
  const { data, error } = await sb.from('vendor_subscriptions').insert(p).select('*').single();
  if (error) throw new Error(error.message); return data as VendorSubscription;
}
export async function updateVendorSubscription(id: string, patch: VendorSubInput): Promise<void> {
  const { error } = await sb.from('vendor_subscriptions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteVendorSubscription(id: string): Promise<void> {
  const { error } = await sb.from('vendor_subscriptions').delete().eq('id', id); if (error) throw new Error(error.message);
}
// Request a new subscription -> tracked as status 'requested' + an approval (F3). Flips to active on approval.
export async function requestVendorSubscription(p: VendorSubInput & { org_id: string; service: string; created_by: string; approver_id?: string | null }): Promise<VendorSubscription> {
  const sub = await createVendorSubscription({ ...p, status: 'requested' });
  await approvalCreate({ org_id: p.org_id, entity_type: 'vendor_subscription', entity_id: sub.id, kind: 'subscription', title: `Subscription: ${p.service}`, body: p.remarks || p.plan_name || null, amount: p.cost ?? null, approver_id: p.approver_id ?? null });
  return sub;
}
export async function listReconciliations(subId: string): Promise<VendorSubReconciliation[]> {
  const { data, error } = await sb.from('vendor_sub_reconciliations').select('*').eq('subscription_id', subId).order('recon_date', { ascending: false });
  if (error) throw new Error(error.message); return (data as VendorSubReconciliation[]) || [];
}
export async function addReconciliation(p: { org_id: string; subscription_id: string; recon_date: string; amount: number; note?: string; created_by: string }): Promise<VendorSubReconciliation> {
  const { data, error } = await sb.from('vendor_sub_reconciliations').insert(p).select('*').single();
  if (error) throw new Error(error.message); return data as VendorSubReconciliation;
}
export async function deleteReconciliation(id: string): Promise<void> {
  const { error } = await sb.from('vendor_sub_reconciliations').delete().eq('id', id); if (error) throw new Error(error.message);
}

// ---- Accounting registers (recurring expenses / domains / assets / bank accounts) ----
export interface RecurringExpense { id: string; org_id: string; name: string; category: string | null; amount: number; currency: string; cycle: string; next_due: string | null; vendor: string | null; payment_method: string | null; paid_by_company: string | null; status: string; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Domain { id: string; org_id: string; domain: string; registrar: string | null; owner_id: string | null; purchased_on: string | null; expires_on: string | null; auto_renew: boolean; cost: number; currency: string; total_spending: number; status: string; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Asset { id: string; org_id: string; name: string; asset_type: string; category: string | null; owner_id: string | null; acquired_on: string | null; value: number; revenue: number; currency: string; status: string; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface BankAccount { id: string; org_id: string; label: string; bank_name: string | null; account_type: string; last4: string | null; currency: string; balance: number; account_id: string | null; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }

async function _list<T>(table: string, orgId: string, orderBy = 'created_at', asc = false): Promise<T[]> {
  const { data, error } = await sb.from(table).select('*').eq('org_id', orgId).order(orderBy, { ascending: asc });
  if (error) throw new Error(error.message); return (data as T[]) || [];
}
async function _create<T>(table: string, row: any): Promise<T> {
  const { data, error } = await sb.from(table).insert(row).select('*').single();
  if (error) throw new Error(error.message); return data as T;
}
async function _update(table: string, id: string, patch: any): Promise<void> {
  const { error } = await sb.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
async function _del(table: string, id: string): Promise<void> {
  const { error } = await sb.from(table).delete().eq('id', id); if (error) throw new Error(error.message);
}

export const listRecurringExpenses = (orgId: string) => _list<RecurringExpense>('recurring_expenses', orgId);
export const createRecurringExpense = (row: Partial<RecurringExpense> & { org_id: string; name: string; created_by: string }) => _create<RecurringExpense>('recurring_expenses', row);
export const updateRecurringExpense = (id: string, patch: Partial<RecurringExpense>) => _update('recurring_expenses', id, patch);
export const deleteRecurringExpense = (id: string) => _del('recurring_expenses', id);

export const listDomains = (orgId: string) => _list<Domain>('domains', orgId);
export const createDomain = (row: Partial<Domain> & { org_id: string; domain: string; created_by: string }) => _create<Domain>('domains', row);
export const updateDomain = (id: string, patch: Partial<Domain>) => _update('domains', id, patch);
export const deleteDomain = (id: string) => _del('domains', id);

export const listAssets = (orgId: string) => _list<Asset>('assets', orgId);
export const createAsset = (row: Partial<Asset> & { org_id: string; name: string; created_by: string }) => _create<Asset>('assets', row);
export const updateAsset = (id: string, patch: Partial<Asset>) => _update('assets', id, patch);
export const deleteAsset = (id: string) => _del('assets', id);

export const listBankAccounts = (orgId: string) => _list<BankAccount>('bank_accounts', orgId);
export const createBankAccount = (row: Partial<BankAccount> & { org_id: string; label: string; created_by: string }) => _create<BankAccount>('bank_accounts', row);
export const updateBankAccount = (id: string, patch: Partial<BankAccount>) => _update('bank_accounts', id, patch);
export const deleteBankAccount = (id: string) => _del('bank_accounts', id);

// ---- Accounting billing (invoices / lines / payments / credit notes) ----
export interface Invoice { id: string; org_id: string; invoice_number: string; client_name: string | null; client_email: string | null; issue_date: string | null; due_date: string | null; currency: string; tax_rate: number; subtotal: number; tax: number; total: number; amount_paid: number; status: string; notes: string | null; project_id?: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface InvoiceLine { id: string; org_id: string; invoice_id: string; description: string; qty: number; unit_price: number; amount: number; sort: number; }
export interface Payment { id: string; org_id: string; invoice_id: string | null; amount: number; paid_on: string; method: string | null; reference: string | null; notes: string | null; created_at: string; }
export interface CreditNote { id: string; org_id: string; credit_number: string; invoice_id: string | null; client_name: string | null; amount: number; issue_date: string | null; reason: string | null; status: string; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }

export const listInvoices = (orgId: string) => _list<Invoice>('invoices', orgId);
export const createInvoice = (row: Partial<Invoice> & { org_id: string; invoice_number: string; created_by: string }) => _create<Invoice>('invoices', row);
export const updateInvoice = (id: string, patch: Partial<Invoice>) => _update('invoices', id, patch);
export const deleteInvoice = (id: string) => softDelete('invoice', id);
export async function getInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await sb.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); return (data as Invoice) || null;
}
export async function listInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  const { data, error } = await sb.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('sort').order('created_at');
  if (error) throw new Error(error.message); return (data as InvoiceLine[]) || [];
}
export const addInvoiceLine = (row: { org_id: string; invoice_id: string; description: string; qty: number; unit_price: number; created_by: string; product_id?: string | null }) => _create<InvoiceLine>('invoice_lines', row);
export const updateInvoiceLine = (id: string, patch: Partial<InvoiceLine>) => _update('invoice_lines', id, patch);
export const deleteInvoiceLine = (id: string) => _del('invoice_lines', id);
export async function listPayments(invoiceId: string): Promise<Payment[]> {
  const { data, error } = await sb.from('payments').select('*').eq('invoice_id', invoiceId).order('paid_on', { ascending: false });
  if (error) throw new Error(error.message); return (data as Payment[]) || [];
}
export const addPayment = (row: { org_id: string; invoice_id: string; amount: number; paid_on: string; method?: string; reference?: string; notes?: string; created_by: string; bank_account_id?: string | null }) => _create<Payment>('payments', row);
export const deletePayment = (id: string) => _del('payments', id);

export const listCreditNotes = (orgId: string) => _list<CreditNote>('credit_notes', orgId);
export const createCreditNote = (row: Partial<CreditNote> & { org_id: string; credit_number: string; created_by: string }) => _create<CreditNote>('credit_notes', row);
export const updateCreditNote = (id: string, patch: Partial<CreditNote>) => _update('credit_notes', id, patch);
export const deleteCreditNote = (id: string) => softDelete('credit_note', id);

// ---- CRM expansion (leads / clients / proposals / contracts) ----
export interface Lead { id: string; org_id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; source: string | null; status: string; value: number; currency: string; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Client { id: string; org_id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; status: string; since: string | null; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Proposal { id: string; org_id: string; title: string; client_name: string | null; amount: number; currency: string; status: string; valid_until: string | null; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Contract { id: string; org_id: string; title: string; client_name: string | null; value: number; currency: string; status: string; start_date: string | null; end_date: string | null; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }

export const listLeads = (orgId: string) => _list<Lead>('leads', orgId);
export const createLead = (row: Partial<Lead> & { org_id: string; name: string; created_by: string }) => _create<Lead>('leads', row);
export const updateLead = (id: string, patch: Partial<Lead>) => _update('leads', id, patch);
export const deleteLead = (id: string) => softDelete('lead', id);

export const listClients = (orgId: string) => _list<Client>('clients', orgId);
export const createClient = (row: Partial<Client> & { org_id: string; name: string; created_by: string }) => _create<Client>('clients', row);
export const updateClient = (id: string, patch: Partial<Client>) => _update('clients', id, patch);
export const deleteClient = (id: string) => softDelete('client', id);

export const listProposals = (orgId: string) => _list<Proposal>('proposals', orgId);
export const createProposal = (row: Partial<Proposal> & { org_id: string; title: string; created_by: string }) => _create<Proposal>('proposals', row);
export const updateProposal = (id: string, patch: Partial<Proposal>) => _update('proposals', id, patch);
export const deleteProposal = (id: string) => softDelete('proposal', id);

export const listContracts = (orgId: string) => _list<Contract>('contracts', orgId);
export const createContract = (row: Partial<Contract> & { org_id: string; title: string; created_by: string }) => _create<Contract>('contracts', row);
export const updateContract = (id: string, patch: Partial<Contract>) => _update('contracts', id, patch);
export const deleteContract = (id: string) => softDelete('contract', id);

export async function convertLeadToClient(lead: Lead, userId: string): Promise<Client> {
  const client = await createClient({ org_id: lead.org_id, name: lead.name, contact_name: lead.contact_name || undefined, email: lead.email || undefined, phone: lead.phone || undefined, status: 'active', since: new Date().toISOString().slice(0, 10), owner_id: lead.owner_id || undefined, created_by: userId });
  await updateLead(lead.id, { status: 'converted' });
  return client;
}

// ---- HR / ATS (jobs / applications / interviews / offer letters) ----
export interface JobPosting { id: string; org_id: string; title: string; department: string | null; location: string | null; employment_type: string; description: string | null; openings: number; status: string; owner_id: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Application { id: string; org_id: string; job_id: string | null; candidate_name: string; email: string | null; phone: string | null; source: string | null; stage: string; rating: number | null; notes: string | null; owner_id: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface Interview { id: string; org_id: string; application_id: string; scheduled_at: string | null; interviewer_id: string | null; mode: string; stage_label: string | null; status: string; feedback: string | null; rating: number | null; created_by: string | null; created_at: string; updated_at: string; }
export interface OfferLetter { id: string; org_id: string; application_id: string | null; candidate_name: string; job_title: string | null; salary: number; currency: string; start_date: string | null; status: string; expires_on: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }

export const listJobs = (orgId: string) => _list<JobPosting>('job_postings', orgId);
export const createJob = (row: Partial<JobPosting> & { org_id: string; title: string; created_by: string }) => _create<JobPosting>('job_postings', row);
export const updateJob = (id: string, patch: Partial<JobPosting>) => _update('job_postings', id, patch);
export const deleteJob = (id: string) => softDelete('job', id);

export const listApplications = (orgId: string) => _list<Application>('applications', orgId);
export const createApplication = (row: Partial<Application> & { org_id: string; candidate_name: string; created_by: string }) => _create<Application>('applications', row);
export const updateApplication = (id: string, patch: Partial<Application>) => _update('applications', id, patch);
export const deleteApplication = (id: string) => _del('applications', id);

export const listInterviews = (orgId: string) => _list<Interview>('interviews', orgId);
export const createInterview = (row: Partial<Interview> & { org_id: string; application_id: string; created_by: string }) => _create<Interview>('interviews', row);
export const updateInterview = (id: string, patch: Partial<Interview>) => _update('interviews', id, patch);
export const deleteInterview = (id: string) => _del('interviews', id);

export const listOfferLetters = (orgId: string) => _list<OfferLetter>('offer_letters', orgId);
export const createOfferLetter = (row: Partial<OfferLetter> & { org_id: string; candidate_name: string; created_by: string }) => _create<OfferLetter>('offer_letters', row);
export const updateOfferLetter = (id: string, patch: Partial<OfferLetter>) => _update('offer_letters', id, patch);
export const deleteOfferLetter = (id: string) => softDelete('offer', id);

// ---- Sticky notes (personal) ----
export interface StickyNote { id: string; org_id: string; user_id: string; title: string; body: string; color: string; page_path: string | null; archived_at: string | null; created_at: string; updated_at: string; }
export async function listStickyNotes(userId: string, scope: 'active' | 'archived' | 'all' = 'active'): Promise<StickyNote[]> {
  let q = sb.from('sticky_notes').select('*').eq('user_id', userId);
  if (scope === 'active') q = q.is('archived_at', null);
  else if (scope === 'archived') q = q.not('archived_at', 'is', null);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as StickyNote[]) || [];
}
export async function createStickyNote(p: { org_id: string; user_id: string; body: string; color?: string; title?: string; page_path?: string | null }): Promise<StickyNote> {
  const { data, error } = await sb.from('sticky_notes').insert({ org_id: p.org_id, user_id: p.user_id, body: p.body, color: p.color || 'yellow', title: p.title || '', page_path: p.page_path ?? null }).select('*').single();
  if (error) throw new Error(error.message); return data as StickyNote;
}
export async function updateStickyNote(id: string, patch: { body?: string; color?: string; title?: string }): Promise<void> {
  const { error } = await sb.from('sticky_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteStickyNote(id: string): Promise<void> {
  const { error } = await sb.from('sticky_notes').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function archiveStickyNote(id: string, archived: boolean): Promise<void> {
  const { error } = await sb.from('sticky_notes').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Notice board ----
export interface Notice { id: string; org_id: string; title: string; body: string | null; audience_type: string; audience_ids: string[]; department: string | null; pinned: boolean; expires_on: string | null; created_by: string | null; created_at: string; mine?: { read_at: string | null }[]; }
export async function listMyNotices(orgId: string): Promise<Notice[]> {
  const { data, error } = await sb.from('notices').select('*, mine:notice_recipients(read_at)').eq('org_id', orgId).order('pinned', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as Notice[]) || [];
}
export async function noticeCreate(p: { org_id: string; title: string; body?: string; audience_type: string; audience_ids?: string[]; department?: string }): Promise<string> {
  const { data, error } = await sb.rpc('notice_create', { p_org: p.org_id, p_title: p.title, p_body: p.body ?? null, p_audience_type: p.audience_type, p_audience_ids: p.audience_ids ?? null, p_department: p.department ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function noticeMarkRead(id: string): Promise<void> {
  const { error } = await sb.rpc('notice_mark_read', { p_notice: id }); if (error) throw new Error(error.message);
}
export async function unreadNoticeCount(): Promise<number> {
  const { count, error } = await sb.from('notice_recipients').select('notice_id', { count: 'exact', head: true }).is('read_at', null);
  if (error) return 0; return count || 0;
}

// ---- Tenant management (platform admin) ----
export interface TenantInfo { active: boolean; plan: string | null; features: Record<string, boolean>; defaults?: Record<string, boolean>; limits: Record<string, number>; }
export async function listTenants(): Promise<any[]> {
  const { data, error } = await sb.rpc('platform_list_orgs');
  if (error) throw new Error(error.message); return (data as any[]) || [];
}
export async function getTenantInfo(orgId: string): Promise<TenantInfo> {
  const { data, error } = await sb.rpc('tenant_admin_info', { p_org: orgId });
  if (error) throw new Error(error.message); return data as TenantInfo;
}
export async function setTenantPlan(orgId: string, planKey: string, reason?: string): Promise<void> {
  const { error } = await sb.rpc('tenant_set_plan', { p_org: orgId, p_plan_key: planKey, p_reason: reason || null }); if (error) throw new Error(error.message);
}
export async function setTenantActive(orgId: string, active: boolean, reason?: string): Promise<void> {
  const { error } = await sb.rpc('tenant_set_active', { p_org: orgId, p_active: active, p_reason: reason || null }); if (error) throw new Error(error.message);
}
export interface TenantEvent { id: string; org_id: string; event_type: string; actor_user_id: string | null; plan_from: string | null; plan_to: string | null; amount_cents: number | null; currency: string | null; reason: string | null; meta: any; created_at: string; }
export async function getTenantEvents(orgId: string): Promise<TenantEvent[]> {
  const { data, error } = await sb.from('tenant_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data || []) as TenantEvent[];
}
export async function addTenantNote(orgId: string, text: string): Promise<void> {
  const { error } = await sb.rpc('tenant_add_note', { p_org: orgId, p_text: text }); if (error) throw new Error(error.message);
}

// ---- Platform marketing campaigns (queue branded emails to a tenant segment) ----
export async function campaignPreview(segment: string): Promise<number> {
  const { data, error } = await sb.rpc('platform_campaign_preview', { p_segment: segment });
  if (error) throw new Error(error.message); return (data as number) ?? 0;
}
export interface CampaignRow { id: string; subject: string; segment: string; status: string; recipient_count: number; scheduled_for: string | null; sent_at: string | null; created_at: string; link: string | null; opens: number; clicks: number; }
export interface CampaignTemplate { id: string; name: string; subject: string | null; body: string | null; link: string | null; created_at: string; }
export async function listCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await sb.rpc('platform_campaigns_list'); if (error) throw new Error(error.message); return (data as CampaignRow[]) || [];
}
export async function listCampaignTemplates(): Promise<CampaignTemplate[]> {
  const { data, error } = await sb.from('platform_campaign_templates').select('id, name, subject, body, link, created_at').order('name'); if (error) throw new Error(error.message); return (data as CampaignTemplate[]) || [];
}
export async function saveCampaignTemplate(t: { id?: string | null; name: string; subject?: string; body?: string; link?: string }): Promise<string> {
  const { data, error } = await sb.rpc('campaign_template_save', { p_id: t.id ?? null, p_name: t.name, p_subject: t.subject ?? null, p_body: t.body ?? null, p_link: t.link ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function deleteCampaignTemplate(id: string): Promise<void> {
  const { error } = await sb.rpc('campaign_template_delete', { p_id: id }); if (error) throw new Error(error.message);
}
export async function sendCampaign(segment: string, subject: string, body: string, link?: string, scheduledFor?: string | null, recipients?: string[]): Promise<number> {
  const { data, error } = await sb.rpc('platform_send_campaign', { p_segment: segment, p_subject: subject, p_body: body, p_link: link || null, p_scheduled_for: scheduledFor || null, p_recipients: recipients && recipients.length ? recipients : null });
  if (error) throw new Error(error.message); return (data as number) ?? 0;
}
export async function emailTenant(orgId: string, subject: string, body: string, link?: string): Promise<number> {
  const { data, error } = await sb.rpc('platform_email_tenant', { p_org: orgId, p_subject: subject, p_body: body, p_link: link || null });
  if (error) throw new Error(error.message); return (data as number) ?? 0;
}

// ---- Support ticketing ----
export interface SupportTicket { id: string; org_id: string; subject: string; body: string | null; category: string | null; priority: string; status: string; requester_id: string; assignee_id: string | null; created_at: string; updated_at: string; resolved_at: string | null; }
export interface SupportReply { id: string; ticket_id: string; org_id: string; author_id: string; body: string; created_at: string; }
export const listTickets = (orgId: string) => _list<SupportTicket>('support_tickets', orgId);
export async function createTicket(p: { org_id: string; subject: string; body?: string; category?: string; priority?: string }): Promise<string> {
  const { data, error } = await sb.rpc('support_ticket_create', { p_org: p.org_id, p_subject: p.subject, p_body: p.body ?? null, p_category: p.category ?? null, p_priority: p.priority ?? 'medium' });
  if (error) throw new Error(error.message); return data as string;
}
export const updateTicket = (id: string, patch: Partial<SupportTicket>) => _update('support_tickets', id, patch);
export async function listTicketReplies(ticketId: string): Promise<SupportReply[]> {
  const { data, error } = await sb.from('support_ticket_replies').select('*').eq('ticket_id', ticketId).order('created_at');
  if (error) throw new Error(error.message); return (data as SupportReply[]) || [];
}
export async function addTicketReply(ticketId: string, body: string): Promise<string> {
  const { data, error } = await sb.rpc('support_reply', { p_ticket: ticketId, p_body: body }); if (error) throw new Error(error.message); return data as string;
}

// ---- #13 Support queue (operator; round-robin auto-assign + manual override) ----
export interface SupportQueueRow {
  id: string; org_id: string; org_name: string | null; subject: string; body: string | null;
  category: string | null; priority: string; status: string;
  requester_id: string; requester_name: string | null; assignee_id: string | null; assignee_name: string | null;
  created_at: string; updated_at: string; reply_count: number; awaiting_response: boolean;
}
export async function supportQueue(status?: string | null): Promise<SupportQueueRow[]> {
  const { data, error } = await sb.rpc('support_queue', { p_status: status ?? null });
  if (error) throw new Error(error.message); return (data as SupportQueueRow[]) || [];
}
export async function assignTicket(ticketId: string, agentId: string | null): Promise<void> {
  const { error } = await sb.rpc('support_assign', { p_ticket: ticketId, p_agent: agentId }); if (error) throw new Error(error.message);
}
export async function setTicketStatus(ticketId: string, status: string): Promise<void> {
  const { error } = await sb.rpc('support_set_status', { p_ticket: ticketId, p_status: status }); if (error) throw new Error(error.message);
}
export interface CannedReply { id: string; title: string; body: string; }
export async function listCannedReplies(): Promise<CannedReply[]> {
  const { data, error } = await sb.from('support_canned_replies').select('id, title, body').order('title'); if (error) throw new Error(error.message); return (data as CannedReply[]) || [];
}
export async function saveCannedReply(id: string | null, title: string, body: string): Promise<string> {
  const { data, error } = await sb.rpc('support_canned_save', { p_id: id, p_title: title, p_body: body }); if (error) throw new Error(error.message); return data as string;
}
export async function deleteCannedReply(id: string): Promise<void> {
  const { error } = await sb.rpc('support_canned_delete', { p_id: id }); if (error) throw new Error(error.message);
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
const ADMIN_USER_COLS = 'id, full_name, email, username, role, department, status, role_template_id, can_view_all_projects, can_edit_all_projects, can_approve_leaves, can_delete_tasks, can_manage_users, can_view_dashboard, can_export_data, annual_balance, sick_balance, casual_balance, job_title, avatar_url, phone, company_id, last_login, company:companies!users_company_id_fkey(name)';
export interface UserAffiliation { user_id: string; companies: string[]; projects: string[]; }
export async function userAffiliations(orgId: string): Promise<UserAffiliation[]> {
  const { data, error } = await sb.rpc('user_affiliations', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as UserAffiliation[]) || [];
}
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
// Resolve a renderable avatar src: pass through full URLs, else a public bucket URL
// (the avatars bucket is public, so no per-image signing needed for lists).
export function avatarSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return sb.storage.from('avatars').getPublicUrl(url).data.publicUrl || undefined;
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
const IDEA_SEL = '*, votes:idea_votes(user_id, value, reason, voter:users(full_name)), project:projects(name), creator:users!ideas_created_by_fkey(full_name)';

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
// Set the caller's idea vote: value 1 (up) or -1 (down) + optional reason. RLS pins user_id.
export async function setIdeaVote(ideaId: string, userId: string, value: 1 | -1, reason?: string | null): Promise<void> {
  const { data: existing, error: selErr } = await sb.from('idea_votes').select('value').eq('idea_id', ideaId).eq('user_id', userId).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  // clicking the same direction with no reason toggles the vote off
  if (existing && (existing as any).value === value && reason === undefined) {
    const { error } = await sb.from('idea_votes').delete().eq('idea_id', ideaId).eq('user_id', userId);
    if (error) throw new Error(error.message); return;
  }
  const row: any = { idea_id: ideaId, user_id: userId, value };
  if (reason !== undefined) row.reason = reason ?? null;
  const { error } = await sb.from('idea_votes').upsert(row, { onConflict: 'idea_id,user_id' });
  if (error) throw new Error(error.message);
}
export async function removeIdeaVote(ideaId: string, userId: string): Promise<void> {
  const { error } = await sb.from('idea_votes').delete().eq('idea_id', ideaId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
// Quick thumbs-up toggle (used in list/card views). RLS pins idea_votes.user_id to the caller.
export async function toggleIdeaVote(idea: Idea, userId: string): Promise<void> {
  return setIdeaVote(idea.id, userId, 1);
}
// Convert an idea into a real project (status -> building, link kept on the idea).
// Reuses createProject (return=minimal + refetch, the projects RLS-safe path),
// then locates the new row in the authoritative list it returns.
// ---- Idea polls (stakeholder yes/no/abstain) ----
export interface IdeaPollStakeholder { user_id: string; name: string | null; choice: 'yes' | 'no' | 'abstain' | null; }
export interface IdeaPoll {
  id: string; question: string; status: 'open' | 'closed';
  created_by: string | null; created_at: string; am_creator: boolean;
  my_choice: 'yes' | 'no' | 'abstain' | null; can_vote: boolean;
  stakeholders: IdeaPollStakeholder[];
  counts: { yes: number; no: number; abstain: number; pending: number };
}
export async function getIdeaPoll(ideaId: string): Promise<IdeaPoll | null> {
  const { data, error } = await sb.rpc('idea_poll_get', { p_idea: ideaId });
  if (error) throw new Error(error.message);
  return (data as IdeaPoll) || null;
}
export async function createIdeaPoll(ideaId: string, question: string, stakeholderIds: string[]): Promise<string> {
  const { data, error } = await sb.rpc('idea_poll_create', { p_idea: ideaId, p_question: question, p_stakeholders: stakeholderIds });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function voteIdeaPoll(pollId: string, choice: 'yes' | 'no' | 'abstain'): Promise<void> {
  const { error } = await sb.rpc('idea_poll_vote', { p_poll: pollId, p_choice: choice });
  if (error) throw new Error(error.message);
}
export async function closeIdeaPoll(pollId: string): Promise<void> {
  const { error } = await sb.rpc('idea_poll_close', { p_poll: pollId });
  if (error) throw new Error(error.message);
}

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
export async function createGuest(p: { org_id: string; email: string; name: string; project_id: string; level?: string }): Promise<string> {
  const { data, error } = await sb.rpc('create_guest', {
    p_org: p.org_id, p_email: p.email, p_name: p.name, p_project: p.project_id, p_level: p.level || 'viewer',
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
const TIME_SEL = '*, user:users!time_entries_user_id_fkey(full_name), task:tasks(name), project:projects(name)';

export async function getTaskTimeEntries(taskId: string): Promise<TimeEntry[]> {
  const { data, error } = await sb.from('time_entries').select(TIME_SEL)
    .eq('task_id', taskId).order('started_at', { ascending: false });
  if (error) throw error; return (data as TimeEntry[]) || [];
}
export interface RunningTimer { id: string; user_id: string; user_name: string | null; task_id: string | null; task_name: string | null; project_id: string | null; project_name: string | null; started_at: string; }
export async function getRunningTimers(orgId: string): Promise<RunningTimer[]> {
  const { data, error } = await sb.rpc('running_timers', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data as RunningTimer[]) || [];
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

export interface EmailStatus { provider: string; from_email: string | null; reply_to: string | null; enabled: boolean; has_key: boolean; has_google_client: boolean; gmail_connected: boolean; gmail_email: string | null; smtp_host: string | null; smtp_port: number | null; smtp_user: string | null; smtp_secure: boolean; has_smtp_pass: boolean; pending_count: number; sent_count: number; updated_at: string | null; }

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

export async function emailSetConfigFull(p: { provider?: string; from?: string; replyTo?: string; enabled?: boolean; apiKey?: string; googleClientId?: string; googleClientSecret?: string; smtpHost?: string; smtpPort?: number | null; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean }): Promise<void> {
  const { error } = await sb.rpc('email_set_config_full', { p_provider: p.provider ?? null, p_from: p.from ?? '', p_reply_to: p.replyTo ?? '', p_enabled: p.enabled ?? null, p_api_key: p.apiKey ?? '', p_google_client_id: p.googleClientId ?? '', p_google_client_secret: p.googleClientSecret ?? '', p_smtp_host: p.smtpHost ?? '', p_smtp_port: p.smtpPort ?? null, p_smtp_user: p.smtpUser ?? '', p_smtp_pass: p.smtpPass ?? '', p_smtp_secure: p.smtpSecure ?? null });
  if (error) throw new Error(error.message);
}
export async function emailOauthParams(): Promise<{ client_id: string | null; state: string; redirect_uri: string }> {
  const { data, error } = await sb.rpc('email_oauth_params'); if (error) throw new Error(error.message); return data as { client_id: string | null; state: string; redirect_uri: string };
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

// --- Backups (platform-admin) ---
export interface BackupConfig { id: number; enabled: boolean; frequency: 'daily' | 'weekly' | 'monthly'; retention_count: number; last_run_at: string | null; updated_at: string; }
export interface BackupRow { id: string; created_at: string; kind: string; status: string; file_path: string | null; size_bytes: number | null; table_count: number | null; row_count: number | null; note: string | null; }
export async function backupGetConfig(): Promise<BackupConfig | null> {
  const { data, error } = await sb.rpc('backup_get_config');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as BackupConfig) || null;
}
export async function backupSetConfig(p: { enabled: boolean; frequency: string; retention: number }): Promise<void> {
  const { error } = await sb.rpc('backup_set_config', { p_enabled: p.enabled, p_frequency: p.frequency, p_retention: p.retention });
  if (error) throw error;
}
export async function listBackups(): Promise<BackupRow[]> {
  const { data, error } = await sb.from('backups').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data as BackupRow[]) || [];
}
export async function runBackupNow(): Promise<{ ok?: boolean; tableCount?: number; rowCount?: number; error?: string }> {
  const { data, error } = await sb.functions.invoke('run-backup', { body: { force: true } });
  if (error) throw error;
  return data as any;
}
export async function getBackupDownloadUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('backups').createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

// --- Error tracking (platform-admin reads; capture via log_error RPC) ---
export interface ErrorRow { id: string; created_at: string; source: string; level: string; message: string; stack: string | null; path: string | null; user_id: string | null; meta: any; resolved: boolean; }
export async function listErrors(): Promise<ErrorRow[]> {
  const { data, error } = await sb.from('error_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data as ErrorRow[]) || [];
}
export async function resolveError(id: string, resolved: boolean): Promise<void> {
  const { error } = await sb.from('error_log').update({ resolved }).eq('id', id);
  if (error) throw error;
}
export async function clearErrors(): Promise<void> {
  const { error } = await sb.from('error_log').delete().gt('created_at', '1900-01-01');
  if (error) throw error;
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await sb.from('plans').delete().eq('id', id);
  if (error) {
    if (error.code === '23503' || /foreign key|violates|referenced/i.test(error.message || '')) {
      throw new Error('This plan is assigned to one or more tenants. Reassign them to another plan first, then delete it.');
    }
    throw error;
  }
}

// ---- Platform co-owners (platform-admin only RPCs; see migration platform_co_owners) ----
export interface PlatformAdminRow { user_id: string; email: string; full_name: string | null; is_primary: boolean; created_at: string; is_self: boolean; }
export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const { data, error } = await sb.rpc('platform_admin_list');
  if (error) throw new Error(error.message);
  return (data as PlatformAdminRow[]) || [];
}
export async function addPlatformAdmin(email: string): Promise<string> {
  const { data, error } = await sb.rpc('platform_admin_add', { p_email: email });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function removePlatformAdmin(userId: string): Promise<{ status: string }> {
  const { data, error } = await sb.rpc('platform_admin_remove', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data as { status: string }) ?? { status: 'removed' };
}
export interface SupportAgent { user_id: string; email: string; full_name: string | null; avatar_url: string | null; active: boolean; created_at: string; }
export async function supportAgentList(): Promise<SupportAgent[]> {
  const { data, error } = await sb.rpc('support_agent_list');
  if (error) throw new Error(error.message);
  return (data as SupportAgent[]) || [];
}
export async function supportAgentAdd(email: string): Promise<string> {
  const { data, error } = await sb.rpc('support_agent_add', { p_email: email });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function supportAgentSetActive(userId: string, active: boolean): Promise<void> {
  const { error } = await sb.rpc('support_agent_set_active', { p_user_id: userId, p_active: active });
  if (error) throw new Error(error.message);
}
export async function supportAgentRemove(userId: string): Promise<void> {
  const { error } = await sb.rpc('support_agent_remove', { p_user_id: userId });
  if (error) throw new Error(error.message);
}
export interface OwnerDeletionRequest { id: string; target_email: string; target_name: string; requested_by: string | null; created_at: string; }
export async function ownerDeletionPending(): Promise<OwnerDeletionRequest[]> {
  const { data, error } = await sb.rpc('owner_deletion_pending');
  if (error) throw new Error(error.message);
  return (data as OwnerDeletionRequest[]) || [];
}
export async function decideOwnerDeletion(id: string, approve: boolean): Promise<{ ok: boolean; reason?: string; status?: string }> {
  const { data, error } = await sb.rpc('decide_owner_deletion', { p_id: id, p_approve: approve });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reason?: string; status?: string };
}
export async function approveOwnerDeletionToken(token: string): Promise<{ ok: boolean; removed?: string; reason?: string }> {
  const { data, error } = await sb.rpc('approve_owner_deletion_token', { p_token: token });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; removed?: string; reason?: string };
}

// ---- Guests (admin-facing cross-project management; see migration guests_admin_rpcs) ----
export interface GuestRow { org_id: string; org_name: string; user_id: string; full_name: string | null; email: string; is_linked: boolean; created_at: string; guest_level: string; guest_perms: Record<string, boolean>; projects: { id: string; name: string }[]; }
export const GUEST_LEVELS = ['viewer', 'collaborator', 'contributor'] as const;
export async function listGuests(): Promise<GuestRow[]> {
  const { data, error } = await sb.rpc('guest_list');
  if (error) throw new Error(error.message);
  return (data as GuestRow[]) || [];
}
export async function revokeGuest(userId: string, orgId: string): Promise<void> {
  const { error } = await sb.rpc('guest_revoke', { p_user_id: userId, p_org: orgId });
  if (error) throw new Error(error.message);
}
export async function guestSetAccess(userId: string, orgId: string, level: string, perms: Record<string, boolean>): Promise<void> {
  const { error } = await sb.rpc('guest_set_access', { p_user_id: userId, p_org: orgId, p_level: level, p_perms: perms });
  if (error) throw new Error(error.message);
}

// ---- Guest requests & suggestions (slice 2; see migration guest_requests) ----
export interface GuestRequest {
  id: string; org_id: string; project_id: string; created_by: string;
  type: 'request' | 'suggestion' | 'edit'; title: string; body: string | null;
  target_task_id: string | null; status: 'open' | 'approved' | 'rejected';
  decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string;
  creator?: { full_name: string | null } | null;
  decider?: { full_name: string | null } | null;
  target?: { name: string } | null;
}
const GREQ_SEL = '*, creator:users!guest_requests_created_by_fkey(full_name), decider:users!guest_requests_decided_by_fkey(full_name), target:tasks!guest_requests_target_task_id_fkey(name)';
export async function listGuestRequests(projectId: string): Promise<GuestRequest[]> {
  const { data, error } = await sb.from('guest_requests').select(GREQ_SEL).eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as GuestRequest[]) || [];
}
export interface GuestRequestG extends GuestRequest { project?: { name: string } | null; }
const GREQ_SEL_G = GREQ_SEL + ', project:projects(name)';
export async function listAllGuestRequests(): Promise<GuestRequestG[]> {
  const { data, error } = await sb.from('guest_requests').select(GREQ_SEL_G).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data as GuestRequestG[]) || [];
}
export async function createGuestRequest(p: { org_id: string; project_id: string; created_by: string; type: string; title: string; body?: string }): Promise<void> {
  const { error } = await sb.from('guest_requests').insert({ org_id: p.org_id, project_id: p.project_id, created_by: p.created_by, type: p.type, title: p.title, body: p.body || null });
  if (error) throw new Error(error.message);
}
export async function decideGuestRequest(id: string, status: 'approved' | 'rejected', note: string, deciderId: string): Promise<void> {
  const { error } = await sb.from('guest_requests').update({ status, decision_note: note || null, decided_by: deciderId, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Guest document submission (slice 3; bucket guest-uploads + guest_documents) ----
export interface GuestDocument { id: string; org_id: string; project_id: string; uploaded_by: string; file_path: string; file_name: string; note: string | null; created_at: string; uploader?: { full_name: string | null } | null; }
const GDOC_SEL = '*, uploader:users!guest_documents_uploaded_by_fkey(full_name)';
export async function listGuestDocuments(projectId: string): Promise<GuestDocument[]> {
  const { data, error } = await sb.from('guest_documents').select(GDOC_SEL).eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as GuestDocument[]) || [];
}
export async function uploadGuestDocument(p: { org_id: string; project_id: string; uploaded_by: string; file: File; note?: string }): Promise<void> {
  const safe = p.file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${p.org_id}/${p.project_id}/${crypto.randomUUID()}_${safe}`;
  const { error: upErr } = await sb.storage.from('guest-uploads').upload(path, p.file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error } = await sb.from('guest_documents').insert({ org_id: p.org_id, project_id: p.project_id, uploaded_by: p.uploaded_by, file_path: path, file_name: p.file.name, note: p.note || null });
  if (error) throw new Error(error.message);
}
export async function guestDocumentUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('guest-uploads').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function deleteGuestDocument(id: string, path: string): Promise<void> {
  await sb.storage.from('guest-uploads').remove([path]);
  const { error } = await sb.from('guest_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Guest detail + activity (admin guest profile; migration guest_activity_and_detail) ----
export interface GuestDetail {
  profile: { user_id: string; full_name: string | null; email: string; is_linked: boolean; guest_level: string; guest_perms: Record<string, boolean>; created_at: string; projects: { id: string; name: string }[] };
  requests: any[]; documents: any[]; comments: any[]; messages: any[]; tasks: any[]; activity: any[]; audit: any[];
}
export async function guestDetail(userId: string, orgId: string): Promise<GuestDetail> {
  const { data, error } = await sb.rpc('guest_detail', { p_user_id: userId, p_org: orgId });
  if (error) throw new Error(error.message);
  return data as GuestDetail;
}
export async function recordGuestActivity(orgId: string, userId: string, projectId: string | null, kind: 'checkin' | 'view', detail: string): Promise<void> {
  try { await sb.from('guest_activity').insert({ org_id: orgId, user_id: userId, project_id: projectId, kind, detail }); } catch { /* best-effort */ }
}

// ---- Trash / safe delete (parent entities route here; reversible 30 days) ----
export interface TrashItem {
  id: string; org_id: string; entity_type: string; entity_id: string; label: string | null;
  snapshot: any; deleted_by: string | null; deleted_at: string; purge_at: string;
  status: 'user_trash' | 'tenant_retained' | 'archived';
}
// Snapshot + soft-delete a record. entityType must be a row in snrpmo.trash_types.
export async function softDelete(entityType: string, id: string): Promise<void> {
  const { error } = await sb.rpc('trash_soft_delete', { p_entity_type: entityType, p_entity_id: id });
  if (error) throw new Error(error.message);
}
export async function listTrash(scope: 'mine' | 'admin' = 'mine'): Promise<TrashItem[]> {
  let q = sb.from('trash').select('*').order('deleted_at', { ascending: false });
  q = scope === 'mine' ? q.eq('status', 'user_trash') : q.in('status', ['tenant_retained', 'archived']);
  const { data, error } = await q;
  if (error) throw new Error(error.message); return (data as TrashItem[]) || [];
}
export async function restoreTrash(id: string): Promise<void> {
  const { error } = await sb.rpc('trash_restore', { p_id: id }); if (error) throw new Error(error.message);
}
export async function purgeTrash(id: string): Promise<void> {
  const { error } = await sb.rpc('trash_purge', { p_id: id }); if (error) throw new Error(error.message);
}
export async function emptyTrash(): Promise<number> {
  const { data, error } = await sb.rpc('trash_empty'); if (error) throw new Error(error.message); return (data as number) ?? 0;
}
export async function archiveTrash(id: string): Promise<void> {
  const { error } = await sb.rpc('trash_archive', { p_id: id }); if (error) throw new Error(error.message);
}

// ---- Tenant data wipe + per-tenant snapshots (auto-backup before wipe) ----
export interface TenantSnapshot { id: string; org_id: string; label: string | null; created_by: string | null; created_at: string; table_count: number; row_count: number; }
export async function tenantSnapshot(orgId: string, label?: string): Promise<string> {
  const { data, error } = await sb.rpc('tenant_snapshot', { p_org: orgId, p_label: label ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function wipeTenantData(orgId: string): Promise<void> {
  const { error } = await sb.rpc('tenant_wipe_data', { p_org: orgId }); if (error) throw new Error(error.message);
}
export async function listTenantSnapshots(orgId: string): Promise<TenantSnapshot[]> {
  const { data, error } = await sb.from('tenant_snapshots')
    .select('id, org_id, label, created_by, created_at, table_count, row_count')
    .eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as TenantSnapshot[]) || [];
}
export async function restoreTenantSnapshot(id: string): Promise<void> {
  const { error } = await sb.rpc('tenant_restore_snapshot', { p_id: id }); if (error) throw new Error(error.message);
}

// ---- Live activity ticker (header) — recent audit-log events ----
export interface ActivityItem { id: number; ts: string; username: string | null; action: string; entity_type: string | null; entity_id: string | null; }
export async function getRecentActivity(): Promise<ActivityItem[]> {
  const { data, error } = await sb.from('audit_log')
    .select('id, ts, username, action, entity_type, entity_id')
    .order('ts', { ascending: false }).limit(20);
  if (error) throw new Error(error.message); return (data as ActivityItem[]) || [];
}

// ---- Tenant usage / profile (operator + owner) ----
// ---- Onboarding: tenant invites (Slice 3) -------------------------------
export async function listOrgInvites(): Promise<OrgInvite[]> {
  const { data, error } = await sb.from('org_invites').select('*').order('created_at', { ascending: false });
  if (error) throw error; return (data as OrgInvite[]) || [];
}
export async function createOrgInvite(email: string, orgName: string, planKey = 'free', role = 'owner', orgId: string | null = null): Promise<{ id: string; token: string; email: string; link: string; expires_at: string }> {
  const { data, error } = await sb.rpc('create_org_invite', { p_email: email, p_org_name: orgName, p_plan_key: planKey, p_role: role, p_org_id: orgId });
  if (error) throw new Error(error.message); return data as { id: string; token: string; email: string; link: string; expires_at: string };
}
export async function setOrgInviteSource(id: string, source: string): Promise<void> {
  const { error } = await sb.rpc('set_org_invite_source', { p_id: id, p_source: source }); if (error) throw new Error(error.message);
}
export async function revokeOrgInvite(id: string): Promise<void> {
  const { error } = await sb.rpc('revoke_org_invite', { p_id: id }); if (error) throw new Error(error.message);
}
export interface InvitePreview { valid: boolean; reason?: string; email?: string; role?: string; plan?: string; new_org?: boolean; org_name?: string | null; kind?: 'org' | 'platform'; }
export async function invitePreview(token: string): Promise<InvitePreview> {
  const { data, error } = await sb.rpc('invite_preview', { p_token: token }); if (error) throw new Error(error.message); return data as InvitePreview;
}
export async function acceptOrgInvite(token: string): Promise<string> {
  const { data, error } = await sb.rpc('accept_org_invite', { p_token: token }); if (error) throw new Error(error.message); return data as string;
}

// ---- #12 Platform co-owner invites (token; invite a co-owner with no account yet) ----
export interface PlatformInvite { id: string; email: string; token: string; status: string; created_at: string; expires_at: string; }
export async function listPlatformInvites(): Promise<PlatformInvite[]> {
  const { data, error } = await sb.from('platform_invites').select('id, email, token, status, created_at, expires_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as PlatformInvite[]) || [];
}
export async function createPlatformInvite(email: string): Promise<{ id: string; token: string; email: string; link: string; expires_at: string }> {
  const { data, error } = await sb.rpc('create_platform_invite', { p_email: email });
  if (error) throw new Error(error.message); return data as { id: string; token: string; email: string; link: string; expires_at: string };
}
export async function revokePlatformInvite(id: string): Promise<void> {
  const { error } = await sb.rpc('revoke_platform_invite', { p_id: id }); if (error) throw new Error(error.message);
}

// ---- #11 Cross-tenant activity oversight (platform owners) ----
export interface PlatformActivityRow { id: number; ts: string; org_id: string | null; org_name: string | null; user_id: string | null; username: string | null; action: string; entity_type: string | null; entity_id: string | null; }
export async function platformActivity(limit = 100, orgId: string | null = null): Promise<PlatformActivityRow[]> {
  const { data, error } = await sb.rpc('platform_activity', { p_limit: limit, p_org: orgId });
  if (error) throw new Error(error.message); return (data as PlatformActivityRow[]) || [];
}

export interface TenantDomain { custom_domain: string | null; verified: boolean; token: string | null; }
export async function getTenantDomain(orgId: string): Promise<TenantDomain> {
  const { data, error } = await sb.rpc('tenant_domain', { p_org: orgId });
  if (error) throw new Error(error.message); return data as TenantDomain;
}
export async function setCustomDomain(orgId: string, domain: string): Promise<TenantDomain> {
  const { data, error } = await sb.rpc('set_custom_domain', { p_org: orgId, p_domain: domain });
  if (error) throw new Error(error.message); return data as TenantDomain;
}
export async function verifyCustomDomain(orgId: string): Promise<void> {
  const { error } = await sb.rpc('verify_custom_domain', { p_org: orgId }); if (error) throw new Error(error.message);
}

export async function requestDomainVerification(orgId: string): Promise<void> {
  const { error } = await sb.rpc('request_domain_verification', { p_org: orgId }); if (error) throw new Error(error.message);
}
export async function checkDomainVerification(orgId: string): Promise<{ state: string }> {
  const { data, error } = await sb.rpc('check_domain_verification', { p_org: orgId }); if (error) throw new Error(error.message); return data as { state: string };
}

export interface TenantUsage {
  created_at: string | null; active: boolean; plan: string | null; owner: string | null;
  seat_count: number; seat_limit: number | null; guests: number;
  storage_used_mb: number; storage_limit_mb: number | null;
  counts: Record<string, number>; features: string[];
}
export async function getTenantUsage(orgId: string): Promise<TenantUsage> {
  const { data, error } = await sb.rpc('tenant_usage', { p_org: orgId });
  if (error) throw new Error(error.message); return data as TenantUsage;
}
export async function getOrgActivity(orgId: string, limit = 15): Promise<ActivityItem[]> {
  const { data, error } = await sb.from('audit_log')
    .select('id, ts, username, action, entity_type, entity_id')
    .eq('org_id', orgId).order('ts', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as ActivityItem[]) || [];
}


// ---- Accounting: double-entry General Ledger (P0) ----
export interface CoaAccount { id: string; org_id: string; code: string; name: string; type: string; subtype: string | null; normal_balance: 'debit' | 'credit'; parent_id: string | null; currency: string; description: string | null; is_system: boolean; is_active: boolean; created_at: string; }
export async function glAccounts(orgId: string): Promise<CoaAccount[]> {
  const { data, error } = await sb.from('coa_accounts').select('*').eq('org_id', orgId).order('code');
  if (error) throw new Error(error.message); return (data as CoaAccount[]) || [];
}
export async function glSeedCoa(orgId: string, industry?: string | null): Promise<number> {
  const { data, error } = await sb.rpc('gl_seed_default_coa', { p_org: orgId, p_industry: industry || null });
  if (error) throw new Error(error.message); return (data as number) ?? 0;
}
export async function glAccountSave(orgId: string, p: { id?: string | null; code: string; name: string; type: string; subtype?: string | null; normal_balance: string; parent_id?: string | null; currency?: string | null; is_active?: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('gl_account_save', { p_org: orgId, p_id: p.id || null, p_code: p.code, p_name: p.name, p_type: p.type, p_subtype: p.subtype || null, p_normal_balance: p.normal_balance, p_parent: p.parent_id || null, p_currency: p.currency || null, p_active: p.is_active ?? true });
  if (error) throw new Error(error.message); return data as string;
}
export async function glAccountDelete(orgId: string, id: string): Promise<string> {
  const { data, error } = await sb.rpc('gl_account_delete', { p_org: orgId, p_id: id });
  if (error) throw new Error(error.message); return (data as string) || 'done';
}
export interface JournalLineInput { account_id: string; debit: number; credit: number; description?: string; project_id?: string | null; company_id?: string | null; }
export async function glPostEntry(orgId: string, entryDate: string, memo: string, lines: JournalLineInput[], source = 'manual', sourceId: string | null = null): Promise<string> {
  const { data, error } = await sb.rpc('gl_post_entry', { p_org: orgId, p_entry_date: entryDate, p_memo: memo, p_source: source, p_source_id: sourceId, p_lines: lines });
  if (error) throw new Error(error.message); return data as string;
}
export interface JournalLineRow { id: string; account_id: string; debit: number; credit: number; description: string | null; coa_accounts?: { code: string; name: string } | null; }
export interface JournalEntryRow { id: string; entry_no: number | null; entry_date: string; memo: string | null; source: string; status: string; reversed_by: string | null; reverses: string | null; created_at: string; journal_lines: JournalLineRow[]; }
export async function glJournal(orgId: string, limit = 100): Promise<JournalEntryRow[]> {
  const { data, error } = await sb.from('journal_entries')
    .select('id, entry_no, entry_date, memo, source, status, reversed_by, reverses, created_at, journal_lines(id, account_id, debit, credit, description, coa_accounts(code, name))')
    .eq('org_id', orgId).order('entry_date', { ascending: false }).order('entry_no', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as unknown as JournalEntryRow[]) || [];
}
export interface TrialBalanceRow { account_id: string; code: string; name: string; type: string; subtype: string | null; normal_balance: string; debit: number; credit: number; balance: number; }
export async function glTrialBalance(orgId: string, asOf?: string): Promise<TrialBalanceRow[]> {
  const { data, error } = await sb.rpc('gl_trial_balance', { p_org: orgId, p_as_of: asOf || null });
  if (error) throw new Error(error.message); return (data as TrialBalanceRow[]) || [];
}

export async function glBackfill(orgId: string): Promise<{ entries: number; by_source?: Record<string, number> }> {
  const { data, error } = await sb.rpc('gl_backfill', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as { entries: number; by_source?: Record<string, number> }) || { entries: 0 };
}

// ---- Accounting P2a: tax rates + liabilities ----
export interface TaxRate { id: string; org_id: string; name: string; rate: number; kind: 'output' | 'input' | 'both'; account_id: string | null; is_active: boolean; }
export async function taxRates(orgId: string): Promise<TaxRate[]> {
  const { data, error } = await sb.from('tax_rates').select('*').eq('org_id', orgId).order('name');
  if (error) throw new Error(error.message); return (data as TaxRate[]) || [];
}
export async function taxRateSave(orgId: string, p: { id?: string | null; name: string; rate: number; kind: string; account_id?: string | null; is_active?: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('tax_rate_save', { p_org: orgId, p_id: p.id || null, p_name: p.name, p_rate: p.rate, p_kind: p.kind, p_account: p.account_id || null, p_active: p.is_active ?? true });
  if (error) throw new Error(error.message); return data as string;
}
export async function taxRateDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('tax_rate_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}
export interface Liability { id: string; org_id: string; name: string; type: string; lender: string | null; principal: number; balance: number; interest_rate: number | null; start_date: string | null; due_date: string | null; account_id: string | null; status: string; notes: string | null; created_at: string; }
export async function liabilities(orgId: string): Promise<Liability[]> {
  const { data, error } = await sb.from('liabilities').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as Liability[]) || [];
}
export async function liabilitySave(orgId: string, p: { id?: string | null; name: string; type: string; lender?: string | null; principal: number; balance: number; interest_rate?: number | null; start_date?: string | null; due_date?: string | null; account_id?: string | null; status: string; notes?: string | null; post_opening?: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('liability_save', { p_org: orgId, p_id: p.id || null, p_name: p.name, p_type: p.type, p_lender: p.lender || null, p_principal: p.principal, p_balance: p.balance, p_interest: p.interest_rate ?? null, p_start: p.start_date || null, p_due: p.due_date || null, p_account: p.account_id || null, p_status: p.status, p_notes: p.notes || null, p_post_opening: p.post_opening ?? false });
  if (error) throw new Error(error.message); return data as string;
}
export async function liabilityDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('liability_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}
export interface TaxSummaryRow { kind: 'output' | 'input'; account_id: string; code: string; name: string; amount: number; }
export async function glTaxSummary(orgId: string, from?: string | null, to?: string | null): Promise<TaxSummaryRow[]> {
  const { data, error } = await sb.rpc('gl_tax_summary', { p_org: orgId, p_from: from || null, p_to: to || null });
  if (error) throw new Error(error.message); return (data as TaxSummaryRow[]) || [];
}

// ---- Accounting P2b: Bills / Accounts Payable ----
export interface Bill { id: string; org_id: string; bill_number: string | null; vendor_name: string | null; vendor_email: string | null; bill_date: string; due_date: string | null; currency: string; tax_rate: number; subtotal: number; tax: number; total: number; amount_paid: number; status: string; notes: string | null; project_id?: string | null; created_by: string; created_at: string; }
export interface BillLine { id: string; org_id: string; bill_id: string; description: string; qty: number; unit_price: number; amount: number; sort: number; }
export interface BillPayment { id: string; org_id: string; bill_id: string; amount: number; paid_on: string; method: string | null; reference: string | null; notes: string | null; }
export async function listBills(orgId: string): Promise<Bill[]> {
  const { data, error } = await sb.from('bills').select('*').eq('org_id', orgId).order('bill_date', { ascending: false });
  if (error) throw new Error(error.message); return (data as Bill[]) || [];
}
export async function getBill(id: string): Promise<Bill | null> {
  const { data, error } = await sb.from('bills').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); return data as Bill | null;
}
export const createBill = (row: Partial<Bill> & { org_id: string; created_by: string }) => _create<Bill>('bills', row);
export const updateBill = (id: string, patch: Partial<Bill>) => _update('bills', id, patch);
export const deleteBill = (id: string) => _del('bills', id);
export async function listBillLines(billId: string): Promise<BillLine[]> {
  const { data, error } = await sb.from('bill_lines').select('*').eq('bill_id', billId).order('sort').order('created_at');
  if (error) throw new Error(error.message); return (data as BillLine[]) || [];
}
export const addBillLine = (row: { org_id: string; bill_id: string; description: string; qty: number; unit_price: number; created_by: string; product_id?: string | null }) => _create<BillLine>('bill_lines', row);
export const deleteBillLine = (id: string) => _del('bill_lines', id);
export async function listBillPayments(billId: string): Promise<BillPayment[]> {
  const { data, error } = await sb.from('bill_payments').select('*').eq('bill_id', billId).order('paid_on', { ascending: false });
  if (error) throw new Error(error.message); return (data as BillPayment[]) || [];
}
export const addBillPayment = (row: { org_id: string; bill_id: string; amount: number; paid_on: string; method?: string; reference?: string; notes?: string; created_by: string; bank_account_id?: string | null }) => _create<BillPayment>('bill_payments', row);
export const deleteBillPayment = (id: string) => _del('bill_payments', id);

// ---- Accounting P3a: statements ----
export interface PLRow { section: 'income' | 'expense'; account_id: string | null; code: string; name: string; amount: number; }
export async function glPL(orgId: string, from?: string | null, to?: string | null, basis = 'accrual'): Promise<PLRow[]> {
  const { data, error } = await sb.rpc('gl_pl', { p_org: orgId, p_from: from || null, p_to: to || null, p_basis: basis });
  if (error) throw new Error(error.message); return (data as PLRow[]) || [];
}
export interface BSRow { section: 'asset' | 'liability' | 'equity'; account_id: string | null; code: string; name: string; amount: number; }
export async function glBalanceSheet(orgId: string, asOf?: string | null): Promise<BSRow[]> {
  const { data, error } = await sb.rpc('gl_balance_sheet', { p_org: orgId, p_as_of: asOf || null });
  if (error) throw new Error(error.message); return (data as BSRow[]) || [];
}
export interface CashFlowRow { label: string; amount: number; }
export async function glCashFlow(orgId: string, from?: string | null, to?: string | null): Promise<CashFlowRow[]> {
  const { data, error } = await sb.rpc('gl_cash_flow', { p_org: orgId, p_from: from || null, p_to: to || null });
  if (error) throw new Error(error.message); return (data as CashFlowRow[]) || [];
}

// ---- Accounting P3b: budgets + forecast ----
export async function budgetSave(orgId: string, accountId: string, period: string, amount: number): Promise<void> {
  const { error } = await sb.rpc('budget_save', { p_org: orgId, p_account: accountId, p_period: period, p_amount: amount });
  if (error) throw new Error(error.message);
}
export interface BudgetRow { account_id: string; code: string; name: string; type: 'income' | 'expense'; budget: number; actual: number; }
export async function glBudgetVsActual(orgId: string, from: string, to: string): Promise<BudgetRow[]> {
  const { data, error } = await sb.rpc('gl_budget_vs_actual', { p_org: orgId, p_from: from, p_to: to });
  if (error) throw new Error(error.message); return (data as BudgetRow[]) || [];
}
export interface ForecastRow { period: string; inflow: number; outflow: number; net: number; running: number; }
export async function glCashForecast(orgId: string, months = 6): Promise<ForecastRow[]> {
  const { data, error } = await sb.rpc('gl_cash_forecast', { p_org: orgId, p_months: months });
  if (error) throw new Error(error.message); return (data as ForecastRow[]) || [];
}

// ---- Accounting P4: controls + audit ----
export interface FiscalPeriod { id: string; period_start: string; period_end: string; label: string | null; status: string; closed_at: string | null; }
export async function glPeriods(orgId: string): Promise<FiscalPeriod[]> {
  const { data, error } = await sb.from('fiscal_periods').select('id, period_start, period_end, label, status, closed_at').eq('org_id', orgId).eq('status', 'closed').order('period_start', { ascending: false });
  if (error) throw new Error(error.message); return (data as FiscalPeriod[]) || [];
}
export async function glClosePeriod(orgId: string, month: string): Promise<void> {
  const { error } = await sb.rpc('gl_close_period', { p_org: orgId, p_month: month }); if (error) throw new Error(error.message);
}
export async function glReopenPeriod(orgId: string, month: string): Promise<void> {
  const { error } = await sb.rpc('gl_reopen_period', { p_org: orgId, p_month: month }); if (error) throw new Error(error.message);
}
export async function glReverseEntry(orgId: string, entryId: string, date: string): Promise<string> {
  const { data, error } = await sb.rpc('gl_reverse_entry', { p_org: orgId, p_entry: entryId, p_date: date }); if (error) throw new Error(error.message); return data as string;
}
export interface AuditSummary { entries?: number; posted?: number; reversals?: number; reversed?: number; closed_periods?: number; unbalanced?: number; by_source?: Record<string, number>; }
export async function glAudit(orgId: string): Promise<AuditSummary> {
  const { data, error } = await sb.rpc('gl_audit', { p_org: orgId }); if (error) throw new Error(error.message); return (data as AuditSummary) || {};
}

// ---- Accounting P7: products / items catalog ----
export interface Product { id: string; org_id: string; sku: string | null; name: string; description: string | null; type: 'service' | 'product' | 'subscription'; unit_price: number; currency: string; income_account_id: string | null; expense_account_id: string | null; tax_rate: number; track_inventory: boolean; stock_qty: number; is_active: boolean; }
export async function products(orgId: string): Promise<Product[]> {
  const { data, error } = await sb.from('products').select('*').eq('org_id', orgId).order('name');
  if (error) throw new Error(error.message); return (data as Product[]) || [];
}
export async function productSave(orgId: string, p: { id?: string | null; sku?: string | null; name: string; description?: string | null; type: string; unit_price: number; currency?: string | null; income_account_id?: string | null; expense_account_id?: string | null; tax_rate?: number; track_inventory?: boolean; is_active?: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('product_save', { p_org: orgId, p_id: p.id || null, p_sku: p.sku || null, p_name: p.name, p_description: p.description || null, p_type: p.type, p_unit_price: p.unit_price, p_currency: p.currency || null, p_income: p.income_account_id || null, p_expense: p.expense_account_id || null, p_tax_rate: p.tax_rate ?? 0, p_track_inventory: p.track_inventory ?? false, p_active: p.is_active ?? true });
  if (error) throw new Error(error.message); return data as string;
}
export async function productDelete(orgId: string, id: string): Promise<string> {
  const { data, error } = await sb.rpc('product_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message); return (data as string) || 'done';
}

// ---- Accounting P5: subscriptions / recurring billing ----
export interface SubscriptionSchedule { id: string; org_id: string; name: string; direction: 'expense' | 'revenue'; status: string; counterparty: string | null; product_id: string | null; amount: number; currency: string; tax_rate: number; cycle: string; start_date: string; next_run: string | null; end_date: string | null; last_run: string | null; notes: string | null; }
export async function subscriptionSchedules(orgId: string): Promise<SubscriptionSchedule[]> {
  const { data, error } = await sb.from('subscription_schedules').select('*').eq('org_id', orgId).order('next_run', { nullsFirst: false });
  if (error) throw new Error(error.message); return (data as SubscriptionSchedule[]) || [];
}
export async function subscriptionSave(orgId: string, p: { id?: string | null; name: string; direction: string; counterparty?: string | null; product_id?: string | null; amount: number; currency?: string | null; tax_rate?: number; cycle: string; start_date?: string | null; next_run?: string | null; end_date?: string | null; status: string; notes?: string | null }): Promise<string> {
  const { data, error } = await sb.rpc('subscription_save', { p_org: orgId, p_id: p.id || null, p_name: p.name, p_direction: p.direction, p_counterparty: p.counterparty || null, p_product: p.product_id || null, p_amount: p.amount, p_currency: p.currency || null, p_tax_rate: p.tax_rate ?? 0, p_cycle: p.cycle, p_start: p.start_date || null, p_next: p.next_run || null, p_end: p.end_date || null, p_status: p.status, p_notes: p.notes || null });
  if (error) throw new Error(error.message); return data as string;
}
export async function subscriptionDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('subscription_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}
export async function subscriptionGenerateDue(orgId: string): Promise<{ generated: number }> {
  const { data, error } = await sb.rpc('subscription_generate_due', { p_org: orgId }); if (error) throw new Error(error.message); return (data as { generated: number }) || { generated: 0 };
}
export interface SubscriptionRun { id: string; schedule_id: string; period: string; document_type: string; document_id: string | null; amount: number; generated_at: string; }
export async function subscriptionRuns(orgId: string, limit = 50): Promise<SubscriptionRun[]> {
  const { data, error } = await sb.from('subscription_runs').select('*').eq('org_id', orgId).order('generated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as SubscriptionRun[]) || [];
}

// ---- Accounting P6: bank <-> GL ----
export async function bankEnsureAccount(orgId: string, bankId: string): Promise<string> {
  const { data, error } = await sb.rpc('bank_ensure_account', { p_org: orgId, p_bank: bankId }); if (error) throw new Error(error.message); return data as string;
}
export async function bankGlBalance(orgId: string, accountId: string): Promise<number> {
  const { data, error } = await sb.rpc('bank_gl_balance', { p_org: orgId, p_account: accountId }); if (error) throw new Error(error.message); return Number(data) || 0;
}
export interface BankReconLine { id: string; entry_no: number; entry_date: string; memo: string | null; debit: number; credit: number; reconciled: boolean; }
export async function bankRecon(orgId: string, accountId: string): Promise<BankReconLine[]> {
  const { data, error } = await sb.rpc('bank_recon', { p_org: orgId, p_account: accountId }); if (error) throw new Error(error.message); return (data as BankReconLine[]) || [];
}
export async function bankLineReconcile(orgId: string, lineId: string, on: boolean): Promise<void> {
  const { error } = await sb.rpc('bank_line_reconcile', { p_org: orgId, p_line: lineId, p_on: on }); if (error) throw new Error(error.message);
}

// ---- Accounting P8: CRM deal -> invoice (revenue posts on the invoice, not on conversion) ----
export async function dealToInvoice(orgId: string, dealId: string): Promise<string> {
  const { data, error } = await sb.rpc('deal_to_invoice', { p_org: orgId, p_deal: dealId }); if (error) throw new Error(error.message); return data as string;
}

// ---- Accounting P9: project job-costing ----
export interface ProjectSummaryRow { project_id: string; project_name: string | null; revenue: number; cost: number; margin: number; }
export async function glProjectsSummary(orgId: string, from?: string | null, to?: string | null): Promise<ProjectSummaryRow[]> {
  const { data, error } = await sb.rpc('gl_projects_summary', { p_org: orgId, p_from: from || null, p_to: to || null });
  if (error) throw new Error(error.message); return (data as ProjectSummaryRow[]) || [];
}

// ---- Accounting P11: financial-risk metrics ----
export interface RiskMetrics { cash?: number; ar_outstanding?: number; ar_overdue?: number; ap_outstanding?: number; ap_overdue?: number; current_ratio?: number | null; quick_ratio?: number | null; runway_months?: number | null; dso_days?: number | null; top_client?: string | null; revenue_concentration_pct?: number | null; }
export async function glRiskMetrics(orgId: string): Promise<RiskMetrics> {
  const { data, error } = await sb.rpc('gl_risk_metrics', { p_org: orgId }); if (error) throw new Error(error.message); return (data as RiskMetrics) || {};
}

// ---- Accounting P10b: employee expense claims ----
export interface ExpenseClaim { id: string; org_id: string; employee_id: string | null; title: string; amount: number; currency: string; tax_rate: number; claim_date: string; status: string; expense_account_id: string | null; notes: string | null; created_at: string; }
export async function expenseClaims(orgId: string): Promise<ExpenseClaim[]> {
  const { data, error } = await sb.from('expense_claims').select('*').eq('org_id', orgId).order('claim_date', { ascending: false });
  if (error) throw new Error(error.message); return (data as ExpenseClaim[]) || [];
}
export async function expenseClaimSave(orgId: string, p: { id?: string | null; employee_id?: string | null; title: string; amount: number; currency?: string | null; tax_rate?: number; claim_date?: string | null; expense_account_id?: string | null; notes?: string | null }): Promise<string> {
  const { data, error } = await sb.rpc('expense_claim_save', { p_org: orgId, p_id: p.id || null, p_employee: p.employee_id || null, p_title: p.title, p_amount: p.amount, p_currency: p.currency || null, p_tax_rate: p.tax_rate ?? 0, p_date: p.claim_date || null, p_account: p.expense_account_id || null, p_notes: p.notes || null });
  if (error) throw new Error(error.message); return data as string;
}
export async function expenseClaimSetStatus(orgId: string, id: string, status: string): Promise<void> {
  const { error } = await sb.rpc('expense_claim_set_status', { p_org: orgId, p_id: id, p_status: status }); if (error) throw new Error(error.message);
}
export async function expenseClaimDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('expense_claim_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}

// ---- Accounting P12.1: per-tenant settings ----
export interface AcctSettings { org_id?: string; fiscal_year_start_month: number; base_currency: string; basis: string; lock_date: string | null; }
export async function accountingSettingsGet(orgId: string): Promise<AcctSettings> {
  const { data, error } = await sb.from('org_accounting_settings').select('*').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AcctSettings) || { fiscal_year_start_month: 1, base_currency: 'USD', basis: 'accrual', lock_date: null };
}
export async function accountingSettingsSave(orgId: string, p: { fiscal_year_start_month: number; base_currency: string; basis: string; lock_date: string | null }): Promise<void> {
  const { error } = await sb.rpc('accounting_settings_save', { p_org: orgId, p_fiscal_month: p.fiscal_year_start_month, p_currency: p.base_currency, p_basis: p.basis, p_lock: p.lock_date || null });
  if (error) throw new Error(error.message);
}

// ---- Accounting P12.3: inventory ----
export interface InventoryValueRow { product_id: string; sku: string | null; name: string; stock_qty: number; avg_cost: number; value: number; }
export async function inventoryValue(orgId: string): Promise<InventoryValueRow[]> {
  const { data, error } = await sb.rpc('gl_inventory_value', { p_org: orgId }); if (error) throw new Error(error.message); return (data as InventoryValueRow[]) || [];
}
export async function inventoryAdjust(orgId: string, productId: string, qty: number, unitCost: number, reason: string, date?: string | null): Promise<string> {
  const { data, error } = await sb.rpc('inventory_adjust', { p_org: orgId, p_product: productId, p_qty: qty, p_unit_cost: unitCost, p_reason: reason, p_date: date || null });
  if (error) throw new Error(error.message); return data as string;
}
export interface InventoryMove { id: string; product_id: string; qty: number; unit_cost: number; value: number; kind: string; source: string | null; move_date: string; notes: string | null; created_at: string; }
export async function inventoryMoves(orgId: string, limit = 60): Promise<InventoryMove[]> {
  const { data, error } = await sb.from('inventory_moves').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as InventoryMove[]) || [];
}

// ---- Accounting P12.4: revenue/expense recognition ----
export interface RecognitionSchedule { id: string; org_id: string; kind: 'deferred_revenue' | 'prepaid_expense'; title: string; counterparty: string | null; total_amount: number; recognized_amount: number; currency: string; start_date: string; months: number; account_id: string | null; deferral_account_id: string | null; next_run: string | null; status: string; notes: string | null; }
export async function recognitionSchedules(orgId: string): Promise<RecognitionSchedule[]> {
  const { data, error } = await sb.from('recognition_schedules').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as RecognitionSchedule[]) || [];
}
export async function recognitionSave(orgId: string, p: { id?: string | null; kind: string; title: string; counterparty?: string | null; total_amount: number; currency?: string | null; start_date?: string | null; months: number; account_id?: string | null; deferral_account_id?: string | null; status: string; notes?: string | null; post_opening?: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('recognition_save', { p_org: orgId, p_id: p.id || null, p_kind: p.kind, p_title: p.title, p_counterparty: p.counterparty || null, p_total: p.total_amount, p_currency: p.currency || null, p_start: p.start_date || null, p_months: p.months, p_account: p.account_id || null, p_deferral: p.deferral_account_id || null, p_status: p.status, p_notes: p.notes || null, p_post_opening: p.post_opening ?? false });
  if (error) throw new Error(error.message); return data as string;
}
export async function recognitionGenerateDue(orgId: string): Promise<{ recognized: number }> {
  const { data, error } = await sb.rpc('recognition_generate_due', { p_org: orgId }); if (error) throw new Error(error.message); return (data as { recognized: number }) || { recognized: 0 };
}
export async function recognitionDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('recognition_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}

// ---- Accounting P12.2: FX rate book ----
export interface FxRate { id: string; org_id: string; currency: string; rate: number; as_of: string; }
export async function fxRates(orgId: string): Promise<FxRate[]> {
  const { data, error } = await sb.from('fx_rates').select('*').eq('org_id', orgId).order('currency').order('as_of', { ascending: false });
  if (error) throw new Error(error.message); return (data as FxRate[]) || [];
}
export async function fxRateSave(orgId: string, currency: string, rate: number, asOf: string): Promise<string> {
  const { data, error } = await sb.rpc('fx_rate_save', { p_org: orgId, p_currency: currency, p_rate: rate, p_as_of: asOf });
  if (error) throw new Error(error.message); return data as string;
}
export async function fxRateDelete(orgId: string, id: string): Promise<void> {
  const { error } = await sb.rpc('fx_rate_delete', { p_org: orgId, p_id: id }); if (error) throw new Error(error.message);
}
export async function fxRevalue(orgId: string, asOf: string): Promise<{ entries: number }> {
  const { data, error } = await sb.rpc('fx_revalue', { p_org: orgId, p_as_of: asOf }); if (error) throw new Error(error.message); return (data as { entries: number }) || { entries: 0 };
}


// ---- S1: Users hub — single user, activity, self password, per-user email ----
export async function getAdminUser(id: string): Promise<AdminUser | null> {
  const { data, error } = await sb.from('users').select(ADMIN_USER_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); return (data as any as AdminUser) || null;
}
export async function getUserActivity(userId: string, limit = 30): Promise<ActivityItem[]> {
  const { data, error } = await sb.from('audit_log')
    .select('id, ts, username, action, entity_type, entity_id')
    .eq('user_id', userId).order('ts', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as ActivityItem[]) || [];
}
export async function changeOwnPassword(email: string, currentPw: string, newPw: string): Promise<void> {
  const { error: e1 } = await sb.auth.signInWithPassword({ email, password: currentPw });
  if (e1) throw new Error('Current password is incorrect');
  const { error: e2 } = await sb.auth.updateUser({ password: newPw });
  if (e2) throw new Error(e2.message);
}
export interface UserEmailConfig { provider: 'smtp' | 'gmail'; from_name: string | null; from_email: string | null; reply_to: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_user: string | null; has_smtp_pass: boolean; gmail_email: string | null; gmail_connected: boolean; status: string; enabled: boolean; }
export async function getUserEmail(orgId: string): Promise<UserEmailConfig | null> {
  const { data, error } = await sb.rpc('user_email_get', { p_org: orgId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data; return (row as UserEmailConfig) || null;
}
export async function saveUserEmail(orgId: string, p: { provider: string; from_name?: string | null; from_email?: string | null; reply_to?: string | null; smtp_host?: string | null; smtp_port?: number | null; smtp_secure?: boolean | null; smtp_user?: string | null; smtp_pass?: string | null; enabled?: boolean; }): Promise<void> {
  const { error } = await sb.rpc('user_email_save', { p_org: orgId, p_provider: p.provider, p_from_name: p.from_name ?? null, p_from_email: p.from_email ?? null, p_reply_to: p.reply_to ?? null, p_smtp_host: p.smtp_host ?? null, p_smtp_port: p.smtp_port ?? null, p_smtp_secure: p.smtp_secure ?? true, p_smtp_user: p.smtp_user ?? null, p_smtp_pass: p.smtp_pass ?? '', p_enabled: p.enabled ?? false });
  if (error) throw new Error(error.message);
}
export async function deleteUserEmail(orgId: string): Promise<void> {
  const { error } = await sb.rpc('user_email_delete', { p_org: orgId }); if (error) throw new Error(error.message);
}
