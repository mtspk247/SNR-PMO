// lib/agents.ts — Phase 3.1 agent tool/permission registry (catalog only).
// The DB stores grants by tool_key; domain executors (Phase 3.2) implement the
// actual writes through existing RLS-safe paths. This file defines WHAT a manager
// can grant + the risk / reversibility / required-RBAC each action carries.
import type { PermKey } from './supabase';

export type AgentDomainKey = 'accounting' | 'tasks' | 'crm' | 'hr' | 'support' | 'people' | 'general';
export type RiskLevel = 'low' | 'medium' | 'high';

export const AGENT_DOMAINS: { key: AgentDomainKey; label: string; icon: string }[] = [
  { key: 'tasks', label: 'Work', icon: 'ti-briefcase' },
  { key: 'accounting', label: 'Accounting', icon: 'ti-report-money' },
  { key: 'people', label: 'People', icon: 'ti-users-group' },
  { key: 'crm', label: 'CRM', icon: 'ti-users' },
  { key: 'hr', label: 'HR', icon: 'ti-heart-handshake' },
  { key: 'support', label: 'Support', icon: 'ti-lifebuoy' },
  { key: 'general', label: 'General', icon: 'ti-robot' },
];

// Maps a nav module group (lib/nav SECTIONS `key`) to its agent domain, so a module page
// can mount <AgentPanel domain={DOMAIN_FOR_NAV[key]} />. 'general' agents are cross-module.
export const DOMAIN_FOR_NAV: Record<string, AgentDomainKey> = {
  work: 'tasks', tracking: 'accounting', people: 'people', crm: 'crm', hr: 'hr', support: 'support',
};

export const AUTONOMY_LABELS: Record<string, string> = {
  draft_only: 'Draft only (proposes, never executes)',
  approve_first: 'Approve-first (a human approves each action)',
  auto_low_risk: 'Auto low-risk (reversible only; money / payroll / legal stay approve-first)',
};

export const RISK_COLOR: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#dc2626' };

export type AgentToolDef = {
  key: string; label: string; domain: AgentDomainKey;
  risk: RiskLevel; reversible: boolean; requires?: PermKey; description: string; noAuto?: boolean;
};

// Starter catalog. Executors arrive in Phase 3.2; the `requires` perm is enforced
// at execution time (the action runs as the approving user through normal RLS).
export const AGENT_TOOLS: AgentToolDef[] = [
  { key: 'draft_journal_entry', label: 'Draft a journal entry from a bill', domain: 'accounting', risk: 'high', reversible: true, requires: 'can_export_data', description: 'Reads a vendor bill and proposes a balanced ledger entry. Posting requires the approver to hold ledger write access.' },
  { key: 'categorize_expense', label: 'Categorize an expense', domain: 'accounting', risk: 'low', reversible: true, noAuto: true, description: 'Suggests a category / account for an uncategorized expense. Financial — always approve-first even in auto mode.' },
  { key: 'create_task', label: 'Create / assign a task', domain: 'tasks', risk: 'low', reversible: true, description: 'Drafts a task (title, assignee, due date) from a request.' },
  { key: 'summarize_project', label: 'Summarize a project', domain: 'tasks', risk: 'low', reversible: true, description: 'Generates a read-only status summary; produces no writes.' },
  { key: 'triage_task', label: 'Triage / reprioritize a task', domain: 'tasks', risk: 'low', reversible: true, requires: 'can_edit_all_projects', description: 'Proposes a priority / status change on a task.' },
  { key: 'draft_followup', label: 'Draft a client follow-up', domain: 'crm', risk: 'low', reversible: true, description: 'Drafts a follow-up for a deal / contact; sending is a separate approved step.' },
  { key: 'update_deal_stage', label: 'Update a deal stage', domain: 'crm', risk: 'medium', reversible: true, description: 'Proposes moving a deal to a new pipeline stage.' },
  { key: 'send_sms', label: 'Send an SMS to a contact', domain: 'crm', risk: 'medium', reversible: false, noAuto: true, description: 'Sends an SMS to a contact through your messaging provider. Always approve-first (it cannot be unsent); respects opt-outs and spend caps.' },
  { key: 'draft_onboarding', label: 'Draft an onboarding plan', domain: 'hr', risk: 'low', reversible: true, description: 'Drafts onboarding tasks for a new hire.' },
  { key: 'route_leave_request', label: 'Route a leave request', domain: 'hr', risk: 'medium', reversible: true, requires: 'can_approve_leaves', description: 'Proposes an approve / deny on a leave request; the decision still flows through the leave approval gate.' },
  { key: 'triage_ticket', label: 'Triage a support ticket', domain: 'support', risk: 'low', reversible: true, description: 'Suggests an assignee / priority for a ticket.' },
  { key: 'draft_reply', label: 'Draft a support reply', domain: 'support', risk: 'low', reversible: true, description: 'Drafts a reply for an agent to review and send.' },
  { key: 'flag_capacity_risk', label: 'Flag a capacity risk', domain: 'people', risk: 'low', reversible: true, description: 'Flags an over-allocated person or team as a reversible review task. Surfaces the risk for a human to act on; never reassigns work itself.' },
  { key: 'draft_meeting_brief', label: 'Draft a 1:1 / meeting brief', domain: 'people', risk: 'low', reversible: true, description: 'Drafts a 1:1 or team-meeting brief from recent activity. Draft only.' },
];

