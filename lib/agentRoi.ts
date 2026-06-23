// lib/agentRoi.ts — transparent, tunable ROI math for the Agent Activity view.
// Pure (type-only imports) so it is unit-testable and the assumptions are auditable.
// Turns executed-action counts (from the agent_roi_summary RPC) into an estimated
// time + money value, netted against real metered agent spend. No side effects.
import type { AgentDomainKey } from './agents';

// Conservative minutes a competent person would spend doing each action BY HAND.
// Deliberately modest so the headline value is defensible, never inflated.
export const MINUTES_SAVED_BY_TOOL: Record<string, number> = {
  draft_journal_entry: 12,
  categorize_expense: 3,
  create_task: 4,
  summarize_project: 15,
  triage_task: 3,
  draft_followup: 8,
  update_deal_stage: 2,
  draft_onboarding: 20,
  route_leave_request: 3,
  triage_ticket: 4,
  draft_reply: 8,
};
// Fallback when a tool isn't in the catalog (e.g. future scanners), by domain.
export const MINUTES_SAVED_BY_DOMAIN: Record<AgentDomainKey, number> = {
  accounting: 8, tasks: 5, crm: 6, hr: 12, support: 6, general: 6,
};
export const DEFAULT_MINUTES_SAVED = 5;
// Blended back-office labour rate (USD/hour). Tunable per-viewer in the UI.
export const DEFAULT_LABOR_RATE_USD = 45;

export const minutesSavedFor = (toolKey: string, domain: string): number =>
  MINUTES_SAVED_BY_TOOL[toolKey]
  ?? MINUTES_SAVED_BY_DOMAIN[domain as AgentDomainKey]
  ?? DEFAULT_MINUTES_SAVED;

export type RoiByTool = { tool_key: string; domain: string; executed: number };
export type AgentRoiSummary = {
  period_days: number; since: string;
  actions_total: number; executed_total: number; auto_executed: number;
  rolled_back_total: number; pending_total: number;
  totals: Record<string, number>;
  by_tool: RoiByTool[];
  by_domain: { domain: string; executed: number; proposed: number }[];
  by_agent: { agent_id: string | null; executed: number }[];
  runs: { total: number; completed: number; failed: number; cost_usd: number; cost_tokens: number };
  active_agents: number;
};

export type RoiDomainRow = { domain: string; executed: number; minutes: number; value: number };
export type RoiComputed = {
  executed: number; autoExecuted: number; autoPct: number;
  rolledBack: number; rollbackPct: number; reliabilityPct: number;
  minutesSaved: number; hoursSaved: number;
  valueCreated: number; spend: number; net: number; roiX: number | null;
  perDomain: RoiDomainRow[];
};

// executed-action counts -> estimated saved time + money, netted vs real spend.
export function computeRoi(s: AgentRoiSummary | null, rateUsd = DEFAULT_LABOR_RATE_USD, spendUsd = 0): RoiComputed {
  const empty: RoiComputed = {
    executed: 0, autoExecuted: 0, autoPct: 0, rolledBack: 0, rollbackPct: 0, reliabilityPct: 100,
    minutesSaved: 0, hoursSaved: 0, valueCreated: 0, spend: spendUsd, net: -spendUsd, roiX: null, perDomain: [],
  };
  if (!s) return empty;
  const byTool = s.by_tool || [];
  let minutes = 0;
  const domAgg: Record<string, { executed: number; minutes: number }> = {};
  for (const t of byTool) {
    const m = minutesSavedFor(t.tool_key, t.domain) * (t.executed || 0);
    minutes += m;
    const d = domAgg[t.domain] || (domAgg[t.domain] = { executed: 0, minutes: 0 });
    d.executed += t.executed || 0; d.minutes += m;
  }
  const hours = minutes / 60;
  const valueCreated = hours * rateUsd;
  const executed = s.executed_total || 0;
  const spend = spendUsd || (s.runs?.cost_usd ?? 0);
  const net = valueCreated - spend;
  const rolledBack = s.rolled_back_total || 0;
  const perDomain: RoiDomainRow[] = Object.entries(domAgg)
    .map(([domain, v]) => ({ domain, executed: v.executed, minutes: v.minutes, value: (v.minutes / 60) * rateUsd }))
    .sort((a, b) => b.value - a.value);
  return {
    executed,
    autoExecuted: s.auto_executed || 0,
    autoPct: executed ? Math.round(((s.auto_executed || 0) / executed) * 100) : 0,
    rolledBack,
    rollbackPct: (executed + rolledBack) ? Math.round((rolledBack / (executed + rolledBack)) * 100) : 0,
    reliabilityPct: (executed + rolledBack) ? Math.round((executed / (executed + rolledBack)) * 100) : 100,
    minutesSaved: minutes, hoursSaved: hours,
    valueCreated, spend, net,
    roiX: spend > 0 ? valueCreated / spend : null,
    perDomain,
  };
}
