import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { AGENT_DOMAINS, AUTONOMY_LABELS, toolsForDomain, RISK_COLOR } from '@/lib/agents';
import {
  listAgents, createAgent, updateAgent, deleteAgent, listAgentTools, grantAgentTool, revokeAgentTool,
  listAgentCostLimits, setAgentCostLimit, listAgentUsage, simulateAgentProposal,
  AgentDefinition, AgentDomain, AgentAutonomy, AgentCostLimit, AgentUsage,
} from '@/lib/db';

const COLS: ColDef[] = [
  { id: 'name', label: 'Agent', locked: true },
  { id: 'domain', label: 'Domain' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'runs', label: 'Runs (mo)', width: 90 },
  { id: 'status', label: 'Status' },
  { id: 'created', label: 'Created' },
];

type Draft = { id?: string; name: string; domain: AgentDomain; description: string; autonomy_level: AgentAutonomy; enabled: boolean };
const emptyDraft = (): Draft => ({ name: '', domain: 'general', description: '', autonomy_level: 'approve_first', enabled: true });

export default function AgentsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const enabled = hasFeature(org, 'agents');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canManage = isAdmin || !!me?.can_manage_agents;

  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [usage, setUsage] = useState<AgentUsage[]>([]);
  const [limits, setLimits] = useState<AgentCostLimit[]>([]);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; initial: string } | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.agents.cols', COLS);

  const load = () => {
    if (!org) return;
    listAgents(org.id).then(setAgents).catch((e) => { setErr(e.message); setAgents([]); });
    listAgentUsage(org.id).then(setUsage).catch(() => {});
    listAgentCostLimits(org.id).then(setLimits).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const runsThisMonth = (agentId: string) =>
    usage.find((u) => u.agent_id === agentId && u.period_kind === 'month')?.runs ?? 0;

  const shown = useMemo(() => {
    const q = prefs.query.trim().toLowerCase();
    return (agents || []).filter((a) => !q || `${a.name} ${a.domain}`.toLowerCase().includes(q));
  }, [agents, prefs.query]);
  const rs = useRowSelection(shown);

  const GROUPS: GroupMeta[] = AGENT_DOMAINS.map((d) => ({ value: d.key, label: d.label }));

  const cell = (id: string, a: AgentDefinition) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{a.name}</span>;
      case 'domain': { const d = AGENT_DOMAINS.find((x) => x.key === a.domain); return <span className="inline-flex items-center gap-1.5"><Icon name={d?.icon || 'ti-robot'} className="text-sm text-muted2" />{d?.label || a.domain}</span>; }
      case 'autonomy': return <span className="text-xs text-muted">{(AUTONOMY_LABELS[a.autonomy_level] || a.autonomy_level).split(' (')[0]}</span>;
      case 'runs': return <span className="tabular-nums">{runsThisMonth(a.id)}</span>;
      case 'status': return a.enabled
        ? <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#16a34a1f', color: '#16a34a' }}>Enabled</span>
        : <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#6b72801f', color: '#6b7280' }}>Disabled</span>;
      case 'created': return a.created_at?.slice(0, 10) || '—';
      default: return '—';
    }
  };

  const openEdit = async (a: AgentDefinition) => {
    setEditor({ mode: 'edit', draft: { id: a.id, name: a.name, domain: a.domain, description: a.description || '', autonomy_level: a.autonomy_level, enabled: a.enabled }, initial: JSON.stringify(a) });
    try { const g = await listAgentTools(a.id); setGrants(new Set(g.map((x) => x.tool_key))); } catch { setGrants(new Set()); }
  };
  const setD = (patch: Partial<Draft>) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateAgent(d.id, { name: d.name.trim(), domain: d.domain, description: d.description || null, autonomy_level: d.autonomy_level, enabled: d.enabled });
      } else {
        const [created] = await createAgent({ org_id: org.id, name: d.name.trim(), domain: d.domain, description: d.description || null, autonomy_level: d.autonomy_level, created_by: me.id });
        if (created && d.enabled === false) await updateAgent(created.id, { enabled: false });
      }
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const toggleTool = async (toolKey: string) => {
    if (!org || !editor?.draft.id) return;
    const has = grants.has(toolKey);
    setGrants((p) => { const n = new Set(p); has ? n.delete(toolKey) : n.add(toolKey); return n; });
    try { has ? await revokeAgentTool(editor.draft.id, toolKey) : await grantAgentTool(editor.draft.id, org.id, toolKey); }
    catch (e: any) { setErr(e.message); setGrants((p) => { const n = new Set(p); has ? n.add(toolKey) : n.delete(toolKey); return n; }); }
  };

  const runSample = async () => {
    if (!org || !editor?.draft.id || busy) return;
    setBusy(true); setErr('');
    try { await simulateAgentProposal(org.id, editor.draft.id, editor.draft.domain); setEditor(null); router.push('/agent-approvals'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  // Org-wide cost ceiling editor (agent_id = null)
  const orgLimit = (period: 'day' | 'month') => limits.find((l) => l.agent_id === null && l.period === period);
  const [limDraft, setLimDraft] = useState<{ period: 'day' | 'month'; max_runs: string; max_usd: string } | null>(null);
  const saveLimit = async () => {
    if (!org || !limDraft) return; setBusy(true); setErr('');
    try {
      await setAgentCostLimit({ org_id: org.id, agent_id: null, period: limDraft.period, max_runs: limDraft.max_runs ? Number(limDraft.max_runs) : null, max_usd: limDraft.max_usd ? Number(limDraft.max_usd) : null, enabled: true });
      setLimDraft(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Agents">
      <EmptyState icon="ti-robot" title="AI Agents not in your plan" text="Upgrade to run approve-first AI agents on your back office." />
    </Layout>
  );
  if (!canManage) return (
    <Layout flat title="Agents">
      <EmptyState icon="ti-lock" title="No access" text="You need the Manage agents permission to configure agents." />
    </Layout>
  );

  const kpis = { total: (agents || []).length, enabled: (agents || []).filter((a) => a.enabled).length, runs: usage.filter((u) => u.agent_id === null && u.period_kind === 'month').reduce((s, u) => s + u.runs, 0) };
  const tools = toolsForDomain(editor?.draft.domain || 'general');

  return (
    <Layout flat title="Agents">
      <PageHeader help="agents" title="Agents" subtitle="Configure approve-first AI agents for your back office" icon="ti-robot"
        action={<button className="btn btn-primary" onClick={() => { setEditor({ mode: 'add', draft: emptyDraft(), initial: JSON.stringify(emptyDraft()) }); setGrants(new Set()); }}><Icon name="ti-plus" />New agent</button>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Agents" value={String(kpis.total)} icon="ti-robot" />
        <StatCard label="Enabled" value={String(kpis.enabled)} icon="ti-circle-check" />
        <StatCard label="Runs this month" value={String(kpis.runs)} icon="ti-activity" />
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-2xs uppercase tracking-wide text-muted2">Org cost ceiling</span><Icon name="ti-shield-dollar" className="text-muted2" /></div>
          <div className="flex items-center gap-2 text-xs">
            <button className="btn btn-sm" onClick={() => { const l = orgLimit('day'); setLimDraft({ period: 'day', max_runs: l?.max_runs != null ? String(l.max_runs) : '', max_usd: l?.max_usd != null ? String(l.max_usd) : '' }); }}>Day{orgLimit('day') ? ` · ${orgLimit('day')!.max_runs ?? '∞'} runs` : ''}</button>
            <button className="btn btn-sm" onClick={() => { const l = orgLimit('month'); setLimDraft({ period: 'month', max_runs: l?.max_runs != null ? String(l.max_runs) : '', max_usd: l?.max_usd != null ? String(l.max_usd) : '' }); }}>Month{orgLimit('month') ? ` · ${orgLimit('month')!.max_runs ?? '∞'} runs` : ''}</button>
          </div>
        </div>
      </div>

      <ListView
        rows={agents === null ? null : shown}
        rowKey={(a) => a.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search agents…"
        groupField={{ value: 'domain', label: 'Domain' }}
        groupOf={(a) => a.domain}
        groups={GROUPS}
        onRowClick={(a) => openEdit(a)}
        exportName="agents"
        exportValue={(id, a) => id === 'name' ? a.name : id === 'domain' ? a.domain : id === 'autonomy' ? a.autonomy_level : id === 'runs' ? String(runsThisMonth(a.id)) : id === 'status' ? (a.enabled ? 'enabled' : 'disabled') : id === 'created' ? (a.created_at?.slice(0, 10) || '') : ''}
        busy={busy}
        emptyIcon="ti-robot"
        emptyText="No agents yet. Create one to get started."
      />

      {editor && (
        <Modal open onClose={() => setEditor(null)} dirty={JSON.stringify({ ...editor.draft }) !== editor.initial && editor.mode === 'add'} size="lg" icon="ti-robot"
          title={editor.mode === 'edit' ? 'Edit agent' : 'New agent'} onSubmit={save}
          footer={<>
            {editor.mode === 'edit' && editor.draft.id && (
              <button className="btn btn-danger mr-auto" disabled={busy} onClick={async () => { if (!editor.draft.id || !confirm('Delete this agent?')) return; setBusy(true); try { await deleteAgent(editor.draft.id); setEditor(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>Delete</button>
            )}
            <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !editor.draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </>}
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required><input className="input" autoFocus value={editor.draft.name} onChange={(e) => setD({ name: e.target.value })} placeholder="Accounting assistant" /></Field>
            <Field label="Domain"><Select value={editor.draft.domain} onChange={(v) => setD({ domain: v as AgentDomain })} options={AGENT_DOMAINS.map((d) => ({ value: d.key, label: d.label }))} /></Field>
            <Field label="Autonomy" className="sm:col-span-2"><Select value={editor.draft.autonomy_level} onChange={(v) => setD({ autonomy_level: v as AgentAutonomy })} options={Object.entries(AUTONOMY_LABELS).map(([k, l]) => ({ value: k, label: l }))} /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-[64px] resize-y" value={editor.draft.description} onChange={(e) => setD({ description: e.target.value })} placeholder="What this agent helps with…" /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={editor.draft.enabled} onChange={(e) => setD({ enabled: e.target.checked })} />Enabled</label>
          </div>

          {editor.mode === 'edit' && editor.draft.id ? (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><Icon name="ti-tools" className="text-muted2" />Granted tools</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {tools.map((t) => (
                  <label key={t.key} className="flex items-start gap-2 text-sm cursor-pointer rounded-md border border-line p-2 hover:bg-surface2">
                    <input type="checkbox" className="accent-accent w-4 h-4 mt-0.5" checked={grants.has(t.key)} onChange={() => toggleTool(t.key)} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5"><span className="text-content">{t.label}</span><span className="rounded px-1 text-2xs font-medium" style={{ backgroundColor: RISK_COLOR[t.risk] + '22', color: RISK_COLOR[t.risk] }}>{t.risk}</span></span>
                      <span className="block text-2xs text-muted">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-md bg-surface2 p-3">
                <span className="text-xs text-muted">Try the approve → rollback flow without an LLM key.</span>
                <button className="btn btn-sm" disabled={busy} onClick={runSample}><Icon name="ti-player-play" className="text-sm" />Generate sample proposal</button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-2xs text-muted">Save the agent first, then re-open it to grant tools and generate a sample proposal.</p>
          )}
        </Modal>
      )}

      {limDraft && (
        <Modal open onClose={() => setLimDraft(null)} size="sm" icon="ti-shield-dollar" title={`Org-wide ${limDraft.period} ceiling`} onSubmit={saveLimit}
          footer={<><button className="btn" onClick={() => setLimDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveLimit}>Save</button></>}>
          <p className="text-xs text-muted mb-3">Runs are refused once a ceiling is reached. Leave blank for no limit.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Max runs / ${limDraft.period}`}><input className="input" type="number" min="0" value={limDraft.max_runs} onChange={(e) => setLimDraft({ ...limDraft, max_runs: e.target.value })} placeholder="∞" /></Field>
            <Field label={`Max $ / ${limDraft.period}`}><input className="input" type="number" min="0" step="0.01" value={limDraft.max_usd} onChange={(e) => setLimDraft({ ...limDraft, max_usd: e.target.value })} placeholder="∞" /></Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
