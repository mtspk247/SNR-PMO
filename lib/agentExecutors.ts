// lib/agentExecutors.ts — Phase 3.2 domain executors.
// CRITICAL (compete plan §4): an executor performs the real business write through
// the SAME db.ts functions a human uses, running CLIENT-SIDE as the approving user,
// so the write is subject to that user's RLS + RBAC — the agent never bypasses.
// Each executor returns target + reversal so the action becomes rollback-able.
import { createTask, deleteTask, updateTask, updateDeal, createContact, deleteContact, createDeal, deleteDeal, createProject, deleteProject, createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, assignTicket, setTicketStatus, sendSms, createActivity, deleteActivity, addComment, deleteComment, createReminder, deleteReminder, createJobDescription, deleteJobDescription, createSocialPost, deleteSocialPost, createCompetitorInsight, deleteCompetitorInsight, listLeads, updateLead, convertLeadToClient, deleteClient, AgentAction, AgentDefinition, listAgents, listAgentTools, requestChatCommandAction, runAgentProposer, decideAgentAction, recordAgentExecution } from './db';
import { buildToolPayload, ChatCommand } from './chatCommands';
import { toolByKey, AGENT_TOOLS } from './agents';

export type ExecCtx = { orgId: string; userId: string };
export type ExecResult = { target_table: string; target_id: string | null; result?: any; reversal?: any; prior_state?: any };
export type Executor = {
  label: string;                                           // verb shown on the Approve button
  execute: (a: AgentAction, ctx: ExecCtx) => Promise<ExecResult>;
  rollback?: (a: AgentAction, ctx: ExecCtx) => Promise<void>;
};

