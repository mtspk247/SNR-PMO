import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { AGENT_DOMAINS, RISK_COLOR, toolByKey } from '@/lib/agents';
import {
  listAgents, listAgentActions, listAgentActionEvents, decideAgentAction, rollbackAgentAction,
  listAgentPolicy, resetAgentPolicy,
  getAgentPolicyConfig, setAgentPolicyConfig, isVerbSuppressed, agentPreflight, agentPreflightPending,
  AgentDefinition, AgentAction, AgentActionEvent, AgentPolicy, AgentPolicyConfig, AgentPreflight, AgentPreflightRow, recordAgentExecution,
} from '@/lib/db';
import { executorFor, simulateAction } from '@/lib/agentExecutors';

const STATUS_COLOR: Record<string, string> = {
  proposed: '#d97706', approved: '#0284c7', executing: '#0284c7', executed: '#16a34a',
  rejected: '#6b7280', rolled_back: '#7c3aed', failed: '#dc2626', expired: '#6b7280',
};
const chip = (text: string, color: string) => (
  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: color + '1f', color, boxShadow: `inset 0 0 0 1px ${color}33` }}>{text}</span>
);

const COLS: ColDef[] = [
  { id: 'summary', label: 'Proposed action', locked: true },
  { id: 'agent', label: 'Agent' },
  { id: 'tool', label: 'Tool' },
  { id: 'risk', label: 'Risk', width: 80 },
  { id: 'check', label: 'Preflight', width: 120 },
  { id: 'signal', label: 'Signal', width: 170 },
  { id: 'status', label: 'Status' },
  { id: 'proposed', label: 'Proposed' },
];
const FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [
    { value: 'all', label: 'All' }, { value: 'proposed', label: 'Pending' }, { value: 'approved', label: 'Approved' },
    { value: 'executed', label: 'Executed' }, { value: 'rejected', label: 'Rejected' }, { value: 'rolled_back', label: 'Rolled back' },
  ] },
];

