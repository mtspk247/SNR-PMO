// lib/agents.ts — Phase 3.1 agent tool/permission registry (catalog only).
// The DB stores grants by tool_key; domain executors (Phase 3.2) implement the
// actual writes through existing RLS-safe paths. This file defines WHAT a manager
// can grant + the risk / reversibility / required-RBAC each action carries.
import type { PermKey } from './supabase';

export type AgentDomainKey = 'accounting' | 'tasks' | 'crm' | 'hr' | 'support' | 'people' | 'marketing' | 'general';
export type RiskLevel = 'low' | 'medium' | 'high';

export const AGENT_DOMAINS: { key: AgentDomainKey; label: string; icon: string }[] = [
  { key: 'tasks', label: 'Work', icon: 'ti-briefcase' },
  { key: 'accounting', label: 'Accounting', icon: 'ti-report-money' },
  { key: 'people', label: 'People', icon: 'ti-users-group' },
  { key: 'crm', label: 'CRM', icon: 'ti-users' },
  { key: 'hr', label: 'HR', icon: 'ti-heart-handshake' },
  { key: 'support', label: 'Support', icon: 'ti-lifebuoy' },
  { key: 'marketing', label: 'Marketing', icon: 'ti-speakerphone' },
  { key: 'general', label: 'General', icon: 'ti-robot' },
];