export const EXECUTORS: Record<string, Executor> = {
  // MARKETING — agents as the content team. Drafts a social post into the Social
  // composer (status='draft', source='agent') via the SAME createSocialPost a human
  // uses, so RLS/RBAC apply (approver must hold social write access). Publishing stays
  // a separate human step (OAuth). Reversible: deletes the draft on rollback.
  // MARKETING — competitor intelligence. The watcher proposes a competitive insight;
  // on approval it persists a reviewable insight row (as the approving user → RLS applies).
  // Reversible: deletes the insight on rollback.
  // MARKETING — performance analyst. Reads analytics (via the deterministic scan) and
  // persists a performance insight for review. Runs as the approving user (RLS applies);
  // reversible. Reuses the social insights feed (competitor_id null = own-performance).
  analyze_social_performance: {
    label: 'Save the performance insight',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const summary = String(p.summary || a.summary || '').slice(0, 600);
      if (!summary.trim()) throw new Error('analyze_social_performance needs an insight summary in the payload');
      const kind = (['trend', 'gap', 'threat', 'opportunity', 'insight'] as const).includes(p.kind) ? p.kind : 'insight';
      const ins = await createCompetitorInsight({ org_id: ctx.orgId, summary, kind, recommendation: p.recommendation ? String(p.recommendation).slice(0, 600) : undefined, competitor_id: null });
      return { target_table: 'social_competitor_insights', target_id: ins.id, result: { insight_id: ins.id }, reversal: { op: 'delete_competitor_insight' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteCompetitorInsight(a.target_id); },
  },
  watch_competitors: {
    label: 'Save the competitive insight',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const summary = String(p.summary || a.summary || '').slice(0, 600);
      if (!summary.trim()) throw new Error('watch_competitors needs an insight summary in the payload');
      const kind = (['trend', 'gap', 'threat', 'opportunity', 'insight'] as const).includes(p.kind) ? p.kind : 'insight';
      const ins = await createCompetitorInsight({ org_id: ctx.orgId, summary, kind, recommendation: p.recommendation ? String(p.recommendation).slice(0, 600) : undefined, competitor_id: p.competitor_id || null });
      return { target_table: 'social_competitor_insights', target_id: ins.id, result: { insight_id: ins.id }, reversal: { op: 'delete_competitor_insight' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteCompetitorInsight(a.target_id); },
  },
  draft_social_post: {
    label: 'Save the draft post',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const body = String(p.body || a.summary || '').slice(0, 5000);
      if (!body.trim()) throw new Error('draft_social_post needs post text in the payload');
      const channel_ids = Array.isArray(p.channel_ids) ? p.channel_ids.map((x: any) => String(x)) : [];
      const post = await createSocialPost({ org_id: ctx.orgId, created_by: ctx.userId, body, status: 'draft', source: 'agent', channel_ids });
      return { target_table: 'social_posts', target_id: post.id, result: { social_post_id: post.id }, reversal: { op: 'delete_social_post' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteSocialPost(a.target_id); },
  },
  // CREATE pattern — reversible by deleting the created row. Fully demonstrable.
  create_task: {
    label: 'Create the task',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const due = typeof p.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : null;
      const name = String(p.title || a.summary || 'New task').slice(0, 200);
      const t = await createTask({ name, org_id: ctx.orgId, project_id: p.project_id ?? null, due_date: due });
      return { target_table: 'tasks', target_id: t.id, result: { task_id: t.id, name: t.name }, reversal: { op: 'delete_task' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteTask(a.target_id); },
  },
  // UPDATE pattern — reversible by restoring prior_state. Needs deal_id + to_stage
  // in the payload (supplied by the LLM proposer in 3.2b); from_stage enables rollback.
  update_deal_stage: {
    label: 'Update the deal stage',
    execute: async (a) => {
      const p = a.payload || {};
      if (!p.deal_id || !p.to_stage) throw new Error('update_deal_stage needs deal_id + to_stage in the payload');
      const d = await updateDeal(p.deal_id, { stage: String(p.to_stage) });
      return { target_table: 'crm_deals', target_id: d.id, result: { stage: d.stage }, reversal: { op: 'restore_stage' }, prior_state: { stage: p.from_stage ?? null } };
    },
    rollback: async (a) => { const ps = a.prior_state || {}; if (a.target_id && ps.stage) await updateDeal(a.target_id, { stage: String(ps.stage) }); },
  },
  // ACCOUNTING headline (compete plan §4): post a vendor bill to the ledger. Demoable
  // via the accounting sample. v1 writes a single-sided expense entry and reverses by
  // delete (the entry was just created by the agent). NOTE: production double-entry
  // should reverse with a contra/reversing entry, not a delete — a follow-up.
  draft_journal_entry: {
    label: 'Post to the ledger',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const amount = Number(p.amount);
      if (!isFinite(amount) || amount <= 0) throw new Error('draft_journal_entry needs a positive amount in the payload');
      const e = await createLedgerEntry({
        org_id: ctx.orgId, type: 'expense',
        category: String(p.account || p.category || 'Uncategorized').slice(0, 80),
        amount, entry_date: new Date().toISOString().slice(0, 10),
        notes: ('Posted by agent — ' + (a.summary || '')).slice(0, 300), created_by: ctx.userId,
      });
      return { target_table: 'ledger_entries', target_id: e.id, result: { ledger_entry_id: e.id, amount }, reversal: { op: 'delete_ledger_entry' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteLedgerEntry(a.target_id); },
  },

  // HR onboarding — CREATE pattern (batch). Demoable via the hr sample: creates a
  // standard week-1 onboarding checklist as tasks. Reversible by deleting them all.
  draft_onboarding: {
    label: 'Create the onboarding tasks',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const who = String(p.employee || p.name || '').trim();
      const items: string[] = Array.isArray(p.tasks) && p.tasks.length
        ? p.tasks.map((x: any) => String(x))
        : ['Send welcome note + ship equipment', 'Create accounts & grant access', 'Schedule week-1 1:1s & team intro', 'Assign first-week training', 'Add to payroll & benefits'];
      const prefix = who ? ('Onboard ' + who + ': ') : 'Onboarding: ';
      const ids: string[] = [];
      for (const it of items.slice(0, 12)) {
        const t = await createTask({ name: (prefix + it).slice(0, 200), org_id: ctx.orgId });
        ids.push(t.id);
      }
      return { target_table: 'tasks', target_id: ids[0] || null, result: { task_ids: ids, count: ids.length }, reversal: { op: 'delete_tasks', ids } };
    },
    rollback: async (a) => { const ids: string[] = (a.reversal && a.reversal.ids) || (a.result && a.result.task_ids) || []; for (const id of ids) { try { await deleteTask(id); } catch { /* keep deleting the rest */ } } },
  },
  // Tasks triage — UPDATE pattern. Needs task_id (+ to_priority/to_status) from the
  // proposer; from_* enable rollback. Reversible by restoring prior_state.
  triage_task: {
    label: 'Apply the task change',
    execute: async (a) => {
      const p = a.payload || {};
      if (!p.task_id) throw new Error('triage_task needs task_id in the payload');
      const patch: any = {};
      if (p.to_priority) patch.priority = String(p.to_priority);
      if (p.to_status) patch.status = String(p.to_status);
      if (!Object.keys(patch).length) throw new Error('triage_task needs to_priority or to_status');
      const t = await updateTask(p.task_id, patch);
      return { target_table: 'tasks', target_id: t.id, result: patch, reversal: { op: 'restore_task' }, prior_state: { priority: p.from_priority ?? null, status: p.from_status ?? null } };
    },
    rollback: async (a) => { const ps = a.prior_state || {}; const patch: any = {}; if (ps.priority) patch.priority = String(ps.priority); if (ps.status) patch.status = String(ps.status); if (a.target_id && Object.keys(patch).length) await updateTask(a.target_id, patch); },
  },
  // Support triage — UPDATE pattern via the support RPCs (the approver must be support
  // staff; support_assign/support_set_status enforce it). Needs ticket_id; from_* roll back.
  triage_ticket: {
    label: 'Apply the ticket triage',
    execute: async (a) => {
      const p = a.payload || {};
      if (!p.ticket_id) throw new Error('triage_ticket needs ticket_id in the payload');
      const prior: any = {}; const res: any = {};
      if (p.assignee_id !== undefined) { await assignTicket(p.ticket_id, p.assignee_id || null); prior.assignee_id = p.from_assignee_id ?? null; res.assignee_id = p.assignee_id || null; }
      if (p.to_status) { await setTicketStatus(p.ticket_id, String(p.to_status)); prior.status = p.from_status ?? null; res.status = String(p.to_status); }
      if (!Object.keys(res).length) throw new Error('triage_ticket needs assignee_id or to_status');
      return { target_table: 'support_tickets', target_id: String(p.ticket_id), result: res, reversal: { op: 'restore_ticket' }, prior_state: prior };
    },
    rollback: async (a) => { const ps = a.prior_state || {}; if (!a.target_id) return; if (ps.status) await setTicketStatus(a.target_id, String(ps.status)); if (Object.prototype.hasOwnProperty.call(ps, 'assignee_id')) await assignTicket(a.target_id, ps.assignee_id || null); },
  },
  // Accounting categorize — UPDATE pattern. Sets a category on an uncategorized ledger
  // entry. Needs entry_id; from_category enables rollback.
  categorize_expense: {
    label: 'Set the category',
    execute: async (a) => {
      const p = a.payload || {};
      if (!p.entry_id || !p.category) throw new Error('categorize_expense needs entry_id + category in the payload');
      const e = await updateLedgerEntry(p.entry_id, { category: String(p.category).slice(0, 80) });
      return { target_table: 'ledger_entries', target_id: e.id, result: { category: e.category }, reversal: { op: 'restore_category' }, prior_state: { category: p.from_category ?? null } };
    },
    rollback: async (a) => { const ps = a.prior_state || {}; if (a.target_id && ps.category) await updateLedgerEntry(a.target_id, { category: String(ps.category) }); },
  },
  // People (capacity) — CREATE pattern. Flags an over-allocated person/team as a review task
  // via the same RLS-safe createTask a human uses; reversible by delete. Demoable via the
  // people SAMPLE (no key needed) and emittable by the live proposer.
  flag_capacity_risk: {
    label: 'Flag the capacity risk',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const who = String(p.person || p.name || p.employee || '').trim();
      const detail = who ? (who + ' is over-allocated') : 'A team member is over-allocated';
      const t = await createTask({ name: ('Capacity risk: ' + detail + ' - review workload').slice(0, 200), org_id: ctx.orgId });
      return { target_table: 'tasks', target_id: t.id, result: { task_id: t.id, name: t.name }, reversal: { op: 'delete_task' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteTask(a.target_id); },
  },
  // CRM (comms) — send an APPROVED SMS via the messaging provider. Irreversible (the tool is
  // reversible:false), so it is ALWAYS approve-first; runs sendSms (sms_enqueue) as the approving
  // user, where opt-outs + spend caps are enforced, then kicks the dispatcher.
  send_sms: {
    label: 'Send the SMS',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      if (!p.to || !p.body) throw new Error('send_sms needs to + body in the payload');
      await sendSms(ctx.orgId, String(p.to), String(p.body));
      return { target_table: 'comms_messages', target_id: null, result: { to: String(p.to) } };
    },
  },
  // CRM (create) — CREATE pattern, reversible by delete. Reuses the same createContact a
  // human uses, so the insert is RLS/RBAC-walled to the approver's org. Demoable via sample.
  create_contact: {
    label: 'Create the contact',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const full_name = String(p.full_name || p.name || a.summary || 'New contact').slice(0, 160);
      const c = await createContact({
        full_name, org_id: ctx.orgId,
        email: p.email ?? null, phone: p.phone ?? null, title: p.title ?? null,
        company_id: p.company_id ?? null, status: p.status ?? null,
      });
      return { target_table: 'crm_contacts', target_id: c.id, result: { contact_id: c.id, full_name }, reversal: { op: 'delete_contact' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteContact(a.target_id); },
  },
  // CRM (create) — CREATE pattern, reversible by delete. Opens a pipeline deal via createDeal
  // (same RLS path as the human). Stage omitted -> the DB default applies (avoids a stage CHECK).
  create_deal: {
    label: 'Create the deal',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const title = String(p.title || a.summary || 'New deal').slice(0, 200);
      const value = isFinite(Number(p.value)) ? Number(p.value) : null;
      const ec = (typeof p.expected_close === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.expected_close)) ? p.expected_close : null;
      const d = await createDeal({
        title, org_id: ctx.orgId, value,
        ...(p.stage ? { stage: String(p.stage) } : {}),
        company_id: p.company_id ?? null, contact_id: p.contact_id ?? null, expected_close: ec,
      });
      return { target_table: 'crm_deals', target_id: d.id, result: { deal_id: d.id, title: d.title }, reversal: { op: 'delete_deal' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteDeal(a.target_id); },
  },
  // WORK (scaffold) — multi-write CREATE: a project + its starter tasks in ONE approved,
  // reversible action (the \"agentic\" multi-step). Uses createProject/createTask as the approver
  // so every write is RLS/RBAC-walled. Reversible: delete the tasks, then soft-delete the project.
  scaffold_project: {
    label: 'Create the project + tasks',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const name = String(p.name || a.summary || 'New project').slice(0, 160);
      const projs = await createProject({
        name, org_id: ctx.orgId,
        ...(p.status ? { status: String(p.status) } : {}),
        ...(p.priority ? { priority: String(p.priority) } : {}),
        company_id: p.company_id ?? null, pm_id: ctx.userId, created_by: ctx.userId,
      });
      const project = Array.isArray(projs) ? projs[0] : (projs as any);
      if (!project || !project.id) throw new Error('scaffold_project could not create the project');
      const titles: string[] = (Array.isArray(p.tasks) && p.tasks.length)
        ? p.tasks.map((x: any) => String(x))
        : ['Kickoff & scope', 'Plan timeline & milestones', 'Assign team & roles', 'First deliverable', 'Review & retrospective'];
      const ids: string[] = [];
      for (const t of titles.slice(0, 12)) {
        const task = await createTask({ name: String(t).slice(0, 200), org_id: ctx.orgId, project_id: project.id });
        ids.push(task.id);
      }
      return { target_table: 'projects', target_id: project.id, result: { project_id: project.id, name: project.name, task_ids: ids, count: ids.length }, reversal: { op: 'delete_project_scaffold', project_id: project.id, ids } };
    },
    rollback: async (a) => {
      const ids: string[] = (a.reversal && a.reversal.ids) || (a.result && a.result.task_ids) || [];
      for (const id of ids) { try { await deleteTask(id); } catch { /* keep deleting */ } }
      if (a.target_id) { try { await deleteProject(a.target_id); } catch { /* noop */ } }
    },
  },
  // CRM/cross-module (composite) — onboard a new client END-TO-END in ONE approved,
  // reversible action: a CRM contact + an onboarding project + its starter tasks. Every
  // write runs as the approver (createContact/createProject/createTask) -> RLS/RBAC-walled.
  // Reversible: delete the tasks, soft-delete the project, delete the contact.
  scaffold_client_onboarding: {
    label: 'Onboard the client',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const client = String(p.client_name || p.name || a.summary || 'New client').slice(0, 120);
      const contact = await createContact({
        full_name: String(p.contact_name || client).slice(0, 160), org_id: ctx.orgId,
        email: p.contact_email ?? null, company_id: p.company_id ?? null,
      });
      const projs = await createProject({
        name: String(p.project_name || (client + ' \u2014 Onboarding')).slice(0, 160),
        org_id: ctx.orgId, status: 'Planning', pm_id: ctx.userId, created_by: ctx.userId,
      });
      const project = Array.isArray(projs) ? projs[0] : (projs as any);
      if (!project || !project.id) throw new Error('scaffold_client_onboarding could not create the project');
      const titles: string[] = (Array.isArray(p.tasks) && p.tasks.length)
        ? p.tasks.map((x: any) => String(x))
        : ['Welcome & kickoff call', 'Collect brand assets & access', 'Set up workspace & contracts', 'Define scope & milestones', 'First check-in'];
      const ids: string[] = [];
      for (const t of titles.slice(0, 12)) {
        const task = await createTask({ name: String(t).slice(0, 200), org_id: ctx.orgId, project_id: project.id });
        ids.push(task.id);
      }
      return { target_table: 'projects', target_id: project.id, result: { contact_id: contact.id, project_id: project.id, task_ids: ids, count: ids.length, client }, reversal: { op: 'delete_client_onboarding', contact_id: contact.id, project_id: project.id, ids } };
    },
    rollback: async (a) => {
      const r: any = a.reversal || {};
      const ids: string[] = r.ids || (a.result && a.result.task_ids) || [];
      for (const id of ids) { try { await deleteTask(id); } catch { /* keep going */ } }
      if (a.target_id) { try { await deleteProject(a.target_id); } catch { /* noop */ } }
      const cid = r.contact_id || (a.result && a.result.contact_id);
      if (cid) { try { await deleteContact(cid); } catch { /* noop */ } }
    },
  },
  // --- Phase 1 expansion: more verbs per module (each reuses an RLS-safe db.ts
  // write run as the approving user, and is one-click reversible). ---

  // CRM — log a call/email/note on a deal or contact. Reversible by delete.
  log_activity: {
    label: 'Log the activity',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const body = String(p.body || a.summary || '').trim();
      if (!body) throw new Error('log_activity needs a body');
      const act = await createActivity({ org_id: ctx.orgId, deal_id: p.deal_id ?? null, contact_id: p.contact_id ?? null, kind: p.kind ? String(p.kind).slice(0, 40) : 'note', body: body.slice(0, 2000), created_by: ctx.userId });
      return { target_table: 'crm_activities', target_id: act.id, result: { activity_id: act.id }, reversal: { op: 'delete_activity' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteActivity(a.target_id); },
  },

  // CRM — convert a qualified lead into a client (creates client + marks lead converted).
  // Two-part reversal: delete the new client + restore the lead's prior status.
  convert_lead: {
    label: 'Convert the lead to a client',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      if (!p.lead_id) throw new Error('convert_lead needs lead_id in the payload');
      const lead = (await listLeads(ctx.orgId)).find((l) => l.id === p.lead_id);
      if (!lead) throw new Error('convert_lead: lead not found or not visible to you');
      const prior = lead.status;
      const client = await convertLeadToClient(lead, ctx.userId);
      return { target_table: 'clients', target_id: client.id, result: { client_id: client.id, name: client.name, lead_id: lead.id }, reversal: { op: 'undo_convert_lead', lead_id: lead.id }, prior_state: { lead_id: lead.id, lead_status: prior } };
    },
    rollback: async (a) => {
      if (a.target_id) { try { await deleteClient(a.target_id); } catch { /* keep going */ } }
      const ps: any = a.prior_state || {};
      if (ps.lead_id) { try { await updateLead(ps.lead_id, { status: ps.lead_status || 'new' }); } catch { /* noop */ } }
    },
  },

  // Work — post a status/update comment on a task, project, or idea. Reversible (soft delete).
  post_comment: {
    label: 'Post the comment',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      if (!p.entity_id) throw new Error('post_comment needs entity_id + entity_type');
      const et: 'task' | 'project' | 'idea' = (p.entity_type === 'project' || p.entity_type === 'idea') ? p.entity_type : 'task';
      const body = String(p.body || a.summary || '').trim();
      if (!body) throw new Error('post_comment needs a body');
      const c = await addComment({ entity_type: et, entity_id: String(p.entity_id), org_id: ctx.orgId, author_id: ctx.userId, body: body.slice(0, 2000), mentions: Array.isArray(p.mentions) ? p.mentions.map(String) : [] });
      return { target_table: 'comments', target_id: c.id, result: { comment_id: c.id }, reversal: { op: 'delete_comment' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteComment(a.target_id); },
  },

  // General — schedule a reminder for the owner (optionally linked to a record). Reversible.
  set_reminder: {
    label: 'Set the reminder',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const note = String(p.note || a.summary || '').trim();
      if (!note) throw new Error('set_reminder needs a note');
      const remind_at = (typeof p.remind_at === 'string' && p.remind_at) ? p.remind_at : new Date(Date.now() + 864e5).toISOString();
      const r = await createReminder({ org_id: ctx.orgId, user_id: p.user_id ? String(p.user_id) : ctx.userId, note: note.slice(0, 500), remind_at, entity_type: p.entity_type ? String(p.entity_type) : undefined, entity_id: p.entity_id ? String(p.entity_id) : undefined });
      return { target_table: 'reminders', target_id: r.id, result: { reminder_id: r.id, remind_at }, reversal: { op: 'delete_reminder' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteReminder(a.target_id); },
  },

  // HR — draft a job description (summary / responsibilities / requirements). Reversible by delete.
  draft_job_posting: {
    label: 'Create the job description',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const title = String(p.title || a.summary || 'New role').slice(0, 160);
      const jd = await createJobDescription({ org_id: ctx.orgId, title, department: p.department ? String(p.department).slice(0, 80) : null, summary: p.summary ? String(p.summary).slice(0, 2000) : null, responsibilities: p.responsibilities ? String(p.responsibilities).slice(0, 4000) : null, requirements: p.requirements ? String(p.requirements).slice(0, 4000) : null, created_by: ctx.userId });
      return { target_table: 'job_descriptions', target_id: jd.id, result: { job_description_id: jd.id, title }, reversal: { op: 'delete_job_description' } };
    },
    rollback: async (a) => { if (a.target_id) await deleteJobDescription({ id: a.target_id }); },
  },
};

export const executorFor = (toolKey: string): Executor | undefined => EXECUTORS[toolKey];

// ---------------------------------------------------------------------------
// Dry-run simulation (Phase 2): a READ-ONLY preview of exactly what an action will
// do — before→after diff, what it creates, blast radius (records / money), and
// reversibility — derived purely from the proposed payload (no DB writes, no reads),
// so the reviewer (and a demo audience) sees the full picture before approving.
// ---------------------------------------------------------------------------
export type SimChange = { field: string; from: string; to: string };
export type SimResult = { changes: SimChange[]; creates: string[]; effects: string[]; blast: { records: number; money: number; irreversible: boolean }; warnings: string[] };
const _s = (v: any): string => (v == null || v === '' ? '—' : String(v));
const _taskCount = (p: any): number => (Array.isArray(p?.tasks) && p.tasks.length ? Math.min(p.tasks.length, 12) : 5);

export function simulateAction(a: AgentAction): SimResult {
  const p = a.payload || {};
  const base: SimResult = { changes: [], creates: [], effects: [], blast: { records: 1, money: 0, irreversible: !a.reversible }, warnings: [] };
  switch (a.tool_key) {
    case 'triage_task': {
      const ch: SimChange[] = [];
      if (p.to_priority) ch.push({ field: 'Priority', from: _s(p.from_priority), to: _s(p.to_priority) });
      if (p.to_status) ch.push({ field: 'Status', from: _s(p.from_status), to: _s(p.to_status) });
      return { ...base, changes: ch, effects: ['Updates 1 task', 'No money moves'] };
    }
    case 'update_deal_stage':
      return { ...base, changes: [{ field: 'Stage', from: _s(p.from_stage), to: _s(p.to_stage) }], effects: ['Moves 1 deal'] };
    case 'categorize_expense':
      return { ...base, changes: [{ field: 'Category', from: _s(p.from_category) === '—' ? 'Uncategorized' : _s(p.from_category), to: _s(p.category) }], effects: ['Categorizes 1 ledger entry', 'No money moves'] };
    case 'triage_ticket': {
      const ch: SimChange[] = [];
      if (p.to_status) ch.push({ field: 'Status', from: _s(p.from_status), to: _s(p.to_status) });
      if (p.assignee_id !== undefined) ch.push({ field: 'Assignee', from: _s(p.from_assignee_id) === '—' ? 'Unassigned' : 'Reassigned', to: 'Assigned' });
      return { ...base, changes: ch, effects: ['Updates 1 ticket'] };
    }
    case 'create_task':
      return { ...base, creates: ['Task: ' + _s(p.title || a.summary)], effects: ['Creates 1 task' + (p.project_id ? ' in a project' : '')] };
    case 'flag_capacity_risk':
      return { ...base, creates: ['Review task: ' + _s(p.person || p.name || 'a team member')], effects: ['Creates 1 review task'] };
    case 'create_contact':
      return { ...base, creates: ['Contact: ' + _s(p.full_name || p.name || a.summary)], effects: ['Adds 1 CRM contact'] };
    case 'create_deal':
      return { ...base, creates: ['Deal: ' + _s(p.title || a.summary)], blast: { ...base.blast, money: Number(p.value) > 0 ? Number(p.value) : 0 }, effects: ['Opens 1 pipeline deal'] };
    case 'draft_journal_entry': {
      const amt = Number(p.amount) || 0;
      return { ...base, creates: ['Ledger expense: $' + amt.toLocaleString() + ' → ' + _s(p.account || p.category || 'Uncategorized')], blast: { records: 1, money: amt, irreversible: false }, effects: ['Posts an expense to the ledger'], warnings: amt >= 1000 ? ['Posts $' + amt.toLocaleString() + ' to your books — confirm the amount.'] : [] };
    }
    case 'draft_onboarding': {
      const n = _taskCount(p);
      return { ...base, creates: ['~' + n + ' onboarding tasks' + (p.employee ? ' for ' + _s(p.employee) : '')], blast: { records: n, money: 0, irreversible: false }, effects: ['Creates a week-1 checklist'] };
    }
    case 'scaffold_project': {
      const n = _taskCount(p);
      return { ...base, creates: ['Project: ' + _s(p.name || a.summary), n + ' starter tasks'], blast: { records: 1 + n, money: 0, irreversible: false }, effects: ['Spins up a project + its tasks'] };
    }
    case 'scaffold_client_onboarding': {
      const n = _taskCount(p);
      const client = _s(p.client_name || p.name || a.summary);
      return { ...base, creates: ['Contact: ' + _s(p.contact_name || client), 'Project: ' + client + ' — Onboarding', n + ' onboarding tasks'], blast: { records: 2 + n, money: 0, irreversible: false }, effects: ['Onboards a client end-to-end'] };
    }
    case 'send_sms':
      return { ...base, blast: { records: 1, money: 0, irreversible: true }, effects: ['Sends 1 SMS to ' + _s(p.to)], warnings: ['This SMS cannot be unsent — the only agent action that is not reversible.'] };
    case 'draft_followup':
      return { ...base, blast: { records: 0, money: 0, irreversible: false }, effects: ['Drafts a follow-up for you to review and send'] };
    case 'log_activity':
      return { ...base, blast: { records: 1, money: 0, irreversible: false }, creates: [(_s(p.kind) === '—' ? 'Note' : _s(p.kind)) + ' on ' + (p.deal_id ? 'a deal' : p.contact_id ? 'a contact' : 'CRM')], effects: ['Logs 1 CRM activity', 'No money moves'] };
    case 'convert_lead':
      return { ...base, changes: [{ field: 'Lead status', from: _s(p.from_status) === '—' ? 'open' : _s(p.from_status), to: 'converted' }], creates: ['Client created from the lead'], blast: { records: 2, money: 0, irreversible: false }, effects: ['Creates a client + marks the lead converted'], warnings: ['Reversible: removes the new client and restores the lead.'] };
    case 'post_comment':
      return { ...base, creates: ['Comment on ' + _s(p.entity_type || 'task')], blast: { records: 1, money: 0, irreversible: false }, effects: ['Posts 1 comment'] };
    case 'set_reminder':
      return { ...base, creates: ['Reminder: ' + _s(p.note || a.summary)], blast: { records: 1, money: 0, irreversible: false }, effects: ['Sets 1 reminder' + (p.remind_at ? ' for ' + _s(p.remind_at) : '')] };
    case 'draft_job_posting':
      return { ...base, creates: ['Job description: ' + _s(p.title || a.summary)], blast: { records: 1, money: 0, irreversible: false }, effects: ['Drafts 1 job description for review'] };
    default: {
      const ch: SimChange[] = [];
      for (const k of Object.keys(p)) { if (k.startsWith('to_')) ch.push({ field: k.slice(3).replace(/_/g, ' '), from: _s(p['from_' + k.slice(3)]), to: _s(p[k]) }); }
      return { ...base, changes: ch, creates: ch.length ? [] : [a.summary], effects: [a.reversible ? 'One-click reversible' : 'Not reversible'] };
    }
  }
}

// Phase 3.5 graduated autonomy: an action may auto-execute (no human approval) ONLY
// when the agent is in auto_low_risk mode AND the action is low-risk + reversible AND
// the tool is not flagged noAuto (e.g. financial). The DB RPC re-enforces this.
export function canAutoExecute(autonomyLevel: string | undefined, a: AgentAction): boolean {
  if (autonomyLevel !== 'auto_low_risk') return false;
  if (a.risk !== 'low' || !a.reversible) return false;
  if (toolByKey(a.tool_key)?.noAuto) return false;
  return !!EXECUTORS[a.tool_key];
}

// ---------------------------------------------------------------------------
// Chat Commands dispatch (Slice 1). A "#keyword <args>" message routes through an
// enabled agent and ALWAYS creates a PROPOSED action (approval-gated) via the
// member-safe agent_request_command_action RPC — it never executes or auto-approves
// here. Honours per-command RBAC. If no agent can run the tool, or the user isn't
// allowed, it returns a hint and creates nothing. (Auto-run/override + NL 'prompt'
// commands arrive in Slice 2.)
// ---------------------------------------------------------------------------
export type ChatCommandResult = { status: 'queued' | 'executed' | 'hint'; note: string };

// Auto-run is allowed ONLY for low-risk, reversible, non-financial tool actions.
export function chatAutoEligible(toolKey: string): boolean {
  const t = toolByKey(toolKey);
  return !!t && t.risk === 'low' && t.reversible === true && !t.noAuto && !!EXECUTORS[toolKey];
}

export async function dispatchChatCommand(
  cmd: ChatCommand, args: string,
  ctx: { orgId: string; userId: string; canManage: boolean; canApprove: boolean; projectId: string | null; brand?: string },
): Promise<ChatCommandResult> {
  // Resolve an enabled agent for this command's domain (prefer the same domain).
  const pickAgent = async (needTool?: string): Promise<AgentDefinition | null> => {
    let agents: AgentDefinition[] = [];
    try { agents = (await listAgents(ctx.orgId)).filter((a) => a.enabled); } catch { return null; }
    const ordered = [...agents.filter((a) => a.domain === cmd.domain), ...agents.filter((a) => a.domain !== cmd.domain)];
    if (!needTool) return ordered[0] || null;
    for (const a of ordered) {
      try { const tools = await listAgentTools(a.id); if (tools.some((t) => t.tool_key === needTool)) return a; } catch { /* next */ }
    }
    return null;
  };

  // ----- Custom natural-language command (kind='prompt') -> LLM proposer -----
  // The proposer is manage-gated and its output varies, so prompt commands are
  // manager-only and ALWAYS go to approval (never auto).
  if (cmd.kind === 'prompt') {
    if (!ctx.canManage) return { status: 'hint', note: `"#${cmd.keyword}" runs an AI agent and is limited to agent managers.` };
    const agent = await pickAgent();
    if (!agent) return { status: 'hint', note: `No enabled agent to run "#${cmd.keyword}". Create one on the Agents page.` };
    let granted: string[] = [];
    try { granted = (await listAgentTools(agent.id)).map((t) => t.tool_key); } catch { /* none */ }
    const tools = AGENT_TOOLS.filter((t) => granted.includes(t.key)).map((t) => ({ key: t.key, label: t.label, description: t.description, risk: t.risk, reversible: t.reversible }));
    if (tools.length === 0) return { status: 'hint', note: `The agent for "#${cmd.keyword}" has no tools granted yet - add some on the Agents page.` };
    const request = `${cmd.instruction || cmd.label}${args ? `: ${args}` : ''}`.slice(0, 1000);
    let res: { configured?: boolean; proposed?: number; error?: string };
    try { res = await runAgentProposer({ orgId: ctx.orgId, agentId: agent.id, request, tools, brand: ctx.brand || '' }); }
    catch (e: any) { return { status: 'hint', note: e?.message || 'Could not run the command.' }; }
    if (res.configured === false) return { status: 'hint', note: 'No AI key connected yet - set one under Console > AI assistant to use natural-language commands.' };
    if (res.error) return { status: 'hint', note: `Could not run that: ${res.error}` };
    if ((res.proposed || 0) > 0) return { status: 'queued', note: `Proposed ${res.proposed} action${res.proposed === 1 ? '' : 's'} for "#${cmd.keyword}" - review in Agent Approvals.` };
    return { status: 'hint', note: `"#${cmd.keyword}" did not produce any actions for that input.` };
  }

  // ----- Deterministic tool command (kind='tool') -----
  if (!cmd.tool_key) return { status: 'hint', note: `"#${cmd.keyword}" is not fully configured.` };
  if (cmd.who_can_use === 'managers' && !ctx.canManage) return { status: 'hint', note: `"#${cmd.keyword}" is restricted to agent managers.` };
  const built = buildToolPayload(cmd.tool_key, args, ctx.projectId);
  if ('error' in built) return { status: 'hint', note: built.error };
  const agent = await pickAgent(cmd.tool_key);
  if (!agent) return { status: 'hint', note: `No agent is set up to run "#${cmd.keyword}". Add the ${cmd.tool_key} tool to an enabled agent on the Agents page.` };

  // Always create a PROPOSED action first (member-safe; approval-gated).
  const actionId = await requestChatCommandAction({
    orgId: ctx.orgId, agentId: agent.id, toolKey: cmd.tool_key, domain: cmd.domain,
    summary: built.summary, payload: built.payload, risk: built.risk, reversible: built.reversible,
    requireManage: cmd.who_can_use === 'managers',
  });

  // Admin auto-override: skip the human approval click ONLY for an auto-eligible
  // (low-risk, reversible, non-financial) action AND only when the caller can
  // approve. This is NOT a bypass: it records a real approval (decideAgentAction,
  // approve-capped) then executes via the normal RLS-enforced executor, fully
  // audited and one-click reversible. Anything else falls back to pending.
  if (cmd.approval === 'auto' && chatAutoEligible(cmd.tool_key) && ctx.canApprove) {
    const ex = executorFor(cmd.tool_key);
    if (ex) {
      try {
        await decideAgentAction(actionId, 'approved', 'Auto-run (chat command policy)');
        const a: AgentAction = {
          id: actionId, org_id: ctx.orgId, run_id: null, agent_id: agent.id, tool_key: cmd.tool_key, domain: cmd.domain,
          summary: built.summary, payload: built.payload, risk: built.risk, reversible: built.reversible, status: 'approved',
          target_table: null, target_id: null, result: null, reversal: null, prior_state: null, proposed_at: '',
          decided_by: null, decided_at: null, decision_note: null, executed_by: null, executed_at: null,
          rolled_back_by: null, rolled_back_at: null, expires_at: null,
        };
        const r = await ex.execute(a, { orgId: ctx.orgId, userId: ctx.userId });
        await recordAgentExecution(actionId, r.target_table, r.target_id, r.result, r.reversal, r.prior_state);
        return { status: 'executed', note: `Done (auto-run, one-click reversible): ${built.summary}.` };
      } catch {
        return { status: 'queued', note: `Queued for approval: ${built.summary} (auto-run could not complete - review in Agent Approvals).` };
      }
    }
  }
  return { status: 'queued', note: `Queued for approval: ${built.summary} - review it in Agent Approvals.` };
}
