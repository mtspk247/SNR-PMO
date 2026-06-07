import { sb, Project, Task, Company, Contact, Deal, AppUser, OrgUser, MyOrg, Organization, Risk, Financial, Comment } from './supabase';

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

export async function getMyOrgs(): Promise<MyOrg[]> {
  const { data, error } = await sb
    .from('org_members')
    .select('role, organizations(id, slug, name, branding, plan)')
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

export async function getOrgUsers(): Promise<OrgUser[]> {
  const { data, error } = await sb.from('users').select('id, full_name, email').order('full_name');
  if (error) throw error;
  return (data as OrgUser[]) || [];
}

// ---------------------------------------------------------------------------
// Data (RLS-scoped to the user's org + project access)
// ---------------------------------------------------------------------------
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
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
