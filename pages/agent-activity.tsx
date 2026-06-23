import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { AGENT_DOMAINS } from '@/lib/agents';
import { computeRoi, minutesSavedFor, DEFAULT_LABOR_RATE_USD, AgentRoiSummary } from '@/lib/agentRoi';
import {
  listAgents, listAgentActions, agentRoiSummary, agentUsageCost,
  AgentDefinition, AgentAction, AgentUsageCost,
} from '@/lib/db';

const STATUS_COLOR: Record<string, string> = {
  proposed: '#d97706', approved: '#0284c7', executing: '#0284c7', executed: '#16a34a',
  rejected: '#6b7280', rolled_back: '#7c3aed', failed: '#dc2626', expired: '#6b7280',
};
const chip = (text: string, color: string) => (
  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: color + '1f', color, boxShadow: `inset 0 0 0 1px ${color}33` }}>{text}</span>
);
const money = (n: number) => '$' + Math.round(n).toLocaleString();
const WINDOWS = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }];

const COLS: ColDef[] = [
  { id: 'summary', label: 'Action', locked: true },
  { id: 'domain', label: 'Domain' },
  { id: 'agent', label: 'Agent' },
  { id: 'status', label: 'Status' },
  { id: 'value', label: 'Est. value', width: 100 },
  { id: 'when', label: 'When' },
];
const FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [
    { value: 'all', label: 'All' }, { value: 'executed', label: 'Executed' }, { value: 'proposed', label: 'Pending' },
    { value: 'rolled_back', label: 'Rolled back' }, { value: 'rejected', label: 'Rejected' },
  ] },
];

