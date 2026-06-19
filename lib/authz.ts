import { OrgRole, MyOrg } from './supabase';

// Mirror of the server-side RLS model for UI gating (hide/disable, never trust on client).
// The database is the source of truth; these helpers only shape what the UI offers.

const RANK: Record<OrgRole, number> = { guest: -1, viewer: 0, member: 1, admin: 2, owner: 3 };

export function atLeast(role: OrgRole | undefined, min: OrgRole): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

export const can = {
  manageOrg: (o?: MyOrg | null) => atLeast(o?.member_role, 'admin'),
  manageMembers: (o?: MyOrg | null) => atLeast(o?.member_role, 'admin'),
  manageBilling: (o?: MyOrg | null) => atLeast(o?.member_role, 'owner'),
  manageIntegrations: (o?: MyOrg | null) => atLeast(o?.member_role, 'admin'),
  editConfig: (o?: MyOrg | null) => atLeast(o?.member_role, 'admin'),
  createProject: (o?: MyOrg | null) => atLeast(o?.member_role, 'member'),
  write: (o?: MyOrg | null) => atLeast(o?.member_role, 'member'),
};

export function roleLabel(role?: OrgRole): string {
  if (!role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}
