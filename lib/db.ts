import { sb, activeOrgScope, Project, Task, Company, OrgCompany, CompanyMember, MemberRole, Portfolio, PortfolioMember, Contact, Deal, CrmActivity, AppUser, OrgUser, MyOrg, Organization, Risk, Financial, Comment, Plan, Feature, PlanFeature, PlatformOrg, OrgPlanInfo, OrgProfile, ORG_PROFILE_KEYS, FEATURES, FabEntry } from './supabase';
import { buildDemoPayload, DemoPayload } from './demoSeed';
import { SAMPLE_PROPOSALS, STARTER_AGENTS } from './agents';
import { scanForWork } from './agentScanner';

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
    .select('id, auth_user_id, username, email, full_name, role, department, feature_access, can_manage_agents, can_approve_agent_actions, can_manage_appraisals, avatar_url, page_perms, role_template_id, role_template:role_templates(page_perms)')
    .eq('auth_user_id', sess.session.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as AppUser) ?? null;
}

export async function touchLastLogin(): Promise<void> {
  try { await sb.rpc('touch_last_login'); } catch { /* non-critical */ }
}

export async function getMyOrgs(userId: string): Promise<MyOrg[]> {
  // Must filter by user_id: the org_members SELECT policy lets a member see ALL
  // members of their org, so without this we'd get one row per co-member (and the
  // org switcher would show the same org N times).
  const { data, error } = await sb
    .from('org_members')
    .select('role, is_primary, organizations(id, slug, name, branding, plan, onboarding, theme_skin, allow_user_themes, fab_shortcuts, hidden_pages, key_rotation_reminders, is_reseller, is_platform_home)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r.organizations, member_role: r.role, member_is_primary: !!r.is_primary })) as MyOrg[];
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

// Seed from a pre-built (typically trimmed/selected) payload — powers the granular seeding tree.
export async function seedDemoCustom(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, number>;
}

// One canonical "bring a workspace to life" action used by EVERY entry point (first-run
// wizard, Settings ▸ Demo data, operator/reseller demos): base demo data + sample smart
// columns + (plan-gated) a starter AI-agent team + chat commands. Composes the individually
// tested, reversible seeders so the alive experience is identical everywhere. Every step
// after the base seed is non-fatal, so a partial failure never blocks the workspace.
export async function seedFullDemo(orgId: string, opts: { industry?: string | null; withAgents?: boolean; userId?: string | null } = {}): Promise<Record<string, number>> {
  const counts = await seedDemoData(orgId, opts.industry ?? null);
  try { await seedDemoSmartColumns(orgId); } catch { /* non-fatal */ }
  if (opts.withAgents && opts.userId) {
    try { await seedStarterAgents(orgId, opts.userId); await seedBuiltinChatCommands(orgId); await seedAgentRoiDemo(orgId); } catch { /* non-fatal */ }
  }
  try { await seedCommsDemo(orgId); } catch { /* non-fatal */ }
  try { await seedGrowthDemo(orgId); } catch { /* non-fatal */ }
  try { await seedSocialDemo(orgId); } catch { /* non-fatal */ }
  return counts;
}
// Demo agent Activity & ROI — populate a believable executed/auto/rolled-back/pending
// history so the Agent Activity dashboard is alive on every demo spin-up (idempotent;
// never bumps real usage, so it can't consume a tenant's Free-tier agent cap).
export async function seedAgentRoiDemo(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('seed_agent_roi_demo', { p_org: orgId }); if (error) throw new Error(error.message);
  return (data as number) || 0;
}
// Demo Booking page + sample SMS conversation so a fresh trial shows Booking + Inbox alive (idempotent + gated).
export async function seedCommsDemo(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('tenant_seed_demo_comms', { p_org: orgId }); if (error) throw new Error(error.message);
  return (data as number) || 0;
}
// Demo growth loop — a published lead-capture form + a welcome drip sequence + the
// form.submitted->enroll_sequence automation + sample enrollments, so a fresh trial SHOWS
// Forms -> Automations -> Sequences working together (idempotent + owner/feature-gated;
// cleared by tenant_wipe_data).
export async function seedGrowthDemo(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('tenant_seed_demo_growth', { p_org: orgId }); if (error) throw new Error(error.message);
  return (data as number) || 0;
}
// Demo Social & Content — a few channels + a mix of draft/scheduled/published posts (published
// carry sample metrics) so a fresh trial shows the Social module, calendar and analytics ALIVE.
// Idempotent (skips if the org already has posts), owner+feature-gated; cleared by tenant_wipe_data.
export async function seedSocialDemo(orgId: string): Promise<Record<string, number>> {
  const payload = { social: {
    channels: [ { platform: 'linkedin', handle: '@yourbrand' }, { platform: 'x', handle: '@yourbrand' }, { platform: 'instagram', handle: '@yourbrand' } ],
    posts: [
      { body: 'We are now live on social \u2014 follow along for product updates, tips and behind-the-scenes.', status: 'published' },
      { body: 'New feature drop: schedule a whole week of content in one click. Here is how.', status: 'published' },
      { body: 'What should we build next? Reply and let us know.', status: 'scheduled' },
      { body: 'Case study: how a client cut reporting time by 60%.', status: 'scheduled' },
      { body: 'Draft: announcement copy for the fall launch.', status: 'draft' },
    ],
  } };
  const { data, error } = await sb.rpc('tenant_seed_demo_social', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}

// Seed/remove the demo "smart columns" (relationship + multi-link + rollup + formula) on Clients,
// so a workspace SHOWS the advanced custom-field depth alive. Reversible + idempotent (owner-gated RPC).
export async function seedDemoSmartColumns(orgId: string): Promise<{ status?: string; clients?: number; columns?: number }> {
  const { data, error } = await sb.rpc('seed_demo_smart_columns', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data || {}) as { status?: string; clients?: number; columns?: number };
}
export async function seedDemoCrmExtra(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo_crm', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}
export async function seedDemoHrExtra(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo_hr', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}
export async function seedDemoAccountingExtra(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo_accounting', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}
export async function seedDemoExtras(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo_extras', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}
export async function seedDemoUsers(orgId: string, payload: DemoPayload): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('tenant_seed_demo_users', { p_org: orgId, p_payload: payload });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) || {};
}
export async function unseedDemoSmartColumns(orgId: string): Promise<{ removed?: number }> {
  const { data, error } = await sb.rpc('unseed_demo_smart_columns', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data || {}) as { removed?: number };
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
// Shortcuts-FAB config — which quick actions appear, workspace-wide. Ungated UI pref;
// owner/admin via the same org_update RLS as theme_skin (no white-label needed).
export async function setOrgFab(orgId: string, ids: FabEntry[]): Promise<void> {
  const { error } = await sb.from('organizations').update({ fab_shortcuts: ids }).eq('id', orgId);
  if (error) throw new Error(error.message);
}

// #10 Per-page visibility: owner/admin hides individual pages from the sidebar/search
// for THIS workspace. Ungated UI pref written via the same org_update RLS as
// fab_shortcuts/theme_skin (no white-label needed; trg_white_label only guards branding).
// Visibility only — RLS remains the access wall; a hidden page's data is still protected
// and a direct link still works.
export async function setOrgHiddenPages(orgId: string, hrefs: string[]): Promise<void> {
  const { error } = await sb.from('organizations').update({ hidden_pages: hrefs }).eq('id', orgId);
  if (error) throw new Error(error.message);
}

// Per-integration key-rotation reminder dates (jsonb map keyed by integration). Ungated UI
// pref via the same organizations org_update RLS as theme_skin/fab_shortcuts; holds no secrets.
export async function setKeyRotations(orgId: string, map: Record<string, string>): Promise<void> {
  const { error } = await sb.from('organizations').update({ key_rotation_reminders: map }).eq('id', orgId);
  if (error) throw new Error(error.message);
}

// Modular self-select: owner/admin turns a module on/off for THIS workspace (writes
// org_feature_overrides). Enabling is server-gated to plan-granted features (never
// escalates past billing); disabling is always allowed + reversible.
export async function setOrgModule(orgId: string, feature: string, enabled: boolean): Promise<void> {
  const { error } = await sb.rpc('org_set_module', { p_org: orgId, p_feature: feature, p_enabled: enabled });
  if (error) throw new Error(error.message);
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

export async function getOrgUsers(orgId: string | null = activeOrgScope): Promise<OrgUser[]> {
  let q = orgId
    ? sb.from('users').select('id, full_name, email, avatar_url, status, org_members!inner(org_id)').eq('org_members.org_id', orgId).order('full_name')
    : sb.from('users').select('id, full_name, email, avatar_url, status').order('full_name');
  const { data, error } = await q;
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
  const { data: home } = await sb.from('organizations').select('is_platform_home, parent_org_id').eq('id', orgId).maybeSingle();
  if ((home as any)?.is_platform_home) return FEATURES.map((f) => f.key as string);
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
  // Reseller cap: a sub-tenant can't exceed its reseller parent's features.
  const parent = (home as any)?.parent_org_id as string | undefined;
  if (parent) { const cap = new Set(await getOrgFeatures(parent)); for (const k of [...set]) if (!cap.has(k)) set.delete(k); }
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
// Resumable onboarding-wizard state: merges patch into organizations.onboarding;
// pass complete=true to stamp completed_at (finish or skip). Owner/admin gated.
export async function setOnboardingState(orgId: string, patch: Record<string, any>, complete = false): Promise<Record<string, any>> {
  const { data, error } = await sb.rpc('set_onboarding_state', { p_org: orgId, p_patch: patch, p_complete: complete });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, any>;
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
export interface FeatureRollout { feature_key: string; stage: string; percent: number; updated_at: string | null }
// Platform-admin rollout console: list current stages + set a feature's stage/percent.
export async function listFeatureRollouts(): Promise<FeatureRollout[]> {
  const { data, error } = await sb.from('feature_rollouts').select('feature_key, stage, percent, updated_at').order('feature_key');
  if (error) throw new Error(error.message);
  return (data as FeatureRollout[]) || [];
}
export async function setFeatureRollout(feature: string, stage: string, percent: number): Promise<void> {
  const { error } = await sb.rpc('platform_set_feature_rollout', { p_feature: feature, p_stage: stage, p_percent: percent });
  if (error) throw new Error(error.message);
}

// Rollout layer: feature keys NOT yet released to this org (progressive delivery).
// Fail-open — on any error return [] so a resolver hiccup never hides a paid feature.
export async function getOrgDarkFeatures(orgId: string): Promise<string[]> {
  try {
    const { data, error } = await sb.rpc('org_dark_features', { p_org: orgId });
    if (error) return [];
    return (data as string[]) || [];
  } catch { return []; }
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

// Primary PLATFORM owner (locked, un-restrictable). Distinct from co-owners (platform admins).
export async function isPlatformPrimary(): Promise<boolean> {
  const { data, error } = await sb.rpc('is_platform_primary');
  if (error) return false;
  return !!data;
}
// True if the TARGET user is a primary owner (org primary OR platform primary) — locked.
export async function isUserPrimary(userId: string, orgId: string): Promise<boolean> {
  const { data, error } = await sb.rpc('is_user_primary', { p_user: userId, p_org: orgId });
  if (error) return false;
  return !!data;
}

// Tenant-facing: current plan + seat usage for the settings page.
export async function getOrgPlanInfo(orgId: string): Promise<OrgPlanInfo> {
  const { data: sub } = await sb.from('subscriptions')
    .select('status, seats, current_period_start, current_period_end, cancel_at_period_end, plans(*)').eq('org_id', orgId).maybeSingle();
  const [{ data: cnt }, { data: lim }] = await Promise.all([
    sb.rpc('org_seat_count', { p_org: orgId }),
    sb.rpc('org_seat_limit', { p_org: orgId }),
  ]);
  return {
    plan: ((sub as any)?.plans as Plan) ?? null,
    status: (sub as any)?.status ?? null,
    seat_count: (cnt as number) ?? 0,
    seat_limit: (lim as number) ?? null,
    current_period_start: (sub as any)?.current_period_start ?? null,
    current_period_end: (sub as any)?.current_period_end ?? null,
    cancel_at_period_end: (sub as any)?.cancel_at_period_end ?? null,
  };
}
export async function setAutoRenew(orgId: string, on: boolean): Promise<void> {
  const { error } = await sb.rpc('set_auto_renew', { p_org: orgId, p_on: on });
  if (error) throw new Error(error.message);
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
  billing_period?: Plan['billing_period']; user_limit?: number | null; unlimited_seats?: boolean;
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
export async function getProjects(orgId: string | null = activeOrgScope): Promise<Project[]> {
  let q = sb.from('projects').select('*').order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
export async function getOrgCompanies(orgId: string | null = activeOrgScope): Promise<OrgCompany[]> {
  let q = sb.from('companies').select('id, name, description, org_id').order('name');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
  if (error) throw error; return (data as unknown as CompanyMember[]) || [];
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
export async function getPortfolios(orgId: string | null = activeOrgScope): Promise<Portfolio[]> {
  let q = sb.from('portfolios')
    .select('id, org_id, company_id, name, description').order('name');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
  if (error) throw error; return (data as unknown as PortfolioMember[]) || [];
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

export async function getTasks(orgId: string | null = activeOrgScope): Promise<Task[]> {
  let q = sb.from('tasks').select('*, projects(name)').order('due_date', { ascending: true });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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

export async function getCompanies(orgId: string | null = activeOrgScope): Promise<Company[]> {
  let q = sb.from('crm_companies').select('*').order('name');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error; return data || [];
}

export async function getContacts(orgId: string | null = activeOrgScope): Promise<Contact[]> {
  let q = sb.from('crm_contacts').select('*, crm_companies(name)').order('full_name');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error; return (data as Contact[]) || [];
}

export async function getDeals(orgId: string | null = activeOrgScope): Promise<Deal[]> {
  let q = sb.from('crm_deals')
    .select('*, crm_companies(name), crm_contacts(full_name, email)')
    .order('value', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
export async function getAttendance(orgId: string | null = activeOrgScope): Promise<Attendance[]> {
  let q = sb.from('attendance')
    .select('*, users(full_name)').order('work_date', { ascending: false }).limit(200);
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error; return (data as Attendance[]) || [];
}
export async function getMyOpenToday(userId: string): Promise<Attendance | null> {
  const { data, error } = await sb.from('attendance').select('*')
    .eq('user_id', userId).eq('work_date', today()).eq('status', 'OPEN').maybeSingle();
  if (error) throw error; return (data as Attendance) ?? null;
}
export async function checkIn(userId: string, orgId: string, geo?: { lat: number; lng: number; accuracy?: number } | null, place?: string | null): Promise<Attendance> {
  const { data, error } = await sb.from('attendance')
    .insert({ user_id: userId, org_id: orgId, work_date: today(), check_in: new Date().toISOString(), status: 'OPEN',
      check_in_lat: geo?.lat ?? null, check_in_lng: geo?.lng ?? null, check_in_accuracy: geo?.accuracy ?? null, check_in_place: place ?? null })
    .select('*, users(full_name)').single();
  if (error) throw new Error(error.message); return data as Attendance;
}
// The current user's reporting manager (users.reports_to) — for check-in notifications.
export async function getMyManagerId(userId: string): Promise<string | null> {
  const { data, error } = await sb.from('users').select('reports_to').eq('id', userId).maybeSingle();
  if (error) return null; return ((data as { reports_to?: string | null } | null)?.reports_to) ?? null;
}

// --- Relationship custom-field: linkable target entities + their pickable rows ---
export const RELATION_ENTITIES: { value: string; label: string }[] = [
  { value: 'projects', label: 'Projects' },
  { value: 'clients', label: 'Clients' },
  { value: 'deals', label: 'Deals' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'people', label: 'People' },
];
const RELATION_SOURCES: Record<string, { table: string; label: string }> = {
  projects: { table: 'projects', label: 'name' },
  clients: { table: 'clients', label: 'name' },
  deals: { table: 'crm_deals', label: 'title' },
  contacts: { table: 'crm_contacts', label: 'full_name' },
  tasks: { table: 'tasks', label: 'name' },
};
// Pickable rows for a relationship field's target entity (RLS-scoped to the user's org).
export async function getRelationOptions(orgId: string, entity: string): Promise<{ id: string; label: string }[]> {
  if (entity === 'people') {
    const { data, error } = await (sb as any).from('users').select('id, full_name, org_members!inner(org_id)').eq('org_members.org_id', orgId).order('full_name').limit(500);
    if (error) return [];
    return (((data as any[]) || [])).map((r) => ({ id: r.id as string, label: (r.full_name as string) || '(unnamed)' }));
  }
  const src = RELATION_SOURCES[entity];
  if (!src) return [];
  const { data, error } = await (sb as any).from(src.table).select(`id, ${src.label}`).eq('org_id', orgId).limit(500);
  if (error) return [];
  return (((data as any[]) || [])).map((r) => ({ id: r.id as string, label: (r[src.label] as string) || '(untitled)' }));
}
// --- Rollup custom-field: surface a field from the record a relationship column links ---
// v1 = lookup of ONE whitelisted field on the single linked record. Aggregations
// (sum/avg/min/max) become meaningful once a relationship column can hold many links.
export const ROLLUP_TARGETS: Record<string, { value: string; label: string; kind: 'number' | 'text' | 'date' }[]> = {
  projects: [
    { value: 'status', label: 'Status', kind: 'text' },
    { value: 'priority', label: 'Priority', kind: 'text' },
    { value: 'progress', label: 'Progress', kind: 'number' },
    { value: 'end_date', label: 'End date', kind: 'date' },
  ],
  clients: [
    { value: 'status', label: 'Status', kind: 'text' },
    { value: 'since', label: 'Client since', kind: 'date' },
  ],
  deals: [
    { value: 'stage', label: 'Stage', kind: 'text' },
    { value: 'value', label: 'Deal value', kind: 'number' },
    { value: 'expected_close', label: 'Expected close', kind: 'date' },
  ],
  contacts: [
    { value: 'title', label: 'Title', kind: 'text' },
    { value: 'status', label: 'Status', kind: 'text' },
  ],
  tasks: [
    { value: 'status', label: 'Status', kind: 'text' },
    { value: 'priority', label: 'Priority', kind: 'text' },
    { value: 'estimated_hours', label: 'Estimated hours', kind: 'number' },
    { value: 'actual_hours', label: 'Actual hours', kind: 'number' },
    { value: 'due_date', label: 'Due date', kind: 'date' },
  ],
  people: [
    { value: 'email', label: 'Email', kind: 'text' },
    { value: 'role', label: 'Role', kind: 'text' },
    { value: 'department', label: 'Department', kind: 'text' },
  ],
};
// Map { linked-record id -> target field value (text) } for a rollup column's target entity.
// Field is whitelisted via ROLLUP_TARGETS so the interpolated column name can't be injected.
export async function getRollupValues(orgId: string, entity: string, field: string): Promise<Record<string, string>> {
  const allowed = (ROLLUP_TARGETS[entity] || []).some((t) => t.value === field);
  if (!allowed) return {};
  if (entity === 'people') {
    const { data, error } = await (sb as any).from('users').select(`id, ${field}, org_members!inner(org_id)`).eq('org_members.org_id', orgId).limit(1000);
    if (error) return {};
    const m: Record<string, string> = {};
    (((data as any[]) || [])).forEach((r) => { const val = r[field]; if (val !== null && val !== undefined && val !== '') m[r.id as string] = String(val); });
    return m;
  }
  const src = RELATION_SOURCES[entity];
  if (!src) return {};
  const { data, error } = await (sb as any).from(src.table).select(`id, ${field}`).eq('org_id', orgId).limit(1000);
  if (error) return {};
  const m: Record<string, string> = {};
  (((data as any[]) || [])).forEach((r) => { const val = r[field]; if (val !== null && val !== undefined && val !== '') m[r.id as string] = String(val); });
  return m;
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
export async function getLeaves(orgId: string | null = activeOrgScope): Promise<Leave[]> {
  let q = sb.from('leaves').select(LEAVE_SEL)
    .order('requested_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
export interface Drive { id: string; org_id: string; name: string; description: string | null; project_id: string | null; restricted?: boolean; created_by: string | null; created_at: string; }
export interface DriveFolder { id: string; org_id: string; drive_id: string; parent_id: string | null; name: string; archived_at?: string | null; archived_by?: string | null; updated_at?: string | null; updated_by?: string | null; created_by: string | null; created_at: string; }
export interface DriveFile { id: string; org_id: string; drive_id: string; folder_id: string | null; name: string; kind: string; storage_path: string | null; mime_type: string | null; size_bytes: number; content?: string | null; doc_state?: string | null; archived_at?: string | null; archived_by?: string | null; updated_at?: string | null; updated_by?: string | null; created_by: string | null; created_at: string; }

export async function listDrives(orgId: string): Promise<Drive[]> {
  const { data, error } = await sb.from('drives').select('*').eq('org_id', orgId).order('created_at');
  if (error) throw new Error(error.message); return (data as Drive[]) || [];
}
export async function createDrive(p: { org_id: string; name: string; description?: string; created_by: string }): Promise<Drive> {
  // No .select() on the insert: INSERT ... RETURNING re-applies the drive_lvl_sel
  // policy (drive_visible -> STABLE fn can't see the just-inserted row) and 42501s.
  // Insert with a client id (return=minimal), then refetch that row RLS-scoped.
  const id = crypto.randomUUID();
  const { error } = await sb.from('drives').insert({ id, org_id: p.org_id, name: p.name, description: p.description || null, created_by: p.created_by });
  if (error) throw new Error(error.message);
  const { data, error: selErr } = await sb.from('drives').select('*').eq('id', id).single();
  if (selErr) throw new Error(selErr.message);
  return data as Drive;
}
export async function renameDrive(id: string, name: string): Promise<void> {
  const { error } = await sb.from('drives').update({ name }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteDrive(id: string): Promise<void> {
  const { error } = await sb.from('drives').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listFolders(driveId: string): Promise<DriveFolder[]> {
  const { data, error } = await sb.from('drive_folders').select('*').eq('drive_id', driveId).is('archived_at', null).order('name');
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
  const LIST_COLS = 'id, org_id, drive_id, folder_id, name, kind, storage_path, mime_type, size_bytes, created_by, created_at, updated_at, archived_at';
  let q = sb.from('drive_files').select(LIST_COLS).eq('drive_id', driveId);
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId);
  const { data, error } = await q.is('archived_at', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as DriveFile[]) || [];
}
// Server-enforced upload safety: RBAC + dangerous-type gate (file_register) then malware scan via the
// scan-file edge fn. FAIL-CLOSED — only a confirmed 'clean' verdict passes (when scanning is enabled,
// 'pending'/'error'/'infected' are all rejected). Removes the stored object on any rejection.
async function assertUploadClean(bucket: string, path: string, reg: { org_id: string; mime: string | null; size: number; filename: string }): Promise<void> {
  const { error: regErr } = await sb.rpc('file_register', { p_bucket: bucket, p_path: path, p_org: reg.org_id, p_mime: reg.mime, p_size: reg.size, p_filename: reg.filename });
  if (regErr) { await sb.storage.from(bucket).remove([path]).catch(() => {}); throw new Error('This file type is not allowed for security reasons.'); }
  let scan: any = null;
  try { const r = await sb.functions.invoke('scan-file', { body: { bucket, path } }); scan = r.data; } catch { scan = null; }
  if (!scan || scan.status !== 'clean') {
    await sb.storage.from(bucket).remove([path]).catch(() => {});
    throw new Error(scan && scan.status === 'infected' ? 'This file was blocked by malware scanning.' : 'This file could not be security-scanned. Please try again.');
  }
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
  // upload safety: RBAC + dangerous-type gate + malware scan, fail-closed (only a clean verdict passes).
  try { await assertUploadClean('drives', path, { org_id: p.org_id, mime: p.file.type || null, size: p.file.size, filename: p.file.name }); }
  catch (e) { await sb.from('drive_files').delete().eq('id', rec.id); throw e; }
  const { error: updErr } = await sb.from('drive_files').update({ storage_path: path }).eq('id', rec.id);
  if (updErr) throw new Error(updErr.message);
  return { ...rec, storage_path: path };
}
export async function driveFileUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('drives').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}

// Link a drive to a project (or null) — a project-linked drive becomes visible in that
// project's client portal (guest RLS fences reads via can_access_project).
export async function setDriveProject(id: string, projectId: string | null): Promise<void> {
  const { error } = await sb.from('drives').update({ project_id: projectId }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Move a folder under a new parent (or null = drive root). Plain UPDATE (no RETURNING) so the
// drive_folders_upd RLS policy (creator-or-owner/admin) enforces; cycle-guard is client-side.
export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  const { error } = await sb.from('drive_folders').update({ parent_id: parentId }).eq('id', id);
  if (error) throw new Error(error.message);
}
// Move a file into a folder (or null = drive root). RLS drive_files_upd gates creator-or-owner/admin.
export async function moveFile(id: string, folderId: string | null): Promise<void> {
  const { error } = await sb.from('drive_files').update({ folder_id: folderId }).eq('id', id);
  if (error) throw new Error(error.message);
}

// In-app documents (kind='doc') — rich-text/HTML stored in drive_files.content, governed by the same RLS.
export async function createDoc(p: { org_id: string; drive_id: string; folder_id: string | null; name: string; created_by: string }): Promise<DriveFile> {
  const { data, error } = await sb.from('drive_files').insert({ org_id: p.org_id, drive_id: p.drive_id, folder_id: p.folder_id, name: p.name, kind: 'doc', mime_type: 'text/html', size_bytes: 0, content: '', created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as DriveFile;
}
export async function createSheet(p: { org_id: string; drive_id: string; folder_id: string | null; name: string; created_by: string }): Promise<DriveFile> {
  const { data, error } = await sb.from('drive_files').insert({ org_id: p.org_id, drive_id: p.drive_id, folder_id: p.folder_id, name: p.name, kind: 'sheet', mime_type: 'text/csv', size_bytes: 0, content: '', created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as DriveFile;
}
export async function createSlides(p: { org_id: string; drive_id: string; folder_id: string | null; name: string; created_by: string }): Promise<DriveFile> {
  const { data, error } = await sb.from('drive_files').insert({ org_id: p.org_id, drive_id: p.drive_id, folder_id: p.folder_id, name: p.name, kind: 'slide', mime_type: 'text/markdown', size_bytes: 0, content: '', created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as DriveFile;
}
export async function getDocContent(id: string): Promise<string> {
  const { data, error } = await sb.from('drive_files').select('content').eq('id', id).single();
  if (error) throw new Error(error.message); return ((data as any)?.content as string) || '';
}
export async function saveDoc(id: string, patch: { name?: string; content?: string }): Promise<void> {
  const upd: any = {};
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.content !== undefined) { upd.content = patch.content; upd.size_bytes = patch.content.length; }
  const { error } = await sb.from('drive_files').update(upd).eq('id', id); if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Drive collaboration — granular permissions (Viewer/Commenter/Editor),
// comments + @mention tagging, and collaborative-document state.
// RLS is the wall: drive_level() resolves each caller's level; these helpers
// just surface it. Comments are posted via the SECURITY DEFINER RPC so mention
// notifications fan out server-side (client never writes notifications).
// ---------------------------------------------------------------------------
export type DriveLevel = 'viewer' | 'commenter' | 'editor' | 'manage';
export interface DriveGrant { id: string; org_id: string; drive_id: string; folder_id: string | null; file_id: string | null; subject_user_id: string | null; subject_role: string | null; level: 'viewer' | 'commenter' | 'editor'; created_by: string | null; created_at: string; }
export interface DriveComment { id: string; org_id: string; drive_id: string; file_id: string; parent_id: string | null; author_id: string; body: string; resolved: boolean; created_at: string; updated_at: string; }
export interface DriveDocState { doc_state: string | null; content: string | null; }

// Caller's resolved access level on a drive (null = no access).
export async function getDriveLevel(driveId: string): Promise<DriveLevel | null> {
  const { data, error } = await sb.rpc('drive_level', { p_drive: driveId });
  if (error) throw new Error(error.message); return (data as DriveLevel | null) ?? null;
}
// Toggle a drive between org-wide (false) and explicit-grants-only (true). Manage-gated by RLS.
export async function setDriveRestricted(id: string, restricted: boolean): Promise<void> {
  const { error } = await sb.from('drives').update({ restricted }).eq('id', id); if (error) throw new Error(error.message);
}
export async function listDriveGrants(driveId: string): Promise<DriveGrant[]> {
  const { data, error } = await sb.from('drive_grants').select('*').eq('drive_id', driveId).order('created_at');
  if (error) throw new Error(error.message); return (data as DriveGrant[]) || [];
}
// Upsert without ON CONFLICT (partial unique indexes aren't usable as a PostgREST arbiter):
// update the existing grant, else insert with return=minimal (dodges the INSERT…RETURNING RLS re-check).
export async function upsertUserGrant(p: { org_id: string; drive_id: string; subject_user_id: string; level: 'viewer' | 'commenter' | 'editor'; created_by: string; folder_id?: string | null; file_id?: string | null }): Promise<void> {
  const fid = p.folder_id ?? null; const flid = p.file_id ?? null;
  let upd = sb.from('drive_grants').update({ level: p.level }).eq('drive_id', p.drive_id).eq('subject_user_id', p.subject_user_id);
  upd = fid ? upd.eq('folder_id', fid) : upd.is('folder_id', null);
  upd = flid ? upd.eq('file_id', flid) : upd.is('file_id', null);
  const { data, error: e1 } = await upd.select('id');
  if (e1) throw new Error(e1.message);
  if (data && data.length) return;
  const { error: e2 } = await sb.from('drive_grants').insert({ org_id: p.org_id, drive_id: p.drive_id, subject_user_id: p.subject_user_id, level: p.level, created_by: p.created_by, folder_id: fid, file_id: flid });
  if (e2) throw new Error(e2.message);
}
// Caller's effective level on a specific item (drive base + item grant + inherited ancestor-folder grants).
export async function getItemLevel(p: { drive_id: string; folder_id?: string | null; file_id?: string | null }): Promise<DriveLevel | null> {
  const { data, error } = await sb.rpc('drive_eff_level', { p_drive: p.drive_id, p_folder: p.folder_id ?? null, p_file: p.file_id ?? null });
  if (error) throw new Error(error.message); return (data as DriveLevel | null) ?? null;
}
export async function upsertRoleGrant(p: { org_id: string; drive_id: string; subject_role: string; level: 'viewer' | 'commenter' | 'editor'; created_by: string }): Promise<void> {
  const { data: upd, error: e1 } = await sb.from('drive_grants').update({ level: p.level }).eq('drive_id', p.drive_id).eq('subject_role', p.subject_role).select('id');
  if (e1) throw new Error(e1.message);
  if (upd && upd.length) return;
  const { error: e2 } = await sb.from('drive_grants').insert({ org_id: p.org_id, drive_id: p.drive_id, subject_role: p.subject_role, level: p.level, created_by: p.created_by });
  if (e2) throw new Error(e2.message);
}
export async function removeDriveGrant(id: string): Promise<void> {
  const { error } = await sb.from('drive_grants').delete().eq('id', id); if (error) throw new Error(error.message);
}

// ---- Comments + @mention tagging ----
export async function addDriveComment(p: { file_id: string; body: string; parent_id?: string | null; mentions?: string[] }): Promise<string> {
  const { data, error } = await sb.rpc('drive_comment_add', { p_file: p.file_id, p_body: p.body, p_parent: p.parent_id ?? null, p_mentions: p.mentions ?? [] });
  if (error) throw new Error(error.message); return data as string;
}
export async function listDriveComments(fileId: string): Promise<DriveComment[]> {
  const { data, error } = await sb.from('drive_comments').select('*').eq('file_id', fileId).order('created_at');
  if (error) throw new Error(error.message); return (data as DriveComment[]) || [];
}
export async function setCommentResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await sb.from('drive_comments').update({ resolved, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteDriveComment(id: string): Promise<void> {
  const { error } = await sb.from('drive_comments').delete().eq('id', id); if (error) throw new Error(error.message);
}

// ---- Collaborative document state (Yjs CRDT snapshot + rendered HTML) ----
export async function loadDocState(id: string): Promise<DriveDocState> {
  const { data, error } = await sb.from('drive_files').select('doc_state, content').eq('id', id).single();
  if (error) throw new Error(error.message);
  return { doc_state: (data as any)?.doc_state ?? null, content: (data as any)?.content ?? null };
}
export async function saveDocState(id: string, p: { doc_state: string; content?: string }): Promise<void> {
  const upd: any = { doc_state: p.doc_state, updated_at: new Date().toISOString() };
  if (p.content !== undefined) { upd.content = p.content; upd.size_bytes = p.content.length; }
  const { error } = await sb.from('drive_files').update(upd).eq('id', id); if (error) throw new Error(error.message);
}

// ---- Drive archive + activity (Slice 2) ----
export interface DriveActivity { id: string; org_id: string; drive_id: string; file_id: string | null; folder_id: string | null; actor_id: string | null; action: string; detail: any; created_at: string; }

export async function archiveFile(id: string): Promise<void> { const { error } = await sb.from('drive_files').update({ archived_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message); }
export async function restoreFile(id: string): Promise<void> { const { error } = await sb.from('drive_files').update({ archived_at: null, archived_by: null }).eq('id', id); if (error) throw new Error(error.message); }
export async function archiveFolder(id: string): Promise<void> { const { error } = await sb.from('drive_folders').update({ archived_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message); }
export async function restoreFolder(id: string): Promise<void> { const { error } = await sb.from('drive_folders').update({ archived_at: null, archived_by: null }).eq('id', id); if (error) throw new Error(error.message); }
export async function listArchived(driveId: string): Promise<{ files: DriveFile[]; folders: DriveFolder[] }> {
  const [f, d] = await Promise.all([
    sb.from('drive_files').select('id, org_id, drive_id, folder_id, name, kind, storage_path, mime_type, size_bytes, created_by, created_at, updated_at, archived_at').eq('drive_id', driveId).not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    sb.from('drive_folders').select('*').eq('drive_id', driveId).not('archived_at', 'is', null).order('archived_at', { ascending: false }),
  ]);
  if (f.error) throw new Error(f.error.message); if (d.error) throw new Error(d.error.message);
  return { files: (f.data as DriveFile[]) || [], folders: (d.data as DriveFolder[]) || [] };
}
// Activity history for a file/folder (or whole drive). Read-gated by RLS (drive viewers).
export async function listActivity(p: { fileId?: string; folderId?: string; driveId?: string; limit?: number }): Promise<DriveActivity[]> {
  let q = sb.from('drive_activity').select('*');
  if (p.fileId) q = q.eq('file_id', p.fileId);
  else if (p.folderId) q = q.eq('folder_id', p.folderId);
  else if (p.driveId) q = q.eq('drive_id', p.driveId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(p.limit ?? 100);
  if (error) throw new Error(error.message); return (data as DriveActivity[]) || [];
}

// ---- Drive access requests (Slice 3b) ----
export interface DriveAccessRequest { id: string; org_id: string; drive_id: string; folder_id: string | null; file_id: string | null; requester_id: string; requested_level: 'viewer' | 'commenter' | 'editor'; note: string | null; status: 'pending' | 'approved' | 'denied' | 'cancelled'; decided_by: string | null; decided_at: string | null; created_at: string; }
export async function requestAccess(p: { drive_id: string; folder_id?: string | null; file_id?: string | null; level: 'viewer' | 'commenter' | 'editor'; note?: string }): Promise<string> {
  const { data, error } = await sb.rpc('drive_request_create', { p_drive: p.drive_id, p_folder: p.folder_id ?? null, p_file: p.file_id ?? null, p_level: p.level, p_note: p.note ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function decideAccessRequest(id: string, approve: boolean): Promise<void> {
  const { error } = await sb.rpc('drive_request_decide', { p_request: id, p_approve: approve });
  if (error) throw new Error(error.message);
}
export async function listAccessRequests(p: { driveId?: string; status?: string }): Promise<DriveAccessRequest[]> {
  let q = sb.from('drive_access_requests').select('*');
  if (p.driveId) q = q.eq('drive_id', p.driveId);
  if (p.status) q = q.eq('status', p.status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as DriveAccessRequest[]) || [];
}
export async function cancelAccessRequest(id: string): Promise<void> {
  const { error } = await sb.from('drive_access_requests').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Drive share links (Slice 3c) ----
export interface DriveShareLink { id: string; token: string; org_id: string; drive_id: string; folder_id: string | null; file_id: string | null; level: 'viewer' | 'commenter'; mode: 'internal' | 'public'; expires_at: string | null; max_uses: number | null; use_count: number; revoked: boolean; created_by: string | null; created_at: string; }
export async function createShareLink(p: { drive_id: string; folder_id?: string | null; file_id?: string | null; level: 'viewer' | 'commenter'; mode: 'internal' | 'public'; expires_at?: string | null; max_uses?: number | null }): Promise<string> {
  const { data, error } = await sb.rpc('drive_link_create', { p_drive: p.drive_id, p_folder: p.folder_id ?? null, p_file: p.file_id ?? null, p_level: p.level, p_mode: p.mode, p_expires_at: p.expires_at ?? null, p_max_uses: p.max_uses ?? null });
  if (error) throw new Error(error.message); return data as string;
}
export async function listShareLinks(p: { drive_id: string; folder_id?: string | null; file_id?: string | null }): Promise<DriveShareLink[]> {
  let q = sb.from('drive_share_links').select('*').eq('drive_id', p.drive_id);
  q = p.file_id ? q.eq('file_id', p.file_id) : (p.folder_id ? q.eq('folder_id', p.folder_id) : q.is('folder_id', null).is('file_id', null));
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as DriveShareLink[]) || [];
}
export async function revokeShareLink(id: string): Promise<void> { const { error } = await sb.from('drive_share_links').update({ revoked: true }).eq('id', id); if (error) throw new Error(error.message); }
export async function deleteShareLink(id: string): Promise<void> { const { error } = await sb.from('drive_share_links').delete().eq('id', id); if (error) throw new Error(error.message); }
// Public/anon link resolve (validates revoked/expiry/uses, rate-limited) -> target payload.
export async function resolveShareLink(token: string): Promise<any> { const { data, error } = await sb.rpc('drive_link_resolve', { p_token: token }); if (error) throw new Error(error.message); return data; }
// Signed download URL for a file reached through a link (edge fn validates token + scope server-side).
export async function shareLinkFileUrl(token: string, fileId: string): Promise<string> {
  const { data, error } = await sb.functions.invoke('drive-link-file', { body: { token, file_id: fileId } });
  if (error) throw new Error(error.message);
  if (!data || !data.url) throw new Error((data && data.error) || 'download failed'); return data.url as string;
}

// ---- Forms (F2) — builder + submissions ----
export interface FormField { key: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string; }
export interface FormDef { id: string; org_id: string; name: string; slug: string; status: 'draft' | 'published' | 'archived'; fields: FormField[]; settings: Record<string, any>; submit_count: number; created_by: string | null; created_at: string; updated_at: string; }
export interface FormSubmissionRow { id: string; form_id: string; org_id: string; data: Record<string, any>; lead_id: string | null; source: string | null; created_at: string; }

export async function listForms(orgId: string): Promise<FormDef[]> {
  const { data, error } = await sb.from('forms').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as FormDef[]) || [];
}
export async function createForm(p: { org_id: string; name: string; slug: string; status?: string; fields?: FormField[]; settings?: Record<string, any>; created_by: string }): Promise<FormDef> {
  const { data, error } = await sb.from('forms').insert({ org_id: p.org_id, name: p.name, slug: p.slug, status: p.status || 'draft', fields: p.fields || [], settings: p.settings || {}, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as FormDef;
}
export async function updateForm(id: string, patch: Partial<Pick<FormDef, 'name' | 'status' | 'fields' | 'settings' | 'slug'>>): Promise<void> {
  const { error } = await sb.from('forms').update(patch).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteForm(id: string): Promise<void> {
  const { error } = await sb.from('forms').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listFormSubmissions(formId: string): Promise<FormSubmissionRow[]> {
  const { data, error } = await sb.from('form_submissions').select('*').eq('form_id', formId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as FormSubmissionRow[]) || [];
}
export interface PortalFile { id: string; name: string; kind: string; mime_type: string | null; size_bytes: number; storage_path: string | null; created_at: string; drive_id: string; drive_name?: string | null; }
// Files the current user can read (RLS-fenced). For a guest = files in project-linked drives they can access.
export interface PortalApproval { id: string; org_id: string; project_id: string; title: string; body: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; requested_by: string | null; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string; project_name?: string | null; }
// Client sign-offs. RLS-filtered: staff see all in org; a guest sees those on projects they can access.
export async function listPortalApprovals(orgId: string): Promise<PortalApproval[]> {
  const { data, error } = await sb.from('portal_approvals').select('*, projects(name)').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({ id: r.id, org_id: r.org_id, project_id: r.project_id, title: r.title, body: r.body, status: r.status, requested_by: r.requested_by, decided_by: r.decided_by, decided_at: r.decided_at, decision_note: r.decision_note, created_at: r.created_at, project_name: r.projects?.name ?? null }));
}
// Staff create. Insert minimal (no RETURNING) to avoid the INSERT-RETURNING RLS gotcha.
export async function createPortalApproval(p: { org_id: string; project_id: string; title: string; body?: string | null; requested_by: string }): Promise<void> {
  const { error } = await sb.from('portal_approvals').insert({ org_id: p.org_id, project_id: p.project_id, title: p.title, body: p.body || null, requested_by: p.requested_by });
  if (error) throw new Error(error.message);
}
// Client (or staff) decides. decided_by MUST be the caller app-user id (RLS WITH CHECK). No RETURNING.
export async function decidePortalApproval(id: string, status: 'approved' | 'rejected', deciderId: string, note?: string | null): Promise<void> {
  const { error } = await sb.from('portal_approvals').update({ status, decided_by: deciderId, decided_at: new Date().toISOString(), decision_note: note || null }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function cancelPortalApproval(id: string): Promise<void> {
  const { error } = await sb.from('portal_approvals').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Booking (appointment scheduling) — migrations booking_substrate_tables/_rpcs ----
export interface BookingPage { id: string; org_id: string; slug: string; name: string; description: string | null; duration_min: number; buffer_min: number; availability: Record<string, [string, string][]>; timezone: string; assignee_id: string | null; status: 'draft' | 'published' | 'archived'; reminder_hours: number; created_by: string | null; created_at: string; updated_at: string; }
export interface Appointment { id: string; org_id: string; booking_page_id: string; name: string; email: string | null; phone: string | null; starts_at: string; ends_at: string; status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'; notes: string | null; lead_id: string | null; source: string | null; created_at: string; }

export async function listBookingPages(orgId: string): Promise<BookingPage[]> {
  const { data, error } = await sb.from('booking_pages').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as BookingPage[]) || [];
}
export async function createBookingPage(p: { org_id: string; name: string; slug: string; description?: string | null; duration_min?: number; buffer_min?: number; availability?: any; timezone?: string; assignee_id?: string | null; status?: string; reminder_hours?: number; created_by: string }): Promise<BookingPage> {
  const { data, error } = await sb.from('booking_pages').insert({ ...p }).select().single();
  if (error) throw new Error(error.message); return data as BookingPage;
}
export async function updateBookingPage(id: string, patch: Partial<Pick<BookingPage, 'name' | 'slug' | 'description' | 'duration_min' | 'buffer_min' | 'availability' | 'timezone' | 'assignee_id' | 'status' | 'reminder_hours'>>): Promise<void> {
  const { error } = await sb.from('booking_pages').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteBookingPage(id: string): Promise<void> {
  const { error } = await sb.from('booking_pages').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listAppointments(orgId: string, bookingPageId?: string): Promise<Appointment[]> {
  let q = sb.from('appointments').select('*').eq('org_id', orgId).order('starts_at', { ascending: false }).limit(500);
  if (bookingPageId) q = q.eq('booking_page_id', bookingPageId);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as Appointment[]) || [];
}
export async function setAppointmentStatus(id: string, status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'): Promise<void> {
  const { error } = await sb.from('appointments').update({ status }).eq('id', id); if (error) throw new Error(error.message);
}

// ---- Comms / SMS (F3) — migrations comms_sms_substrate_* + edge fn sms-dispatch ----
export interface EmailSendLimits { paused: boolean; monthly_cap_per_org: number | null; daily_cap_global: number | null }
export async function emailGetLimits(): Promise<EmailSendLimits | null> {
  const { data, error } = await sb.rpc('email_get_limits');
  if (error) throw new Error(error.message);
  const r = (data as any[] | null)?.[0];
  return r ? { paused: !!r.paused, monthly_cap_per_org: r.monthly_cap_per_org, daily_cap_global: r.daily_cap_global } : null;
}
export async function emailSetLimits(p: { paused: boolean; monthlyCapPerOrg: number; dailyCapGlobal: number }): Promise<void> {
  const { error } = await sb.rpc('email_set_limits', { p_paused: p.paused, p_monthly_cap_per_org: p.monthlyCapPerOrg, p_daily_cap_global: p.dailyCapGlobal });
  if (error) throw new Error(error.message);
}

export interface SmsConfigStatus { provider: string; from_number: string | null; custom_url: string | null; enabled: boolean; monthly_cap_usd: number | null; has_token: boolean; has_account: boolean; configured: boolean; month_cost_usd: number; }
export interface CommsMessage { id: string; org_id: string; channel: string; direction: string; to_addr: string; from_addr: string | null; body: string; status: string; provider: string | null; provider_msg_id: string | null; cost_usd: number; error: string | null; lead_id: string | null; created_by: string | null; created_at: string; }
export interface SuppressionEntry { id: string; org_id: string; channel: string; address: string; reason: string | null; created_at: string; }

export async function smsGetConfig(orgId: string): Promise<SmsConfigStatus | null> {
  const { data, error } = await sb.rpc('sms_get_config', { p_org: orgId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SmsConfigStatus) || null;
}
export async function smsSetConfig(p: { org_id: string; provider?: string; account_sid?: string; auth_token?: string; from_number?: string; custom_url?: string; enabled?: boolean; monthly_cap_usd?: number | null }): Promise<void> {
  const { error } = await sb.rpc('sms_set_config', { p_org: p.org_id, p_provider: p.provider ?? null, p_account_sid: p.account_sid ?? '', p_auth_token: p.auth_token ?? '', p_from_number: p.from_number ?? '', p_custom_url: p.custom_url ?? '', p_enabled: p.enabled ?? null, p_monthly_cap_usd: p.monthly_cap_usd ?? null });
  if (error) throw new Error(error.message);
}
export async function listMessages(orgId: string): Promise<CommsMessage[]> {
  const { data, error } = await sb.from('comms_messages').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message); return (data as CommsMessage[]) || [];
}
export async function sendSms(orgId: string, to: string, body: string, leadId?: string | null): Promise<void> {
  const { error } = await sb.rpc('sms_enqueue', { p_org: orgId, p_to: to, p_body: body, p_lead_id: leadId ?? null });
  if (error) throw new Error(error.message);
  try { await sb.rpc('sms_kick'); } catch { /* queued — a later run sends it */ }
}
export async function listSuppression(orgId: string): Promise<SuppressionEntry[]> {
  const { data, error } = await sb.from('comms_suppression').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as SuppressionEntry[]) || [];
}
export async function addSuppression(orgId: string, address: string, reason?: string): Promise<void> {
  const { error } = await sb.from('comms_suppression').insert({ org_id: orgId, channel: 'sms', address: address.trim(), reason: reason || 'manual' });
  if (error) throw new Error(error.message);
}
export async function removeSuppression(id: string): Promise<void> {
  const { error } = await sb.from('comms_suppression').delete().eq('id', id); if (error) throw new Error(error.message);
}

// ---- Drip sequences (#15) — migrations sequences_substrate/_engine ----
export interface Sequence { id: string; org_id: string; name: string; status: 'active' | 'paused' | 'archived'; created_by: string | null; created_at: string; }
export interface SequenceStep { id: string; org_id: string; sequence_id: string; step_order: number; channel: 'email' | 'sms'; delay_minutes: number; subject: string | null; body: string; }
export interface SequenceEnrollment { id: string; org_id: string; sequence_id: string; lead_id: string | null; email: string | null; phone: string | null; step_idx: number; next_due_at: string; status: string; enrolled_at: string; }
export interface LeadLite { id: string; name: string; email: string | null; phone: string | null; }

export async function listSequences(orgId: string): Promise<Sequence[]> {
  const { data, error } = await sb.from('email_sequences').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as Sequence[]) || [];
}
export async function createSequence(p: { org_id: string; name: string; created_by: string }): Promise<Sequence> {
  const { data, error } = await sb.from('email_sequences').insert({ org_id: p.org_id, name: p.name, created_by: p.created_by }).select().single();
  if (error) throw new Error(error.message); return data as Sequence;
}
export async function updateSequence(id: string, patch: Partial<Pick<Sequence, 'name' | 'status'>>): Promise<void> {
  const { error } = await sb.from('email_sequences').update(patch).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteSequence(id: string): Promise<void> {
  const { error } = await sb.from('email_sequences').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listSteps(seqId: string): Promise<SequenceStep[]> {
  const { data, error } = await sb.from('sequence_steps').select('*').eq('sequence_id', seqId).order('step_order', { ascending: true });
  if (error) throw new Error(error.message); return (data as SequenceStep[]) || [];
}
export async function saveSteps(orgId: string, seqId: string, steps: { channel: string; delay_minutes: number; subject: string | null; body: string }[]): Promise<void> {
  const { error: e1 } = await sb.from('sequence_steps').delete().eq('sequence_id', seqId); if (e1) throw new Error(e1.message);
  if (steps.length) {
    const rows = steps.map((s, i) => ({ org_id: orgId, sequence_id: seqId, step_order: i, channel: s.channel, delay_minutes: s.delay_minutes, subject: s.subject, body: s.body }));
    const { error: e2 } = await sb.from('sequence_steps').insert(rows); if (e2) throw new Error(e2.message);
  }
}
export async function listEnrollments(orgId: string, seqId?: string): Promise<SequenceEnrollment[]> {
  let q = sb.from('sequence_enrollments').select('*').eq('org_id', orgId).order('enrolled_at', { ascending: false }).limit(500);
  if (seqId) q = q.eq('sequence_id', seqId);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as SequenceEnrollment[]) || [];
}
export async function stopEnrollment(id: string): Promise<void> {
  const { error } = await sb.from('sequence_enrollments').update({ status: 'stopped' }).eq('id', id); if (error) throw new Error(error.message);
}
export async function enrollLead(orgId: string, seqId: string, leadId: string): Promise<void> {
  const { error } = await sb.rpc('sequence_enroll', { p_org: orgId, p_sequence: seqId, p_lead: leadId }); if (error) throw new Error(error.message);
}
export async function listLeadsLite(orgId: string): Promise<LeadLite[]> {
  const { data, error } = await sb.from('leads').select('id, name, email, phone').eq('org_id', orgId).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message); return (data as LeadLite[]) || [];
}
export async function listPortalFiles(orgId: string): Promise<PortalFile[]> {
  const { data, error } = await sb.from('drive_files')
    .select('id,name,kind,mime_type,size_bytes,storage_path,created_at,drive_id, drives(name)')
    .eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, mime_type: r.mime_type, size_bytes: r.size_bytes, storage_path: r.storage_path, created_at: r.created_at, drive_id: r.drive_id, drive_name: r.drives?.name ?? null }));
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
  // upload safety: RBAC + dangerous-type gate + malware scan, fail-closed (only a clean verdict passes).
  await assertUploadClean('attachments', path, { org_id: p.org_id, mime: p.file.type || null, size: p.file.size, filename: p.file.name });
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
export interface Lead { id: string; org_id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; source: string | null; status: string; value: number; currency: string; score: number; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; }
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
export async function getAuditLog(orgId: string | null = activeOrgScope): Promise<AuditEntry[]> {
  let q = sb.from('audit_log').select('*')
    .order('ts', { ascending: false }).limit(200);
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
const ADMIN_USER_COLS = 'id, full_name, email, username, role, department, status, role_template_id, page_perms, can_view_all_projects, can_edit_all_projects, can_approve_leaves, can_delete_tasks, can_manage_users, can_view_dashboard, can_export_data, can_manage_appraisals, annual_balance, sick_balance, casual_balance, job_title, avatar_url, phone, company_id, last_login, company:companies!users_company_id_fkey(name)';
export interface UserAffiliation { user_id: string; companies: string[]; projects: string[]; }
export async function userAffiliations(orgId: string): Promise<UserAffiliation[]> {
  const { data, error } = await sb.rpc('user_affiliations', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as UserAffiliation[]) || [];
}
export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await sb.from('users').select(ADMIN_USER_COLS).order('full_name');
  if (error) throw error; return (data as unknown as AdminUser[]) || [];
}
export async function updateUserAdmin(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
  const { data, error } = await sb.from('users').update(patch).eq('id', id).select(ADMIN_USER_COLS).single();
  if (error) throw new Error(error.message); return data as unknown as AdminUser;
}

// ---- Custom role templates (RBAC) ----------------------------------------
// rt_select = is_org_member, writes = is_org_role(owner/admin). Admin is a member,
// so RETURNING re-applies the select policy to the new row safely.
export async function listRoleTemplates(): Promise<RoleTemplate[]> {
  const { data, error } = await sb.from('role_templates').select('*')
    .order('is_system', { ascending: false }).order('name');
  if (error) throw error; return (data as RoleTemplate[]) || [];
}
export async function createRoleTemplate(p: { org_id: string; name: string; description?: string | null; permissions: Record<string, boolean>; feature_access: string[]; page_perms?: Record<string, any> }): Promise<RoleTemplate> {
  const { data, error } = await sb.from('role_templates')
    .insert({ org_id: p.org_id, name: p.name, description: p.description ?? null, permissions: p.permissions, feature_access: p.feature_access, page_perms: p.page_perms ?? {} })
    .select('*').single();
  if (error) throw new Error(error.message); return data as RoleTemplate;
}
export async function updateRoleTemplate(id: string, patch: Partial<Pick<RoleTemplate, 'name' | 'description' | 'permissions' | 'feature_access' | 'page_perms'>>): Promise<RoleTemplate> {
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
  await assertUploadClean('employee-docs', path, { org_id: t.org_id || orgId, mime: file.type || null, size: file.size, filename: file.name });
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
export async function getEmployees(orgId: string | null = activeOrgScope): Promise<Employee[]> {
  let q = orgId
    ? sb.from('users').select(EMPLOYEE_SEL + ', org_members!inner(org_id)').eq('org_members.org_id', orgId).order('full_name')
    : sb.from('users').select(EMPLOYEE_SEL).order('full_name');
  const { data, error } = await q;
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
  if (url.startsWith('preset:')) return url;
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
export async function getPayrollRuns(orgId: string | null = activeOrgScope): Promise<PayrollRun[]> {
  let q = sb.from('payroll_runs').select('*')
    .order('period_start', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
  options?: string[] | null; option_meta?: Record<string, string> | null; position?: number;
}): Promise<CustomFieldDef> {
  const { data, error } = await sb.from('custom_field_definitions').insert(d).select('*').single();
  if (error) throw new Error(error.message);
  return data as CustomFieldDef;
}

export async function updateCustomFieldDef(id: string, patch: Partial<{ name: string; options: string[] | null; option_meta: Record<string, string>; position: number }>): Promise<void> {
  const { error } = await sb.from('custom_field_definitions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
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

export async function getCustomFieldValuesByType(orgId: string, entityType: CustomEntityType): Promise<CustomFieldValue[]> {
  const { data, error } = await sb.from('custom_field_values').select('*')
    .eq('org_id', orgId).eq('entity_type', entityType);
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

export async function getLedgerEntries(orgId: string | null = activeOrgScope): Promise<LedgerEntry[]> {
  let q = sb.from('ledger_entries').select(LEDGER_SEL)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
const IDEA_SEL = '*, votes:idea_votes(user_id, value, reason, voter:users(full_name)), project:projects(name), creator:users!ideas_created_by_fkey(full_name, avatar_url)';

export async function getIdeas(orgId: string | null = activeOrgScope): Promise<Idea[]> {
  let q = sb.from('ideas').select(IDEA_SEL)
    .order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
  created_by: string | null; created_at: string; deadline: string | null; am_creator: boolean;
  my_choice: 'yes' | 'no' | 'abstain' | null; can_vote: boolean;
  stakeholders: IdeaPollStakeholder[];
  counts: { yes: number; no: number; abstain: number; pending: number };
}
export interface PendingPoll { id: string; question: string; idea_id: string; idea_title: string | null; deadline: string | null; created_at: string; }
/** Open polls awaiting MY vote (stakeholder, not voted, not past deadline). Fail-soft. */
export async function getMyPendingPolls(): Promise<PendingPoll[]> {
  const { data, error } = await sb.rpc('idea_polls_for_me');
  if (error) return []; return (data as PendingPoll[]) || [];
}
export async function getIdeaPoll(ideaId: string): Promise<IdeaPoll | null> {
  const { data, error } = await sb.rpc('idea_poll_get', { p_idea: ideaId });
  if (error) throw new Error(error.message);
  return (data as IdeaPoll) || null;
}
export async function createIdeaPoll(ideaId: string, question: string, stakeholderIds: string[], deadline?: string | null): Promise<string> {
  const { data, error } = await sb.rpc('idea_poll_create', { p_idea: ideaId, p_question: question, p_stakeholders: stakeholderIds, p_deadline: deadline ?? null });
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

export async function getTrainingDocs(orgId: string | null = activeOrgScope): Promise<TrainingDoc[]> {
  let q = sb.from('training_docs').select(TDOC_SEL)
    .order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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

export async function getJobDescriptions(orgId: string | null = activeOrgScope): Promise<JobDescription[]> {
  let q = sb.from('job_descriptions').select(JD_SEL)
    .order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
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
  await assertUploadClean('training-docs', path, { org_id: row.org_id, mime: file.type || null, size: file.size, filename: file.name });
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
export async function getTeams(orgId: string | null = activeOrgScope): Promise<Team[]> {
  let q = sb.from('teams').select(TEAM_SEL).order('name');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error; return (data as Team[]) || [];
}
export async function createTeam(p: { org_id: string; name: string; description?: string; color?: string; avatar?: string }): Promise<Team> {
  const { data, error } = await sb.from('teams')
    .insert({ org_id: p.org_id, name: p.name, description: p.description || null, color: p.color || null, avatar: p.avatar || null })
    .select(TEAM_SEL).single();
  if (error) throw new Error(error.message); return data as Team;
}
export async function updateTeam(id: string, patch: { name?: string; description?: string | null; color?: string | null; avatar?: string | null }): Promise<Team> {
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
export async function getMyOpenTimer(userId: string, orgId: string | null = activeOrgScope): Promise<TimeEntry | null> {
  let q = sb.from('time_entries').select(TIME_SEL)
    .eq('user_id', userId).is('ended_at', null);
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error; return (data as TimeEntry) || null;
}
export async function startTimer(p: { org_id: string; task_id: string; project_id?: string | null; user_id: string }): Promise<TimeEntry> {
  const { data, error } = await sb.from('time_entries')
    .insert({ org_id: p.org_id, task_id: p.task_id, project_id: p.project_id || null, user_id: p.user_id })
    .select(TIME_SEL).single();
  if (error) throw new Error(error.code === '23505' ? 'You already have a running timer — stop it first.' : error.message);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('snrpmo:timers-changed'));
  return data as TimeEntry;
}
export async function stopTimer(entry: TimeEntry): Promise<TimeEntry> {
  const ended = new Date();
  const mins = Math.max(1, Math.round((ended.getTime() - new Date(entry.started_at).getTime()) / 60000));
  const { data, error } = await sb.from('time_entries')
    .update({ ended_at: ended.toISOString(), duration_minutes: mins })
    .eq('id', entry.id).select(TIME_SEL).single();
  if (error) throw new Error(error.message);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('snrpmo:timers-changed'));
  return data as TimeEntry;
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

export async function getChatMessages(projectId: string | null, orgId: string | null = activeOrgScope): Promise<ChatMessage[]> {
  let q = sb.from('chat_messages').select(CHAT_SEL)
    .order('created_at', { ascending: false }).limit(CHAT_PAGE);
  q = projectId === null ? q.is('project_id', null) : q.eq('project_id', projectId);
  if (orgId) q = q.eq('org_id', orgId);
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
  return (data as unknown as GuestRequestG[]) || [];
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
  // upload safety (anon-facing): RBAC + dangerous-type gate + malware scan, fail-closed.
  await assertUploadClean('guest-uploads', path, { org_id: p.org_id, mime: p.file.type || null, size: p.file.size, filename: p.file.name });
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
// ---- Workspace member invites (owner/admin invites a teammate by email) ----
export interface MemberInvite { id: string; email: string; role: string; status: string; created_at: string; expires_at: string; accepted_at: string | null }
export async function inviteMember(orgId: string, email: string, role: string): Promise<{ id: string; token: string; email: string; link: string; role: string; expires_at: string }> {
  const { data, error } = await sb.rpc('org_invite_member', { p_org: orgId, p_email: email, p_role: role });
  if (error) throw new Error(error.message); return data as any;
}
export async function listMemberInvites(orgId: string): Promise<MemberInvite[]> {
  const { data, error } = await sb.rpc('org_list_member_invites', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as MemberInvite[]) || [];
}
export async function revokeMemberInvite(id: string): Promise<void> {
  const { error } = await sb.rpc('org_revoke_member_invite', { p_id: id }); if (error) throw new Error(error.message);
}
export interface InvitePreview { valid: boolean; reason?: string; email?: string; role?: string; plan?: string; new_org?: boolean; org_name?: string | null; kind?: 'org' | 'platform'; }
export async function claimPendingInvite(): Promise<string | null> {
  const { data, error } = await sb.rpc('claim_pending_invite'); if (error) return null; return (data as string) || null;
}
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
export interface DocTemplate { id: string; org_id: string; name: string; doc_type: string; body: string | null; is_default: boolean; created_by: string | null; created_at: string; updated_at: string; }
export async function listDocTemplates(orgId: string): Promise<DocTemplate[]> {
  const { data, error } = await sb.from('document_templates').select('*').eq('org_id', orgId).order('doc_type').order('name');
  if (error) throw new Error(error.message); return (data as DocTemplate[]) || [];
}
export async function createDocTemplate(p: { org_id: string; name: string; doc_type: string; body?: string }): Promise<DocTemplate> {
  const { data, error } = await sb.from('document_templates').insert({ org_id: p.org_id, name: p.name, doc_type: p.doc_type, body: p.body ?? '' }).select('*').single();
  if (error) throw new Error(error.message); return data as DocTemplate;
}
export async function updateDocTemplate(id: string, patch: { name?: string; doc_type?: string; body?: string }): Promise<void> {
  const { error } = await sb.from('document_templates').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteDocTemplate(id: string): Promise<void> {
  const { error } = await sb.from('document_templates').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function leadToDeal(leadId: string): Promise<string> {
  const { data, error } = await sb.rpc('lead_to_deal', { p_lead: leadId }); if (error) throw new Error(error.message); return data as string;
}
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
export async function getMemberRole(orgId: string, userId: string): Promise<string | null> {
  const { data, error } = await sb.from('org_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  if (error) return null; return (data as any)?.role ?? null;
}
export async function setMemberRole(orgId: string, userId: string, role: string): Promise<void> {
  const { error } = await sb.rpc('org_set_member_role', { p_org: orgId, p_user: userId, p_role: role }); if (error) throw new Error(error.message);
}
export async function seedDefaultRoles(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('seed_default_roles', { p_org: orgId }); if (error) throw new Error(error.message); return (data as number) || 0;
}
export async function seedDefaultTeams(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('seed_default_teams', { p_org: orgId }); if (error) throw new Error(error.message); return (data as number) || 0;
}
export interface ResellerOrg { org_id: string; org_name: string; slug: string; member_count: number; plan_key: string | null; plan_name: string | null; sub_status: string | null; seats: number; seat_limit: number | null; }
export async function resellerListOrgs(reseller: string): Promise<ResellerOrg[]> {
  const { data, error } = await sb.rpc('reseller_list_orgs', { p_reseller: reseller }); if (error) throw new Error(error.message); return (data as ResellerOrg[]) || [];
}
export interface ResellerInvite { id: string; email: string; org_name: string | null; plan_key: string | null; status: string; expires_at: string; token: string; }
export async function resellerPendingInvites(reseller: string): Promise<ResellerInvite[]> {
  const { data, error } = await sb.rpc('reseller_pending_invites', { p_reseller: reseller }); if (error) throw new Error(error.message); return (data as ResellerInvite[]) || [];
}
export interface ResellerBilling { sub_count: number; active: number; total_seats: number; by_plan: Record<string, number>; }
export async function resellerBillingSummary(reseller: string): Promise<ResellerBilling> {
  const { data, error } = await sb.rpc('reseller_billing_summary', { p_reseller: reseller }); if (error) throw new Error(error.message); return (data as ResellerBilling) || { sub_count: 0, active: 0, total_seats: 0, by_plan: {} };
}
export async function resellerCreateInvite(reseller: string, email: string, orgName: string, planKey: string, snapshotId?: string | null): Promise<{ link: string; token: string; email: string }> {
  const { data, error } = await sb.rpc('reseller_create_invite', { p_reseller: reseller, p_email: email, p_org_name: orgName, p_plan_key: planKey, p_snapshot_id: snapshotId ?? null }); if (error) throw new Error(error.message); return data as { link: string; token: string; email: string };
}
// Snapshots (cloneable workspaces) — capture self-contained config; apply on sub-tenant create.
export interface WorkspaceSnapshot { id: string; name: string; description: string | null; created_at: string; }
export async function snapshotList(org: string): Promise<WorkspaceSnapshot[]> {
  const { data, error } = await sb.from('workspace_snapshots').select('id, name, description, created_at').eq('owner_org_id', org).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return (data as WorkspaceSnapshot[]) || [];
}
export async function snapshotCapture(sourceOrg: string, name: string, description?: string | null): Promise<string> {
  const { data, error } = await sb.rpc('snapshot_capture', { p_source_org: sourceOrg, p_name: name, p_description: description ?? null }); if (error) throw new Error(error.message); return data as string;
}
export async function snapshotDelete(id: string): Promise<void> {
  const { error } = await sb.from('workspace_snapshots').delete().eq('id', id); if (error) throw new Error(error.message);
}
// Reseller Stripe Connect (rebilling) — onboard the reseller's connected account + status.
export interface ResellerConnectStatus { connected: boolean; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean; }
async function invokeResellerConnect(orgId: string, action: 'onboard' | 'status'): Promise<any> {
  const { data, error } = await sb.functions.invoke('reseller-connect', { body: { action, org_id: orgId } });
  if (error) { let msg = error.message; try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ } throw new Error(msg); }
  return data;
}
export async function resellerConnectOnboard(orgId: string): Promise<{ url: string }> {
  const d = await invokeResellerConnect(orgId, 'onboard'); if (!d?.url) throw new Error('No onboarding URL returned'); return d as { url: string };
}
export async function resellerConnectStatus(orgId: string): Promise<ResellerConnectStatus> {
  return (await invokeResellerConnect(orgId, 'status')) as ResellerConnectStatus;
}
// Reseller-defined sub-tenant pricing (used as inline price_data at Connect checkout).
export interface ResellerPlanPrice { id: string; plan_key: string; amount_cents: number; currency: string; interval: string; active: boolean; }
export async function resellerListPrices(reseller: string): Promise<ResellerPlanPrice[]> {
  const { data, error } = await sb.from('reseller_plan_prices').select('id, plan_key, amount_cents, currency, interval, active').eq('reseller_org_id', reseller).order('plan_key'); if (error) throw new Error(error.message); return (data as ResellerPlanPrice[]) || [];
}
export async function resellerSetPrice(reseller: string, planKey: string, amountCents: number, interval: string, currency = 'usd'): Promise<void> {
  const { error } = await sb.from('reseller_plan_prices').upsert({ reseller_org_id: reseller, plan_key: planKey, amount_cents: amountCents, interval, currency, active: true }, { onConflict: 'reseller_org_id,plan_key' }); if (error) throw new Error(error.message);
}
// Sub-tenant subscribes through its parent reseller's connected account (1.2c).
export async function startResellerCheckout(orgId: string, planKey: string): Promise<string> {
  const { data, error } = await sb.functions.invoke('reseller-checkout', { body: { org_id: orgId, plan_key: planKey } });
  if (error) { let msg = error.message; try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ } throw new Error(msg); }
  if (!data?.url) throw new Error('No checkout URL returned'); return data.url as string;
}
// Reseller self-serve signup config (public signup on the reseller's verified domain).
export interface SelfSignupConfig { enabled: boolean; plan_key: string | null; snapshot_id: string | null; custom_domain: string | null; domain_verified: boolean; }
export async function resellerGetSelfSignup(org: string): Promise<SelfSignupConfig> {
  const { data, error } = await sb.from('organizations').select('self_signup_enabled, self_signup_plan_key, self_signup_snapshot_id, custom_domain, domain_verified').eq('id', org).maybeSingle();
  if (error) throw new Error(error.message);
  return { enabled: !!data?.self_signup_enabled, plan_key: (data as any)?.self_signup_plan_key ?? null, snapshot_id: (data as any)?.self_signup_snapshot_id ?? null, custom_domain: (data as any)?.custom_domain ?? null, domain_verified: !!(data as any)?.domain_verified };
}
export async function resellerSetSelfSignup(reseller: string, enabled: boolean, planKey: string | null, snapshotId: string | null): Promise<void> {
  const { error } = await sb.rpc('reseller_set_self_signup', { p_reseller: reseller, p_enabled: enabled, p_plan_key: planKey, p_snapshot_id: snapshotId }); if (error) throw new Error(error.message);
}
export interface SelfSignupContext { enabled: boolean; reseller_org_id?: string; name?: string; branding?: any; plan_key?: string }
export async function resellerSelfSignupContext(host: string): Promise<SelfSignupContext> {
  const { data, error } = await sb.rpc('reseller_self_signup_context', { p_host: host }); if (error) throw new Error(error.message); return (data as SelfSignupContext) || { enabled: false };
}
export async function resellerSelfSignup(host: string, orgName: string): Promise<string> {
  const { data, error } = await sb.rpc('reseller_self_signup', { p_host: host, p_org_name: orgName }); if (error) throw new Error(error.message); return data as string;
}
export interface ResellerSitePlan { plan_key: string; amount_cents: number; currency: string; interval: string }
export interface ResellerSite { enabled: boolean; reseller_org_id?: string; name?: string; branding?: { name?: string; logo_url?: string; primary_color?: string; site_template?: string }; theme_skin?: string | null; plans?: ResellerSitePlan[] }
export async function resellerSetSubPlan(sub: string, planKey: string, reason?: string): Promise<void> {
  const { error } = await sb.rpc('reseller_set_sub_plan', { p_sub: sub, p_plan_key: planKey, p_reason: reason || null }); if (error) throw new Error(error.message);
}
export async function resellerSetSubActive(sub: string, active: boolean, reason?: string): Promise<void> {
  const { error } = await sb.rpc('reseller_set_sub_active', { p_sub: sub, p_active: active, p_reason: reason || null }); if (error) throw new Error(error.message);
}
export async function getOrgImpersonation(orgId: string): Promise<boolean> {
  const { data } = await sb.from('organizations').select('allow_sub_impersonation').eq('id', orgId).maybeSingle();
  return !!(data as { allow_sub_impersonation?: boolean } | null)?.allow_sub_impersonation;
}
export async function setSubImpersonation(orgId: string, on: boolean): Promise<void> {
  const { error } = await sb.rpc('platform_set_sub_impersonation', { p_org: orgId, p_on: on }); if (error) throw new Error(error.message);
}
export async function resellerPublicSite(host: string): Promise<ResellerSite> {
  const { data, error } = await sb.rpc('reseller_public_site', { p_host: host }); if (error) return { enabled: false }; return (data as ResellerSite) || { enabled: false };
}
export async function setTenantReseller(orgId: string, on: boolean): Promise<void> {
  const { error } = await sb.rpc('platform_set_reseller', { p_org: orgId, p_on: on }); if (error) throw new Error(error.message);
}
export async function adminImpersonateLink(p: { target?: string; org?: string; sub?: string }): Promise<{ link: string; email: string; name: string }> {
  const { data, error } = await sb.functions.invoke('admin-impersonate-link', { body: p });
  if (error) { const m = (data as any)?.error; throw new Error(m || error.message || 'Failed'); }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { link: string; email: string; name: string };
}
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const { error } = await sb.rpc('org_remove_member', { p_org: orgId, p_user: userId });
  if (error) throw new Error(error.message);
}
export async function adminResetUserPassword(targetUserId: string): Promise<{ temp_password: string; email: string; name: string }> {
  const { data, error } = await sb.functions.invoke('admin-reset-user-password', { body: { target: targetUserId } });
  if (error) { const m = (data as any)?.error; throw new Error(m || error.message || 'Reset failed'); }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { temp_password: string; email: string; name: string };
}
export async function userGmailOauthStart(orgId: string): Promise<{ client_id: string; redirect_uri: string; token: string }> {
  const { data, error } = await sb.rpc('user_email_oauth_start', { p_org: orgId });
  if (error) throw new Error(error.message); return data as { client_id: string; redirect_uri: string; token: string };
}

// --- In-app AI help assistant (grounded in live /docs SECTIONS) --------------
export interface AssistantStatus { provider: string; model: string; enabled: boolean; has_key: boolean; updated_at: string | null; }
export async function assistantGetStatus(): Promise<AssistantStatus | null> {
  const { data, error } = await sb.rpc('assistant_status');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as AssistantStatus) || null;
}
export async function assistantSetConfig(p: { provider?: string; apiKey?: string; model?: string; enabled?: boolean }): Promise<void> {
  const { error } = await sb.rpc('assistant_set_config', {
    p_provider: p.provider ?? '', p_api_key: p.apiKey ?? '', p_model: p.model ?? '', p_enabled: p.enabled ?? null,
  });
  if (error) throw new Error(error.message);
}
export type AssistantTurn = { role: 'user' | 'assistant'; content: string };
export interface AssistantReply { configured: boolean; answer?: string; model?: string; }
// Grounding is built client-side from the live SECTIONS and passed per request,
// so the assistant never relies on a stale snapshot. See lib/docs.ts.
export async function askAssistant(p: { question: string; brand?: string; history?: AssistantTurn[]; grounding: { id: string; title: string; text: string }[] }): Promise<AssistantReply> {
  const { data, error } = await sb.functions.invoke('docs-assistant', { body: { question: p.question, brand: p.brand, history: p.history ?? [], grounding: p.grounding } });
  if (error) { let msg = error.message; try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ } throw new Error(msg); }
  return data as AssistantReply;
}

// ---------------------------------------------------------------------------
// Agents (Phase 3.1 agentic-ops foundation) — substrate access layer.
// Definitions/tool-grants/cost-limits are direct table writes (RLS-gated by the
// agent caps); the action lifecycle (decide/rollback/propose/run) goes through
// the SECURITY DEFINER RPCs so the scoped-principal + approve-first model holds.
// ---------------------------------------------------------------------------
export type AgentDomain = 'accounting' | 'tasks' | 'crm' | 'hr' | 'support' | 'people' | 'marketing' | 'general';
export type AgentAutonomy = 'draft_only' | 'approve_first' | 'auto_low_risk';
export interface AgentDefinition { id: string; org_id: string; name: string; domain: AgentDomain; description: string | null; enabled: boolean; autonomy_level: AgentAutonomy; config: any; created_by: string | null; created_at: string; updated_at: string; }
export type AgentActionStatus = 'proposed' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'rolled_back' | 'expired';
export interface AgentAction { id: string; org_id: string; run_id: string | null; agent_id: string | null; tool_key: string; domain: string; summary: string; payload: any; risk: 'low' | 'medium' | 'high'; reversible: boolean; status: AgentActionStatus; target_table: string | null; target_id: string | null; result: any; reversal: any; prior_state: any; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; executed_by: string | null; executed_at: string | null; rolled_back_by: string | null; rolled_back_at: string | null; expires_at: string | null; priority?: number | null; }
export interface AgentRun { id: string; org_id: string; agent_id: string | null; initiated_by: string | null; trigger: string; input: any; status: string; error: string | null; cost_tokens: number; cost_usd: number; started_at: string | null; finished_at: string | null; created_at: string; }
export interface AgentCostLimit { id: string; org_id: string; agent_id: string | null; period: 'day' | 'month'; max_runs: number | null; max_tokens: number | null; max_usd: number | null; enabled: boolean; created_at: string; updated_at: string; }
export interface AgentUsage { id: string; org_id: string; agent_id: string | null; period_kind: 'day' | 'month'; period_start: string; runs: number; tokens: number; usd: number; updated_at: string; }
export interface AgentActionEvent { id: number; org_id: string; action_id: string; event: string; actor: string | null; detail: any; at: string; }
// Phase 3 — per-tenant policy memory: agents learn each tenant's approve/reject history.
export interface AgentPolicy { org_id: string; verb: string; approve_count: number; reject_count: number; last_decision: string | null; last_decided_at: string | null; score: number; updated_at: string; }
export async function listAgentPolicy(orgId: string): Promise<AgentPolicy[]> {
  const { data, error } = await sb.from('agent_policy_memory').select('*').eq('org_id', orgId).order('score', { ascending: false });
  if (error) throw new Error(error.message); return (data as AgentPolicy[]) || [];
}
export async function resetAgentPolicy(orgId: string, verb?: string): Promise<number> {
  const { data, error } = await sb.rpc('agent_policy_reset', { p_org: orgId, p_verb: verb ?? null });
  if (error) throw new Error(error.message); return (data as number) ?? 0;
}
// Phase 3+ noise control: opt-in muting of chronically-rejected verbs. Agents STOP autonomously
// proposing a verb once its learned score is low enough - approve-first stays inviolate.
export interface AgentPolicyConfig { org_id: string; auto_suppress: boolean; suppress_threshold: number; suppress_min_n: number; updated_at?: string; updated_by?: string | null; }
export const AGENT_POLICY_CONFIG_DEFAULT: Omit<AgentPolicyConfig, 'org_id'> = { auto_suppress: false, suppress_threshold: 0.34, suppress_min_n: 5 };
export async function getAgentPolicyConfig(orgId: string): Promise<AgentPolicyConfig> {
  const { data, error } = await sb.from('agent_policy_config').select('*').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AgentPolicyConfig) || { org_id: orgId, ...AGENT_POLICY_CONFIG_DEFAULT };
}
export async function setAgentPolicyConfig(orgId: string, autoSuppress: boolean, threshold?: number, minN?: number): Promise<AgentPolicyConfig> {
  const { data, error } = await sb.rpc('agent_policy_config_set', { p_org: orgId, p_auto_suppress: autoSuppress, p_threshold: threshold ?? null, p_min_n: minN ?? null });
  if (error) throw new Error(error.message); return data as AgentPolicyConfig;
}
// Client mirror of snrpmo.agent_policy_suppressed - a verb is muted only when the org opted in,
// has >= min_n human decisions on it, and its learned score is at/below the threshold.
export function isVerbSuppressed(cfg: AgentPolicyConfig | null, p: AgentPolicy | undefined): boolean {
  if (!cfg || !cfg.auto_suppress || !p) return false;
  const n = p.approve_count + p.reject_count;
  return n >= cfg.suppress_min_n && Number(p.score) <= cfg.suppress_threshold;
}
// Phase 2 server-side transactional preflight: replays the action's writes as the real approver
// (RLS/RBAC enforced) inside a rolled-back subtransaction, so a guaranteed failure is caught
// BEFORE approval. checked=false => no server preflight for this tool (client dry-run still applies).
export interface AgentPreflight { ok: boolean; checked: boolean; tool?: string; creates?: string[]; reason?: string; error?: string; sqlstate?: string; }
export async function agentPreflight(actionId: string): Promise<AgentPreflight> {
  const { data, error } = await sb.rpc('agent_preflight_action', { p_action: actionId });
  if (error) throw new Error(error.message); return data as AgentPreflight;
}
// Batch preflight: validate every pending proposal in one capped call -> the queue shows
// ready / would-fail at a glance. Each action runs in its own rolled-back subtransaction.
export interface AgentPreflightRow { id: string; ok: boolean; checked: boolean; reason: string | null; }
export async function agentPreflightPending(orgId: string, limit = 50): Promise<AgentPreflightRow[]> {
  const { data, error } = await sb.rpc('agent_preflight_pending', { p_org: orgId, p_limit: limit });
  if (error) throw new Error(error.message);
  const d = data as { results?: AgentPreflightRow[] } | null;
  return (d && d.results) || [];
}
export interface AgentToolGrant { agent_id: string; org_id: string; tool_key: string; granted_by: string | null; granted_at: string; }

export const listAgents = (orgId: string) => _list<AgentDefinition>('agent_definitions', orgId);
// ABOS autonomous sensing config + org kill-switch (server-governed RPCs).
export async function setAgentSensing(agentId: string, enabled: boolean, cadence: 'daily' | 'hourly' = 'daily', max = 8): Promise<void> {
  const { error } = await sb.rpc('agent_set_sensing', { p_agent: agentId, p_enabled: enabled, p_cadence: cadence, p_max: max });
  if (error) throw new Error(error.message);
}
export async function setOrgAgentsPaused(orgId: string, paused: boolean): Promise<void> {
  const { error } = await sb.rpc('agent_set_org_paused', { p_org: orgId, p_paused: paused });
  if (error) throw new Error(error.message);
}
export async function getOrgAgentsPaused(orgId: string): Promise<boolean> {
  const { data } = await sb.from('organizations').select('agents_paused').eq('id', orgId).maybeSingle();
  return !!(data as any)?.agents_paused;
}
export interface AgentBriefing { awaiting: number; watched_today: number; proposed_today: number; executed_today: number; rolled_back_today: number; top: { id: string; summary: string; domain: string; risk: string; agent: string | null; proposed_at: string }[]; }
export async function getAgentBriefing(orgId: string): Promise<AgentBriefing | null> {
  const { data, error } = await sb.rpc('agent_briefing', { p_org: orgId });
  if (error) return null; return (data as AgentBriefing) || null;
}
export async function createAgent(row: { org_id: string; name: string; domain: AgentDomain; description?: string | null; autonomy_level?: AgentAutonomy; created_by?: string | null }): Promise<AgentDefinition[]> {
  const { error } = await sb.from('agent_definitions').insert(row);
  if (error) throw new Error(error.message);
  return listAgents(row.org_id);
}

// Activation: provision the curated STARTER_AGENTS pack. Idempotent (skips any whose
// name already exists). Uses the same RLS-safe wrappers a human uses, so it only works
// for a user who can manage agents. Returns the number of agents created.
export async function seedStarterAgents(orgId: string, userId: string): Promise<number> {
  const existing = await listAgents(orgId);
  const have = new Set(existing.map((a) => a.name.trim().toLowerCase()));
  let created = 0;
  for (const sa of STARTER_AGENTS) {
    if (have.has(sa.name.toLowerCase())) continue;
    const list = await createAgent({ org_id: orgId, name: sa.name, domain: sa.domain as AgentDomain, description: sa.description, autonomy_level: sa.autonomy as AgentAutonomy, created_by: userId });
    const made = list.find((a) => a.name.trim().toLowerCase() === sa.name.toLowerCase());
    if (!made) continue;
    for (const tool of sa.tools) { try { await grantAgentTool(made.id, orgId, tool); } catch { /* ignore dup grant */ } }
    created++;
  }
  // Set a sensible starter ceiling only if the org has no org-wide day limit yet.
  try {
    const limits = await listAgentCostLimits(orgId);
    if (!limits.some((l) => l.agent_id === null && l.period === 'day')) {
      await setAgentCostLimit({ org_id: orgId, agent_id: null, period: 'day', max_runs: 50, enabled: true });
    }
  } catch { /* non-fatal */ }
  return created;
}
export async function updateAgent(id: string, patch: Partial<AgentDefinition>): Promise<void> {
  const { error } = await sb.from('agent_definitions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteAgent(id: string): Promise<void> {
  const { error } = await sb.from('agent_definitions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function listAgentTools(agentId: string): Promise<AgentToolGrant[]> {
  const { data, error } = await sb.from('agent_tool_grants').select('*').eq('agent_id', agentId);
  if (error) throw new Error(error.message); return (data as AgentToolGrant[]) || [];
}
export async function grantAgentTool(agentId: string, orgId: string, toolKey: string): Promise<void> {
  const { error } = await sb.from('agent_tool_grants').insert({ agent_id: agentId, org_id: orgId, tool_key: toolKey });
  if (error) throw new Error(error.message);
}
export async function revokeAgentTool(agentId: string, toolKey: string): Promise<void> {
  const { error } = await sb.from('agent_tool_grants').delete().eq('agent_id', agentId).eq('tool_key', toolKey);
  if (error) throw new Error(error.message);
}
export async function listAgentActions(orgId: string, status?: string): Promise<AgentAction[]> {
  let qy = sb.from('agent_actions').select('*').eq('org_id', orgId).order('proposed_at', { ascending: false }).limit(200);
  if (status) qy = qy.eq('status', status);
  const { data, error } = await qy;
  if (error) throw new Error(error.message); return (data as AgentAction[]) || [];
}
export async function listAgentActionEvents(actionId: string): Promise<AgentActionEvent[]> {
  const { data, error } = await sb.from('agent_action_events').select('*').eq('action_id', actionId).order('at', { ascending: true });
  if (error) throw new Error(error.message); return (data as AgentActionEvent[]) || [];
}
export async function decideAgentAction(actionId: string, decision: 'approved' | 'rejected', note?: string): Promise<void> {
  const { error } = await sb.rpc('agent_decide_action', { p_action: actionId, p_decision: decision, p_note: note ?? null });
  if (error) throw new Error(error.message);
}
export async function rollbackAgentAction(actionId: string, note?: string): Promise<void> {
  const { error } = await sb.rpc('agent_record_rollback', { p_action: actionId, p_note: note ?? null });
  if (error) throw new Error(error.message);
}
export async function listAgentRuns(orgId: string): Promise<AgentRun[]> {
  const { data, error } = await sb.from('agent_runs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message); return (data as AgentRun[]) || [];
}
export async function listAgentCostLimits(orgId: string): Promise<AgentCostLimit[]> {
  const { data, error } = await sb.from('agent_cost_limits').select('*').eq('org_id', orgId);
  if (error) throw new Error(error.message); return (data as AgentCostLimit[]) || [];
}
export async function setAgentCostLimit(p: { org_id: string; agent_id?: string | null; period: 'day' | 'month'; max_runs?: number | null; max_tokens?: number | null; max_usd?: number | null; enabled?: boolean }): Promise<void> {
  const agentId = p.agent_id ?? null;
  let sel = sb.from('agent_cost_limits').select('id').eq('org_id', p.org_id).eq('period', p.period);
  sel = agentId === null ? sel.is('agent_id', null) : sel.eq('agent_id', agentId);
  const { data: ex, error: e1 } = await sel.maybeSingle();
  if (e1) throw new Error(e1.message);
  const vals = { max_runs: p.max_runs ?? null, max_tokens: p.max_tokens ?? null, max_usd: p.max_usd ?? null, enabled: p.enabled ?? true, updated_at: new Date().toISOString() };
  if (ex && (ex as any).id) {
    const { error } = await sb.from('agent_cost_limits').update(vals).eq('id', (ex as any).id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('agent_cost_limits').insert({ org_id: p.org_id, agent_id: agentId, period: p.period, ...vals });
    if (error) throw new Error(error.message);
  }
}
export async function listAgentUsage(orgId: string): Promise<AgentUsage[]> {
  const { data, error } = await sb.from('agent_usage').select('*').eq('org_id', orgId);
  if (error) throw new Error(error.message); return (data as AgentUsage[]) || [];
}

// Accurate ROI rollup over ALL agent rows (server-side; not capped by the 200-row action fetch).
export async function agentRoiSummary(orgId: string, days = 30): Promise<import('./agentRoi').AgentRoiSummary> {
  const { data, error } = await sb.rpc('agent_roi_summary', { p_org: orgId, p_days: days });
  if (error) throw new Error(error.message);
  return data as import('./agentRoi').AgentRoiSummary;
}

// ---------------------------------------------------------------------------
// 3.4 Metered agent billing -> reseller markup (the margin engine).
// Usage (runs/tokens) accrues in agent_usage; rate cards turn it into money.
// Platform sets WHOLESALE rates; resellers set RETAIL rates for their sub-tenants.
// Margin = retail - wholesale. Compute/visibility only; Stripe charge wiring = 3.4b.
// ---------------------------------------------------------------------------
export interface AgentBillingRates { enabled: boolean; per_run: number; per_1k_tokens: number; currency: string; }
export interface ResellerAgentRate { reseller_org_id: string; price_per_run: number; price_per_1k_tokens: number; currency: string; active: boolean; }
export interface AgentUsageCost { period_kind: 'day' | 'month'; period_start: string; runs: number; tokens: number; cogs_usd: number; per_run: number; per_1k_tokens: number; currency: string; source: 'platform' | 'reseller'; amount: number; }
export interface ResellerAgentMarginSub { org_id: string; name: string; runs: number; tokens: number; wholesale: number; retail: number; margin: number; }
export interface ResellerAgentMargin { period_kind: 'day' | 'month'; period_start: string; currency: string; per_run_wholesale: number; per_1k_wholesale: number; per_run_retail: number; per_1k_retail: number; total_runs: number; total_tokens: number; total_wholesale: number; total_retail: number; total_margin: number; subs: ResellerAgentMarginSub[]; }
export interface PlatformAgentRevenueOrg { org_id: string; name: string; runs: number; tokens: number; cogs: number; revenue: number; }
export interface PlatformAgentRevenue { period_kind: 'day' | 'month'; period_start: string; currency: string; per_run: number; per_1k_tokens: number; total_runs: number; total_tokens: number; total_revenue: number; total_cogs: number; orgs: PlatformAgentRevenueOrg[]; }

// Platform wholesale rate card (platform-admin; never returns the Stripe secret).
export async function platformAgentBillingGet(): Promise<AgentBillingRates> {
  const { data, error } = await sb.rpc('platform_agent_billing_get'); if (error) throw new Error(error.message);
  return (data as AgentBillingRates) || { enabled: false, per_run: 0, per_1k_tokens: 0, currency: 'usd' };
}
export async function platformAgentBillingSet(p: { enabled: boolean; perRun: number; per1kTokens: number; currency?: string }): Promise<void> {
  const { error } = await sb.rpc('platform_agent_billing_set', { p_enabled: p.enabled, p_per_run: p.perRun, p_per_1k_tokens: p.per1kTokens, p_currency: p.currency ?? 'usd' });
  if (error) throw new Error(error.message);
}
export async function platformAgentRevenue(periodKind: 'day' | 'month' = 'month'): Promise<PlatformAgentRevenue> {
  const { data, error } = await sb.rpc('platform_agent_revenue', { p_period_kind: periodKind }); if (error) throw new Error(error.message);
  return data as PlatformAgentRevenue;
}
// Reseller retail rate card (direct table under RLS — owner/admin of the reseller).
export async function resellerGetAgentRate(reseller: string): Promise<ResellerAgentRate | null> {
  const { data, error } = await sb.from('reseller_agent_rates').select('reseller_org_id, price_per_run, price_per_1k_tokens, currency, active').eq('reseller_org_id', reseller).maybeSingle();
  if (error) throw new Error(error.message); return (data as ResellerAgentRate) || null;
}
export async function resellerSetAgentRate(reseller: string, perRun: number, per1kTokens: number, currency = 'usd'): Promise<void> {
  const { error } = await sb.from('reseller_agent_rates').upsert({ reseller_org_id: reseller, price_per_run: perRun, price_per_1k_tokens: per1kTokens, currency, active: true }, { onConflict: 'reseller_org_id' });
  if (error) throw new Error(error.message);
}
export async function resellerAgentMargin(reseller: string, periodKind: 'day' | 'month' = 'month'): Promise<ResellerAgentMargin> {
  const { data, error } = await sb.rpc('reseller_agent_margin', { p_reseller: reseller, p_period_kind: periodKind }); if (error) throw new Error(error.message);
  return data as ResellerAgentMargin;
}
// Per-org usage + cost at the applicable rate (reseller retail if sub-tenant, else platform wholesale).
export async function agentUsageCost(orgId: string, periodKind: 'day' | 'month' = 'month'): Promise<AgentUsageCost> {
  const { data, error } = await sb.rpc('agent_usage_cost', { p_org: orgId, p_period_kind: periodKind }); if (error) throw new Error(error.message);
  return data as AgentUsageCost;
}
export interface AgentUsageSummary { plan: string; runs: number; cap: number | null; capped: boolean; source: 'free' | 'org_limit' | 'unlimited'; upgrade: boolean; remaining: number | null; pct: number; }
// Effective monthly run cap + usage for the in-product usage meter / upgrade moment (read-only).
export async function agentUsageSummary(orgId: string): Promise<AgentUsageSummary> {
  const { data, error } = await sb.rpc('agent_usage_summary', { p_org: orgId }); if (error) throw new Error(error.message);
  return data as AgentUsageSummary;
}
// Manual demo: exercise the propose -> approve -> rollback flow without an LLM key.
export async function simulateAgentProposal(orgId: string, agentId: string, domain: string): Promise<string> {
  const { data: runId, error: e1 } = await sb.rpc('agent_start_run', { p_org: orgId, p_agent: agentId, p_trigger: 'manual', p_input: {} });
  if (e1) throw new Error(e1.message);
  const samples = SAMPLE_PROPOSALS[domain] || SAMPLE_PROPOSALS.general;
  for (const s of samples) {
    const { error } = await sb.rpc('agent_propose_action', { p_org: orgId, p_run: runId as string, p_agent: agentId, p_tool: s.tool, p_domain: domain, p_summary: s.summary, p_payload: s.payload || {}, p_risk: s.risk || 'low', p_reversible: s.reversible ?? true });
    if (error) throw new Error(error.message);
  }
  await sb.rpc('agent_finish_run', { p_run: runId as string, p_status: 'awaiting_approval', p_tokens: 0, p_usd: 0, p_error: null });
  return runId as string;
}

// Propose a deterministic multi-step WORKFLOW plan as approve-first actions in one grouped run.
// RLS-safe: agent_start_run/agent_propose_action are manage-gated SECURITY DEFINER RPCs, so a
// non-manager call fails closed. Each step lands in the approvals queue (dry-run + preflighted).
export async function proposeWorkflowPlan(orgId: string, agentId: string, goal: string, steps: { tool: string; domain: string; summary: string; payload: Record<string, unknown>; risk?: string; reversible?: boolean }[]): Promise<{ runId: string; count: number }> {
  const { data: runId, error: e1 } = await sb.rpc('agent_start_run', { p_org: orgId, p_agent: agentId, p_trigger: 'manual', p_input: { kind: 'workflow', goal } });
  if (e1) throw new Error(e1.message);
  let count = 0;
  for (const st of steps) {
    const { error } = await sb.rpc('agent_propose_action', { p_org: orgId, p_run: runId as string, p_agent: agentId, p_tool: st.tool, p_domain: st.domain, p_summary: st.summary, p_payload: st.payload || {}, p_risk: st.risk || 'low', p_reversible: st.reversible ?? true });
    if (error) throw new Error(error.message);
    count++;
  }
  await sb.rpc('agent_finish_run', { p_run: runId as string, p_status: 'awaiting_approval', p_tokens: 0, p_usd: 0, p_error: null });
  return { runId: runId as string, count };
}
// Phase 3.5 graduated autonomy: auto-approve a low-risk reversible action with no human
// click. The RPC hard-enforces the policy (auto_low_risk + enabled agent, low risk,
// reversible); execution still runs client-side as the user (never a bypass).
export async function autoApproveAgentAction(actionId: string): Promise<void> {
  const { error } = await sb.rpc('agent_auto_approve', { p_action: actionId });
  if (error) throw new Error(error.message);
}

// Deterministic "Find work" scan (Phase 3.5+): reads the workspace's REAL records and
// proposes concrete actions with REAL target ids — so the executors run WITHOUT an LLM
// key. Writes through the same approve-first RPCs as the LLM proposer. Dedupes against
// already-pending proposals so a re-scan doesn't spam the queue.
export async function runWorkScan(orgId: string, agent: { id: string; domain: string }): Promise<{ runId: string | null; count: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const [tasks, deals, ledger, users, tickets, agents, pending, socOv, socChan, socTop, socItems] = await Promise.all([
    (agent.domain === 'tasks' || agent.domain === 'people') ? getTasks(orgId) : Promise.resolve([] as Task[]),
    agent.domain === 'crm' ? getDeals(orgId) : Promise.resolve([] as Deal[]),
    agent.domain === 'accounting' ? getLedgerEntries(orgId) : Promise.resolve([] as LedgerEntry[]),
    agent.domain === 'people' ? getOrgUsers(orgId) : Promise.resolve([] as OrgUser[]),
    agent.domain === 'support' ? listTickets(orgId) : Promise.resolve([] as SupportTicket[]),
    agent.domain === 'support' ? supportAgentList() : Promise.resolve([] as SupportAgent[]),
    listAgentActions(orgId, 'proposed').catch(() => [] as AgentAction[]),
    agent.domain === 'marketing' ? socialAnalyticsOverview(orgId, 30).catch(() => null) : Promise.resolve(null),
    agent.domain === 'marketing' ? socialChannelStats(orgId).catch(() => [] as SocialChannelStat[]) : Promise.resolve([] as SocialChannelStat[]),
    agent.domain === 'marketing' ? socialTopPosts(orgId, 5).catch(() => [] as SocialTopPost[]) : Promise.resolve([] as SocialTopPost[]),
    agent.domain === 'marketing' ? listSourceItems(orgId, { undraftedOnly: true, limit: 20 }).catch(() => [] as SocialSourceItem[]) : Promise.resolve([] as SocialSourceItem[]),
  ]);
  const userList = (users as OrgUser[]).map((u) => ({ id: u.id, name: u.full_name || u.email || 'Unknown' }));
  const agentList = (agents as SupportAgent[]).filter((a) => a.active).map((a) => ({ id: a.user_id, name: a.full_name || a.email || 'Agent' }));
  const seen = new Set(pending.map((a) => a.payload?.entry_id || a.payload?.task_id || a.payload?.deal_id || a.payload?.person_id || a.payload?.ticket_id || a.payload?.insight_key || a.payload?.source_item_id).filter(Boolean));
  const proposals = scanForWork(agent.domain, { tasks, deals, ledger, users: userList, tickets: tickets as SupportTicket[], agents: agentList, analytics: agent.domain === 'marketing' ? { overview: (socOv as any) || {}, channels: (socChan as any[]), top: (socTop as any[]) } : undefined, sourceItems: agent.domain === 'marketing' ? (socItems as SocialSourceItem[]).map((i) => ({ id: i.id, title: i.title, url: i.url, summary: i.summary })) : undefined, today })
    .filter((p) => { const tid = p.payload.entry_id || p.payload.task_id || p.payload.deal_id || p.payload.person_id || p.payload.ticket_id || p.payload.insight_key || p.payload.source_item_id; return !tid || !seen.has(tid); });
  if (proposals.length === 0) return { runId: null, count: 0 };
  const { data: runId, error: e1 } = await sb.rpc('agent_start_run', { p_org: orgId, p_agent: agent.id, p_trigger: 'manual', p_input: { kind: 'work_scan' } });
  if (e1) throw new Error(e1.message);
  for (const p of proposals) {
    const { error } = await sb.rpc('agent_propose_action', { p_org: orgId, p_run: runId as string, p_agent: agent.id, p_tool: p.tool, p_domain: agent.domain, p_summary: p.summary, p_payload: p.payload, p_risk: p.risk, p_reversible: p.reversible });
    if (error) throw new Error(error.message);
  }
  await sb.rpc('agent_finish_run', { p_run: runId as string, p_status: 'awaiting_approval', p_tokens: 0, p_usd: 0, p_error: null });
  return { runId: runId as string, count: proposals.length };
}

import { ChatCommand } from './chatCommands';

// ---- Chat Commands registry (data-driven #keyword commands) ----
// RLS: non-guest members read; agent-managers create/edit/delete.
export async function listChatCommands(orgId: string): Promise<ChatCommand[]> {
  const { data, error } = await sb.from('agent_chat_commands').select('*').eq('org_id', orgId).order('keyword');
  if (error) throw new Error(error.message); return (data as ChatCommand[]) || [];
}
export async function seedBuiltinChatCommands(orgId: string): Promise<number> {
  const { data, error } = await sb.rpc('seed_builtin_chat_commands', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as number) || 0;
}
export async function createChatCommand(row: { org_id: string; keyword: string; label: string; description?: string | null; kind?: string; tool_key?: string | null; domain?: string; instruction?: string | null; who_can_use?: string; approval?: string; enabled?: boolean; created_by?: string | null }): Promise<void> {
  const { error } = await sb.from('agent_chat_commands').insert(row);
  if (error) throw new Error(error.message);
}
export async function updateChatCommand(id: string, patch: Partial<ChatCommand>): Promise<void> {
  const { error } = await sb.from('agent_chat_commands').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteChatCommand(id: string): Promise<void> {
  const { error } = await sb.from('agent_chat_commands').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
// Member-safe dispatch: creates ONE proposed action (approval-gated; never executes/auto).
export async function requestChatCommandAction(p: { orgId: string; agentId: string; toolKey: string; domain: string; summary: string; payload: any; risk: string; reversible: boolean; requireManage: boolean }): Promise<string> {
  const { data, error } = await sb.rpc('agent_request_command_action', {
    p_org: p.orgId, p_agent: p.agentId, p_tool: p.toolKey, p_domain: p.domain, p_summary: p.summary,
    p_payload: p.payload ?? {}, p_risk: p.risk ?? 'low', p_reversible: p.reversible ?? true, p_require_manage: p.requireManage ?? false,
  });
  if (error) throw new Error(error.message); return data as string;
}
// Domain executor calls this AFTER performing the real (RLS-enforced) write, to
// record target + reversal so the action becomes executed + rollback-able.
export async function recordAgentExecution(actionId: string, targetTable: string, targetId: string | null, result?: any, reversal?: any, priorState?: any): Promise<void> {
  const { error } = await sb.rpc('agent_record_execution', { p_action: actionId, p_target_table: targetTable, p_target_id: targetId, p_result: result ?? {}, p_reversal: reversal ?? null, p_prior_state: priorState ?? null });
  if (error) throw new Error(error.message);
}
// Invoke the LLM proposer edge fn (Phase 3.2). Returns {configured:false} when no
// provider key is set. Errors from the fn (cost ceiling, provider, auth) come back
// as { error }. Nothing executes here — it only writes proposals for approval.
export async function runAgentProposer(p: { orgId: string; agentId: string; request: string; tools: { key: string; label: string; description: string; risk: string; reversible: boolean }[]; brand?: string }): Promise<{ configured?: boolean; proposed?: number; considered?: number; run_id?: string; error?: string }> {
  let brand = p.brand || '';
  try { const bv = await getBrandVoice(p.orgId); if (bv) brand = composeBrandContext(brand, bv); } catch { /* brand voice optional */ }
  const { data, error } = await sb.functions.invoke('agent-propose', { body: { org_id: p.orgId, agent_id: p.agentId, request: p.request, tools: p.tools, brand } });
  if (error) {
    let msg = (error as any).message || 'Agent run failed';
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    return { error: msg };
  }
  return (data || {}) as any;
}


// ── HR Appraisals / performance reviews ───────────────────────────────────────
export interface AppraisalCycle {
  id: string; org_id: string; name: string;
  period_start: string | null; period_end: string | null;
  status: 'draft' | 'active' | 'closed';
  created_by: string | null; created_at: string;
}
export interface Appraisal {
  id: string; org_id: string; cycle_id: string | null;
  employee_id: string; reviewer_id: string | null;
  status: 'pending' | 'self_review' | 'in_review' | 'completed';
  overall_rating: number | null; summary: string | null;
  ratings: Record<string, number>;
  created_by: string | null; created_at: string; updated_at: string;
  employee?: { full_name: string | null; avatar_url: string | null } | null;
  reviewer?: { full_name: string | null; avatar_url: string | null } | null;
}

export async function getAppraisalCycles(orgId: string | null = activeOrgScope): Promise<AppraisalCycle[]> {
  let q = sb.from('appraisal_cycles').select('*').order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q; if (error) throw error; return (data as AppraisalCycle[]) || [];
}
export async function createAppraisalCycle(p: { org_id: string; name: string; period_start?: string | null; period_end?: string | null; status?: AppraisalCycle['status'] }): Promise<AppraisalCycle> {
  const { data, error } = await sb.from('appraisal_cycles')
    .insert({ org_id: p.org_id, name: p.name, period_start: p.period_start || null, period_end: p.period_end || null, status: p.status || 'draft' })
    .select('*').single();
  if (error) throw error; return data as AppraisalCycle;
}
export async function updateAppraisalCycle(id: string, patch: Partial<Pick<AppraisalCycle, 'name' | 'period_start' | 'period_end' | 'status'>>): Promise<AppraisalCycle> {
  const { data, error } = await sb.from('appraisal_cycles').update(patch).eq('id', id).select('*').single();
  if (error) throw error; return data as AppraisalCycle;
}
export async function deleteAppraisalCycle(id: string): Promise<void> {
  const { error } = await sb.from('appraisal_cycles').delete().eq('id', id); if (error) throw error;
}

const APPRAISAL_SEL = '*, employee:users!appraisals_employee_id_fkey(full_name, avatar_url), reviewer:users!appraisals_reviewer_id_fkey(full_name, avatar_url)';
export async function getAppraisals(orgId: string | null = activeOrgScope, cycleId?: string | null): Promise<Appraisal[]> {
  let q = sb.from('appraisals').select(APPRAISAL_SEL).order('created_at', { ascending: false });
  if (orgId) q = q.eq('org_id', orgId);
  if (cycleId) q = q.eq('cycle_id', cycleId);
  const { data, error } = await q; if (error) throw error; return (data as Appraisal[]) || [];
}
export async function createAppraisal(p: { org_id: string; cycle_id: string; employee_id: string; reviewer_id?: string | null; status?: Appraisal['status']; overall_rating?: number | null; summary?: string | null }): Promise<Appraisal> {
  const { data, error } = await sb.from('appraisals')
    .insert({ org_id: p.org_id, cycle_id: p.cycle_id, employee_id: p.employee_id, reviewer_id: p.reviewer_id || null, status: p.status || 'pending', overall_rating: p.overall_rating ?? null, summary: p.summary || null })
    .select(APPRAISAL_SEL).single();
  if (error) throw error; return data as Appraisal;
}
export async function updateAppraisal(id: string, patch: Partial<Pick<Appraisal, 'status' | 'overall_rating' | 'summary' | 'reviewer_id'>> & { ratings?: Record<string, number> }): Promise<Appraisal> {
  const { data, error } = await sb.from('appraisals').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select(APPRAISAL_SEL).single();
  if (error) throw error; return data as Appraisal;
}
export async function deleteAppraisal(id: string): Promise<void> {
  const { error } = await sb.from('appraisals').delete().eq('id', id); if (error) throw error;
}

// AI custom fields — compute a cell value from a record's text via the key-gated
// ai-field edge fn (reuses the shared assistant_config key; no business writes there).
export async function computeAiField(p: { text: string; transform: string; categories?: string[]; instruction?: string }): Promise<{ configured?: boolean; value?: string; error?: string }> {
  const { data, error } = await sb.functions.invoke('ai-field', { body: { text: p.text, transform: p.transform, categories: p.categories || [], instruction: p.instruction || '' } });
  if (error) { let msg = (error as any).message || 'AI field failed'; try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ } return { error: msg }; }
  return (data || {}) as any;
}

// --- Account / workspace self-deletion lifecycle (#4) ---
export interface AccountDeletionStatus { state: 'none' | 'requested' | 'scheduled'; scheduled_for?: string | null; requested_at?: string | null; is_owner?: boolean }
export async function requestAccountDeletion(orgId: string, reason?: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await sb.rpc('request_account_deletion', { p_org: orgId, p_reason: reason ?? null });
  if (error) throw new Error(error.message); return data as { ok: boolean; reason?: string };
}
export async function cancelAccountDeletion(orgId: string): Promise<{ ok: boolean }> {
  const { data, error } = await sb.rpc('cancel_account_deletion', { p_org: orgId });
  if (error) throw new Error(error.message); return data as { ok: boolean };
}
export async function confirmAccountDeletion(token: string): Promise<{ ok: boolean; reason?: string; scheduled_for?: string }> {
  const { data, error } = await sb.rpc('confirm_account_deletion', { p_token: token });
  if (error) throw new Error(error.message); return data as { ok: boolean; reason?: string; scheduled_for?: string };
}
export async function accountDeletionStatus(orgId: string): Promise<AccountDeletionStatus> {
  const { data, error } = await sb.rpc('account_deletion_status', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as AccountDeletionStatus) ?? { state: 'none' };
}

// ===== File security / malware scanning (admin & platform) =====================
// Backed by SECURITY DEFINER RPCs that self-enforce platform-admin / org owner-admin.
export type QuarantineRow = {
  bucket: string; path: string; org_id: string | null; org_name: string | null;
  status: string; verdict: string | null; mime: string | null; size_bytes: number | null;
  filename: string | null; created_at: string; scanned_at: string | null; object_present: boolean;
};
export async function fileScanQuarantineList(orgId?: string | null, limit = 200): Promise<QuarantineRow[]> {
  const { data, error } = await sb.rpc('file_scan_quarantine_list', { p_org: orgId ?? null, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data || []) as QuarantineRow[];
}
export async function fileScanRequestRescan(bucket: string, path: string): Promise<void> {
  const { error } = await sb.rpc('file_scan_request_rescan', { p_bucket: bucket, p_path: path });
  if (error) throw new Error(error.message);
}
export async function fileScanDismiss(bucket: string, path: string): Promise<void> {
  const { error } = await sb.rpc('file_scan_dismiss', { p_bucket: bucket, p_path: path });
  if (error) throw new Error(error.message);
}
export async function fileScanDeleteObject(bucket: string, path: string): Promise<void> {
  // Remove the actual object (storage RLS gates delete to org owner/admin), then clear the record.
  try { await sb.storage.from(bucket).remove([path]); } catch { /* object may already be gone */ }
  await fileScanDismiss(bucket, path);
}
export type FileScanStatus = {
  enabled: boolean; provider: string | null; has_key: boolean; updated_at: string | null;
  av_daily_cap_org: number | null; av_daily_cap_global: number | null;
  av_calls_today: number | null; av_alert_at: string | null;
};
export async function fileScanGetStatus(): Promise<FileScanStatus | null> {
  const { data, error } = await sb.rpc('file_scan_get_config');
  if (error) throw new Error(error.message);
  return (data as FileScanStatus) || null;
}
export async function fileScanSetConfig(p: { enabled?: boolean | null; provider?: string | null; apiKey?: string | null; capOrg?: number | null; capGlobal?: number | null }): Promise<FileScanStatus> {
  const { data, error } = await sb.rpc('file_scan_set_config', {
    p_enabled: p.enabled ?? null, p_provider: p.provider ?? null, p_api_key: p.apiKey ?? null,
    p_cap_org: p.capOrg ?? null, p_cap_global: p.capGlobal ?? null,
  });
  if (error) throw new Error(error.message);
  return data as FileScanStatus;
}

// --- Tenant archive / restore (#3) ---
export interface TenantLifecycle { allowed: boolean; archived?: boolean; archived_at?: string | null; scheduled_for?: string | null; requested_at?: string | null }
export async function tenantArchive(orgId: string, reason?: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await sb.rpc('tenant_archive', { p_org: orgId, p_reason: reason ?? null });
  if (error) throw new Error(error.message); return data as { ok: boolean; reason?: string };
}
export async function tenantRestore(orgId: string): Promise<{ ok: boolean }> {
  const { data, error } = await sb.rpc('tenant_restore', { p_org: orgId });
  if (error) throw new Error(error.message); return data as { ok: boolean };
}
export async function tenantLifecycleState(orgId: string): Promise<TenantLifecycle> {
  const { data, error } = await sb.rpc('tenant_lifecycle_state', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as TenantLifecycle) ?? { allowed: false };
}

// ── Social & Content (Phase 3A) ─────────────────────────────────────────────
export type SocialPlatform = 'facebook'|'instagram'|'linkedin'|'x'|'youtube'|'tiktok'|'threads'|'pinterest'|'google_business';
export interface SocialChannel { id: string; org_id: string; platform: SocialPlatform; display_name: string | null; handle: string | null; status: 'connected'|'disconnected'|'error'; created_by: string | null; created_at: string; updated_at: string; }
export interface SocialPostChannel { id: string; org_id: string; post_id: string; channel_id: string | null; status: 'pending'|'published'|'failed'|'skipped'; external_id: string | null; error: string | null; created_at: string; }
export interface SocialPost { id: string; org_id: string; body: string; media: any[]; status: 'draft'|'scheduled'|'published'|'failed'|'cancelled'; scheduled_at: string | null; published_at: string | null; source: 'manual'|'agent'|'automation'|'rss'; created_by: string | null; created_at: string; updated_at: string; approved_by?: string | null; approved_at?: string | null; channels?: SocialPostChannel[]; }

export async function listSocialChannels(orgId: string): Promise<SocialChannel[]> {
  const { data, error } = await sb.from('social_channels').select('*').eq('org_id', orgId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message); return (data as SocialChannel[]) || [];
}
export async function createSocialChannel(p: { org_id: string; platform: SocialPlatform; display_name?: string; handle?: string; created_by: string }): Promise<SocialChannel> {
  const { data, error } = await sb.from('social_channels').insert({ org_id: p.org_id, platform: p.platform, display_name: p.display_name || null, handle: p.handle || null, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as SocialChannel;
}
export async function deleteSocialChannel(id: string): Promise<void> {
  const { error } = await sb.from('social_channels').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listSocialPosts(orgId: string): Promise<SocialPost[]> {
  const { data, error } = await sb.from('social_posts').select('*, channels:social_post_channels(*)').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as SocialPost[]) || [];
}
export async function createSocialPost(p: { org_id: string; body: string; created_by: string; status?: SocialPost['status']; scheduled_at?: string | null; channel_ids?: string[]; source?: SocialPost['source']; media?: any[] }): Promise<SocialPost> {
  const status = p.status || (p.scheduled_at ? 'scheduled' : 'draft');
  const { data, error } = await sb.from('social_posts').insert({ org_id: p.org_id, body: p.body, status, scheduled_at: p.scheduled_at || null, source: p.source || 'manual', created_by: p.created_by, media: p.media || [] }).select('*').single();
  if (error) throw new Error(error.message);
  const post = data as SocialPost;
  if (p.channel_ids && p.channel_ids.length) {
    const rows = p.channel_ids.map((cid) => ({ org_id: p.org_id, post_id: post.id, channel_id: cid }));
    const { error: e2 } = await sb.from('social_post_channels').insert(rows);
    if (e2) throw new Error(e2.message);
  }
  return post;
}
export async function updateSocialPost(id: string, patch: Partial<Pick<SocialPost, 'body'|'status'|'scheduled_at'>>): Promise<void> {
  const { error } = await sb.from('social_posts').update(patch).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteSocialPost(id: string): Promise<void> {
  const { error } = await sb.from('social_posts').delete().eq('id', id); if (error) throw new Error(error.message);
}

// ── Content sources (RSS/import → drafts) ───────────────────────────────────
export interface SocialContentSource { id: string; org_id: string; kind: 'rss'|'atom'; name: string; url: string; active: boolean; last_fetched_at: string | null; last_status: string | null; last_error: string | null; item_count: number; created_by: string | null; created_at: string; updated_at: string; }
export interface SocialSourceItem { id: string; org_id: string; source_id: string; guid: string; title: string; url: string; summary: string; published_at: string | null; drafted_post_id: string | null; created_at: string; }
export async function listContentSources(orgId: string): Promise<SocialContentSource[]> {
  const { data, error } = await sb.from('social_content_sources').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as SocialContentSource[]) || [];
}
export async function createContentSource(p: { org_id: string; name: string; url: string; created_by: string; kind?: 'rss'|'atom' }): Promise<void> {
  const { error } = await sb.from('social_content_sources').insert({ org_id: p.org_id, name: p.name, url: p.url, kind: p.kind || 'rss', created_by: p.created_by });
  if (error) throw new Error(error.message);
}
export async function updateContentSource(id: string, patch: Partial<Pick<SocialContentSource, 'name'|'url'|'active'>>): Promise<void> {
  const { error } = await sb.from('social_content_sources').update(patch).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteContentSource(id: string): Promise<void> {
  const { error } = await sb.from('social_content_sources').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listSourceItems(orgId: string, opts?: { undraftedOnly?: boolean; limit?: number }): Promise<SocialSourceItem[]> {
  let q = sb.from('social_source_items').select('*').eq('org_id', orgId);
  if (opts?.undraftedOnly) q = q.is('drafted_post_id', null);
  q = q.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(opts?.limit ?? 200);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as SocialSourceItem[]) || [];
}
// Fetch feeds server-side (SSRF-guarded, rate-limited edge fn). Returns counts.
export async function fetchContentSources(sourceId?: string): Promise<{ fetched: number; new_items: number }> {
  const { data, error } = await sb.functions.invoke('social-fetch-sources', { body: sourceId ? { source_id: sourceId } : {} });
  if (error) throw new Error(error.message); return (data as { fetched: number; new_items: number }) || { fetched: 0, new_items: 0 };
}
// Draft a post from a feed item: post is inserted under RLS as the user, then linked to the item (definer, staff-checked).
export async function draftPostFromItem(item: SocialSourceItem, createdBy: string): Promise<string> {
  const body = item.url ? `${item.title}\n\n${item.url}` : item.title;
  const post = await createSocialPost({ org_id: item.org_id, body, created_by: createdBy, source: 'rss' });
  const { error } = await sb.rpc('social_source_item_link_draft', { p_item: item.id, p_post: post.id });
  if (error) throw new Error(error.message);
  return post.id;
}
export async function linkSourceItemDraft(itemId: string, postId: string): Promise<void> {
  const { error } = await sb.rpc('social_source_item_link_draft', { p_item: itemId, p_post: postId });
  if (error) throw new Error(error.message);
}

// ── Media library (reusable creatives) ──────────────────────────────────────
export interface SocialMediaAsset { id: string; org_id: string; kind: 'image'|'video'|'gif'; title: string; url: string; thumb_url: string | null; source: 'url'|'drive'|'upload'; drive_file_id: string | null; storage_path: string | null; width: number | null; height: number | null; tags: string[]; created_by: string | null; created_at: string; }
export async function listMediaAssets(orgId: string, opts?: { kind?: 'image'|'video'|'gif'; limit?: number }): Promise<SocialMediaAsset[]> {
  let q = sb.from('social_media_assets').select('*').eq('org_id', orgId);
  if (opts?.kind) q = q.eq('kind', opts.kind);
  q = q.order('created_at', { ascending: false }).limit(opts?.limit ?? 500);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as SocialMediaAsset[]) || [];
}
export async function createMediaAsset(p: { org_id: string; created_by: string; kind: 'image'|'video'|'gif'; title: string; url: string; thumb_url?: string | null; tags?: string[] }): Promise<void> {
  const { error } = await sb.from('social_media_assets').insert({ org_id: p.org_id, created_by: p.created_by, kind: p.kind, title: p.title, url: p.url, thumb_url: p.thumb_url || null, source: 'url', tags: p.tags || [] });
  if (error) throw new Error(error.message);
}
export async function deleteMediaAsset(id: string): Promise<void> {
  const { error } = await sb.from('social_media_assets').delete().eq('id', id); if (error) throw new Error(error.message);
}

const mimeToKind = (m: string | null): 'image' | 'video' | 'gif' => m === 'image/gif' ? 'gif' : (m || '').startsWith('video/') ? 'video' : 'image';
// Device upload → private, scan-gated 'social-media' bucket (fail-closed: only a clean verdict is saved), then a metadata row.
export async function uploadMediaAsset(p: { org_id: string; created_by: string; file: File; title?: string }): Promise<void> {
  const kind = mimeToKind(p.file.type || null);
  const ext = (p.file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${p.org_id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from('social-media').upload(path, p.file, { upsert: false, contentType: p.file.type || undefined });
  if (upErr) throw new Error(upErr.message);
  const { error } = await sb.from('social_media_assets').insert({ org_id: p.org_id, created_by: p.created_by, kind, title: p.title?.trim() || p.file.name, url: '', source: 'upload', storage_path: path });
  if (error) { await sb.storage.from('social-media').remove([path]).catch(() => {}); throw new Error(error.message); }
}
// Reference an already-scanned Drive file (no copy, no re-scan) as a reusable media asset.
export async function createMediaAssetFromDrive(p: { org_id: string; created_by: string; file: DriveFile }): Promise<void> {
  const { error } = await sb.from('social_media_assets').insert({ org_id: p.org_id, created_by: p.created_by, kind: mimeToKind(p.file.mime_type), title: p.file.name, url: '', source: 'drive', drive_file_id: p.file.id });
  if (error) throw new Error(error.message);
}
// Resolve a previewable URL for any asset source (signed for private drive/upload; literal for url).
export async function mediaAssetUrl(a: SocialMediaAsset): Promise<string> {
  if (a.source === 'url') return a.url || '';
  if (a.source === 'upload' && a.storage_path) {
    const { data } = await sb.storage.from('social-media').createSignedUrl(a.storage_path, 3600); return data?.signedUrl || '';
  }
  if (a.source === 'drive' && a.drive_file_id) {
    const { data: df } = await sb.from('drive_files').select('storage_path').eq('id', a.drive_file_id).maybeSingle();
    const sp = (df as { storage_path?: string } | null)?.storage_path; if (!sp) return '';
    const { data } = await sb.storage.from('drives').createSignedUrl(sp, 3600); return data?.signedUrl || '';
  }
  return '';
}
// List the org's Drive image/video files for the "pick from Drive" picker (already malware-scanned).
export async function listDriveMediaFiles(orgId: string, limit = 60): Promise<DriveFile[]> {
  const cols = 'id, org_id, drive_id, folder_id, name, kind, storage_path, mime_type, size_bytes, created_by, created_at, updated_at, archived_at';
  const { data, error } = await sb.from('drive_files').select(cols)
    .eq('org_id', orgId).is('archived_at', null).not('storage_path', 'is', null)
    .or('mime_type.ilike.image/%,mime_type.ilike.video/%')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message); return (data as DriveFile[]) || [];
}

// ── Live publishing: provider config (platform) + per-channel connection (secret-isolated) ──
export interface SocialProviderStatus { provider: string; enabled: boolean; configured: boolean; redirect_uri: string | null; scopes: string; updated_at: string | null; }
export async function socialProviderStatus(): Promise<SocialProviderStatus[]> {
  const { data, error } = await sb.rpc('social_provider_status');
  if (error) throw new Error(error.message); return (data as SocialProviderStatus[]) || [];
}
export async function socialProviderSetConfig(p: { provider: string; client_id: string; client_secret: string; redirect_uri: string; scopes: string; enabled: boolean }): Promise<void> {
  const { error } = await sb.rpc('social_provider_set_config', { p_provider: p.provider, p_client_id: p.client_id, p_client_secret: p.client_secret, p_redirect_uri: p.redirect_uri, p_scopes: p.scopes, p_enabled: p.enabled });
  if (error) throw new Error(error.message);
}
export interface SocialChannelConn { channel_id: string; connected: boolean; status: string; expires_at: string | null; provider_account_id: string | null; }
export async function socialChannelConnStatus(channelId: string): Promise<SocialChannelConn | null> {
  const { data, error } = await sb.rpc('social_channel_conn_status', { p_channel: channelId });
  if (error) throw new Error(error.message); const r = (data as SocialChannelConn[]) || []; return r[0] || null;
}
export async function socialChannelDisconnect(channelId: string): Promise<void> {
  const { error } = await sb.rpc('social_channel_disconnect', { p_channel: channelId });
  if (error) throw new Error(error.message);
}
// Begin OAuth connect: returns the provider authorize URL to redirect the user to.
export interface DashboardCounts { agent_pending?: number; social_scheduled?: number; social_draft?: number; leads_new_7d?: number; forms_subs_7d?: number; inbox_open?: number; tasks_overdue?: number; invoices_overdue?: number; expenses_pending?: number; leave_pending?: number; drive_used_bytes?: number; drive_limit_mb?: number | null; drive_files?: number; recordings_count?: number; }
// Single-round-trip cockpit counts (org-scoped, member-gated). Cheap + cacheable.
export async function dashboardCounts(orgId: string): Promise<DashboardCounts> {
  const { data, error } = await sb.rpc('dashboard_counts', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as DashboardCounts) || {};
}
// ── Upsell / upgrade-prompt engine (platform defaults + reseller overrides) ──
export interface UpsellPrompt { id: string; owner_org: string | null; slug: string; trigger_type: string; feature_key: string | null; metric: string | null; threshold_pct: number | null; placement: string; title: string; body: string; cta_label: string; cta_href: string; min_plan: string | null; audience: string; status: string; priority: number; style: any; created_at?: string; }
export interface UpsellPromptInput { id?: string | null; owner_org: string | null; slug: string; trigger_type: string; feature_key?: string | null; metric?: string | null; threshold_pct?: number | null; placement: string; title: string; body: string; cta_label: string; cta_href: string; min_plan?: string | null; audience: string; priority: number; style?: any }
// Management list (RLS: platform admin sees platform defaults; reseller owner/admin sees its own).
export async function listUpsellPrompts(ownerOrg: string | null): Promise<UpsellPrompt[]> {
  let q = sb.from('upsell_prompts').select('*');
  q = ownerOrg === null ? q.is('owner_org', null) : q.eq('owner_org', ownerOrg);
  const { data, error } = await q.neq('status', 'archived').order('priority', { ascending: true });
  if (error) throw new Error(error.message); return (data as UpsellPrompt[]) || [];
}
// Resolved, merged, active prompts for an org (platform defaults + its reseller's overrides).
export async function upsellPromptsFor(orgId: string): Promise<UpsellPrompt[]> {
  const { data, error } = await sb.rpc('upsell_prompts_for', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as UpsellPrompt[]) || [];
}
export async function saveUpsellPrompt(p: UpsellPromptInput): Promise<string> {
  const { data, error } = await sb.rpc('upsell_prompt_save', { p_id: p.id || null, p_owner: p.owner_org, p_slug: p.slug, p_trigger: p.trigger_type, p_feature: p.feature_key || null, p_metric: p.metric || null, p_threshold: p.threshold_pct ?? null, p_placement: p.placement, p_title: p.title, p_body: p.body, p_cta_label: p.cta_label, p_cta_href: p.cta_href, p_min_plan: p.min_plan || null, p_audience: p.audience, p_priority: p.priority, p_style: p.style || {} });
  if (error) throw new Error(error.message); return data as string;
}
export async function setUpsellPromptStatus(id: string, status: 'active' | 'paused' | 'archived'): Promise<void> {
  const { error } = await sb.rpc('upsell_prompt_set_status', { p_id: id, p_status: status }); if (error) throw new Error(error.message);
}

// ── Screen recordings (metadata + storage; recorder UI = slice 2) ───────────
export interface ScreenRecording { id: string; org_id: string; title: string; description: string | null; storage_path: string | null; thumb_path: string | null; duration_sec: number | null; size_bytes: number | null; mime: string; created_by: string | null; created_at: string; updated_at: string; }
export const RECORDING_MAX_BYTES = 209715200;   // 200 MB per recording (matches bucket cap)
export const RECORDING_MAX_SEC = 600;           // 10 min v1
export async function listScreenRecordings(orgId: string): Promise<ScreenRecording[]> {
  const { data, error } = await sb.from('screen_recordings').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as ScreenRecording[]) || [];
}
// Insert row first (so size counts toward the storage meter), then upload bytes, then stamp storage_path.
export async function uploadScreenRecording(p: { org_id: string; created_by: string; title: string; description?: string | null; blob: Blob; duration_sec: number; mime?: string; thumb?: Blob | null }): Promise<ScreenRecording> {
  const size = p.blob.size;
  if (size > RECORDING_MAX_BYTES) throw new Error(`Recording is too large (max ${Math.round(RECORDING_MAX_BYTES / 1048576)} MB).`);
  const mime = p.mime || 'video/webm';
  const { data: row, error: insErr } = await sb.from('screen_recordings')
    .insert({ org_id: p.org_id, created_by: p.created_by, title: p.title, description: p.description || null, duration_sec: Math.round(p.duration_sec), size_bytes: size, mime })
    .select('*').single();
  if (insErr) throw new Error(insErr.message);
  const rec = row as ScreenRecording;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const path = `${p.org_id}/${p.created_by}/${rec.id}.${ext}`;
  const { error: upErr } = await sb.storage.from('recordings').upload(path, p.blob, { upsert: false, contentType: mime });
  if (upErr) { await sb.from('screen_recordings').delete().eq('id', rec.id); throw new Error(upErr.message); }
  // Poster thumbnail (recordings are non-executable media; stored private, not AV-scanned).
  let thumbPath: string | null = null;
  if (p.thumb) {
    const tpath = `${p.org_id}/${p.created_by}/${rec.id}_thumb.jpg`;
    const { error: tErr } = await sb.storage.from('recordings').upload(tpath, p.thumb, { upsert: false, contentType: 'image/jpeg' });
    if (!tErr) thumbPath = tpath;
  }
  const { error: updErr } = await sb.from('screen_recordings').update({ storage_path: path, thumb_path: thumbPath }).eq('id', rec.id);
  if (updErr) throw new Error(updErr.message);
  return { ...rec, storage_path: path, thumb_path: thumbPath };
}
export async function updateScreenRecording(id: string, patch: Partial<Pick<ScreenRecording, 'title'|'description'>>): Promise<void> {
  const { error } = await sb.from('screen_recordings').update(patch).eq('id', id); if (error) throw new Error(error.message);
}
export async function screenRecordingUrl(path: string): Promise<string> {
  const { data, error } = await sb.storage.from('recordings').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message); return data.signedUrl;
}
export async function deleteScreenRecording(rec: ScreenRecording): Promise<void> {
  if (rec.storage_path) { try { await sb.storage.from('recordings').remove([rec.storage_path]); } catch { /* best-effort */ } }
  const { error } = await sb.from('screen_recordings').delete().eq('id', rec.id); if (error) throw new Error(error.message);
}

export interface RecordingShare { id: string; recording_id: string; token: string; revoked: boolean; views: number; created_at: string; }
export async function createRecordingShare(recordingId: string): Promise<string> {
  const { data, error } = await sb.rpc('screen_recording_share_create', { p_recording: recordingId });
  if (error) throw new Error(error.message); return data as string;
}
export async function revokeRecordingShare(id: string): Promise<void> {
  const { error } = await sb.rpc('screen_recording_share_revoke', { p_id: id }); if (error) throw new Error(error.message);
}
export async function listRecordingShares(recordingId: string): Promise<RecordingShare[]> {
  const { data, error } = await sb.from('screen_recording_shares').select('id, recording_id, token, revoked, views, created_at').eq('recording_id', recordingId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as RecordingShare[]) || [];
}
export interface ScreenRecordingLink { id: string; recording_id: string; task_id: string; task_name: string | null; created_at: string; }
export async function listRecordingTaskLinks(recordingId: string): Promise<ScreenRecordingLink[]> {
  const { data, error } = await sb.from('screen_recording_links').select('id, recording_id, task_id, created_at, tasks(name)').eq('recording_id', recordingId);
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((r) => ({ id: r.id, recording_id: r.recording_id, task_id: r.task_id, task_name: r.tasks?.name ?? null, created_at: r.created_at }));
}
export async function linkRecordingToTask(p: { org_id: string; created_by: string; recording_id: string; task_id: string }): Promise<void> {
  const { error } = await sb.from('screen_recording_links').insert({ org_id: p.org_id, created_by: p.created_by, recording_id: p.recording_id, task_id: p.task_id });
  if (error) throw new Error(error.message);
}
export async function unlinkRecording(id: string): Promise<void> {
  const { error } = await sb.from('screen_recording_links').delete().eq('id', id); if (error) throw new Error(error.message);
}
export interface TaskLite { id: string; name: string }
export async function listTasksLite(orgId: string): Promise<TaskLite[]> {
  const { data, error } = await sb.from('tasks').select('id, name').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message); return (data as TaskLite[]) || [];
}

export async function socialOauthBegin(channelId: string, provider: string): Promise<string> {
  const { data, error } = await sb.rpc('social_oauth_begin', { p_channel: channelId, p_provider: provider });
  if (error) throw new Error(error.message);
  const r = (data as any[] | null)?.[0];
  if (!r || !r.client_id) throw new Error('This network is not connected yet — ask your platform admin to enable it.');
  const u = new URL(r.authorize_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', r.client_id);
  u.searchParams.set('redirect_uri', r.redirect_uri);
  u.searchParams.set('scope', r.scopes);
  u.searchParams.set('state', r.state);
  return u.toString();
}
export interface SocialPublishConfig { enabled: boolean; global_daily_cap: number; per_tenant_daily_cap: number; sent_today: number; updated_at: string | null; }
export async function socialPublishConfigGet(): Promise<SocialPublishConfig | null> {
  const { data, error } = await sb.rpc('social_publish_config_get');
  if (error) throw new Error(error.message); const r = (data as SocialPublishConfig[]) || []; return r[0] || null;
}
export async function socialPublishConfigSet(p: { enabled: boolean; global: number; tenant: number }): Promise<void> {
  const { error } = await sb.rpc('social_publish_config_set', { p_enabled: p.enabled, p_global: p.global, p_tenant: p.tenant });
  if (error) throw new Error(error.message);
}

// ── Reseller feature control (per-sub-tenant) ───────────────────────────────
export interface ResellerSubFeature { feature_key: string; name: string; reseller_has: boolean; override: boolean | null; effective: boolean; }
export async function resellerSubFeatures(subOrgId: string): Promise<ResellerSubFeature[]> {
  const { data, error } = await sb.rpc('reseller_sub_features', { p_sub: subOrgId });
  if (error) throw new Error(error.message); return (data as ResellerSubFeature[]) || [];
}
export async function resellerSetSubFeature(subOrgId: string, feature: string, enabled: boolean): Promise<void> {
  const { error } = await sb.rpc('reseller_set_sub_feature', { p_sub: subOrgId, p_feature: feature, p_enabled: enabled });
  if (error) throw new Error(error.message);
}

// ── Social Analytics (Phase 3C) ─────────────────────────────────────────────
export interface SocialAnalyticsOverview { posts: number; impressions: number; reach: number; engagement: number; clicks: number; engagement_rate: number; }
export interface SocialChannelStat { channel_id: string; platform: string; handle: string | null; posts: number; impressions: number; engagement: number; followers: number; }
export interface SocialTopPost { post_id: string; body: string; platform: string | null; impressions: number; engagement: number; engagement_rate: number; published_at: string | null; }
export interface SocialTrendPoint { day: string; engagement: number; impressions: number; }

export async function socialAnalyticsOverview(orgId: string, days = 30): Promise<SocialAnalyticsOverview> {
  const { data, error } = await sb.rpc('social_analytics_overview', { p_org: orgId, p_days: days });
  if (error) throw new Error(error.message);
  return (data?.[0] as SocialAnalyticsOverview) || { posts: 0, impressions: 0, reach: 0, engagement: 0, clicks: 0, engagement_rate: 0 };
}
export async function socialChannelStats(orgId: string): Promise<SocialChannelStat[]> {
  const { data, error } = await sb.rpc('social_channel_stats', { p_org: orgId });
  if (error) throw new Error(error.message); return (data as SocialChannelStat[]) || [];
}
export async function socialTopPosts(orgId: string, limit = 10): Promise<SocialTopPost[]> {
  const { data, error } = await sb.rpc('social_top_posts', { p_org: orgId, p_limit: limit });
  if (error) throw new Error(error.message); return (data as SocialTopPost[]) || [];
}
export async function socialEngagementTrend(orgId: string, days = 30): Promise<SocialTrendPoint[]> {
  const { data, error } = await sb.rpc('social_engagement_trend', { p_org: orgId, p_days: days });
  if (error) throw new Error(error.message); return (data as SocialTrendPoint[]) || [];
}
export async function socialRecordPostMetrics(postId: string, channelId: string | null, metrics: Record<string, number>): Promise<void> {
  const { error } = await sb.rpc('social_record_post_metrics', { p_post: postId, p_channel: channelId, p_metrics: metrics });
  if (error) throw new Error(error.message);
}

// ── Competitor Intelligence (Phase 3E) ──────────────────────────────────────
export interface SocialCompetitor { id: string; org_id: string; name: string; platform: string | null; handle: string | null; url: string | null; notes: string | null; active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface SocialCompetitorInsight { id: string; org_id: string; competitor_id: string | null; kind: 'trend'|'gap'|'threat'|'opportunity'|'insight'; summary: string; recommendation: string | null; status: 'new'|'reviewed'|'actioned'|'dismissed'; created_by: string | null; created_at: string; }

export async function listCompetitors(orgId: string): Promise<SocialCompetitor[]> {
  const { data, error } = await sb.from('social_competitors').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return (data as SocialCompetitor[]) || [];
}
export async function createCompetitor(p: { org_id: string; name: string; platform?: string; handle?: string; url?: string; created_by: string }): Promise<SocialCompetitor> {
  const { data, error } = await sb.from('social_competitors').insert({ org_id: p.org_id, name: p.name, platform: p.platform || null, handle: p.handle || null, url: p.url || null, created_by: p.created_by }).select('*').single();
  if (error) throw new Error(error.message); return data as SocialCompetitor;
}
export async function deleteCompetitor(id: string): Promise<void> {
  const { error } = await sb.from('social_competitors').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function listCompetitorInsights(orgId: string): Promise<SocialCompetitorInsight[]> {
  const { data, error } = await sb.from('social_competitor_insights').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message); return (data as SocialCompetitorInsight[]) || [];
}
export async function createCompetitorInsight(p: { org_id: string; summary: string; kind?: SocialCompetitorInsight['kind']; recommendation?: string; competitor_id?: string | null }): Promise<SocialCompetitorInsight> {
  const { data, error } = await sb.from('social_competitor_insights').insert({ org_id: p.org_id, summary: p.summary, kind: p.kind || 'insight', recommendation: p.recommendation || null, competitor_id: p.competitor_id || null }).select('*').single();
  if (error) throw new Error(error.message); return data as SocialCompetitorInsight;
}
export async function deleteCompetitorInsight(id: string): Promise<void> {
  const { error } = await sb.from('social_competitor_insights').delete().eq('id', id); if (error) throw new Error(error.message);
}
export async function setCompetitorInsightStatus(id: string, status: SocialCompetitorInsight['status']): Promise<void> {
  const { error } = await sb.from('social_competitor_insights').update({ status }).eq('id', id); if (error) throw new Error(error.message);
}

// ── Brand Voice (Phase 3 / #35) — feeds the content agents so drafts sound on-brand ──
export interface BrandVoice { org_id: string; tone: string | null; audience: string | null; guidelines: string | null; cta: string | null; hashtags: string[]; banned_words: string[]; updated_at: string; }
export async function getBrandVoice(orgId: string): Promise<BrandVoice | null> {
  const { data, error } = await sb.from('social_brand_voice').select('*').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message); return (data as BrandVoice) || null;
}
export async function setBrandVoice(orgId: string, userId: string, patch: Partial<BrandVoice>): Promise<void> {
  const { error } = await sb.from('social_brand_voice').upsert({
    org_id: orgId, tone: patch.tone ?? null, audience: patch.audience ?? null, guidelines: patch.guidelines ?? null,
    cta: patch.cta ?? null, hashtags: patch.hashtags ?? [], banned_words: patch.banned_words ?? [],
    updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id' });
  if (error) throw new Error(error.message);
}
export function composeBrandContext(name: string, v: BrandVoice | null): string {
  if (!v) return name;
  const parts = [name];
  if (v.tone) parts.push('Voice/tone: ' + v.tone);
  if (v.audience) parts.push('Audience: ' + v.audience);
  if (v.guidelines) parts.push('Guidelines: ' + v.guidelines);
  if (v.cta) parts.push('Preferred CTA: ' + v.cta);
  if (v.hashtags && v.hashtags.length) parts.push('Hashtags: ' + v.hashtags.join(' '));
  if (v.banned_words && v.banned_words.length) parts.push('Never use: ' + v.banned_words.join(', '));
  return parts.join(' — ');
}

// ── Social approval workflow (#34) ──────────────────────────────────────────
export async function getApprovalPolicy(orgId: string): Promise<boolean> {
  const { data, error } = await sb.from('social_approval_policy').select('require_approval').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message); return !!(data && (data as any).require_approval);
}
export async function setApprovalPolicy(orgId: string, userId: string, require: boolean): Promise<void> {
  const { error } = await sb.from('social_approval_policy').upsert({ org_id: orgId, require_approval: require, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
  if (error) throw new Error(error.message);
}
export async function approveSocialPost(postId: string): Promise<void> {
  const { error } = await sb.rpc('social_approve_post', { p_post: postId });
  if (error) throw new Error(error.message);
}

// ── Social inbox (#31) ──────────────────────────────────────────────────────
export interface SocialConversation { id: string; org_id: string; channel_id: string | null; platform: string | null; kind: 'comment'|'dm'|'mention'|'reply'; participant_name: string | null; participant_handle: string | null; subject: string | null; status: 'open'|'pending'|'closed'; assigned_to: string | null; unread: boolean; last_message_at: string; }
export interface SocialMessage { id: string; org_id: string; conversation_id: string; direction: 'inbound'|'outbound'; body: string; author: string | null; status: 'draft'|'pending'|'sent'|'failed'; created_by: string | null; created_at: string; }

export async function listConversations(orgId: string, status?: string): Promise<SocialConversation[]> {
  let q = sb.from('social_conversations').select('*').eq('org_id', orgId).order('last_message_at', { ascending: false }).limit(200);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q; if (error) throw new Error(error.message); return (data as SocialConversation[]) || [];
}
export async function listSocialMessages(convId: string): Promise<SocialMessage[]> {
  const { data, error } = await sb.from('social_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message); return (data as SocialMessage[]) || [];
}
export async function sendSocialReply(orgId: string, convId: string, body: string, userId: string): Promise<void> {
  const { error } = await sb.from('social_messages').insert({ org_id: orgId, conversation_id: convId, direction: 'outbound', body, created_by: userId, status: 'sent' });
  if (error) throw new Error(error.message);
  await sb.from('social_conversations').update({ unread: false, last_message_at: new Date().toISOString() }).eq('id', convId);
}
export async function setConversationStatus(convId: string, status: 'open'|'pending'|'closed'): Promise<void> {
  const { error } = await sb.from('social_conversations').update({ status }).eq('id', convId); if (error) throw new Error(error.message);
}
export async function markConversationRead(convId: string): Promise<void> {
  await sb.from('social_conversations').update({ unread: false }).eq('id', convId);
}
export async function deleteSocialMessage(id: string): Promise<void> {
  const { error } = await sb.from('social_messages').delete().eq('id', id); if (error) throw new Error(error.message);
}
// Agent draft reply (approve-first): outbound message in 'draft' status; reversible.
export async function createSocialReplyDraft(orgId: string, convId: string, body: string, userId: string): Promise<SocialMessage> {
  const { data, error } = await sb.from('social_messages').insert({ org_id: orgId, conversation_id: convId, direction: 'outbound', body, created_by: userId, status: 'draft' }).select('*').single();
  if (error) throw new Error(error.message); return data as SocialMessage;
}