export default function AgentApprovalsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'agents');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canApprove = isAdmin || !!me?.can_approve_agent_actions;
  const canManage = isAdmin || !!me?.can_manage_agents;

  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [policy, setPolicy] = useState<AgentPolicy[]>([]);
  const [cfg, setCfg] = useState<AgentPolicyConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [pf, setPf] = useState<AgentPreflight | null>(null);
  const [pfBusy, setPfBusy] = useState(false);
  const [pfMap, setPfMap] = useState<Map<string, AgentPreflightRow>>(new Map());
  const [pfRunning, setPfRunning] = useState(false);
  const [sel, setSel] = useState<AgentAction | null>(null);
  const [events, setEvents] = useState<AgentActionEvent[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.agentactions.cols', COLS);

  const load = () => {
    if (!org) return;
    listAgentActions(org.id).then(setActions).catch((e) => { setErr(e.message); setActions([]); });
    listAgents(org.id).then(setAgents).catch(() => {});
    listAgentPolicy(org.id).then(setPolicy).catch(() => {});
    getAgentPolicyConfig(org.id).then(setCfg).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) { load(); prefs.setFilter('status', 'proposed'); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || '—';
  // Phase 3 — per-tenant policy memory: rank + explain proposals by your own approve/reject history.
  const policyMap = useMemo(() => new Map(policy.map((p) => [p.verb, p])), [policy]);
  const totalDecisions = useMemo(() => policy.reduce((n, p) => n + p.approve_count + p.reject_count, 0), [policy]);
  // Noise control: which action types the org has muted (agents stop auto-proposing them).
  const mutedVerbs = useMemo(() => new Set(policy.filter((p) => isVerbSuppressed(cfg, p)).map((p) => p.verb)), [policy, cfg]);
  const mutedPending = useMemo(() => (actions || []).filter((a) => a.status === 'proposed' && mutedVerbs.has(a.tool_key)).length, [actions, mutedVerbs]);
  const saveNoise = async (on: boolean) => {
    if (!org || savingCfg) return; setSavingCfg(true); setErr('');
    try { const c = await setAgentPolicyConfig(org.id, on); setCfg(c); }
    catch (e: any) { setErr(e.message); } finally { setSavingCfg(false); }
  };
  // Queue-level preflight: validate every pending proposal against live data in one capped call.
  const runBatchPreflight = async () => {
    if (!org || pfRunning) return; setPfRunning(true);
    try { const rows = await agentPreflightPending(org.id, 200); setPfMap(new Map(rows.map((r) => [r.id, r]))); }
    catch { /* non-fatal */ } finally { setPfRunning(false); }
  };
  const pendingCount = useMemo(() => (actions || []).filter((a) => a.status === 'proposed').length, [actions]);
  useEffect(() => { if (org?.id && enabled && canApprove && pendingCount > 0 && pendingCount <= 25) runBatchPreflight(); /* eslint-disable-next-line */ }, [actions, org?.id, enabled, canApprove]);
  const pfStats = useMemo(() => {
    const pend = (actions || []).filter((a) => a.status === 'proposed');
    let ready = 0, fail = 0, checked = 0;
    for (const a of pend) { const p = pfMap.get(a.id); if (p && p.checked) { checked++; if (p.ok) ready++; else fail++; } }
    return { ready, fail, checked, pend: pend.length };
  }, [actions, pfMap]);
  const signalCell = (a: AgentAction) => {
    const p = policyMap.get(a.tool_key);
    const n = p ? p.approve_count + p.reject_count : 0;
    if (mutedVerbs.has(a.tool_key)) return <span title="You muted this action type — agents have stopped auto-proposing it. Turn off Noise control to resume.">{chip('Muted \u00b7 no longer proposed', '#6b7280')}</span>;
    if (!p || n === 0) return <span className="text-2xs text-muted2 inline-flex items-center gap-1" title="No prior decisions for this action type — your agent learns from your call."><Icon name="ti-sparkles" className="text-2xs" />New</span>;
    const obs = p.approve_count / n; const pct = Math.round(obs * 100);
    let color = '#d97706', label = 'Mixed';
    if (n < 3) { color = '#d97706'; label = 'Learning'; }
    else if (obs >= 0.66) { color = '#16a34a'; label = 'Usually approved'; }
    else if (obs <= 0.34) { color = '#dc2626'; label = 'Often rejected'; }
    return <span title={`Approved ${p.approve_count} of ${n} \u00b7 queue ranked by learned acceptance`}>{chip(`${label} \u00b7 ${pct}%`, color)}</span>;
  };
  const resetThis = async () => {
    if (!sel || !org || busy || !confirm('Forget the learned approve/reject history for this action type? Future proposals start neutral.')) return;
    setBusy(true); setErr('');
    try { await resetAgentPolicy(org.id, sel.tool_key); await listAgentPolicy(org.id).then(setPolicy); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const statusF = prefs.filters.status || 'all';
  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    const f = (actions || []).filter((a) =>
      (statusF === 'all' || a.status === statusF) &&
      (!q || `${a.summary} ${a.tool_key} ${a.domain}`.toLowerCase().includes(q))
    );
    // Learned ranking: agents surface what you most often approve first (ties -> newest).
    const sc = (x: AgentAction) => { const pp = policyMap.get(x.tool_key); return pp ? Number(pp.score) : (x.priority != null ? Number(x.priority) : 0.5); };
    return f.sort((a, b) => { const d = sc(b) - sc(a); return Math.abs(d) > 1e-9 ? d : String(b.proposed_at || '').localeCompare(String(a.proposed_at || '')); });
  }, [actions, statusF, prefs.query, policyMap]);
  const rs = useRowSelection(shown);

  const STATUSES = ['proposed', 'approved', 'executed', 'rejected', 'rolled_back', 'failed', 'expired'];
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: titleCase(s.replace('_', ' ')), color: STATUS_COLOR[s] }));

  const cell = (id: string, a: AgentAction) => {
    switch (id) {
      case 'summary': return <span className="font-medium text-content">{a.summary}</span>;
      case 'agent': return <span className="text-sm">{agentName(a.agent_id)}</span>;
      case 'tool': return <span className="text-xs text-muted">{toolByKey(a.tool_key)?.label || a.tool_key}</span>;
      case 'risk': return chip(a.risk, RISK_COLOR[a.risk] || '#6b7280');
      case 'check': {
        if (a.status !== 'proposed') return <span className="text-2xs text-muted2">—</span>;
        const p = pfMap.get(a.id);
        if (!p) return <span className="text-2xs text-muted2">{pfRunning ? '…' : '—'}</span>;
        if (!p.checked) return <span className="text-2xs text-muted2" title="No transactional preflight for this action type">n/a</span>;
        return p.ok
          ? <span title="Verified against live data — would run"><span className="inline-flex items-center gap-1">{chip('Ready', '#16a34a')}</span></span>
          : <span title={PF_REASON[p.reason || 'error'] || 'Would fail if approved'}>{chip('Would fail', '#dc2626')}</span>;
      }
      case 'signal': return signalCell(a);
      case 'status': return chip(titleCase(a.status.replace('_', ' ')), STATUS_COLOR[a.status] || '#6b7280');
      case 'proposed': return a.proposed_at?.slice(0, 16).replace('T', ' ') || '—';
      default: return '—';
    }
  };

  const openDetail = async (a: AgentAction) => {
    setSel(a); setNote(''); setEvents([]); setPf(null);
    // Server preflight: will this actually run for the approver? (RLS/RBAC/trigger/CHECK)
    if (a.status === 'proposed' && canApprove) { setPfBusy(true); agentPreflight(a.id).then(setPf).catch(() => setPf(null)).finally(() => setPfBusy(false)); }
    try { setEvents(await listAgentActionEvents(a.id)); } catch { /* ignore */ }
  };
  const PF_REASON: Record<string, string> = {
    permission_denied: "The approver's role isn't allowed to create these records (row-level security / page permission).",
    check_violation: 'A value would fail a validation rule.',
    missing_reference: 'A referenced record is missing.',
    missing_required_field: 'A required field is missing.',
    duplicate: 'It would duplicate an existing record.',
    not_authorized: 'You need the Approve or Manage agents permission.',
    error: 'It would fail to run.',
  };
  // Execution runs CLIENT-SIDE as the approver through db.ts fns -> RLS/RBAC enforced.
  const runExecution = async (action: AgentAction) => {
    const ex = executorFor(action.tool_key);
    if (!ex || !org || !me) return;
    const res = await ex.execute(action, { orgId: org.id, userId: me.id });
    await recordAgentExecution(action.id, res.target_table, res.target_id, res.result, res.reversal, res.prior_state);
  };
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!sel || busy) return; setBusy(true); setErr('');
    try {
      await decideAgentAction(sel.id, decision, note || undefined);
      if (decision === 'approved' && executorFor(sel.tool_key)) await runExecution(sel);
      setSel(null); load();
    } catch (e: any) { setErr(e.message); load(); } finally { setBusy(false); }
  };
  const executeNow = async () => {
    if (!sel || busy) return; setBusy(true); setErr('');
    try { await runExecution(sel); setSel(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const rollback = async () => {
    if (!sel || busy || !confirm('Roll back this executed action?')) return; setBusy(true); setErr('');
    try {
      const ex = executorFor(sel.tool_key);
      if (ex?.rollback && org && me) await ex.rollback(sel, { orgId: org.id, userId: me.id });
      await rollbackAgentAction(sel.id, note || undefined);
      setSel(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Agent approvals">
      <EmptyState icon="ti-robot" title="AI Agents not in your plan" text="Upgrade to review and approve agent actions." />
    </Layout>
  );

  const kpis = {
    pending: (actions || []).filter((a) => a.status === 'proposed').length,
    approved: (actions || []).filter((a) => a.status === 'approved').length,
    executed: (actions || []).filter((a) => a.status === 'executed').length,
    rolledBack: (actions || []).filter((a) => a.status === 'rolled_back').length,
  };
  const selTool = sel ? toolByKey(sel.tool_key) : undefined;
  const selDomain = sel ? AGENT_DOMAINS.find((d) => d.key === sel.domain) : undefined;

  return (
    <Layout flat title="Agent approvals">
      <PageHeader help="agents" title="Agent approvals" subtitle="Review, approve, and roll back actions proposed by your agents" icon="ti-checks" action={<Link href="/agent-activity" className="btn btn-sm"><Icon name="ti-chart-line" />Activity & ROI</Link>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {!canApprove && <p className="text-xs text-amber-600 mb-3">You can view the queue but need the <b>Approve agent actions</b> permission to approve, reject, or roll back.</p>}
      {policy.length > 0 && <p className="text-xs text-muted mb-3 inline-flex items-center gap-1.5"><Icon name="ti-brain" className="text-sm text-accentstrong" />Your agents have learned from <b className="text-content">{totalDecisions}</b> decision{totalDecisions === 1 ? '' : 's'} across <b className="text-content">{policy.length}</b> action type{policy.length === 1 ? '' : 's'} — the queue is ranked by how often you approve each kind.</p>}

      {canManage && policy.length > 0 && (
        <div className="rounded-lg border border-line p-3.5 mb-5 bg-surface2/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-content inline-flex items-center gap-1.5"><Icon name="ti-filter-cog" className="text-sm text-accentstrong" />Noise control</h3>
              <p className="text-xs text-muted mt-0.5">When on, agents <b className="text-content">stop autonomously proposing</b> action types you consistently reject (learned from at least {cfg?.suppress_min_n ?? 5} decisions). Approvals still work exactly the same — nothing is ever auto-executed, and turning this off brings the suggestions right back.</p>
              {cfg?.auto_suppress && (
                mutedVerbs.size > 0
                  ? <p className="text-2xs text-muted2 mt-1.5 inline-flex items-center gap-1"><Icon name="ti-volume-off" className="text-2xs" />Muted: {[...mutedVerbs].map((v) => toolByKey(v)?.label || v).join(', ')}{mutedPending > 0 ? ` \u00b7 ${mutedPending} pending item${mutedPending === 1 ? '' : 's'} kept for review` : ''}</p>
                  : <p className="text-2xs text-muted2 mt-1.5 inline-flex items-center gap-1"><Icon name="ti-circle-check" className="text-2xs text-emerald-600" />On — nothing is noisy enough to mute yet. Your agents keep proposing everything.</p>
              )}
            </div>
            <button type="button" role="switch" aria-checked={!!cfg?.auto_suppress} disabled={savingCfg}
              onClick={() => saveNoise(!cfg?.auto_suppress)}
              title={cfg?.auto_suppress ? 'Turn noise control off' : 'Turn noise control on'}
              className={`relative h-5 w-9 rounded-full transition shrink-0 disabled:opacity-50 ${cfg?.auto_suppress ? 'bg-accent' : 'bg-surface2 border border-line'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${cfg?.auto_suppress ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Pending" value={String(kpis.pending)} icon="ti-clock" />
        <StatCard label="Approved" value={String(kpis.approved)} icon="ti-circle-check" />
        <StatCard label="Executed" value={String(kpis.executed)} icon="ti-bolt" />
        <StatCard label="Rolled back" value={String(kpis.rolledBack)} icon="ti-arrow-back-up" />
      </div>

      {canApprove && pendingCount > 0 && (
        <div className="flex items-center flex-wrap gap-2 mb-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted"><Icon name="ti-shield-check" className="text-sm text-accentstrong" />Preflight</span>
          {pfRunning && <span className="text-muted2 inline-flex items-center gap-1"><Icon name="ti-loader-2" className="text-2xs animate-spin" />Checking {pendingCount} pending against live data…</span>}
          {!pfRunning && pfStats.checked > 0 && <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5"><Icon name="ti-circle-check" className="text-2xs" />{pfStats.ready} ready</span>
            {pfStats.fail > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5"><Icon name="ti-alert-triangle" className="text-2xs" />{pfStats.fail} would fail</span>}
          </>}
          {!pfRunning && pfStats.checked === 0 && pendingCount > 25 && <span className="text-muted2">{pendingCount} pending — large queue, run on demand</span>}
          <button type="button" className="btn btn-sm ml-auto" disabled={pfRunning} onClick={runBatchPreflight}><Icon name="ti-refresh" className="text-2xs" />{pfStats.checked > 0 ? 'Re-check all' : 'Check all pending'}</button>
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
        searchPlaceholder="Search proposed actions…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(a) => a.status}
        groups={GROUPS}
        onRowClick={(a) => openDetail(a)}
        exportName="agent-actions"
        exportValue={(id, a) => id === 'summary' ? a.summary : id === 'agent' ? agentName(a.agent_id) : id === 'tool' ? a.tool_key : id === 'risk' ? a.risk : id === 'status' ? a.status : id === 'proposed' ? (a.proposed_at || '') : id === 'check' ? (() => { const p = pfMap.get(a.id); return a.status !== 'proposed' || !p ? '' : !p.checked ? 'n/a' : p.ok ? 'ready' : 'would-fail'; })() : id === 'signal' ? (() => { const p = policyMap.get(a.tool_key); const n = p ? p.approve_count + p.reject_count : 0; return n ? Math.round((p!.approve_count / n) * 100) + '%' : 'new'; })() : ''}
        busy={busy}
        emptyIcon="ti-checks"
        emptyText="No actions in the queue. Agents propose actions here for your approval."
      />

      {sel && (
        <Modal open onClose={() => setSel(null)} size="lg" icon="ti-robot" title="Proposed action"
          footer={<>
            <button className="btn mr-auto" onClick={() => setSel(null)}>Close</button>
            {sel.status === 'proposed' && canApprove && (<>
              <button className="btn btn-danger" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
              <button className="btn btn-primary" disabled={busy || (!!pf && pf.checked && !pf.ok)} title={(!!pf && pf.checked && !pf.ok) ? 'Preflight says this would fail — resolve the cause first' : undefined} onClick={() => decide('approved')}>{busy ? 'Working…' : (executorFor(sel.tool_key) ? 'Approve & run' : 'Approve')}</button>
            </>)}
            {sel.status === 'approved' && canApprove && executorFor(sel.tool_key) && (
              <button className="btn btn-primary" disabled={busy} onClick={executeNow}>{busy ? 'Running…' : 'Execute now'}</button>
            )}
            {sel.status === 'executed' && sel.reversible && canApprove && (
              <button className="btn btn-danger" disabled={busy} onClick={rollback}><Icon name="ti-arrow-back-up" className="text-sm" />Roll back</button>
            )}
          </>}
        >
          <div className="space-y-4">
            <div>
              <p className="text-base font-medium text-content">{sel.summary}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {chip(titleCase(sel.status.replace('_', ' ')), STATUS_COLOR[sel.status] || '#6b7280')}
                {chip(sel.risk + ' risk', RISK_COLOR[sel.risk] || '#6b7280')}
                {sel.decision_note && sel.decision_note.indexOf('Auto-approved') === 0 && chip('Auto', '#7c3aed')}
                {chip(sel.reversible ? 'reversible' : 'not reversible', sel.reversible ? '#16a34a' : '#dc2626')}
                <span className="text-xs text-muted inline-flex items-center gap-1"><Icon name={selDomain?.icon || 'ti-robot'} className="text-sm" />{selDomain?.label || sel.domain}</span>
                <span className="text-xs text-muted">· {agentName(sel.agent_id)}</span>
              </div>
            </div>
            {(() => { const p = policyMap.get(sel.tool_key); const n = p ? p.approve_count + p.reject_count : 0; if (!p || n === 0) return null; const obs = p.approve_count / n; const pct = Math.round(obs * 100); return (
              <div className="rounded-lg border border-line p-3 bg-surface2/40">
                <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1 inline-flex items-center gap-1.5"><Icon name="ti-brain" className="text-sm text-accentstrong" />Learned from your history</h4>
                <p className="text-sm text-content">You've approved <b>{p.approve_count}</b> of <b>{n}</b> ({pct}%) <b>{selTool?.label || sel.tool_key}</b> proposals. {obs >= 0.66 ? 'Your agent ranks these higher in the queue.' : obs <= 0.34 ? 'Your agent flags these as likely noise and ranks them lower.' : 'Your agent is still learning your preference here.'}</p>
                {isAdmin && <button type="button" className="mt-2 text-2xs text-muted2 hover:text-rose-600 inline-flex items-center gap-1 disabled:opacity-50" onClick={resetThis} disabled={busy}><Icon name="ti-eraser" className="text-2xs" />Reset learning for this action type</button>}
              </div>
            ); })()}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1">Tool</h4>
              <p className="text-sm">{selTool?.label || sel.tool_key}{selTool?.description ? <span className="block text-2xs text-muted">{selTool.description}</span> : null}</p>
              {executorFor(sel.tool_key) ? <p className="text-2xs text-emerald-600 mt-1 inline-flex items-center gap-1"><Icon name="ti-bolt" className="text-xs" />On approval this runs automatically and can be rolled back.</p> : <p className="text-2xs text-muted mt-1">Draft only — approving records your sign-off; act on it manually.</p>}
            </div>
            {(sel.payload && (sel.payload.draft || sel.payload.rationale || sel.payload.note)) && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1.5 inline-flex items-center gap-1.5"><Icon name="ti-pencil" className="text-sm text-accentstrong" />Drafted by agent</h4>
                <div className="rounded-lg border border-line p-3 bg-surface2/40 space-y-2">
                  {sel.payload.draft && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xs uppercase tracking-wide text-muted2">Message</span>
                        <button type="button" className="text-2xs text-accentstrong inline-flex items-center gap-1 hover:underline" onClick={(e) => { try { navigator.clipboard?.writeText(String(sel.payload.draft || '')); const b = e.currentTarget; const t = b.innerText; b.innerText = 'Copied'; setTimeout(() => { try { b.innerText = t; } catch { /* gone */ } }, 1200); } catch { /* noop */ } }}><Icon name="ti-copy" className="text-2xs" />Copy</button>
                      </div>
                      <p className="text-sm text-content whitespace-pre-wrap leading-relaxed">{String(sel.payload.draft)}</p>
                    </div>
                  )}
                  {(sel.payload.rationale || sel.payload.note) && (
                    <p className="text-2xs text-muted2 inline-flex items-start gap-1"><Icon name="ti-bulb" className="text-2xs mt-0.5 shrink-0 text-amber-500" /><span><span className="font-medium text-muted">Why:</span> {String(sel.payload.rationale || sel.payload.note)}</span></p>
                  )}
                </div>
              </div>
            )}
            {sel.status === 'proposed' && (pfBusy || pf) && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1.5 inline-flex items-center gap-1.5"><Icon name="ti-shield-check" className="text-sm text-accentstrong" />Preflight — will this run?</h4>
                {pfBusy && <p className="text-2xs text-muted inline-flex items-center gap-1"><Icon name="ti-loader-2" className="text-2xs animate-spin" />Checking permissions & data rules against your live data…</p>}
                {!pfBusy && pf && pf.checked && pf.ok && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/60 p-3 text-sm text-emerald-800 flex items-start gap-2"><Icon name="ti-circle-check-filled" className="text-emerald-600 mt-0.5 shrink-0" /><span>Verified against your live data — the approver’s permissions and every data rule allow this{pf.creates && pf.creates.length ? `; ${pf.creates.length} record type${pf.creates.length === 1 ? '' : 's'} would be created` : ''}. It was run as a real transaction and rolled back, so nothing was written.</span></div>
                )}
                {!pfBusy && pf && pf.checked && !pf.ok && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-50/60 p-3 text-sm text-rose-800 flex items-start gap-2"><Icon name="ti-alert-triangle-filled" className="text-rose-600 mt-0.5 shrink-0" /><span><b>Would fail if approved.</b> {PF_REASON[pf.reason || 'error'] || 'It would fail to run.'} Resolve the cause (or the approver’s permissions) before approving.</span></div>
                )}
                {!pfBusy && pf && !pf.checked && (
                  <p className="text-2xs text-muted2 inline-flex items-center gap-1"><Icon name="ti-info-circle" className="text-2xs" />No transactional preflight for this action type — see the dry run below.</p>
                )}
              </div>
            )}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1.5 inline-flex items-center gap-1.5"><Icon name="ti-flask" className="text-sm text-accentstrong" />Dry run — what will happen</h4>
              {(() => { const sim = simulateAction(sel); return (
                <div className="rounded-lg border border-line p-3 bg-surface2/40 space-y-2">
                  {sim.changes.length > 0 && (
                    <div className="space-y-1">
                      {sim.changes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-2xs uppercase tracking-wide text-muted2 w-20 shrink-0">{c.field}</span>
                          <span className="text-muted line-through">{c.from}</span>
                          <Icon name="ti-arrow-right" className="text-2xs text-muted2 shrink-0" />
                          <span className="font-medium text-content">{c.to}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sim.creates.length > 0 && (
                    <ul className="space-y-0.5">
                      {sim.creates.map((c, i) => <li key={i} className="flex items-center gap-1.5 text-sm text-content"><Icon name="ti-plus" className="text-2xs text-emerald-600 shrink-0" />{c}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-2xs text-muted border border-line"><Icon name="ti-stack-2" className="text-2xs" />{sim.blast.records} record{sim.blast.records === 1 ? '' : 's'}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs ${sim.blast.money > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon name="ti-coin" className="text-2xs" />{sim.blast.money > 0 ? `$${sim.blast.money.toLocaleString()} moves` : 'No money moves'}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs ${sim.blast.irreversible ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon name={sim.blast.irreversible ? 'ti-alert-triangle' : 'ti-arrow-back-up'} className="text-2xs" />{sim.blast.irreversible ? 'Not reversible' : 'One-click reversible'}</span>
                  </div>
                  {sim.effects.length > 0 && <p className="text-2xs text-muted2">{sim.effects.join(' · ')}</p>}
                  {sim.warnings.map((w, i) => <p key={i} className="text-2xs text-rose-600 inline-flex items-center gap-1"><Icon name="ti-alert-triangle" className="text-2xs shrink-0" />{w}</p>)}
                </div>
              ); })()}
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1">Payload</h4>
              <pre className="text-2xs bg-surface2 rounded-md p-3 overflow-x-auto">{JSON.stringify(sel.payload || {}, null, 2)}</pre>
            </div>
            {sel.status === 'proposed' && canApprove && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1">Decision note (optional)</h4>
                <textarea className="input min-h-[56px] resize-y" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you approved / rejected…" />
              </div>
            )}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1">Audit trail</h4>
              <ul className="space-y-1.5">
                {events.length === 0 && <li className="text-2xs text-muted">No events.</li>}
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[ev.event] || '#9ca3af' }} />
                    <span className="font-medium">{titleCase(ev.event.replace('_', ' '))}</span>
                    <span className="text-muted">{ev.at?.slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
