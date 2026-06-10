import { sb, Project, Task, Company, OrgCompany, CompanyMember, MemberRole, Contact, Deal, AppUser, OrgUser, MyOrg, Organization, Risk, Financial, Comment, Plan, Feature, PlanFeature, PlatformOrg, OrgPlanInfo } from './supabase';

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
    .select('id, auth_user_id, username, email, full_name, role, department')
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

// ---------------------------------------------------------------------------
// Data (RLS-scoped to the user's org + project access)
// ---------------------------------------------------------------------------
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}

export async function createProject(p: {
  name: string; org_id: string; description?: string | null;
  status?: string; priority?: string; start_date?: string | null; end_date?: string | null;
  company_id?: string | null; pm_id?: string | null; created_by?: string | null;
}): Promise<Project[]> {
  // NB: no .select() here. INSERT ... RETURNING re-applies the proj_select RLS
  // policy (can_access_project) to the new row and rejects it, so we insert with
  // return=minimal, then refetch the RLS-scoped list.
  const { error } = await sb.from('projects').insert({
    name: p.name, org_id: p.org_id, description: p.description || null,
    status: p.status || 'Planning', priority: p.priority || 'Medium',
    start_date: p.start_date || null, end_date: p.end_date || null,
    company_id: p.company_id || null,
    pm_id: p.pm_id || null, created_by: p.created_by || null,
  });
  if (error) throw new Error(error.message);
  return getProjects();
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
// Company ids the current user manages as a non-org-admin (role='manager') --
// lets the UI surface member management to delegated company managers too.
export async function getMyCompanyManagerships(userId: string): Promise<string[]> {
  const { data, error } = await sb.from('company_members')
    .select('company_id').eq('user_id', userId).eq('role', 'manager');
  if (error) throw error; return ((data || []) as any[]).map((r) => r.company_id);
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
// which are same-org -> visible) is safe -- no return=minimal/refetch needed. ---
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

// Advance a deal to the next pipeline stage (no-op past Negotiation->Won; Won/Lost are terminal).
export async function advanceDealStage(id: string, current: string): Promise<Deal> {
  const order = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
  const i = order.indexOf(current);
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : current;
  return updateDeal(id, { stage: next });
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
import { Attendance, Leave, AppNotification, Tag, Integration, AuditEntry, AdminUser, OnboardingTemplate, OnboardingTemplateItem, OnboardingTask } from './supabase';

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
const ADMIN_USER_COLS = 'id, full_name, email, username, role, department, status, can_view_all_projects, can_edit_all_projects, can_approve_leaves, can_delete_tasks, can_manage_users, can_view_dashboard, can_export_data, annual_balance, sick_balance, casual_balance';
export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await sb.from('users').select(ADMIN_USER_COLS).order('full_name');
  if (error) throw error; return (data as AdminUser[]) || [];
}
export async function updateUserAdmin(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
  const { data, error } = await sb.from('users').update(patch).eq('id', id).select(ADMIN_USER_COLS).single();
  if (error) throw new Error(error.message); return data as AdminUser;
}

// ---- 2.8 Tags / task_tags -------------------------------------------------
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
export async function getTaskTags(taskId: string): Promise<Tag[]> {
  const { data, error } = await sb.from('task_tags').select('tags(*)').eq('task_id', taskId);
  if (error) throw error; return ((data || []) as any[]).map((r) => r.tags).filter(Boolean) as Tag[];
}
export async function addTaskTag(taskId: string, tagId: string, orgId: string): Promise<void> {
  const { error } = await sb.from('task_tags').insert({ task_id: taskId, tag_id: tagId, org_id: orgId });
  if (error) throw new Error(error.message);
}
export async function removeTaskTag(taskId: string, tagId: string): Promise<void> {
  const { error } = await sb.from('task_tags').delete().eq('task_id', taskId).eq('tag_id', tagId);
  if (error) throw new Error(error.message);
}

// ---- 3.2 HR Onboarding ----------------------------------------------------
// Templates + their items. insert+select policies on these tables are identical
// (write=is_org_role owner/admin, select=is_org_member; admin is a member), so
// RETURNING is safe - same reasoning as createOrgCompany.
export async function getOnboardingTemplates(): Promise<OnboardingTemplate[]> {
  const { data, error } = await sb.from('onboarding_templates')
    .select('*, items:onboarding_template_items(*)')
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
export async function addTemplateItem(p: { template_id: string; org_id: string; title: string; description?: string; sort_order?: number; offset_days?: number }): Promise<OnboardingTemplateItem> {
  const { data, error } = await sb.from('onboarding_template_items')
    .insert({ template_id: p.template_id, org_id: p.org_id, title: p.title, description: p.description || null, sort_order: p.sort_order ?? 0, offset_days: p.offset_days ?? 0 })
    .select('*').single();
  if (error) throw new Error(error.message); return data as OnboardingTemplateItem;
}
export async function deleteTemplateItem(id: string): Promise<void> {
  const { error } = await sb.from('onboarding_template_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Per-hire checklist tasks. Two FKs to users -> disambiguated embeds (cf. leaves).
const OB_TASK_SEL = '*, hire:users!onboarding_tasks_user_id_fkey(full_name), assignee:users!onboarding_tasks_assignee_id_fkey(full_name)';
export async function getOnboardingTasks(): Promise<OnboardingTask[]> {
  const { data, error } = await sb.from('onboarding_tasks').select(OB_TASK_SEL)
    .order('user_id', { ascending: true }).order('sort_order', { ascending: true });
  if (error) throw error; return (data as OnboardingTask[]) || [];
}
// Assign a template to a new hire: bulk-insert its items as tasks. Insert with
// return=minimal (no .select()) then refetch - same RLS-safe pattern as createProject.
export async function assignOnboarding(p: { user_id: string; org_id: string; template: OnboardingTemplate; created_by?: string; start_date?: string }): Promise<OnboardingTask[]> {
  const base = p.start_date ? new Date(p.start_date) : null;
  const rows = (p.template.items || []).map((it, i) => ({
    org_id: p.org_id, user_id: p.user_id, template_id: p.template.id,
    title: it.title, description: it.description, sort_order: it.sort_order ?? i, status: 'Pending',
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
