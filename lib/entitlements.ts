import { FEATURES, FeatureKey, MyOrg, AppUser, PermKey } from './supabase';

// 3.3 client-side entitlement gating. The DB is the source of truth (RLS feature
// clauses + seat trigger); these helpers only decide what the UI offers. A user
// who forces a hidden route still hits an empty/denied result server-side.

// Human labels for plan feature keys (used by settings + platform console).
// Derived from the single FEATURES catalog in supabase.ts — do not hand-maintain.
export const FEATURE_LABELS: Record<FeatureKey, string> =
  Object.fromEntries(FEATURES.map((f) => [f.key, f.label])) as Record<FeatureKey, string>;

// True if the org's plan enables `key`. No key → ungated (core module).
export function hasFeature(org: MyOrg | null | undefined, key?: FeatureKey): boolean {
  if (!key) return true;
  return !!org?.features?.includes(key);
}

// True if the org's PLAN grants `key` (ignoring per-tenant overrides).
export function planGrantsFeature(org: MyOrg | null | undefined, key?: FeatureKey): boolean {
  if (!key) return true;
  return !!org?.planFeatures?.includes(key);
}
// Off because the PLAN doesn't include it (vs an operator turning it off) → show a locked upsell.
export function isUpsellLocked(org: MyOrg | null | undefined, key?: FeatureKey): boolean {
  if (!key) return false;
  return !hasFeature(org, key) && !planGrantsFeature(org, key);
}
// Nav visibility: show effective-on items AND plan-gated (locked) ones; hide only operator-disabled.
export function navVisible(org: MyOrg | null | undefined, key?: FeatureKey): boolean {
  if (!key) return true;
  return hasFeature(org, key) || isUpsellLocked(org, key);
}

// Role-template permission labels (used by /roles + /users).
export const PERMISSION_LABELS: Record<PermKey, string> = {
  can_manage_appraisals: 'Manage performance appraisals',
  can_view_dashboard: 'View dashboard',
  can_view_all_projects: 'View all projects',
  can_edit_all_projects: 'Edit all projects',
  can_delete_tasks: 'Delete tasks',
  can_approve_leaves: 'Approve leaves',
  can_manage_users: 'Manage users & roles',
  can_export_data: 'Export data',
  can_manage_agents: 'Manage agents',
  can_approve_agent_actions: 'Approve agent actions',
};

// Per-user feature/form access from their assigned role. Empty/undefined = all
// (entitled) features visible — backward compatible with users who have no role.
// Core items (no feature key) are always allowed. DB stays source of truth.
export function roleAllowsFeature(user: AppUser | null | undefined, key?: FeatureKey): boolean {
  if (!key) return true;
  const fa = user?.feature_access;
  if (!fa || fa.length === 0) return true;
  return fa.includes(key);
}

export function formatPrice(cents: number, model: string): string {
  if (cents === 0) return 'Free';
  const dollars = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return model === 'per_user' ? `$${dollars}/user/mo` : `$${dollars}/mo`;
}
