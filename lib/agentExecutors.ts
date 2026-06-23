// lib/agentExecutors.ts — Phase 3.2 domain executors.
// CRITICAL (compete plan §4): an executor performs the real business write through
// the SAME db.ts functions a human uses, running CLIENT-SIDE as the approving user,
// so the write is subject to that user's RLS + RBAC — the agent never bypasses.
// Each executor returns target + reversal so the action becomes rollback-able.
import { createTask, deleteTask, updateDeal, createLedgerEntry, deleteLedgerEntry, AgentAction } from './db';

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
};

export const executorFor = (toolKey: string): Executor | undefined => EXECUTORS[toolKey];
