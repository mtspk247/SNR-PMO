import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// App data lives in the `snrpmo` schema. Supabase Auth now owns identity:
// the JWT is attached automatically so RLS policies (org/project scoping) apply.
export const sb = createClient(url, anon, {
  db: { schema: 'snrpmo' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Active-workspace scope: the org id of the currently selected workspace.
// db.ts getters default their `org_id` filter to this so that a user who belongs
// to multiple workspaces only ever loads the active workspace's data (RLS allows
// the union of all their orgs; this fences reads to one). Kept in sync by the
// auth store on session load / workspace switch.
export let activeOrgScope: string | null = null;
export function setActiveOrgScope(id: string | null) { activeOrgScope = id; }

export type Role = 'super_admin' | 'pm' | 'team_member' | 'viewer';
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer' | 'guest';

export interface OrgBranding {
  name?: string;
  site_template?: string;
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
  theme_skin?: 'classic' | 'daylight' | 'vivid' | 'midnight' | null;
  allow_user_themes?: boolean;
  plan: 'free' | 'pro' | 'enterprise';
  onboarding?: { completed_at?: string; team_size?: string; industry?: string; use_case?: string; role?: string; step?: number; skipped?: boolean } | null;
}

// #5 full tenant profile — editable contact/web/location/classification fields.
export interface OrgProfile {
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  industry: string | null;
  category: string | null;
  about: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
  registration_no: string | null;
  social_linkedin: string | null;
  social_twitter: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  legal_name: string | null;
  founded_year: string | null;
  company_size: string | null;
  contact_person: string | null;
  contact_role: string | null;
  contact_person_email: string | null;
  contact_person_phone: string | null;
}
export const ORG_PROFILE_KEYS: (keyof OrgProfile)[] = [
  'website','contact_email','contact_phone','industry','category','about',
  'address_line1','address_line2','city','state_region','postal_code','country',
  'tax_id','registration_no','social_linkedin','social_twitter','social_facebook','social_instagram',
  'legal_name','founded_year','company_size','contact_person','contact_role','contact_person_email','contact_person_phone',
];

export interface MyOrg extends Organization {
  member_role: OrgRole;
  features?: string[];   // 3.3 entitlements: EFFECTIVE feature keys (plan minus overrides-off plus overrides-on)
  planFeatures?: string[]; // feature keys the PLAN grants (ignores overrides) — used to tell upsell-locked vs operator-disabled
  is_reseller?: boolean;
}

// ---------------------------------------------------------------------------
// 3.3 Platform layer — plans, features, entitlements, subscriptions
// ---------------------------------------------------------------------------
// Single feature catalog — ONE place to add a plan feature. Drives the FeatureKey
// type, FEATURE_LABELS (settings + tenant overrides), and nav gating keys.
export const FEATURES = [
  { key: 'companies', label: 'Companies' },
  { key: 'projects', label: 'Projects & Tasks' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'chat', label: 'Chat' },
  { key: 'teams', label: 'Teams & Workload' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'attendance', label: 'Attendance & Leave' },
  { key: 'crm', label: 'CRM' },
  { key: 'risk', label: 'Risk Analysis' },
  { key: 'financial', label: 'Financial Data' },
  { key: 'hr', label: 'HR / Onboarding' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'white_label', label: 'White-label' },
  { key: 'portfolios', label: 'Portfolios' },
  { key: 'drives', label: 'Drives' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'support', label: 'Support' },
  { key: 'reseller', label: 'Reseller (sub-tenants)' },
  { key: 'api', label: 'API & Webhooks' },
  { key: 'automations', label: 'Automations' },
] as const;
export type FeatureKey = typeof FEATURES[number]['key'];
export type PricingModel = 'flat' | 'per_user' | 'white_label';
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export interface Plan {
  id: string; key: string; name: string; description: string | null;
  pricing_model: PricingModel; price_cents: number; currency: string;
  billing_period: 'monthly' | 'annual'; user_limit: number | null;
  is_active: boolean; sort_order: number; stripe_price_id?: string | null;
}
export interface Feature { key: string; name: string; description: string | null; sort_order: number; }
export interface PlanFeature { plan_id: string; feature_key: string; enabled: boolean; }

// Row shape from the platform_list_orgs() RPC (super-super-admin console).
export interface PlatformOrg {
  org_id: string; org_name: string; slug: string; member_count: number;
  plan_key: string | null; plan_name: string | null; sub_status: SubStatus | null;
  seats: number | null; seat_limit: number | null; current_period_end: string | null;
}
// Tenant-facing plan/usage summary for the settings page.
export interface OrgPlanInfo {
  plan: Plan | null; status: SubStatus | null;
  seat_count: number; seat_limit: number | null;
  current_period_start?: string | null; current_period_end?: string | null; cancel_at_period_end?: boolean | null;
}

export interface AppUser {
  id: string;
  auth_user_id: string | null;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  department?: string;
  feature_access?: string[];   // role-template feature/form access; empty = all entitled
  avatar_url?: string | null;
}

// Custom role templates — org-scoped reusable permission bundles + feature access.
export type PermKey =
  | 'can_view_all_projects' | 'can_edit_all_projects' | 'can_approve_leaves'
  | 'can_delete_tasks' | 'can_manage_users' | 'can_view_dashboard' | 'can_export_data';
export interface RoleTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  permissions: Partial<Record<PermKey, boolean>>;
  feature_access: string[];
  is_system: boolean;
  created_at?: string;
}

export interface OrgUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  status?: string | null;
}

export interface Project {
  id: string; name: string; description: string | null;
  status: string; priority: string; progress: number | null;
  start_date: string | null; end_date: string | null; pm_id: string | null;
  org_id?: string; company_id?: string | null; portfolio_id?: string | null; created_at?: string;
}

export interface Task {
  id: string; project_id: string | null; name: string;
  description?: string | null;
  status: string; priority: string; assignee_id: string | null;
  assignee_ids?: string[] | null;
  parent_task_id?: string | null;
  followers?: string[];
  due_date: string | null; estimated_hours: number | null; actual_hours?: number | null;
  recur_every?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | null;
  recur_until?: string | null;
  team_id?: string | null;
  org_id?: string; created_by?: string | null; created_at?: string;
  projects?: { name: string } | null;
}

export interface ChecklistItem {
  id: string; org_id: string; task_id: string; project_id: string | null;
  label: string; done: boolean; sort_order: number; created_at: string;
}

export interface Team {
  id: string; org_id: string; name: string; description: string | null;
  color: string | null; avatar: string | null; created_at: string;
  members?: { user_id: string; users?: { full_name: string | null } | null }[];
}

export interface Reminder {
  id: string; org_id: string; user_id: string;
  entity_type: string | null; entity_id: string | null;
  note: string; remind_at: string; sent_at: string | null; created_at: string;
}

export interface Company { id: string; name: string; industry: string | null; website: string | null; phone: string | null; }

// Tenancy-tier company (Org → Company → Project). Distinct from CRM `Company` above.
export interface OrgCompany { id: string; name: string; description: string | null; org_id?: string; }

// 3.4 Company/Portfolio RBAC -- per-company (and per-portfolio) membership.
export type MemberRole = 'manager' | 'member';
export interface CompanyMember {
  company_id: string; user_id: string; role: MemberRole; created_at?: string;
  users?: { full_name: string | null; email: string } | null;
}
// Tenancy-tier portfolio (Org -> Company -> Portfolio -> Project). company_id required.
export interface Portfolio { id: string; org_id: string; company_id: string; name: string; description: string | null; created_at?: string; }
export interface PortfolioMember {
  portfolio_id: string; user_id: string; role: MemberRole; created_at?: string;
  users?: { full_name: string | null; email: string } | null;
}
export interface Contact {
  id: string; full_name: string; email: string | null; phone: string | null;
  title: string | null; status: string | null; company_id: string | null;
  crm_companies?: { name: string } | null;
}
export interface Deal {
  id: string; title: string; value: number | null; stage: string;
  expected_close: string | null; company_id: string | null; contact_id: string | null;
  notes?: string | null; created_at?: string | null; owner_id?: string | null;
  crm_companies?: { name: string } | null; crm_contacts?: { full_name: string; email: string | null } | null;
}

export interface CrmActivity {
  id: string; org_id?: string; deal_id: string | null; contact_id: string | null;
  kind: string; body: string; created_by: string | null; created_at?: string;
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

export interface OrgInvite {
  id: string; token: string; email: string; org_id: string | null; org_name: string | null;
  plan_key: string; role: string; status: 'pending' | 'accepted' | 'revoked';
  invited_by: string | null; created_at: string; expires_at: string; accepted_at: string | null; source?: string | null;
  parent_org_id?: string | null;
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
  role_template_id: string | null;
  can_view_all_projects: boolean; can_edit_all_projects: boolean;
  can_approve_leaves: boolean; can_delete_tasks: boolean;
  can_manage_users: boolean; can_view_dashboard: boolean; can_export_data: boolean;
  annual_balance: number; sick_balance: number; casual_balance: number;
  job_title?: string | null; avatar_url?: string | null; phone?: string | null; company_id?: string | null; last_login?: string | null; company?: { name: string } | null;
}


// ---------------------------------------------------------------------------
// HR Onboarding types
// ---------------------------------------------------------------------------
export interface OnboardingTemplateItem {
  id: string; template_id: string; org_id?: string;
  title: string; description: string | null; sort_order: number; offset_days: number;
  requires_doc?: boolean;
  training_doc_id?: string | null;
  training_doc?: TrainingDocRef | null;
}
export interface OnboardingTemplate {
  id: string; org_id?: string; name: string; description: string | null;
  created_by?: string | null; created_at?: string;
  items?: OnboardingTemplateItem[];
}
export interface OnboardingTask {
  id: string; org_id?: string; user_id: string; template_id: string | null;
  title: string; description: string | null;
  status: 'Pending' | 'Done'; due_date: string | null;
  assignee_id: string | null; sort_order: number; completed_at: string | null;
  requires_doc?: boolean; doc_path?: string | null; doc_name?: string | null; doc_uploaded_at?: string | null;
  training_doc_id?: string | null;
  training_doc?: TrainingDocRef | null;
  created_by?: string | null; created_at?: string;
  hire?: { full_name: string } | null;
  assignee?: { full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Phase 4 — HR module: employee directory/profile + payroll types
// ---------------------------------------------------------------------------
// Employee directory row — org users with the extra People-domain fields
// needed for the directory list and profile header.
export interface Employee {
  avatar_url?: string | null;
  id: string; full_name: string; email: string; role: Role;
  department: string | null; status: 'active' | 'suspended';
  reports_to: string | null;
  phone?: string | null; job_title?: string | null; hire_date?: string | null;
  company_id?: string | null; address?: string | null; emergency_contact?: string | null;
  manager?: { full_name: string | null } | null;
  company?: { name: string | null } | null;
}

export interface EmployeeCompensation {
  id: string; org_id?: string; user_id: string;
  base_salary: number; currency: string; pay_schedule: string;
  pay_type?: 'monthly' | 'hourly'; hourly_rate?: number | null;
  effective_date: string; notes?: string | null;
  created_by?: string | null; created_at?: string;
}

export interface PayrollRun {
  id: string; org_id?: string; period_label: string;
  period_start: string; period_end: string;
  status: 'Draft' | 'Processed' | 'Paid' | 'Cancelled';
  notes?: string | null; created_by?: string | null; created_at?: string;
}

export interface Payslip {
  id: string; org_id?: string; run_id: string; user_id: string;
  gross: number; deductions: number; net: number;
  hours_worked?: number | null; days_worked?: number | null;
  bonus?: number; bonus_tag?: string | null; bonus_note?: string | null;
  breakdown: Record<string, any>; created_at?: string;
  users?: { full_name: string | null; email?: string; job_title?: string | null; department?: string | null } | null;
}

// ---- Task custom fields (per-project definitions + per-task values) ----
export interface TaskFieldDef {
  id: string; org_id: string; project_id: string; name: string;
  field_type: 'text' | 'textarea' | 'number' | 'currency' | 'progress' | 'rating' | 'date' | 'checkbox' | 'dropdown' | 'multiselect' | 'labels' | 'url' | 'email' | 'phone';
  options?: string[] | null; created_by?: string | null; created_at?: string;
}
export interface TaskFieldValue {
  task_id: string; field_id: string; project_id: string;
  value: string | null; updated_at?: string;
}

// ---- Generalized custom fields (CRM + HR; org-scoped, polymorphic by entity_type) ----
export type CustomEntityType = 'crm_deal' | 'crm_contact' | 'crm_company' | 'employee' | 'ledger_entry' | (string & {});
export interface CustomFieldDef {
  id: string; org_id: string; entity_type: CustomEntityType; name: string;
  field_type: 'text' | 'textarea' | 'number' | 'currency' | 'progress' | 'rating' | 'date' | 'checkbox' | 'dropdown' | 'multiselect' | 'labels' | 'url' | 'email' | 'phone';
  options?: string[] | null; option_meta?: Record<string, string> | null; position?: number; created_by?: string | null; created_at?: string;
}
export interface CustomFieldValue {
  org_id: string; entity_type: CustomEntityType; entity_id: string; field_id: string;
  value: string | null; updated_at?: string;
}

// ---- S2 Finance core: org ledger (income/expense book; payroll posts Salaries) ----
export interface LedgerEntry {
  id: string; org_id: string;
  type: 'income' | 'expense';
  category: string; amount: number; entry_date: string;
  project_id?: string | null; company_id?: string | null;
  payroll_run_id?: string | null; notes?: string | null;
  created_by?: string | null; created_at?: string;
  project?: { name: string | null } | null;
  company?: { name: string | null } | null;
}

// --- S3: Ideas ---
export type IdeaStatus = 'idea' | 'exploring' | 'approved' | 'building' | 'shipped' | 'parked' | (string & {});
export interface Idea {
  id: string; org_id: string;
  title: string; pitch?: string | null;
  status: IdeaStatus;
  project_id?: string | null;
  created_by?: string | null; created_at?: string;
  votes?: { user_id: string; value?: number; reason?: string | null; voter?: { full_name: string | null } | null }[];
  project?: { name: string | null } | null;
  creator?: { full_name: string | null; avatar_url?: string | null } | null;
}

// ---- S4: Training docs & Job descriptions (HR) -----------------------------
// Lightweight embed shape used on onboarding items/tasks.
export interface TrainingDocRef {
  title: string; doc_path: string | null; doc_name?: string | null; link_url?: string | null;
}
export interface TrainingDoc {
  id: string; org_id: string;
  title: string; description?: string | null;
  category?: string | null; department?: string | null;
  role_template_id?: string | null;
  doc_path?: string | null; doc_name?: string | null; doc_uploaded_at?: string | null;
  link_url?: string | null;
  created_by?: string | null; created_at?: string;
  role_template?: { name: string | null } | null;
  creator?: { full_name: string | null } | null;
}
export interface JobDescription {
  id: string; org_id: string;
  title: string; department?: string | null;
  role_template_id?: string | null;
  summary?: string | null; responsibilities?: string | null; requirements?: string | null; link_url?: string | null;
  doc_path?: string | null; doc_name?: string | null; doc_uploaded_at?: string | null;
  created_by?: string | null; created_at?: string;
  role_template?: { name: string | null } | null;
  creator?: { full_name: string | null } | null;
}

// ---- S5: Chat ---------------------------------------------------------------
export interface TimeEntry {
  id: string;
  org_id: string;
  task_id: string;
  project_id: string | null;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_manual: boolean;
  notes: string | null;
  task?: { name: string } | null;
  project?: { name: string } | null;
  created_at: string;
  user?: { full_name: string } | null;
}

export interface ChatMessage {
  id: string; org_id: string;
  project_id: string | null;   // null = org-wide channel
  sender_id: string;
  body: string; created_at: string;
  sender?: { full_name: string | null } | null;
}
