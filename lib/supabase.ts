import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// App data lives in the `snrpmo` schema. Supabase Auth now owns identity:
// the JWT is attached automatically so RLS policies (org/project scoping) apply.
export const sb = createClient(url, anon, {
  db: { schema: 'snrpmo' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Role = 'super_admin' | 'pm' | 'team_member' | 'viewer';
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrgBranding {
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  ink_color?: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  branding: OrgBranding;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface MyOrg extends Organization {
  member_role: OrgRole;
}

export interface AppUser {
  id: string;
  auth_user_id: string | null;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  department?: string;
}

export interface OrgUser {
  id: string;
  full_name: string;
  email: string;
}

export interface Project {
  id: string; name: string; description: string | null;
  status: string; priority: string; progress: number | null;
  start_date: string | null; end_date: string | null; pm_id: string | null;
  org_id?: string; company_id?: string | null; portfolio_id?: string | null;
}

export interface Task {
  id: string; project_id: string | null; name: string;
  description?: string | null;
  status: string; priority: string; assignee_id: string | null;
  parent_task_id?: string | null;
  followers?: string[];
  due_date: string | null; estimated_hours: number | null; actual_hours?: number | null;
  org_id?: string; created_by?: string | null;
  projects?: { name: string } | null;
}

export interface Company { id: string; name: string; industry: string | null; website: string | null; phone: string | null; }

// Tenancy-tier company (Org → Company → Project). Distinct from CRM `Company` above.
export interface OrgCompany { id: string; name: string; description: string | null; org_id?: string; }
export interface Contact {
  id: string; full_name: string; email: string | null; phone: string | null;
  title: string | null; status: string | null; company_id: string | null;
  crm_companies?: { name: string } | null;
}
export interface Deal {
  id: string; title: string; value: number | null; stage: string;
  expected_close: string | null; company_id: string | null; contact_id: string | null;
  notes?: string | null; created_at?: string | null;
  crm_companies?: { name: string } | null; crm_contacts?: { full_name: string; email: string | null } | null;
}

export interface Risk {
  id: string; project_id: string | null; title: string; description: string | null;
  category: string; impact: number; probability: number; status: string;
  owner_id: string | null; mitigation: string | null; due_date: string | null;
  projects?: { name: string } | null;
}

export interface Financial {
  id: string; project_id: string | null; period: string; category: string;
  planned: number; actual: number; paid_on: string | null;
  projects?: { name: string } | null;
}

export interface Comment {
  id: string; entity_type: string; entity_id: string; author_id: string | null;
  body: string; mentions: string[]; deleted?: boolean; created_at?: string;
}

// ---------------------------------------------------------------------------
// Phase 2 types
// ---------------------------------------------------------------------------
export interface Attendance {
  id: string; user_id: string | null; work_date: string;
  check_in: string | null; check_out: string | null; hours: number | null;
  status: 'OPEN' | 'CLOSED' | 'AUTO_CHECKOUT'; org_id?: string;
  users?: { full_name: string } | null;
}

export interface Leave {
  id: string; user_id: string | null; type: string;
  start_date: string; end_date: string; days: number; reason: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  approver_id: string | null; decision_comment: string | null;
  requested_at?: string; decided_at?: string | null; org_id?: string;
  requester?: { full_name: string } | null;
}

export interface AppNotification {
  id: string; user_id: string | null; type: string; title: string;
  body: string | null; link: string | null; entity_type: string | null;
  entity_id: string | null; is_read: boolean; urgent: boolean; created_at: string;
}

export interface Tag {
  id: string; name: string; color: string | null;
  scope: 'Global' | 'Personal'; created_by?: string | null; org_id?: string;
}

export interface Integration {
  id: string; key: string; name: string; category: string | null;
  description: string | null; icon: string | null;
  status: 'connected' | 'disconnected'; connected_at: string | null; org_id?: string;
}

export interface AuditEntry {
  id: number; ts: string; user_id: string | null; username: string | null;
  action: string; entity_type: string | null; entity_id: string | null;
  old_value: any; new_value: any;
}

export interface AdminUser {
  id: string; full_name: string; email: string; username: string;
  role: Role; department: string | null; status: 'active' | 'suspended';
  can_view_all_projects: boolean; can_edit_all_projects: boolean;
  can_approve_leaves: boolean; can_delete_tasks: boolean;
  can_manage_users: boolean; can_view_dashboard: boolean; can_export_data: boolean;
  annual_balance: number; sick_balance: number; casual_balance: number;
}
