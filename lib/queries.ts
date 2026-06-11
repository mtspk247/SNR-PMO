import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveOrg } from '@/lib/store';
import { qk } from '@/lib/queryKeys';
import {
  getProjects, createProject, updateProject, deleteProject,
  getOrgCompanies, getPortfolios,
  getAuditLog, getAttendance, getEmployees, getLeaves, getPayrollRuns,
  getTasks, getDeals, getContacts, getCompanies,
} from '@/lib/db';

// ---------------------------------------------------------------------------
// React Query hooks over the existing RLS-scoped db.ts functions.
//
// Pattern (canonical — copy this for rollout):
//  • Reads are server-side RLS-scoped already; the org id in the key only
//    partitions cache per active org and refetches on switch. `enabled: !!org`
//    defers the first fetch until an org is known (no unscoped flash-fetch).
//  • createProject/updateProject already return the authoritative RLS-scoped
//    list (insert/update with return=minimal, then refetch — see db.ts). We push
//    that straight into the cache with setQueryData: no second round-trip, no
//    invalidate-refetch. deleteProject returns void → invalidate.
//
// ROLLOUT note (audit/attendance/employees/leave/payroll + future pages):
//  Use the list read hook below for the main (paginated) list. For mutations,
//  keep calling the existing db.ts fn directly, then invalidate the matching
//  key, e.g.:
//      const qc = useQueryClient(); const org = useActiveOrg();
//      await requestLeave(...); qc.invalidateQueries({ queryKey: qk.leaves(org?.id) });
//  (RQ refetches the scoped list — replaces the old `setX(await getX())`.)
// ---------------------------------------------------------------------------

// --- Projects --------------------------------------------------------------
export function useProjects() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.projects(org?.id), queryFn: getProjects, enabled: !!org });
}
export function useOrgCompanies() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.companies(org?.id), queryFn: getOrgCompanies, enabled: !!org });
}
export function usePortfolios() {
  const org = useActiveOrg();
  // portfolios is a plan-gated feature; tolerate RLS/feature rejection as empty.
  return useQuery({
    queryKey: qk.portfolios(org?.id),
    queryFn: () => getPortfolios().catch(() => []),
    enabled: !!org,
  });
}
export function useCreateProject() {
  const qc = useQueryClient(); const org = useActiveOrg();
  return useMutation({
    mutationFn: createProject,
    onSuccess: (list) => qc.setQueryData(qk.projects(org?.id), list),
  });
}
export function useUpdateProject() {
  const qc = useQueryClient(); const org = useActiveOrg();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateProject>[1] }) =>
      updateProject(id, patch),
    onSuccess: (list) => qc.setQueryData(qk.projects(org?.id), list),
  });
}
export function useDeleteProject() {
  const qc = useQueryClient(); const org = useActiveOrg();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(org?.id) }),
  });
}

// --- List reads for rollout pages ------------------------------------------
export function useAuditLog() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.auditLog(org?.id), queryFn: getAuditLog, enabled: !!org });
}
export function useAttendance() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.attendance(org?.id), queryFn: getAttendance, enabled: !!org });
}
export function useEmployees() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.employees(org?.id), queryFn: getEmployees, enabled: !!org });
}
export function useLeaves() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.leaves(org?.id), queryFn: getLeaves, enabled: !!org });
}
export function usePayrollRuns() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.payrollRuns(org?.id), queryFn: getPayrollRuns, enabled: !!org });
}

// --- Tasks & CRM (batch 2) ---------------------------------------------------
// Pages with fine-grained local mutations (tasks, crm) patch the cached list
// in place via qc.setQueryData(qk.X(org?.id), ...) using the authoritative row
// returned by db.ts — same "no extra round-trip" principle as the project
// mutations above, without forcing a whole-list refetch per inline edit.
export function useTasks() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.tasks(org?.id), queryFn: getTasks, enabled: !!org });
}
export function useDeals() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.deals(org?.id), queryFn: getDeals, enabled: !!org });
}
export function useContacts() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.contacts(org?.id), queryFn: getContacts, enabled: !!org });
}
export function useCrmCompanies() {
  const org = useActiveOrg();
  return useQuery({ queryKey: qk.crmCompanies(org?.id), queryFn: getCompanies, enabled: !!org });
}
