import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, Spinner } from '@/components/ui';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { titleCase } from '@/lib/format';
import { AGENT_DOMAINS, AUTONOMY_LABELS, toolByKey, RISK_COLOR } from '@/lib/agents';
import { minutesSavedFor, DEFAULT_LABOR_RATE_USD } from '@/lib/agentRoi';
import {
  agentReport, AgentReportRow, listAgentActionsByAgent, listAgentActionEvents,
  AgentAction, AgentActionEvent,
} from '@/lib/db';

// Agent profile — the complete, auditable record for ONE agent, mirroring a human
// teammate's report: identity + autonomy, KPIs, what it suggested by category, and
// its FULL action history with per-action payload/result/decision + audit timeline.
// Reads ride the existing RLS walls (agent_actions/aa_sel, events/aae_sel); no new
// server surface. Visible to agent managers & approvers (same gate as Activity & ROI).

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
  { id: 'tool', label: 'Skill' },
  { id: 'domain', label: 'Category', width: 110 },
  { id: 'status', label: 'Status', width: 100 },
  { id: 'risk', label: 'Risk', width: 80 },
  { id: 'value', label: 'Est. value', width: 92 },
  { id: 'proposed', label: 'Suggested', width: 120 },
  { id: 'executed', label: 'Executed', width: 120 },
];
const FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [
    { value: 'all', label: 'All' }, { value: 'executed', label: 'Executed' }, { value: 'proposed', label: 'Pending' },
    { value: 'approved', label: 'Approved' }, { value: 'rolled_back', label: 'Rolled back' }, { value: 'rejected', label: 'Rejected' }, { value: 'failed', label: 'Failed' },
  ] },
];

const pretty = (v: unknown): string => { try { return JSON.stringify(v ?? null, null, 2); } catch { return String(v); } };

