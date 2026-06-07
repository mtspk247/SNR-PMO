import { sb, Project, Task, Company, Contact, Deal, AppUser, OrgUser, MyOrg, Organization, Risk, Financial } from './supabase';

// ---------------------------------------------------------------------------
// Auth (Supabase Auth — replaces the legacy sha256 `login` RPC)
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

// New-tenant signup: trigger handle_new_auth_user() reads org_slug/org_name from metadata.
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

// Map the auth session -> the snrpmo.users row (RLS lets a user read themselves).
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

// Orgs the signed-in user belongs to, with their role (drives the org switcher + authz).
export async function getMyOrgs(): Promise<MyOrg[]> {
  const { data, error } = await sb
    .from('org_members')
    .select('role, organizations(id, slug, name, branding, plan)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r.organizations, member_role: r.role })) as MyOrg[];
}

// Public, anon-safe branding lookup for subdomain resolution (SECURITY DEFINER RPC).
export async function getOrgBranding(slug: string): Promise<Organization | null> {
  const { data, error } = await sb.rpc('org_branding', { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Organization) ?? null;
}

// Directory of users sharing the caller's org(s) — for assignee/follower pickers (RLS-scoped).
export async function getOrgUsers(): Promise<OrgUser[]> {
  const { data, error } = await sb.from('users').select('id, full_name, email').order('full_name');
  if (error) throw error;
  return (data as OrgUser[]) || [];
}

// ---------------------------------------------------------------------------
// Data (now automatically scoped by RLS to the user's org + project access)
// ---------------------------------------------------------------------------
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await sb.from('tasks').select('*, projects(name)').order('due_date', { ascending: true });
  if (error) throw error; return (data as Task[]) || [];
}

// Phase 2.1 — task detail / subtasks / followers mutations.
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
  const { error } = await sb.f