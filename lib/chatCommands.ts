// lib/chatCommands.ts — Chat Commands: parse "#keyword <args>" and turn args into an
// agent action payload. PURE (no I/O) so it is unit-testable. Command DEFINITIONS live
// in the DB (snrpmo.agent_chat_commands); this file holds only the command-LINE parser
// and the per-tool arg->payload builders (logic that can't live in a data row).
import type { RiskLevel } from './agents';

export type ChatCommand = {
  id: string; org_id: string; keyword: string; label: string; description: string | null;
  kind: 'tool' | 'prompt'; tool_key: string | null; domain: string; instruction: string | null;
  who_can_use: 'managers' | 'members'; approval: 'always' | 'auto'; is_builtin: boolean; enabled: boolean;
};

// Parse the composer line into { keyword (lowercased, no #), args }. Accepts # or /.
export function parseCommandLine(body: string): { keyword: string; args: string } | null {
  const m = body.match(/^[#/]([a-z0-9][a-z0-9_-]{0,30})\b[ \t:>-]*([\s\S]*)$/i);
  if (!m) return null;
  return { keyword: m[1].toLowerCase(), args: (m[2] || '').trim() };
}

export type BuiltPayload =
  | { payload: Record<string, any>; risk: RiskLevel; reversible: boolean; summary: string }
  | { error: string };

// Tools whose payload can be built deterministically from free chat text (Slice 1).
// Tools needing a resolved target id (move a specific deal / triage a ticket) are handled
// by NL 'prompt' commands in Slice 2.
export const CHAT_TOOLABLE = ['create_task', 'draft_onboarding', 'draft_journal_entry'];

export function buildToolPayload(toolKey: string, args: string, projectId: string | null): BuiltPayload {
  const a = (args || '').trim();
  switch (toolKey) {
    case 'create_task': {
      if (!a) return { error: 'Add a task title, e.g. #task Follow up with Acme' };
      return { payload: { title: a.slice(0, 200), project_id: projectId }, risk: 'low', reversible: true, summary: `Create task: ${a.slice(0, 120)}` };
    }
    case 'draft_onboarding': {
      if (!a) return { error: 'Add a name, e.g. #onboard Jordan Lee' };
      return { payload: { employee: a.slice(0, 120) }, risk: 'low', reversible: true, summary: `Draft week-1 onboarding for ${a.slice(0, 80)}` };
    }
    case 'draft_journal_entry': {
      const m = a.match(/(\d+(?:[.,]\d{1,2})?)/);
      if (!m) return { error: 'Add an amount, e.g. #expense 512.40 AWS hosting' };
      const amount = parseFloat(m[1].replace(',', '.'));
      if (!isFinite(amount) || amount <= 0) return { error: 'Amount must be a positive number, e.g. #expense 512.40 AWS hosting' };
      const idx = m.index || 0;
      const desc = (a.slice(0, idx) + a.slice(idx + m[1].length)).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Expense';
      return { payload: { amount, account: desc, category: desc }, risk: 'high', reversible: true, summary: `Draft journal entry: ${desc} ($${amount})` };
    }
    default: {
      // Generic free-text fallback (custom command mapping to a draft-style tool).
      return { payload: { title: a.slice(0, 200), text: a.slice(0, 500), project_id: projectId }, risk: 'low', reversible: true, summary: a ? a.slice(0, 120) : 'Run command' };
    }
  }
}
