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

// ===========================================================================
// Phase 2 data access
// ===========================================================================
import { Attendance, Leave, AppNotification, Tag, Integration, AuditEntry, AdminUser } from './supabase';

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
