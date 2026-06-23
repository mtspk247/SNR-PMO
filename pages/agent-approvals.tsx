import { useEffect, useMemo, useState } from 'react';
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
  AgentDefinition, AgentAction, AgentActionEvent, recordAgentExecution,
} from '@/lib/db';
import { executorFor } from '@/lib/agentExecutors';

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

  const [actions, setActions] = useState<AgentAction[] | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
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
  };
  useEffect(() => { if (org?.id && enabled) { load(); prefs.setFilter('status', 'proposed'); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || '—';
  const statusF = prefs.filters.status || 'all';
  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    return (actions || []).filter((a) =>
      (statusF === 'all' || a.status === statusF) &&
      (!q || `${a.summary} ${a.tool_key} ${a.domain}`.toLowerCase().includes(q))
    );
  }, [actions, statusF, prefs.query]);
  const rs = useRowSelection(shown);

  const STATUSES = ['proposed', 'approved', 'executed', 'rejected', 'rolled_back', 'failed', 'expired'];
  const GROUPS: GroupMeta[] = STATUSES.map((s) => ({ value: s, label: titleCase(s.replace('_', ' ')), color: STATUS_COLOR[s] }));

  const cell = (id: string, a: AgentAction) => {
    switch (id) {
      case 'summary': return <span className="font-medium text-content">{a.summary}</span>;
      case 'agent': return <span className="text-sm">{agentName(a.agent_id)}</span>;
      case 'tool': return <span className="text-xs text-muted">{toolByKey(a.tool_key)?.label || a.tool_key}</span>;
      case 'risk': return chip(a.risk, RISK_COLOR[a.risk] || '#6b7280');
      case 'status': return chip(titleCase(a.status.replace('_', ' ')), STATUS_COLOR[a.status] || '#6b7280');
      case 'proposed': return a.proposed_at?.slice(0, 16).replace('T', ' ') || '—';
      default: return '—';
    }
  };

  const openDetail = async (a: AgentAction) => {
    setSel(a); setNote(''); setEvents([]);
    try { setEvents(await listAgentActionEvents(a.id)); } catch { /* ignore */ }
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
      <PageHeader help="agents" title="Agent approvals" subtitle="Review, approve, and roll back actions proposed by your agents" icon="ti-checks" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {!canApprove && <p className="text-xs text-amber-600 mb-3">You can view the queue but need the <b>Approve agent actions</b> permission to approve, reject, or roll back.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Pending" value={String(kpis.pending)} icon="ti-clock" />
        <StatCard label="Approved" value={String(kpis.approved)} icon="ti-circle-check" />
        <StatCard label="Executed" value={String(kpis.executed)} icon="ti-bolt" />
        <StatCard label="Rolled back" value={String(kpis.rolledBack)} icon="ti-arrow-back-up" />
      </div>

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
        exportValue={(id, a) => id === 'summary' ? a.summary : id === 'agent' ? agentName(a.agent_id) : id === 'tool' ? a.tool_key : id === 'risk' ? a.risk : id === 'status' ? a.status : id === 'proposed' ? (a.proposed_at || '') : ''}
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
              <button className="btn btn-primary" disabled={busy} onClick={() => decide('approved')}>{busy ? 'Working…' : (executorFor(sel.tool_key) ? 'Approve & run' : 'Approve')}</button>
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
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted2 mb-1">Tool</h4>
              <p className="text-sm">{selTool?.label || sel.tool_key}{selTool?.description ? <span className="block text-2xs text-muted">{selTool.description}</span> : null}</p>
              {executorFor(sel.tool_key) ? <p className="text-2xs text-emerald-600 mt-1 inline-flex items-center gap-1"><Icon name="ti-bolt" className="text-xs" />On approval this runs automatically and can be rolled back.</p> : <p className="text-2xs text-muted mt-1">Draft only — approving records your sign-off; act on it manually.</p>}
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
