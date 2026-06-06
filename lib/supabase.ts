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
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  branding: OrgBranding;
  plan: 'free' | 'pro' | 'enterprise';
}

// An org the signed-in user belongs to, with their role in it.
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

export interface Project {
  id: string; name: string; description: string | null;
  status: string; priority: string; progress: number | null;
  start_date: string | null; end_date: string | null; pm_id: string | null;
  org_id?: string; company_id?: string | null; portfolio_id?: string | null;
}

export interface Task {
  id: string; project_id: string | null; name: string;
  status: string; priority: string; assignee_id: string | null;
  due_date: string | nul