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
  {
    key: 'employee_onboarding', label: 'Onboard an employee', icon: 'ti-user-check', domain: 'hr',
    description: 'Drafts a week-1 onboarding checklist for a new hire \u2014 welcome, accounts & access, intro 1:1s, training, payroll \u2014 as approve-first tasks.',
    fields: [
      { key: 'employee_name', label: 'Employee name', placeholder: 'Jordan Lee', required: true },
      { key: 'tasks', label: 'Checklist items (optional, one per line)', kind: 'list', placeholder: 'Send welcome note\nCreate accounts & access' },
    ],
    build: (v) => {
      const who = (v.employee_name || 'New hire').trim();
      const tasks = listFrom(v.tasks);
      return [{
        tool: 'draft_onboarding', domain: 'hr', risk: 'low', reversible: true,
        summary: `Onboard ${who} \u2014 week-1 checklist${tasks.length ? ` (${tasks.length} tasks)` : ''}`,
        payload: { employee: who, ...(tasks.length ? { tasks } : {}) },
      }];
    },
  },
];

export const workflowByKey = (k: string): WorkflowTemplate | undefined => WORKFLOW_TEMPLATES.find((t) => t.key === k);

// Natural-language intent router: map a free-text request to a workflow template + best-effort
// field extraction. PURE + deterministic (no LLM) so it is unit-testable and always available;
// the "Ask your agent" box uses it first and falls through to the LLM proposer when it returns null.
// `ready` = all required fields were extracted (propose immediately) vs pre-fill the launcher form.
export interface WorkflowMatch { key: string; vals: Record<string, string>; ready: boolean; }

const clean = (s: string): string =>
  s.replace(/^["'`]+|["'`.!?,;:]+$/g, '').replace(/\s+/g, ' ').trim();

export function detectWorkflow(raw: string): WorkflowMatch | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const low = text.toLowerCase();

  // ---- Employee onboarding (checked before client — both say "onboard") ----
  if (/\bonboard/.test(low) && /\b(employee|new hire|newhire|hire|staff|teammate|team ?member|colleague|worker)\b/.test(low)) {
    let name = '';
    const m = text.match(/(?:employee|new hire|hire|staff(?:\s*member)?|teammate|team\s*member|colleague|worker)\s+(.+?)(?:\s+(?:for|on|as|to|and|\u2014|-|:)\b.*)?$/i);
    if (m) name = clean(m[1]);
    if (name && /^(a|an|the|our|new|to|for|onboarding|checklist)$/i.test(name)) name = '';
    const vals: Record<string, string> = {};
    if (name) vals.employee_name = name;
    return { key: 'employee_onboarding', vals, ready: !!name };
  }

  // ---- Client onboarding ----
  if (/\bonboard(?:ing|ed|s)?\b/.test(low) || /\bnew client\b/.test(low)) {
    let client = '';
    let project = '';
    // "onboard [a|the|new] [client] <Name> [for|on|with|to|as ...]"
    let m = text.match(/onboard(?:ing|ed|s)?\s+(?:a\s+|the\s+|our\s+|new\s+)*(?:client\s+|customer\s+)?(.+?)(?:\s+(?:for|on|with|to|as|and|—|-|:)\b.*)?$/i);
    if (!m) m = text.match(/new client\s*[:\-]?\s*(.+?)$/i);
    if (m) client = clean(m[1]);
    // optional project name: "... for <Project>" / "project <Project>"
    const pm = text.match(/\b(?:project|for(?:\s+the)?)\s+(.+?)(?:\s+project)?$/i);
    if (pm) { const p = clean(pm[1]); if (p && p.toLowerCase() !== client.toLowerCase()) project = p; }
    // guard: don't treat generic verbs as a client name
    if (client && /^(a|the|our|new|client|customer|process|flow|them|it|this)$/i.test(client)) client = '';
    const vals: Record<string, string> = {};
    if (client) vals.client_name = client;
    if (project) vals.project_name = project;
    return { key: 'client_onboarding', vals, ready: !!client };
  }

  // ---- Project kickoff ----
  if (/\bkick[\s-]?off\b/.test(low) || /\b(?:start|spin up|launch|create|set up|new)\b[^.]*\bproject\b/.test(low)) {
    let name = '';
    let m = text.match(/project\s+(?:called\s+|named\s+|titled\s+)?(.+?)$/i);
    if (!m) m = text.match(/kick[\s-]?off\s+(?:the\s+|a\s+)?(.+?)(?:\s+project)?$/i);
    if (m) name = clean(m[1]);
    if (name && /^(a|the|our|new|project|this|it)$/i.test(name)) name = '';
    const vals: Record<string, string> = {};
    if (name) vals.project_name = name;
    return { key: 'project_kickoff', vals, ready: !!name };
  }

  return null;
}
