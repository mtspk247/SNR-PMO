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

// ---------------------------------------------------------------------------
// Chief of Staff conversational intents (PURE + deterministic, unit-testable).
// The assistant collects missing details across turns, then proposes a single
// approve-first action through the normal queue — it never writes directly.
// ---------------------------------------------------------------------------

export const INVITE_ROLES = ['admin', 'member', 'viewer'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export interface InviteIntent { email?: string; role?: InviteRole }

export function parseEmail(text: string): string | null {
  const m = (text || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

export function parseInviteRole(text: string): InviteRole | null {
  const low = (text || '').toLowerCase();
  if (/\badmin(istrator)?\b/.test(low)) return 'admin';
  if (/\b(viewer|view[- ]only|read[- ]only)\b/.test(low)) return 'viewer';
  if (/\bmember\b/.test(low)) return 'member';
  return null;
}

// Suggest a workspace role from how the person's duties were described.
export function suggestInviteRole(text: string): { role: InviteRole; why: string } {
  const low = (text || '').toLowerCase();
  if (/\b(manage|admin|owner|billing|settings|permissions|full access|it lead)\b/.test(low)) return { role: 'admin', why: 'they will manage settings or people' };
  if (/\b(client|external|stakeholder|auditor|view only|read only|only needs? to (view|see|read))\b/.test(low)) return { role: 'viewer', why: 'they only need to view' };
  return { role: 'member', why: 'full day-to-day access without admin settings' };
}

// "Invite / add a user" intent. Deliberately narrow: never fires on records
// (contact / deal / client / agent / employee-onboarding), only on workspace-login nouns.
export function detectInvite(raw: string): InviteIntent | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const low = text.toLowerCase();
  if (/\b(agent|contact|deal|client|customer|ticket|expense|invoice|lead|employee|social|channel|password)\b/.test(low)) return null;
  const email = parseEmail(text);
  const verb = /\b(invite|add|create|set ?up|register|bring)\b/.test(low);
  const noun = /\b(users?|teammates?|team ?members?|members?|colleagues?|seat|login|account|someone)\b/.test(low);
  // "send him a link so he can sign up" / "email her an invite link" — same intent.
  const linky = /\b(send|email|share|give|text)\b[^.?!]*\blink\b/.test(low) && /\b(sign[- ]?up|signup|join|invite|invitation|register)\b/.test(low);
  if (!(verb && (noun || email)) && !linky) return null;
  if (/\bonboard/.test(low) && !/\binvite\b/.test(low) && !email) return null; // HR onboarding workflow owns that phrasing
  const out: InviteIntent = {};
  if (email) out.email = email;
  const role = parseInviteRole(text);
  if (role) out.role = role;
  return out;
}

// ---- Agent training / upgrading ----
export type AutonomyKey = 'draft_only' | 'approve_first' | 'auto_low_risk';
export interface TrainingChanges { tools: string[]; revoke: boolean; autonomy?: AutonomyKey; sensing?: boolean }
export interface UpgradeIntent { agentName?: string; changes: TrainingChanges }

// Match tool mentions against a catalog (key "send_sms" ⇒ "send sms", or the full label).
const normTool = (x: string): string => ` ${(x || '').toLowerCase().replace(/[-_/]/g, ' ').replace(/\b(a|an|the|to)\b/g, ' ').replace(/\s+/g, ' ').trim()} `;
export function matchToolKeys(text: string, catalog: { key: string; label: string }[]): string[] {
  const low = normTool(text);
  const out: string[] = [];
  for (const t of catalog) {
    if (low.includes(normTool(t.key).trim()) || low.includes(normTool(t.label).trim())) out.push(t.key);
  }
  return out;
}

export function parseTrainingChanges(raw: string, catalog: { key: string; label: string }[]): TrainingChanges {
  const low = (raw || '').toLowerCase();
  const revoke = /\b(revoke|remove|take (away|back)|un-?grant)\b/.test(low);
  const autonomy: AutonomyKey | undefined =
    /\b(auto[- ]?low[- ]?risk|more autonomous|autonomous(ly)?|auto[- ]?pilot|independent(ly)?)\b/.test(low) ? 'auto_low_risk'
      : /\bdraft[- ]only\b/.test(low) ? 'draft_only'
        : /\bapprove[- ]first\b/.test(low) ? 'approve_first' : undefined;
  const senseWord = /\b(sensing|proactive(ly)?|watch(ing)?|monitor(ing)?|scan(ning)?)\b/.test(low);
  const sensing = senseWord && /\b(enable|turn on|start|switch on|activate)\b/.test(low) ? true
    : senseWord && /\b(disable|turn off|stop|switch off|deactivate)\b/.test(low) ? false : undefined;
  return { tools: matchToolKeys(raw, catalog), revoke, autonomy, sensing };
}

// "Train / upgrade an agent" intent. Requires a training verb (or an explicit
// autonomy / sensing / tool-grant ask) AND a reference to an agent.
export function detectUpgrade(raw: string, agentNames: string[], catalog: { key: string; label: string }[]): UpgradeIntent | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const low = text.toLowerCase();
  const changes = parseTrainingChanges(text, catalog);
  const trainy = /\b(train|upskill|upgrade|teach|level ?up|coach|improve)\b/.test(low);
  const granty = /\b(grant|give|add|enable|allow|revoke|remove|take)\b/.test(low) && /\b(tools?|skills?|abilit\w*|capabilit\w*)\b/.test(low);
  if (!trainy && !granty && changes.autonomy === undefined && changes.sensing === undefined && !changes.tools.length) return null;
  const named = [...agentNames].sort((a, b) => b.length - a.length).find((n) => n && low.includes(n.toLowerCase()));
  if (!named && !/\b(agents?|assistants?|chief of staff|my team)\b/.test(low)) return null;
  if (/\bupgrade\b/.test(low) && /\b(plan|subscription|billing|storage)\b/.test(low)) return null; // plan upsell, not agent training
  return { agentName: named, changes };
}

// ---- Chief-assistant ACTION protocol (LLM path → deterministic flows) ----
// The edge fn instructs the model to end an actionable reply with one [[...]] line;
// the client strips it from the shown text and routes into the SAME approve-first flows.
export interface ChiefAction { kind: 'invite' | 'train' | 'workflow' | 'survey'; attrs: Record<string, string> }
export function parseChiefAction(answer: string): { shown: string; action: ChiefAction | null } {
  const m = (answer || '').match(/\[\[\s*(invite|train|workflow|survey)\b([^\]]*)\]\]/i);
  const shown = (answer || '').replace(/\s*\[\[\s*(invite|train|workflow|survey)\b[^\]]*\]\]\s*/gi, ' ').replace(/\s+\n/g, '\n').trim();
  if (!m) return { shown, action: null };
  const raw = m[2] || '';
  const attrs: Record<string, string> = {};
  const marks: { k: string; end: number; start: number }[] = [];
  const re = /(\w+)\s*=\s*/g; let mm: RegExpExecArray | null;
  while ((mm = re.exec(raw))) marks.push({ k: mm[1].toLowerCase(), start: mm.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const v = raw.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : raw.length).replace(/^["']|["',;]+$/g, '').trim();
    if (v) attrs[marks[i].k] = v;
  }
  return { shown, action: { kind: m[1].toLowerCase() as ChiefAction['kind'], attrs } };
}
// ---- Survey intent: "create a survey about X" → deterministic draft-survey flow.
// Checked BEFORE workflow detection so "create a survey ... about our project" can never
// be hijacked by the project-kickoff template (the failure Tariq hit on 2026-07-02).
export interface SurveyIntent { topic: string }
export function detectSurvey(raw: string): SurveyIntent | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const low = text.toLowerCase();
  if (!/\b(survey|nps|csat|questionnaire|poll|feedback (?:form|request))\b/.test(low)) return null;
  if (!/\b(create|make|build|set ?up|run|send|launch|conduct|start|draft|prepare|new)\b/.test(low)) return null;
  let topic = '';
  const m = text.match(/\b(?:about|regarding|on|for)\s+(.{3,140}?)(?:[.?!]|$)/i);
  if (m) topic = m[1].replace(/\s+/g, ' ').replace(/["'.!?\s]+$/g, '').trim();
  return { topic };
}

// Defensive plain-texting of LLM output (the panel renders plain text).
export function stripMd(text: string): string {
  return (text || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\n)#{1,4}\s+/g, '$1').replace(/(^|\n)\s*[*•]\s+/g, '$1- ');
}

// ---- Continuous learning: "remember / forget" (org-wide assistant memory) ----
export interface RememberIntent { content: string; kind: 'fact' | 'preference' | 'correction' }
export function detectRemember(raw: string): RememberIntent | null {
  const text = (raw || '').trim();
  if (!text) return null;
  let kind: RememberIntent['kind'] = 'fact';
  let m = text.match(/^\s*(?:please\s+|hey\s+)?(?:remember|note|keep in mind|learn)(?:\s+that)?[:,]?\s+(.{3,500})$/i);
  if (!m) { m = text.match(/^\s*(?:from now on|going forward)[:,]?\s+(.{3,500})$/i); if (m) kind = 'preference'; }
  if (!m) return null;
  const content = m[1].replace(/\s+/g, ' ').replace(/["'.!\s]+$/g, '').trim();
  if (!content || /\?$/.test(content)) return null;
  if (/^to\s+(invite|add|create|set ?up|onboard|kick|train|grant)\b/i.test(content)) return null; // an action request, not a fact
  if (/\b(always|never|prefer(s|red)?|should|must|don.?t|do not)\b/i.test(content)) kind = 'preference';
  return { content, kind };
}
export function detectForget(raw: string): { match: string } | null {
  const text = (raw || '').trim();
  if (/^\s*(?:please\s+)?forget\s+(?:that|it)\s*[.!]?\s*$/i.test(text)) return { match: '' }; // undo the last learned item
  const m = text.match(/^\s*(?:please\s+)?(?:forget|unlearn)(?:\s+(?:that|about))?\s+(.{2,300})$/i);
  if (!m) return null;
  const match = m[1].replace(/\s+/g, ' ').replace(/["'.!\s]+$/g, '').trim();
  return match ? { match } : null;
}
