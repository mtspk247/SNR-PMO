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
import { AGENT_DOMAINS, AUTONOMY_LABELS, toolsForDomain, RISK_COLOR, AGENT_TOOLS } from '@/lib/agents';
import { ChatCommand, CHAT_TOOLABLE } from '@/lib/chatCommands';
import { executorFor, canAutoExecute } from '@/lib/agentExecutors';
import { SCANNABLE_DOMAINS } from '@/lib/agentScanner';
import { toast } from '@/lib/toast';
import {
  listAgents, createAgent, updateAgent, deleteAgent, listAgentTools, grantAgentTool, revokeAgentTool, seedStarterAgents,
  listAgentCostLimits, setAgentCostLimit, listAgentUsage, simulateAgentProposal, runAgentProposer, agentUsageCost, runWorkScan,
  listAgentActions, recordAgentExecution, autoApproveAgentAction,
  listChatCommands, createChatCommand, updateChatCommand, deleteChatCommand, seedBuiltinChatCommands,
  AgentDefinition, AgentDomain, AgentAutonomy, AgentCostLimit, AgentUsage, AgentUsageCost,
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
  const [cost, setCost] = useState<AgentUsageCost | null>(null);
  const [limits, setLimits] = useState<AgentCostLimit[]>([]);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft; initial: string } | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const [runReq, setRunReq] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [commands, setCommands] = useState<ChatCommand[]>([]);
  const [cmdEditor, setCmdEditor] = useState<{ mode: 'add' | 'edit'; id?: string; kw: string; label: string; tool_key: string; who: 'members' | 'managers' } | null>(null);
  const prefs = useListPrefs('snrpmo.agents.cols', COLS);

  const load = () => {
    if (!org) return;
    listAgents(org.id).then(setAgents).catch((e) => { setErr(e.message); setAgents([]); });
    listAgentUsage(org.id).then(setUsage).catch(() => {});
    agentUsageCost(org.id).then(setCost).catch(() => {});
    listAgentCostLimits(org.id).then(setLimits).catch(() => {});
    listChatCommands(org.id).then(setCommands).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const toolLabel = (k: string | null) => AGENT_TOOLS.find((t) => t.key === k)?.label || k || '—';
  const loadBuiltins = async () => { if (!org) return; setBusy(true); setErr(''); try { await seedBuiltinChatCommands(org.id); listChatCommands(org.id).then(setCommands); toast('Built-in commands added', 'success'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggleCmd = async (c: ChatCommand) => { try { await updateChatCommand(c.id, { enabled: !c.enabled }); setCommands((cs) => cs.map((x) => x.id === c.id ? { ...x, enabled: !x.enabled } : x)); } catch (e: any) { setErr(e.message); } };
  const removeCmd = async (c: ChatCommand) => { if (!confirm(`Delete #${c.keyword}?`)) return; try { await deleteChatCommand(c.id); setCommands((cs) => cs.filter((x) => x.id !== c.id)); } catch (e: any) { setErr(e.message); } };
  const saveCmd = async () => { if (!org || !cmdEditor || busy) return; const kw = cmdEditor.kw.trim(); if (!kw || !cmdEditor.label.trim()) return; setBusy(true); setErr(''); try {
    const dom = AGENT_TOOLS.find((t) => t.key === cmdEditor.tool_key)?.domain || 'general';
    if (cmdEditor.mode === 'edit' && cmdEditor.id) await updateChatCommand(cmdEditor.id, { keyword: kw, label: cmdEditor.label.trim(), tool_key: cmdEditor.tool_key, domain: dom, who_can_use: cmdEditor.who });
    else await createChatCommand({ org_id: org.id, keyword: kw, label: cmdEditor.label.trim(), kind: 'tool', tool_key: cmdEditor.tool_key, domain: dom, who_can_use: cmdEditor.who, created_by: me?.id });
    setCmdEditor(null); listChatCommands(org.id).then(setCommands);
  } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

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

  const addStarters = async () => {
    if (!org || !me || seeding) return;
    setSeeding(true); setErr('');
    try { const n = await seedStarterAgents(org.id, me.id); toast(n > 0 ? ('Added ' + n + ' starter agent' + (n === 1 ? '' : 's')) : 'Starter agents already added', n > 0 ? 'success' : 'info'); load(); }
    catch (e: any) { setErr(e.message); } finally { setSeeding(false); }
  };

  // Phase 3.5: after a run proposes, auto-execute the low-risk reversible actions of an
  // auto_low_risk agent (no approval click). Each runs as the user via the executor (RLS),
  // the auto-approve RPC re-enforces the policy, and everything stays audited + reversible.
  const autoRunForRun = async (runId: string | undefined, draft: Draft): Promise<{ auto: number; failed: number }> => {
    if (!org || !me || !runId || draft.autonomy_level !== 'auto_low_risk') return { auto: 0, failed: 0 };
    let acts: any[] = [];
    try { acts = await listAgentActions(org.id, 'proposed'); } catch { return { auto: 0, failed: 0 }; }
    const eligible = acts.filter((a: any) => a.run_id === runId && canAutoExecute(draft.autonomy_level, a)).slice(0, 25);
    let auto = 0, failed = 0;
    for (const a of eligible) {
      try {
        await autoApproveAgentAction(a.id);
        const ex = executorFor(a.tool_key);
        if (ex) { const r = await ex.execute(a, { orgId: org.id, userId: me.id }); await recordAgentExecution(a.id, r.target_table, r.target_id, r.result, r.reversal, r.prior_state); auto++; }
      } catch { failed++; }
    }
    return { auto, failed };
  };

  const runSample = async () => {
    if (!org || !editor?.draft.id || busy) return;
    setBusy(true); setErr('');
    try {
      const runId = await simulateAgentProposal(org.id, editor.draft.id, editor.draft.domain);
      const { auto } = await autoRunForRun(runId, editor.draft);
      toast(auto > 0 ? (auto + ' low-risk action' + (auto === 1 ? '' : 's') + ' auto-executed') : 'Sample proposal ready for approval', auto > 0 ? 'success' : 'info');
      setEditor(null); router.push('/agent-approvals');
    }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const findWork = async () => {
    if (!org || !editor?.draft.id || busy) return;
    setBusy(true); setErr('');
    try {
      const { runId, count } = await runWorkScan(org.id, { id: editor.draft.id, domain: editor.draft.domain });
      if (count === 0) { toast('No actionable work found in this domain right now', 'info'); return; }
      const { auto } = await autoRunForRun(runId || undefined, editor.draft);
      toast('Found ' + count + ' item' + (count === 1 ? '' : 's') + (auto > 0 ? (', ' + auto + ' auto-executed') : '') + ' \u2014 review in approvals', 'success');
      setEditor(null); router.push('/agent-approvals');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const runAgent = async () => {
    if (!org || !editor?.draft.id || !runReq.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const tools = AGENT_TOOLS.filter((t) => grants.has(t.key)).map((t) => ({ key: t.key, label: t.label, description: t.description, risk: t.risk, reversible: t.reversible }));
      const res = await runAgentProposer({ orgId: org.id, agentId: editor.draft.id, request: runReq.trim(), tools, brand: (org as any).name || '' });
      if (res.configured === false) setErr('Connect an LLM key under Console ▸ AI assistant to let agents propose real actions.');
      else if (res.error) setErr(res.error);
      else if ((res.proposed || 0) > 0) { const { auto } = await autoRunForRun(res.run_id, editor.draft); if (auto > 0) toast(auto + ' low-risk action' + (auto === 1 ? '' : 's') + ' auto-executed', 'success'); setEditor(null); router.push('/agent-approvals'); }
      else setErr('The agent did not propose any actions for that request.');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
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
        action={<div className="flex items-center gap-2"><button className="btn btn-sm" onClick={() => router.push('/agent-activity')}><Icon name="ti-chart-line" />Activity & ROI</button><button className="btn btn-primary" onClick={() => { setEditor({ mode: 'add', draft: emptyDraft(), initial: JSON.stringify(emptyDraft()) }); setGrants(new Set()); }}><Icon name="ti-plus" />New agent</button></div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <StatCard label="Agents" value={String(kpis.total)} icon="ti-robot" />
        <StatCard label="Enabled" value={String(kpis.enabled)} icon="ti-circle-check" />
        <StatCard label="Runs this month" value={String(kpis.runs)} icon="ti-activity" />
        <StatCard label="Est. cost this month" value={cost ? `$${cost.amount.toFixed(2)}` : '—'} hint={cost ? `${cost.source === 'reseller' ? 'Reseller rate' : 'Plan rate'}: $${cost.per_run}/run · $${cost.per_1k_tokens}/1k` : 'metered agent usage'} icon="ti-coin" />
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-2xs uppercase tracking-wide text-muted2">Org cost ceiling</span><Icon name="ti-shield-dollar" className="text-muted2" /></div>
          <div className="flex items-center gap-2 text-xs">
            <button className="btn btn-sm" onClick={() => { const l = orgLimit('day'); setLimDraft({ period: 'day', max_runs: l?.max_runs != null ? String(l.max_runs) : '', max_usd: l?.max_usd != null ? String(l.max_usd) : '' }); }}>Day{orgLimit('day') ? ` · ${orgLimit('day')!.max_runs ?? '∞'} runs` : ''}</button>
            <button className="btn btn-sm" onClick={() => { const l = orgLimit('month'); setLimDraft({ period: 'month', max_runs: l?.max_runs != null ? String(l.max_runs) : '', max_usd: l?.max_usd != null ? String(l.max_usd) : '' }); }}>Month{orgLimit('month') ? ` · ${orgLimit('month')!.max_runs ?? '∞'} runs` : ''}</button>
          </div>
        </div>
      </div>

      {agents && agents.length === 0 && canManage && (
        <div className="card p-5 mb-4 flex flex-wrap items-center justify-between gap-3 border border-dashed border-line">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Icon name="ti-sparkles" className="text-accent" />Start with a ready-made agent team</h3>
            <p className="text-2xs text-muted mt-0.5 max-w-2xl">Provision five back-office agents — Task Assistant, Onboarding Helper, Expense Categorizer, Support Triage and Pipeline Mover — pre-wired with the right tools. Try one instantly with &ldquo;Generate sample proposal&rdquo;; nothing runs until you ask.</p>
          </div>
          <button className="btn btn-primary whitespace-nowrap" disabled={seeding} onClick={addStarters}><Icon name="ti-wand" />{seeding ? 'Adding…' : 'Add starter agents'}</button>
        </div>
      )}

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

      {canManage && (
        <div className="card p-5 mt-5">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-slash" className="text-muted2" />Chat commands</h3>
              <p className="text-2xs text-muted mt-0.5 max-w-2xl">Type <code className="text-accentstrong">#keyword</code> in chat and an agent acts on it. Every command is <b>approval-gated</b> — it proposes an action for review (Auto low-risk agents run it; otherwise it queues in Agent Approvals). Members can use member-commands (always queued); managers configure them here.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {commands.length === 0 && <button className="btn btn-sm" disabled={busy} onClick={loadBuiltins}><Icon name="ti-download" />Load built-ins</button>}
              <button className="btn btn-primary btn-sm" onClick={() => setCmdEditor({ mode: 'add', kw: '', label: '', tool_key: 'create_task', who: 'members' })}><Icon name="ti-plus" />Add command</button>
            </div>
          </div>
          {commands.length === 0 ? (
            <p className="text-2xs text-muted">No commands yet — load the built-ins (#task, #onboard, #expense) or add your own.</p>
          ) : (
            <div className="space-y-1.5">
              {commands.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <code className="text-xs font-semibold text-accentstrong shrink-0">#{c.keyword}</code>
                  <button className="text-sm text-content truncate min-w-0 text-left hover:text-accentstrong" onClick={() => setCmdEditor({ mode: 'edit', id: c.id, kw: c.keyword, label: c.label, tool_key: c.tool_key || 'create_task', who: c.who_can_use })}>{c.label}</button>
                  <span className="text-2xs text-muted2 shrink-0 hidden sm:inline">{toolLabel(c.tool_key)} · {c.who_can_use}{c.is_builtin ? ' · built-in' : ''}</span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1 text-2xs text-muted cursor-pointer"><input type="checkbox" className="accent-accent w-3.5 h-3.5" checked={c.enabled} onChange={() => toggleCmd(c)} />on</label>
                    {!c.is_builtin && <button className="text-muted2 hover:text-rose-500" title="Delete" onClick={() => removeCmd(c)}><Icon name="ti-trash" className="text-sm" /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            {editor.draft.autonomy_level === 'auto_low_risk' && <p className="text-2xs text-muted sm:col-span-2 -mt-1.5"><Icon name="ti-bolt" className="text-amber-500" /> Low-risk, reversible actions run automatically — no approval click. Money, payroll and any medium/high-risk action still wait for approval. Everything stays audited and one-click reversible.</p>}
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
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-1 inline-flex items-center gap-2"><Icon name="ti-sparkles" className="text-muted2" />Run the agent</h3>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" value={runReq} onChange={(e) => setRunReq(e.target.value)} placeholder="Describe what you want the agent to do…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runAgent(); } }} />
                  <button className="btn btn-primary btn-sm" disabled={busy || !runReq.trim()} onClick={runAgent}>{busy ? 'Running…' : 'Run'}</button>
                </div>
                <p className="text-2xs text-muted mt-1">Needs an LLM key (Console ▸ AI assistant). Proposes actions for your approval — it never executes on its own.</p>
              </div>
              {SCANNABLE_DOMAINS.includes(editor.draft.domain) && (
                <div className="mt-3 flex items-center justify-between rounded-md bg-surface2 p-3 gap-3">
                  <span className="text-xs text-muted">No key needed — scan your real {editor.draft.domain === 'accounting' ? 'expenses' : editor.draft.domain === 'tasks' ? 'tasks' : 'deals'} for actionable work.</span>
                  <button className="btn btn-primary btn-sm whitespace-nowrap" disabled={busy} onClick={findWork}><Icon name="ti-radar" className="text-sm" />{busy ? 'Scanning…' : 'Find work in my data'}</button>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-md bg-surface2 p-3">
                <span className="text-xs text-muted">No key yet? Try the approve → rollback flow on sample data.</span>
                <button className="btn btn-sm" disabled={busy} onClick={runSample}><Icon name="ti-player-play" className="text-sm" />Generate sample proposal</button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-2xs text-muted">Save the agent first, then re-open it to grant tools and generate a sample proposal.</p>
          )}
        </Modal>
      )}

      {cmdEditor && (
        <Modal open onClose={() => setCmdEditor(null)} size="sm" icon="ti-slash" title={cmdEditor.mode === 'add' ? 'Add chat command' : 'Edit chat command'} onSubmit={saveCmd}
          footer={<><button className="btn" onClick={() => setCmdEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !cmdEditor.kw.trim() || !cmdEditor.label.trim()} onClick={saveCmd}>{busy ? 'Saving…' : 'Save'}</button></>}>
          <div className="space-y-3">
            <Field label="Keyword (no #)" required><div className="flex items-center"><span className="text-muted2 mr-1">#</span><input className="input" value={cmdEditor.kw} onChange={(e) => setCmdEditor({ ...cmdEditor, kw: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} placeholder="task" /></div></Field>
            <Field label="Label" required><input className="input" value={cmdEditor.label} onChange={(e) => setCmdEditor({ ...cmdEditor, label: e.target.value })} placeholder="Create a task" /></Field>
            <Field label="Action (what the agent does)"><Select value={cmdEditor.tool_key} onChange={(v) => setCmdEditor({ ...cmdEditor, tool_key: v })} options={CHAT_TOOLABLE.map((k) => ({ value: k, label: toolLabel(k) }))} /></Field>
            <Field label="Who can use"><Select value={cmdEditor.who} onChange={(v) => setCmdEditor({ ...cmdEditor, who: v as 'members' | 'managers' })} options={[{ value: 'members', label: 'Any member (always queued for approval)' }, { value: 'managers', label: 'Agent managers only' }]} /></Field>
            <p className="text-2xs text-muted inline-flex items-center gap-1"><Icon name="ti-shield-check" className="text-emerald-600" />Approval-gated — it proposes an action for review and never bypasses approval.</p>
          </div>
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