export default function AgentActivityPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'agents');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canSee = isAdmin || !!me?.can_manage_agents || !!me?.can_approve_agent_actions;

  const [summary, setSummary] = useState<AgentRoiSummary | null>(null);
  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [cost, setCost] = useState<AgentUsageCost | null>(null);
  const [days, setDays] = useState(30);
  const [rate, setRate] = useState(DEFAULT_LABOR_RATE_USD);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.agentactivity.cols', COLS);

  useEffect(() => {
    try { const v = window.localStorage.getItem('snrpmo.agentroi.rate'); if (v) setRate(Number(v) || DEFAULT_LABOR_RATE_USD); } catch { /* ignore */ }
  }, []);
  const updateRate = (n: number) => { setRate(n); try { window.localStorage.setItem('snrpmo.agentroi.rate', String(n)); } catch { /* ignore */ } };

  const load = () => {
    if (!org) return;
    agentRoiSummary(org.id, days).then(setSummary).catch((e) => { setErr(e.message); setSummary(null); });
    listAgentActions(org.id).then(setActions).catch(() => setActions([]));
    listAgents(org.id).then(setAgents).catch(() => {});
    agentUsageCost(org.id).then(setCost).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled && canSee) load(); /* eslint-disable-next-line */ }, [org?.id, enabled, canSee, days]);

  const roi = useMemo(() => computeRoi(summary, rate, cost?.amount ?? 0), [summary, rate, cost]);
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || '—';
  const domLabel = (d: string) => AGENT_DOMAINS.find((x) => x.key === d)?.label || titleCase(d);
  const domIcon = (d: string) => AGENT_DOMAINS.find((x) => x.key === d)?.icon || 'ti-robot';

  const statusF = prefs.filters.status || 'all';
  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    return (actions || []).filter((a) =>
      (statusF === 'all' || a.status === statusF) &&
      (!q || `${a.summary} ${a.tool_key} ${a.domain}`.toLowerCase().includes(q))
    );
  }, [actions, statusF, prefs.query]);
  const rs = useRowSelection(shown);
  const GROUPS: GroupMeta[] = AGENT_DOMAINS.map((d) => ({ value: d.key, label: d.label, color: '#6b7280' }));

  const rowValue = (a: AgentAction) => a.executed_at ? minutesSavedFor(a.tool_key, a.domain) / 60 * rate : 0;
  const cell = (id: string, a: AgentAction) => {
    switch (id) {
      case 'summary': return <span className="font-medium text-content">{a.summary}</span>;
      case 'domain': return <span className="text-xs text-muted inline-flex items-center gap-1"><Icon name={domIcon(a.domain)} className="text-sm" />{domLabel(a.domain)}</span>;
      case 'agent': return <span className="text-sm">{agentName(a.agent_id)}</span>;
      case 'status': return chip(titleCase(a.status.replace('_', ' ')), STATUS_COLOR[a.status] || '#6b7280');
      case 'value': return a.executed_at ? <span className="tnum text-emerald-600 font-medium">{money(rowValue(a))}</span> : <span className="text-muted2">—</span>;
      case 'when': return (a.executed_at || a.decided_at || a.proposed_at)?.slice(0, 16).replace('T', ' ') || '—';
      default: return '—';
    }
  };

  if (!enabled) return (
    <Layout flat title="Agent activity">
      <EmptyState icon="ti-robot" title="AI Agents not in your plan" text="Upgrade to put agents to work and track the time + money they save." />
    </Layout>
  );
  if (!canSee) return (
    <Layout flat title="Agent activity">
      <PageHeader help="agents" title="Agent activity & ROI" icon="ti-chart-line" />
      <EmptyState icon="ti-lock" title="Restricted" text="Agent activity is visible to agent managers and approvers. Ask an admin for the Manage agents or Approve agent actions permission." />
    </Layout>
  );

  const maxDomVal = Math.max(1, ...roi.perDomain.map((d) => d.value));
  const hasActivity = roi.executed > 0 || (summary?.actions_total || 0) > 0;

  return (
    <Layout flat title="Agent activity">
      <PageHeader help="agents" title="Agent activity & ROI" subtitle="The time and money your agents save — measured, with every action auditable and reversible" icon="ti-chart-line"
        action={<div className="flex items-center gap-2">
          <Link href="/agents" className="btn btn-sm"><Icon name="ti-robot" />Agents</Link>
          <Link href="/agent-approvals" className="btn btn-sm"><Icon name="ti-checks" />Approvals</Link>
        </div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg bg-surface2 p-0.5">
          {WINDOWS.map((w) => (
            <button key={w.d} onClick={() => setDays(w.d)} className={`px-3 py-1 text-xs font-medium rounded-md transition ${days === w.d ? 'bg-accent text-accentfg' : 'text-muted hover:text-content'}`}>{w.label}</button>
          ))}
        </div>
        <label className="text-xs text-muted inline-flex items-center gap-2">
          Blended rate
          <span className="inline-flex items-center rounded-md bg-surface2 px-2 py-1">
            <span className="text-muted2">$</span>
            <input type="number" min={0} value={rate} onChange={(e) => updateRate(Number(e.target.value) || 0)} className="w-14 bg-transparent text-content text-right outline-none tnum" />
            <span className="text-muted2">/hr</span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Actions executed" value={String(roi.executed)} hint={`${roi.autoPct}% ran automatically`} icon="ti-bolt" />
        <StatCard label="Time saved" value={`${roi.hoursSaved.toFixed(1)} h`} hint="est. hands-on work avoided" icon="ti-clock-hour-4" />
        <StatCard label="Value created" value={money(roi.valueCreated)} hint={`net ${money(roi.net)} after agent cost`} hintTone={roi.net >= 0 ? 'up' : 'down'} icon="ti-coin" />
        <StatCard label="Reliability" value={`${roi.reliabilityPct}%`} hint={roi.rolledBack > 0 ? `${roi.rolledBack} rolled back` : 'none rolled back'} hintTone={roi.rolledBack > 0 ? 'down' : 'up'} icon="ti-shield-check" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Pending approvals" value={String(summary?.pending_total ?? 0)} icon="ti-clock" />
        <StatCard label="Auto-executed" value={String(roi.autoExecuted)} hint="low-risk, reversible" icon="ti-wand" />
        <StatCard label="Active agents" value={String(summary?.active_agents ?? 0)} icon="ti-robot" />
        <StatCard label="Est. agent cost" value={money(roi.spend)} hint="metered runs + tokens" icon="ti-receipt" />
      </div>

      {!hasActivity && (
        <div className="card p-5 mb-5 flex flex-wrap items-center justify-between gap-3 border border-dashed border-line">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Icon name="ti-sparkles" className="text-accent" />No agent activity in this window yet</h3>
            <p className="text-xs text-muted mt-1">Put your agents to work — they propose real actions from your own data, no AI key required. Every action stays auditable and one-click reversible.</p>
          </div>
          <Link href="/agents" className="btn btn-primary shrink-0"><Icon name="ti-search" />Find work for my agents</Link>
        </div>
      )}

      {roi.perDomain.length > 0 && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Where agents create value</h3>
            <span className="text-2xs text-muted2">last {days} days · est. at ${rate}/hr</span>
          </div>
          <div className="space-y-2.5">
            {roi.perDomain.map((d) => (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-muted inline-flex items-center gap-1.5"><Icon name={domIcon(d.domain)} className="text-sm" />{domLabel(d.domain)}</span>
                <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (d.value / maxDomVal) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs"><span className="tnum font-medium text-content">{money(d.value)}</span> <span className="text-muted2">· {d.executed}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ListView
        rows={actions === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={FILTERS}
        searchPlaceholder="Search agent actions…"
        groupField={{ value: 'domain', label: 'Domain' }}
        groupOf={(a) => a.domain}
        groups={GROUPS}
        exportName="agent-activity"
        exportValue={(id, a) => id === 'summary' ? a.summary : id === 'domain' ? a.domain : id === 'agent' ? agentName(a.agent_id) : id === 'status' ? a.status : id === 'value' ? String(Math.round(rowValue(a))) : id === 'when' ? (a.executed_at || a.proposed_at || '') : ''}
        emptyIcon="ti-chart-line"
        emptyText="No agent actions yet. Agents propose actions from your data — review them under Approvals."
      />
    </Layout>
  );
}
