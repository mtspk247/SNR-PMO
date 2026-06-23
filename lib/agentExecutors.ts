// lib/agentExecutors.ts — Phase 3.2 domain executors.
// CRITICAL (compete plan §4): an executor performs the real business write through
// the SAME db.ts functions a human uses, running CLIENT-SIDE as the approving user,
// so the write is subject to that user's RLS + RBAC — the agent never bypasses.
// Each executor returns target + reversal so the action becomes rollback-able.
import { createTask, deleteTask, updateTask, updateDeal, createLedgerEntry, updateLedgerEntry, deleteLedgerEntry, assignTicket, setTicketStatus, AgentAction } from './db';
import { toolByKey } from './agents';

export type ExecCtx = { orgId: string; userId: string };
export type ExecResult = { target_table: string; target_id: string | null; result?: any; reversal?: any; prior_state?: any };
export type Executor = {
  label: string;                                           // verb shown on the Approve button
  execute: (a: AgentAction, ctx: ExecCtx) => Promise<ExecResult>;
  rollback?: (a: AgentAction, ctx: ExecCtx) => Promise<void>;
};

export const EXECUTORS: Record<string, Executor> = {
  // CREATE pattern — reversible by deleting the created row. Fully demonstrable.
  create_task: {
    label: 'Create the task',
    execute: async (a, ctx) => {
      const p = a.payload || {};
      const due = typeof p.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : null;
      const name = String(p.title || a.summary || 'New task').slice(0, 200);
      const t = await createTask({ name, org_id: ctx.orgId, due_date: due });
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
};

export const executorFor = (toolKey: string): Executor | undefined => EXECUTORS[toolKey];

// Phase 3.5 graduated autonomy: an action may auto-execute (no human approval) ONLY
// when the agent is in auto_low_risk mode AND the action is low-risk + reversible AND
// the tool is not flagged noAuto (e.g. financial). The DB RPC re-enforces this.
export function canAutoExecute(autonomyLevel: string | undefined, a: AgentAction): boolean {
  if (autonomyLevel !== 'auto_low_risk') return false;
  if (a.risk !== 'low' || !a.reversible) return false;
  if (toolByKey(a.tool_key)?.noAuto) return false;
  return !!EXECUTORS[a.tool_key];
}
