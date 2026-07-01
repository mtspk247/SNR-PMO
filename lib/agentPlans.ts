// Deterministic agent WORKFLOWS: a chosen goal + a few fields -> an ordered, approve-first PLAN
// of tool calls that reuses the composite executors + the transactional preflight. Pure module
// (no imports) so it stays cycle-free and unit-testable. The agent proposes the plan; a human
// approves each step (every step is dry-run + preflighted in the approvals queue).
export interface PlanStep {
  tool: string; domain: string; summary: string;
  payload: Record<string, unknown>; risk: 'low' | 'medium' | 'high'; reversible: boolean;
}
export interface WorkflowField { key: string; label: string; placeholder?: string; required?: boolean; kind?: 'text' | 'list'; }
export interface WorkflowTemplate {
  key: string; label: string; icon: string; domain: string; description: string;
  fields: WorkflowField[];
  build: (v: Record<string, string>) => PlanStep[];
}

const listFrom = (s?: string): string[] =>
  (s || '').split(/[\n,]/).map((t) => t.trim()).filter(Boolean).slice(0, 12);

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'client_onboarding', label: 'Onboard a new client', icon: 'ti-user-plus', domain: 'crm',
    description: 'Creates the CRM contact, an onboarding project with starter tasks, and the sales opportunity — as one approve-first plan.',
    fields: [
      { key: 'client_name', label: 'Client name', placeholder: 'Acme Corp', required: true },
      { key: 'project_name', label: 'Project name (optional)', placeholder: 'Acme — Website Redesign' },
      { key: 'tasks', label: 'Starter tasks (optional, one per line)', kind: 'list', placeholder: 'Kickoff call\nCollect brand assets' },
    ],
    build: (v) => {
      const client = (v.client_name || 'New client').trim();
      const tasks = listFrom(v.tasks);
      return [
        {
          tool: 'scaffold_client_onboarding', domain: 'crm', risk: 'medium', reversible: true,
          summary: `Onboard ${client} — contact + project${tasks.length ? ` + ${tasks.length} tasks` : ' + starter tasks'}`,
          payload: { client_name: client, contact_name: client, ...(v.project_name && v.project_name.trim() ? { project_name: v.project_name.trim() } : {}), ...(tasks.length ? { tasks } : {}) },
        },
        {
          tool: 'create_deal', domain: 'crm', risk: 'low', reversible: true,
          summary: `Create the opportunity for ${client}`,
          payload: { title: `${client} — engagement` },
        },
      ];
    },
  },
  {
    key: 'project_kickoff', label: 'Kick off a project', icon: 'ti-rocket', domain: 'tasks',
    description: 'Creates the project and its starter tasks — one approve-first action, fully reversible.',
    fields: [
      { key: 'project_name', label: 'Project name', placeholder: 'Q3 Marketing Site', required: true },
      { key: 'tasks', label: 'Starter tasks (optional, one per line)', kind: 'list', placeholder: 'Kickoff & scope\nPlan timeline' },
    ],
    build: (v) => {
      const name = (v.project_name || 'New project').trim();
      const tasks = listFrom(v.tasks);
      return [{
        tool: 'scaffold_project', domain: 'tasks', risk: 'medium', reversible: true,
        summary: `Kick off "${name}"${tasks.length ? ` with ${tasks.length} tasks` : ''}`,
        payload: { name, ...(tasks.length ? { tasks } : {}) },
      }];
    },
  },
];

export const workflowByKey = (k: string): WorkflowTemplate | undefined => WORKFLOW_TEMPLATES.find((t) => t.key === k);