export const toolsForDomain = (d: string) => AGENT_TOOLS.filter((t) => t.domain === d);
export const toolByKey = (k: string) => AGENT_TOOLS.find((t) => t.key === k);

// Sample proposals so the approval + rollback UX is demonstrable WITHOUT an LLM key.
export const SAMPLE_PROPOSALS: Record<string, { tool: string; summary: string; risk?: RiskLevel; reversible?: boolean; payload?: any }[]> = {
  accounting: [
    { tool: 'draft_journal_entry', summary: 'Post vendor bill "AWS - May invoice" ($512.40) to Cloud Hosting expense', risk: 'high', payload: { vendor: 'AWS', amount: 512.40, account: 'Cloud Hosting' } },
  ],
  tasks: [
    { tool: 'create_task', summary: 'Create task "Send Q2 report to Acme", assign to the account owner, due Friday', risk: 'low', payload: { title: 'Send Q2 report to Acme', due: 'Friday' } },
  ],
  crm: [
    { tool: 'draft_followup', summary: 'Draft a follow-up to "Globex" (no reply in 7 days on the proposal)', risk: 'low', payload: { deal: 'Globex' } },
    { tool: 'send_sms', summary: 'Text "Acme" a reminder of tomorrow\'s 10am call', risk: 'medium', reversible: false, payload: { to: '+15551234567', body: 'Hi Acme - a reminder of our call tomorrow at 10am. Reply STOP to opt out.' } },
  ],
  hr: [
    { tool: 'draft_onboarding', summary: 'Draft a week-1 onboarding checklist for new hire "Jordan Lee"', risk: 'low', payload: { employee: 'Jordan Lee' } },
  ],
  support: [
    { tool: 'draft_reply', summary: 'Draft a reply to ticket "Login fails after password reset"', risk: 'low', payload: { ticket: 'Login fails after password reset' } },
  ],
  people: [
    { tool: 'flag_capacity_risk', summary: 'Flag that "Alex Kim" is over-allocated this week (7 open tasks, 3 overdue)', risk: 'low', payload: { person: 'Alex Kim' } },
  ],
  general: [
    { tool: 'summarize_project', summary: 'Summarize this week of activity across active projects', risk: 'low', payload: {} },
  ],
};

// Phase 3.5+ activation: a curated starter pack so a new workspace experiences agents
// immediately. Provisioned via db.seedStarterAgents through the normal RLS-safe paths;
// nothing runs until the user triggers a run (sample or proposer).
export const STARTER_AGENTS: { name: string; domain: AgentDomainKey; autonomy: string; description: string; tools: string[] }[] = [
  { name: 'Task Assistant', domain: 'tasks', autonomy: 'auto_low_risk', description: 'Creates and triages tasks from requests. Low-risk, reversible actions run automatically.', tools: ['create_task', 'triage_task', 'summarize_project'] },
  { name: 'Onboarding Helper', domain: 'hr', autonomy: 'auto_low_risk', description: 'Drafts a week-1 onboarding checklist for a new hire.', tools: ['draft_onboarding', 'create_task'] },
  { name: 'Expense Categorizer', domain: 'accounting', autonomy: 'approve_first', description: 'Suggests categories for uncategorized expenses and drafts journal entries. Financial — you approve each one.', tools: ['categorize_expense', 'draft_journal_entry'] },
  { name: 'Support Triage', domain: 'support', autonomy: 'approve_first', description: 'Suggests an assignee and priority for new tickets, and drafts replies for review.', tools: ['triage_ticket', 'draft_reply'] },
  { name: 'Pipeline Mover', domain: 'crm', autonomy: 'approve_first', description: 'Proposes deal-stage moves, drafts client follow-ups, and sends approved SMS.', tools: ['update_deal_stage', 'draft_followup', 'send_sms'] },
  { name: 'People Coordinator', domain: 'people', autonomy: 'draft_only', description: 'Surfaces capacity risks and drafts 1:1 / meeting briefs from workload. Draft-only - it proposes, you decide.', tools: ['flag_capacity_risk', 'draft_meeting_brief'] },
];
