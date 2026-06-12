// Org-scoped React Query key factory. Every list key embeds the active org id so
// switching orgs naturally partitions the cache AND triggers a refetch — the core
// multi-tenant invariant. Detail keys are id-scoped (an id is globally unique).
export const qk = {
  projects: (org?: string | null) => ['projects', org ?? null] as const,
  project: (id: string) => ['project', id] as const,
  companies: (org?: string | null) => ['companies', org ?? null] as const,
  portfolios: (org?: string | null) => ['portfolios', org ?? null] as const,
  tasks: (org?: string | null) => ['tasks', org ?? null] as const,
  risks: (org?: string | null) => ['risks', org ?? null] as const,
  financials: (org?: string | null) => ['financials', org ?? null] as const,
  contacts: (org?: string | null) => ['contacts', org ?? null] as const,
  deals: (org?: string | null) => ['deals', org ?? null] as const,
  crmCompanies: (org?: string | null) => ['crmCompanies', org ?? null] as const,
  employees: (org?: string | null) => ['employees', org ?? null] as const,
  attendance: (org?: string | null) => ['attendance', org ?? null] as const,
  leaves: (org?: string | null) => ['leaves', org ?? null] as const,
  auditLog: (org?: string | null) => ['auditLog', org ?? null] as const,
  payrollRuns: (org?: string | null) => ['payrollRuns', org ?? null] as const,
  ledger: (org?: string | null) => ['ledger', org ?? null] as const,
  ideas: (org?: string | null) => ['ideas', org ?? null] as const,
  trainingDocs: (org?: string | null) => ['trainingDocs', org ?? null] as const,
  jobDescriptions: (org?: string | null) => ['jobDescriptions', org ?? null] as const,
  adminUsers: (org?: string | null) => ['adminUsers', org ?? null] as const,
  chat: (org?: string | null, channel?: string | null) => ['chat', org ?? null, channel ?? null] as const,
  taskTime: (task: string) => ['taskTime', task] as const,
  myTimer: (org?: string | null, user?: string | null) => ['myTimer', org ?? null, user ?? null] as const,
};
