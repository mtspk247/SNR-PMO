import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// All app data lives in the `snrpmo` schema (exposed via PostgREST).
export const sb = createClient(url, anon, { db: { schema: 'snrpmo' } });

export type Role = 'super_admin' | 'pm' | 'team_member' | 'viewer';

export interface AppUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  department?: string;
  permissions?: Record<string, boolean>;
}

export interface Project {
  id: string; name: string; description: string | null;
  status: string; priority: string; progress: number | null;
  start_date: string | null; end_date: string | null; pm_id: string | null;
}

export interface Task {
  id: string; project_id: string | null; name: string;
  status: string; priority: string; assignee_id: string | null;
  due_date: string | null; estimated_hours: number | null;
  projects?: { name: string } | null;
}

export interface Company { id: string; name: string; industry: string | null; website: string | null; phone: string | null; }
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
