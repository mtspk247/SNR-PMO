import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { DataList, GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { AGENT_DOMAINS, AUTONOMY_LABELS, toolByKey } from '@/lib/agents';
import { computeRoi, minutesSavedFor, DEFAULT_LABOR_RATE_USD, AgentRoiSummary } from '@/lib/agentRoi';
import {
  listAgents, listAgentActions, agentRoiSummary, agentUsageCost, agentReport,
  AgentDefinition, AgentAction, AgentUsageCost, AgentReportRow,
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

const RCOLS: ColDef[] = [
  { id: 'agent', label: 'Agent', locked: true },
  { id: 'domain', label: 'Domain', width: 110 },
  { id: 'executed', label: 'Done', width: 70 },
  { id: 'rolled', label: 'Rolled back', width: 92 },
  { id: 'reliability', label: 'Reliability', width: 88 },
  { id: 'time', label: 'Time saved', width: 92 },
  { id: 'net', label: 'Net value', width: 90 },
  { id: 'runs', label: 'Runs', width: 66 },
  { id: 'cost', label: 'Cost', width: 74 },
  { id: 'last', label: 'Last active', width: 100 },
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
  const [report, setReport] = useState<AgentReportRow[] | null>(null);
  const [selReport, setSelReport] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [rate, setRate] = useState(DEFAULT_LABOR_RATE_USD);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.agentactivity.cols', COLS);
  const prefsR = useListPrefs('snrpmo.agentreport.cols', RCOLS);

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
    agentReport(org.id, days).then(setReport).catch(() => setReport([]));
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

  // ---- Per-agent report: complete record for every agent (like a user report) ----
  const rHours = (r: AgentReportRow) => r.by_tool.reduce((m, t) => m + t.executed * minutesSavedFor(t.tool_key, t.domain), 0) / 60;
  const rValue = (r: AgentReportRow) => rHours(r) * rate;
  const rNet = (r: AgentReportRow) => rValue(r) - (Number(r.usd) || 0);
  const rReliability = (r: AgentReportRow) => { const d = r.executed + r.rolled_back; return d > 0 ? Math.round((r.executed / d) * 100) : 100; };
  const cellR = (id: string, r: AgentReportRow) => {
    switch (id) {
      case 'agent': return <span className="inline-flex items-center gap-2 font-medium text-content">{r.name}{r.builtin && <span className="text-2xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500">System</span>}{r.archived_at ? <span className="text-2xs px-1.5 py-0.5 rounded bg-surface2 text-muted2">Archived</span> : !r.enabled ? <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">Paused</span> : null}</span>;
      case 'domain': return <span className="text-xs text-muted inline-flex items-center gap-1"><Icon name={domIcon(r.domain)} className="text-sm" />{domLabel(r.domain)}</span>;
      case 'executed': return <span className="tnum font-medium">{r.executed}</span>;
      case 'rolled': return r.rolled_back > 0 ? <span className="tnum text-violet-600">{r.rolled_back}</span> : <span className="text-muted2">0</span>;
      case 'reliability': { const p = rReliability(r); return <span className={`tnum font-medium ${p >= 90 ? 'text-emerald-600' : p >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>{p}%</span>; }
      case 'time': return <span className="tnum">{rHours(r).toFixed(1)} h</span>;
      case 'net': { const n = rNet(r); return <span className={`tnum font-medium ${n >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(n)}</span>; }
      case 'runs': return <span className="tnum">{r.runs}</span>;
      case 'cost': return <span className="tnum text-muted">${(Number(r.usd) || 0).toFixed(2)}</span>;
      case 'last': return <span className="text-xs text-muted">{r.last_at ? r.last_at.slice(0, 10) : '—'}</span>;
      default: return '—';
    }
  };
  const rawR = (id: string, r: AgentReportRow) =>
    id === 'agent' ? r.name : id === 'domain' ? r.domain : id === 'executed' ? String(r.executed)
    : id === 'rolled' ? String(r.rolled_back) : id === 'reliability' ? String(rReliability(r))
    : id === 'time' ? rHours(r).toFixed(2) : id === 'net' ? String(Math.round(rNet(r)))
    : id === 'runs' ? String(r.runs) : id === 'cost' ? String(r.usd) : id === 'last' ? (r.last_at || '') : '';
  const exportReport = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const head = ['Agent', 'Domain', 'Autonomy', 'Executed', 'Rolled back', 'Rejected', 'Pending', 'Auto', 'Reliability %', 'Hours saved', 'Value $', 'Cost $', 'Net $', 'Runs', 'Tokens', 'First active', 'Last active'];
    const lines = (report || []).map((r) => [r.name, r.domain, r.autonomy_level, r.executed, r.rolled_back, r.rejected, r.pending, r.auto_executed, rReliability(r), rHours(r).toFixed(1), Math.round(rValue(r)), (Number(r.usd) || 0).toFixed(2), Math.round(rNet(r)), r.runs, r.tokens, r.first_at?.slice(0, 10) || '', r.last_at?.slice(0, 10) || ''].map((x) => esc(String(x))).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agent-report-${days}d.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const selRow = (report || []).find((r) => r.agent_id === selReport) || null;

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

      {report && report.length > 0 && (
        <div className="card p-5 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-id-badge-2" className="text-accent" />Agent team — individual reports</h3>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-muted2">last {days} days · click a row for the full record</span>
              <button className="btn btn-sm" onClick={exportReport}><Icon name="ti-download" />CSV</button>
            </div>
          </div>
          <DataList rows={report} rowKey={(r) => r.agent_id} cols={RCOLS} prefs={prefsR} cell={cellR} rawValue={rawR}
            onRowClick={(r) => setSelReport(selReport === r.agent_id ? null : r.agent_id)} />
          {selRow && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-content">{selRow.name}</span>
                {selRow.builtin && <span className="text-2xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500">System</span>}
                <span className="text-2xs text-muted">{domLabel(selRow.domain)} · {AUTONOMY_LABELS[selRow.autonomy_level] || selRow.autonomy_level}</span>
                {selRow.first_at && <span className="text-2xs text-muted2">· active since {selRow.first_at.slice(0, 10)}</span>}
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Proposed</p><p className="text-sm tnum font-medium">{selRow.proposed_total}</p></div>
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Pending</p><p className="text-sm tnum font-medium">{selRow.pending}</p></div>
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Rejected</p><p className="text-sm tnum font-medium">{selRow.rejected}</p></div>
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Auto-executed</p><p className="text-sm tnum font-medium">{selRow.auto_executed}</p></div>
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Runs (done)</p><p className="text-sm tnum font-medium">{selRow.runs}<span className="text-muted2"> ({selRow.runs_completed})</span></p></div>
                <div><p className="text-2xs text-muted2 uppercase tracking-wide">Tokens</p><p className="text-sm tnum font-medium">{selRow.tokens.toLocaleString()}</p></div>
              </div>
              {selRow.by_tool.length > 0 && (
                <div className="mb-4">
                  <p className="text-2xs text-muted2 uppercase tracking-wide mb-2">Work by skill</p>
                  <div className="space-y-2">
                    {selRow.by_tool.map((t) => { const mx = Math.max(1, ...selRow.by_tool.map((x) => x.executed)); return (
                      <div key={t.tool_key} className="flex items-center gap-3">
                        <span className="w-56 shrink-0 text-xs text-muted truncate">{toolByKey(t.tool_key)?.label || t.tool_key}</span>
                        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (t.executed / mx) * 100)}%` }} /></div>
                        <span className="w-16 shrink-0 text-right text-xs tnum">{t.executed}<span className="text-muted2"> · {(t.executed * minutesSavedFor(t.tool_key, t.domain) / 60).toFixed(1)}h</span></span>
                      </div>
                    ); })}
                  </div>
                </div>
              )}
              <div>
                <p className="text-2xs text-muted2 uppercase tracking-wide mb-2">Recent actions</p>
                <div className="space-y-1.5">
                  {(actions || []).filter((a) => a.agent_id === selRow.agent_id).slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      {chip(titleCase(a.status.replace('_', ' ')), STATUS_COLOR[a.status] || '#6b7280')}
                      <span className="truncate text-content">{a.summary}</span>
                      <span className="ml-auto shrink-0 text-muted2">{(a.executed_at || a.proposed_at)?.slice(0, 10)}</span>
                    </div>
                  ))}
                  {(actions || []).filter((a) => a.agent_id === selRow.agent_id).length === 0 && <p className="text-xs text-muted2">No recent actions in the loaded window.</p>}
                </div>
                <Link href="/agent-approvals" className="inline-flex items-center gap-1 mt-2 text-2xs text-accentstrong hover:underline"><Icon name="ti-arrow-right" className="text-2xs" />Full audit trail in Approvals</Link>
              </div>
            </div>
          )}
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