// Maps a nav module group (lib/nav SECTIONS `key`) to its agent domain, so a module page
// can mount <AgentPanel domain={DOMAIN_FOR_NAV[key]} />. 'general' agents are cross-module.
export const DOMAIN_FOR_NAV: Record<string, AgentDomainKey> = {
  work: 'tasks', tracking: 'accounting', people: 'people', crm: 'crm', hr: 'hr', support: 'support', marketing: 'marketing',
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
  { key: 'scaffold_project', label: 'Scaffold a project (with starter tasks)', domain: 'tasks', risk: 'medium', reversible: true, description: 'Creates a new project and seeds its starter tasks in one step. Approve-first; reversible (removes the tasks and the project).' },
  { key: 'summarize_project', label: 'Summarize a project', domain: 'tasks', risk: 'low', reversible: true, description: 'Generates a read-only status summary; produces no writes.' },
  { key: 'triage_task', label: 'Triage / reprioritize a task', domain: 'tasks', risk: 'low', reversible: true, requires: 'can_edit_all_projects', description: 'Proposes a priority / status change on a task.' },
  { key: 'draft_followup', label: 'Draft a client follow-up', domain: 'crm', risk: 'low', reversible: true, description: 'Drafts a follow-up for a deal / contact; sending is a separate approved step.' },
  { key: 'update_deal_stage', label: 'Update a deal stage', domain: 'crm', risk: 'medium', reversible: true, description: 'Proposes moving a deal to a new pipeline stage.' },
  { key: 'send_sms', label: 'Send an SMS to a contact', domain: 'crm', risk: 'medium', reversible: false, noAuto: true, description: 'Sends an SMS to a contact through your messaging provider. Always approve-first (it cannot be unsent); respects opt-outs and spend caps.' },
  { key: 'create_contact', label: 'Add a CRM contact', domain: 'crm', risk: 'low', reversible: true, description: 'Creates a new contact (name, email, title) from a request. Reversible — deletes the contact on rollback.' },
  { key: 'create_deal', label: 'Create a deal / opportunity', domain: 'crm', risk: 'medium', reversible: true, description: 'Opens a new pipeline deal (title, value, expected close) from a request. Approve-first; reversible by deleting the deal.' },
  { key: 'scaffold_client_onboarding', label: 'Onboard a new client (contact + project + tasks)', domain: 'crm', risk: 'medium', reversible: true, description: 'Onboards a client end-to-end in one step: creates a CRM contact, an onboarding project, and its starter tasks. Approve-first; reversible (removes them all).' },
  { key: 'draft_onboarding', label: 'Draft an onboarding plan', domain: 'hr', risk: 'low', reversible: true, description: 'Drafts onboarding tasks for a new hire.' },
  { key: 'route_leave_request', label: 'Route a leave request', domain: 'hr', risk: 'medium', reversible: true, requires: 'can_approve_leaves', description: 'Proposes an approve / deny on a leave request; the decision still flows through the leave approval gate.' },
  { key: 'triage_ticket', label: 'Triage a support ticket', domain: 'support', risk: 'low', reversible: true, description: 'Suggests an assignee / priority for a ticket.' },
  { key: 'draft_reply', label: 'Draft a support reply', domain: 'support', risk: 'low', reversible: true, description: 'Drafts a reply for an agent to review and send.' },
  { key: 'flag_capacity_risk', label: 'Flag a capacity risk', domain: 'people', risk: 'low', reversible: true, description: 'Flags an over-allocated person or team as a reversible review task. Surfaces the risk for a human to act on; never reassigns work itself.' },
  { key: 'draft_meeting_brief', label: 'Draft a 1:1 / meeting brief', domain: 'people', risk: 'low', reversible: true, description: 'Drafts a 1:1 or team-meeting brief from recent activity. Draft only.' },
  // --- Phase 1 expansion verbs (each reversible, RLS-enforced at execution) ---
  { key: 'log_activity', label: 'Log a CRM activity (call / email / note)', domain: 'crm', risk: 'low', reversible: true, description: 'Logs a call, email, or note against a deal or contact so the timeline stays current. Reversible — deletes the activity on rollback.' },
  { key: 'convert_lead', label: 'Convert a qualified lead to a client', domain: 'crm', risk: 'medium', reversible: true, noAuto: true, requires: 'can_edit_all_projects', description: 'Promotes a qualified lead to a client and marks the lead converted. Approve-first; reversible (removes the client, restores the lead).' },
  { key: 'post_comment', label: 'Post a comment / status update', domain: 'tasks', risk: 'low', reversible: true, description: 'Posts an update comment on a task, project, or idea. Reversible — removes the comment on rollback.' },
  { key: 'set_reminder', label: 'Set a reminder', domain: 'general', risk: 'low', reversible: true, description: 'Schedules a reminder for the owner, optionally linked to a record. Reversible — deletes the reminder on rollback.' },
  { key: 'draft_job_posting', label: 'Draft a job description', domain: 'hr', risk: 'low', reversible: true, description: 'Drafts a job description (summary, responsibilities, requirements) for review. Reversible — deletes the draft on rollback.' },
  { key: 'draft_social_post', label: 'Draft a social post', domain: 'marketing', risk: 'low', reversible: true, description: 'Drafts a social post (text + optional channels) into the Social composer for review. Drafting only — scheduling and publishing stay a separate human step. Reversible — deletes the draft on rollback.' },
  { key: 'watch_competitors', label: 'Watch competitors & draft insights', domain: 'marketing', risk: 'low', reversible: true, description: 'Scans your tracked competitors and drafts a competitive insight (trend / gap / threat / opportunity) with a recommendation, so your team can stay ahead. Read-heavy; produces a reviewable insight — reversible on rollback.' },
  { key: 'analyze_social_performance', label: 'Analyze social performance', domain: 'marketing', risk: 'low', reversible: true, description: 'Reads your social analytics (best channel, engagement rate, top content, cadence) and drafts a performance insight + recommendation for review. Read-only analysis; reversible on rollback.' },
  { key: 'draft_social_reply', label: 'Draft a reply to a comment/DM', domain: 'marketing', risk: 'low', reversible: true, description: 'Drafts an on-brand reply to an inbox conversation (comment / mention / DM) for a human to review and send. Draft-only, approve-first; reversible on rollback.' },
  // --- Chief of Staff verbs (workspace administration — always approve-first) ---
  { key: 'invite_user', label: 'Invite a teammate (workspace user)', domain: 'general', risk: 'medium', reversible: true, noAuto: true, description: 'Invites a new user to the workspace by email as admin, member or viewer. Approve-first — the invitation email only goes out when you approve; reversible (rollback revokes the invite so its link stops working). Sending requires an owner/admin approver.' },
  { key: 'upgrade_agent', label: 'Train / upgrade an agent', domain: 'general', risk: 'medium', reversible: true, noAuto: true, description: 'Upskills one of your agents: grants or revokes tools, adjusts its autonomy level, or turns proactive sensing on/off. Approve-first and reversible — rollback restores the previous skills and settings.' },
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
    { tool: 'scaffold_project', summary: 'Scaffold project "Acme Website Revamp" with 5 starter tasks', risk: 'medium', payload: { name: 'Acme Website Revamp', tasks: ['Kickoff & scope', 'Design & wireframes', 'Build', 'QA & launch', 'Retrospective'] } },
  ],
  crm: [
    { tool: 'draft_followup', summary: 'Draft a follow-up to "Globex" (no reply in 7 days on the proposal)', risk: 'low', payload: { deal: 'Globex' } },
    { tool: 'send_sms', summary: 'Text "Acme" a reminder of tomorrow\'s 10am call', risk: 'medium', reversible: false, payload: { to: '+15551234567', body: 'Hi Acme - a reminder of our call tomorrow at 10am. Reply STOP to opt out.' } },
    { tool: 'create_contact', summary: 'Add contact "Jordan Reyes" (Ops Lead, jordan@acme.com)', risk: 'low', payload: { full_name: 'Jordan Reyes', title: 'Ops Lead', email: 'jordan@acme.com' } },
    { tool: 'create_deal', summary: 'Open a deal "Acme - Website redesign" ($12,000)', risk: 'medium', payload: { title: 'Acme - Website redesign', value: 12000 } },
    { tool: 'scaffold_client_onboarding', summary: 'Onboard new client "Northwind Co" - contact + onboarding project + 5 tasks', risk: 'medium', payload: { client_name: 'Northwind Co', contact_name: 'Dana Pierce', contact_email: 'dana@northwind.co' } },
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
  marketing: [
    { tool: 'draft_social_post', summary: 'Draft a LinkedIn post announcing a recent client onboarding win', risk: 'low', payload: { body: 'Thrilled to welcome our newest client aboard! Another team now runs projects, CRM, and back-office in one place — less tool-juggling, more momentum. 🚀' } },
    { tool: 'watch_competitors', summary: 'Competitive gap: rivals post 3x/week on LinkedIn; you post 1x', risk: 'low', payload: { kind: 'gap', summary: 'Top competitors post ~3x/week on LinkedIn with carousels; your cadence is ~1x/week text-only.', recommendation: 'Move to 3x/week and test one carousel per week; watch engagement lift in Analytics.' } },
  ],
  general: [
    { tool: 'summarize_project', summary: 'Summarize this week of activity across active projects', risk: 'low', payload: {} },
  ],
};

