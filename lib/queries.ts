import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveOrg } from '@/lib/store';
import { qk } from '@/lib/queryKeys';
import {
  getProjects, createProject, updateProject, deleteProject,
  getOrgCompanies, getPortfolios,
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
// ---------------------------------------------------------------------------

// --- Reads -----------------------------------------------------------------
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

// --- Project mutations -----------------------------------------------------
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