export default function AgentProfilePage() {
  const router = useRouter();
  const agentId = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'agents');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canSee = isAdmin || !!me?.can_manage_agents || !!me?.can_approve_agent_actions;

  const [days, setDays] = useState(30);
  const [rate, setRate] = useState(DEFAULT_LABOR_RATE_USD);
  const [row, setRow] = useState<AgentReportRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [sel, setSel] = useState<AgentAction | null>(null);
  const [events, setEvents] = useState<AgentActionEvent[] | null>(null);
  const prefs = useListPrefs('snrpmo.agentprofile.cols', COLS);

  useEffect(() => { try { const v = window.localStorage.getItem('snrpmo.agentroi.rate'); if (v) setRate(Number(v) || DEFAULT_LABOR_RATE_USD); } catch { /* ignore */ } }, []);

  useEffect(() => {
    if (!org?.id || !agentId || !enabled || !canSee) return;
    agentReport(org.id, days).then((rows) => {
      const r = rows.find((x) => x.agent_id === agentId) || null;
      setRow(r); setMissing(!r);
    }).catch(() => setMissing(true));
    listAgentActionsByAgent(org.id, agentId).then(setActions).catch(() => setActions([]));
    setSel(null); setEvents(null);
  }, [org?.id, agentId, days, enabled, canSee]);

  useSetCrumbs(row ? [{ label: 'Agents', href: '/agents' }, { label: row.name }] : null);

  const domLabel = (d: string) => AGENT_DOMAINS.find((x) => x.key === d)?.label || titleCase(d);
  const domIcon = (d: string) => AGENT_DOMAINS.find((x) => x.key === d)?.icon || 'ti-robot';
  const hours = useMemo(() => (row ? row.by_tool.reduce((m, t) => m + t.executed * minutesSavedFor(t.tool_key, t.domain), 0) / 60 : 0), [row]);
  const net = hours * rate - (Number(row?.usd) || 0);
  const reliability = row && row.executed + row.rolled_back > 0 ? Math.round((row.executed / (row.executed + row.rolled_back)) * 100) : 100;

  // What it suggested, by category: per-domain counts across the FULL loaded history.
  const byCategory = useMemo(() => {
    const m = new Map<string, { suggested: number; executed: number; pending: number; rejected: number; rolled: number }>();
    for (const a of actions || []) {
      const g = m.get(a.domain) || { suggested: 0, executed: 0, pending: 0, rejected: 0, rolled: 0 };
      g.suggested++;
      if (a.executed_at && !a.rolled_back_at) g.executed++;
      if (a.status === 'proposed') g.pending++;
      if (a.status === 'rejected') g.rejected++;
      if (a.rolled_back_at) g.rolled++;
      m.set(a.domain, g);
    }
    return [...m.entries()].sort((x, y) => y[1].suggested - x[1].suggested);
  }, [actions]);

  const statusF = prefs.filters.status || 'all';
  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    return (actions || []).filter((a) =>
      (statusF === 'all' || a.status === statusF) &&
      (!q || `${a.summary} ${a.tool_key} ${a.domain}`.toLowerCase().includes(q)));
  }, [actions, statusF, prefs.query]);
  const rs = useRowSelection(shown);
  const GROUPS: GroupMeta[] = AGENT_DOMAINS.map((d) => ({ value: d.key, label: d.label, color: '#6b7280' }));

  const rowValue = (a: AgentAction) => (a.executed_at && !a.rolled_back_at ? (minutesSavedFor(a.tool_key, a.domain) / 60) * rate : 0);
  const cell = (id: string, a: AgentAction) => {
    switch (id) {
      case 'summary': return <span className="font-medium text-content">{a.summary}</span>;
      case 'tool': return <span className="text-xs text-muted">{toolByKey(a.tool_key)?.label || a.tool_key}</span>;
      case 'domain': return <span className="text-xs text-muted inline-flex items-center gap-1"><Icon name={domIcon(a.domain)} className="text-sm" />{domLabel(a.domain)}</span>;
      case 'status': return chip(titleCase(a.status.replace('_', ' ')), STATUS_COLOR[a.status] || '#6b7280');
      case 'risk': return chip(titleCase(a.risk), RISK_COLOR[a.risk] || '#6b7280');
      case 'value': return a.executed_at && !a.rolled_back_at ? <span className="tnum text-emerald-600 font-medium">{money(rowValue(a))}</span> : <span className="text-muted2">—</span>;
      case 'proposed': return <span className="text-xs text-muted">{a.proposed_at?.slice(0, 16).replace('T', ' ') || '—'}</span>;
      case 'executed': return <span className="text-xs text-muted">{a.executed_at ? a.executed_at.slice(0, 16).replace('T', ' ') : '—'}</span>;
      default: return '—';
    }
  };

  const openDetail = (a: AgentAction) => {
    setSel(a); setEvents(null);
    listAgentActionEvents(a.id).then(setEvents).catch(() => setEvents([]));
  };

  if (!enabled) return <Layout flat title="Agent"><EmptyState icon="ti-robot" title="AI Agents not in your plan" text="Upgrade to put agents to work." /></Layout>;
  if (!canSee) return <Layout flat title="Agent"><EmptyState icon="ti-lock" title="Restricted" text="Agent records are visible to agent managers and approvers." /></Layout>;
  if (missing) return <Layout flat title="Agent"><EmptyState icon="ti-robot-off" title="Agent not found" text="It may have been removed, or it belongs to another workspace." /><div className="mt-3"><Link href="/agents" className="btn btn-sm"><Icon name="ti-arrow-left" />Back to Agents</Link></div></Layout>;
  if (!row) return <Layout flat title="Agent"><div className="p-10 grid place-items-center"><Spinner /></div></Layout>;

  return (
    <Layout flat title={row.name}>
      <PageHeader help="agents" icon={domIcon(row.domain)}
        title={<span className="inline-flex items-center gap-2">{row.name}{row.builtin && <span className="text-2xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 align-middle">System</span>}{row.archived_at ? <span className="text-2xs px-1.5 py-0.5 rounded bg-surface2 text-muted2">Archived</span> : !row.enabled ? <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">Paused</span> : null}</span> as any}
        subtitle={`${domLabel(row.domain)} agent · ${AUTONOMY_LABELS[row.autonomy_level] || row.autonomy_level}${row.first_at ? ` · active since ${row.first_at.slice(0, 10)}` : ''}`}
        action={<div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface2 p-0.5">
            {WINDOWS.map((w) => (<button key={w.d} onClick={() => setDays(w.d)} className={`px-3 py-1 text-xs font-medium rounded-md transition ${days === w.d ? 'bg-accent text-accentfg' : 'text-muted hover:text-content'}`}>{w.label}</button>))}
          </div>
          <Link href="/agent-activity" className="btn btn-sm"><Icon name="ti-chart-line" />Team report</Link>
          <Link href="/agents" className="btn btn-sm"><Icon name="ti-robot" />Manage</Link>
        </div>} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
        <StatCard label="Done (net)" value={String(row.executed)} hint={`${row.proposed_total} suggested`} icon="ti-bolt" />
        <StatCard label="Rolled back" value={String(row.rolled_back)} hintTone={row.rolled_back > 0 ? 'down' : 'up'} hint={`${row.rejected} rejected`} icon="ti-arrow-back-up" />
        <StatCard label="Reliability" value={`${reliability}%`} icon="ti-shield-check" />
        <StatCard label="Time saved" value={`${hours.toFixed(1)} h`} hint={`est. at $${rate}/hr`} icon="ti-clock-hour-4" />
        <StatCard label="Net value" value={money(net)} hintTone={net >= 0 ? 'up' : 'down'} hint={`cost $${(Number(row.usd) || 0).toFixed(2)}`} icon="ti-coin" />
        <StatCard label="Runs" value={String(row.runs)} hint={`${row.tokens.toLocaleString()} tokens`} icon="ti-activity" />
      </div>

      {byCategory.length > 0 && (
        <div className="card p-5 mb-5">
          <h3 className="text-sm font-semibold mb-3">What it suggested, by category</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {byCategory.map(([dom, g]) => (
              <div key={dom} className="rounded-lg border border-line p-3">
                <p className="text-xs font-medium text-content inline-flex items-center gap-1.5 mb-1.5"><Icon name={domIcon(dom)} className="text-sm" />{domLabel(dom)}</p>
                <p className="text-2xs text-muted">{g.suggested} suggested · <span className="text-emerald-600">{g.executed} done</span>{g.pending > 0 ? <> · <span className="text-amber-600">{g.pending} pending</span></> : null}{g.rejected > 0 ? <> · {g.rejected} rejected</> : null}{g.rolled > 0 ? <> · <span className="text-violet-600">{g.rolled} rolled back</span></> : null}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Complete history & audit</h3>
        <span className="text-2xs text-muted2">click an action for full details + audit trail</span>
      </div>
      <ListView
        rows={actions === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={FILTERS}
        searchPlaceholder="Search this agent's actions…"
        groupField={{ value: 'domain', label: 'Category' }}
        groupOf={(a) => a.domain}
        groups={GROUPS}
        onRowClick={openDetail}
        exportName={`agent-${row.name.replace(/\s+/g, '-').toLowerCase()}-history`}
        exportValue={(id, a) => id === 'summary' ? a.summary : id === 'tool' ? a.tool_key : id === 'domain' ? a.domain : id === 'status' ? a.status : id === 'risk' ? a.risk : id === 'value' ? String(Math.round(rowValue(a))) : id === 'proposed' ? (a.proposed_at || '') : id === 'executed' ? (a.executed_at || '') : ''}
        emptyIcon="ti-history"
        emptyText="No actions from this agent yet."
      />

      {sel && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-3" onClick={() => setSel(null)}>
          <div className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content">{sel.summary}</p>
                <p className="text-2xs text-muted mt-0.5">{toolByKey(sel.tool_key)?.label || sel.tool_key} · {domLabel(sel.domain)} · {chip(titleCase(sel.status.replace('_', ' ')), STATUS_COLOR[sel.status] || '#6b7280')} {chip(titleCase(sel.risk), RISK_COLOR[sel.risk] || '#6b7280')} {sel.reversible ? chip('Reversible', '#0284c7') : chip('Not reversible', '#dc2626')}</p>
              </div>
              <button className="text-muted hover:text-content" onClick={() => setSel(null)} aria-label="Close"><Icon name="ti-x" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-2xs text-muted mb-3">
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Suggested</p>{sel.proposed_at?.replace('T', ' ').slice(0, 19) || '—'}</div>
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Decided</p>{sel.decided_at ? `${sel.decided_at.replace('T', ' ').slice(0, 19)}` : '—'}{sel.decision_note ? ` · ${sel.decision_note}` : ''}</div>
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Executed</p>{sel.executed_at?.replace('T', ' ').slice(0, 19) || '—'}</div>
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Rolled back</p>{sel.rolled_back_at?.replace('T', ' ').slice(0, 19) || '—'}</div>
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Target</p>{sel.target_table ? `${sel.target_table}${sel.target_id ? ` · ${sel.target_id.slice(0, 8)}…` : ''}` : '—'}</div>
              <div><p className="uppercase tracking-wide text-muted2 mb-0.5">Est. value</p>{sel.executed_at && !sel.rolled_back_at ? money(rowValue(sel)) : '—'}</div>
            </div>
            <div className="space-y-2 mb-3">
              <details open><summary className="text-2xs uppercase tracking-wide text-muted2 cursor-pointer">Details it suggested (payload)</summary><pre className="mt-1 text-2xs bg-surface2 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">{pretty(sel.payload)}</pre></details>
              {sel.result != null && <details><summary className="text-2xs uppercase tracking-wide text-muted2 cursor-pointer">Result</summary><pre className="mt-1 text-2xs bg-surface2 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">{pretty(sel.result)}</pre></details>}
              {sel.prior_state != null && <details><summary className="text-2xs uppercase tracking-wide text-muted2 cursor-pointer">Prior state (what rollback restores)</summary><pre className="mt-1 text-2xs bg-surface2 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">{pretty(sel.prior_state)}</pre></details>}
            </div>
            <p className="text-2xs uppercase tracking-wide text-muted2 mb-1.5">Audit trail</p>
            {events === null ? <div className="py-3 grid place-items-center"><Spinner /></div> : events.length === 0 ? <p className="text-2xs text-muted2">No audit events recorded.</p> : (
              <ol className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-2xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[e.event] || '#94a3b8' }} />
                    <span className="font-medium text-content">{titleCase(e.event.replace('_', ' '))}</span>
                    <span className="text-muted truncate">{e.detail ? JSON.stringify(e.detail).slice(0, 80) : ''}</span>
                    <span className="ml-auto shrink-0 text-muted2">{e.at?.replace('T', ' ').slice(0, 19)}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-3 flex justify-end"><Link href="/agent-approvals" className="btn btn-sm"><Icon name="ti-checks" />Open in Approvals</Link></div>
          </div>
        </div>
      )}
    </Layout>
  );
}