// Phase 3.5+ activation: a curated starter pack so a new workspace experiences agents
// immediately. Provisioned via db.seedStarterAgents through the normal RLS-safe paths;
// nothing runs until the user triggers a run (sample or proposer).
export const STARTER_AGENTS: { name: string; domain: AgentDomainKey; autonomy: string; description: string; tools: string[] }[] = [
  { name: 'Task Assistant', domain: 'tasks', autonomy: 'auto_low_risk', description: 'Creates and triages tasks, and scaffolds new projects with starter tasks. Low-risk actions run automatically; project scaffolding is approve-first.', tools: ['create_task', 'scaffold_project', 'triage_task', 'summarize_project'] },
  { name: 'Onboarding Helper', domain: 'hr', autonomy: 'auto_low_risk', description: 'Drafts a week-1 onboarding checklist for a new hire.', tools: ['draft_onboarding', 'create_task'] },
  { name: 'Expense Categorizer', domain: 'accounting', autonomy: 'approve_first', description: 'Suggests categories for uncategorized expenses and drafts journal entries. Financial — you approve each one.', tools: ['categorize_expense', 'draft_journal_entry'] },
  { name: 'Support Triage', domain: 'support', autonomy: 'approve_first', description: 'Suggests an assignee and priority for new tickets, and drafts replies for review.', tools: ['triage_ticket', 'draft_reply'] },
  { name: 'Pipeline Mover', domain: 'crm', autonomy: 'approve_first', description: 'Creates contacts and deals, onboards won clients end-to-end (contact + project + tasks), proposes deal-stage moves, drafts follow-ups, and sends approved SMS. You approve each one.', tools: ['update_deal_stage', 'create_deal', 'create_contact', 'scaffold_client_onboarding', 'draft_followup', 'send_sms'] },
  { name: 'People Coordinator', domain: 'people', autonomy: 'draft_only', description: 'Surfaces capacity risks and drafts 1:1 / meeting briefs from workload. Draft-only - it proposes, you decide.', tools: ['flag_capacity_risk', 'draft_meeting_brief'] },
  { name: 'Content Assistant', domain: 'marketing', autonomy: 'approve_first', description: 'Your content teammate — drafts social posts into the Social composer, and analyzes your performance to recommend what to post next. Approve-first; drafts only (publishing stays a human step).', tools: ['draft_social_post', 'analyze_social_performance', 'draft_social_reply'] },
  { name: 'Competitor Watcher', domain: 'marketing', autonomy: 'draft_only', description: 'Keeps an eye on your tracked competitors and drafts competitive insights (trends, gaps, threats, opportunities) with recommendations — so your social team always plans a step ahead. Draft-only: it proposes, you decide.', tools: ['watch_competitors'] },
];
