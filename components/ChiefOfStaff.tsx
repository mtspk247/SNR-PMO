import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { AGENT_TOOLS, AGENT_DOMAINS } from '@/lib/agents';
import { detectWorkflow, workflowByKey } from '@/lib/agentPlans';
import { listAgents, proposeWorkflowPlan, createAgent, listAgentActions, listAgentTools, runAgentProposer } from '@/lib/db';

// Chief of Staff — a floating, plan/RBAC-gated manager you can talk to. It acts AS the signed-in
// user (RLS/RBAC — never a super-user): it proposes approve-first, preflighted work by delegating
// to the domain agents, runs ready-made workflows, and can create new agents on request. Every
// action still lands in the Agent approvals queue. Deterministic-first; free-form falls to the
// LLM proposer (which degrades gracefully with no AI key).
type MsgLink = { href: string; label: string };
type Msg = { role: 'user' | 'assistant'; content: string; link?: MsgLink };

const DOMAIN_KW: [string, string][] = [
  ['helpdesk', 'support'], ['support', 'support'], ['ticket', 'support'],
  ['pipeline', 'crm'], ['sales', 'crm'], ['crm', 'crm'], ['lead', 'crm'],
  ['recruit', 'hr'], ['hr', 'hr'], ['onboard', 'hr'],
  ['people', 'people'], ['capacity', 'people'], ['workload', 'people'],
  ['expense', 'accounting'], ['invoice', 'accounting'], ['finance', 'accounting'], ['account', 'accounting'], ['ledger', 'accounting'],
  ['marketing', 'marketing'], ['social', 'marketing'], ['content', 'marketing'],
  ['project', 'tasks'], ['task', 'tasks'], ['work', 'tasks'],
];

export function parseCreateAgent(text: string): { name: string; domain: string } | null {
  if (!/\b(create|add|make|set\s?up|spin\s?up|new|build)\b/i.test(text) || !/\bagent\b/i.test(text)) return null;
  const low = text.toLowerCase();
  let domain = 'general';
  for (const [kw, dom] of DOMAIN_KW) { if (low.includes(kw)) { domain = dom; break; } }
  let name = '';
  const nm = text.match(/\b(?:called|named|call it|name it)\s+(.+?)$/i);
  if (nm) name = nm[1].replace(/["'`.!?]+$/g, '').trim();
  if (!name) {
    const label = AGENT_DOMAINS.find((d) => d.key === domain)?.label || 'General';
    name = `${label} Assistant`;
  }
  return { name: name.slice(0, 80), domain };
}

const HIDE_KEY = 'chief_of_staff_hidden';

export default function ChiefOfStaff() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const brand = (org as any)?.branding?.name || (org as any)?.name || 'your workspace';
  const isAdmin = ['owner', 'admin'].includes((org as any)?.member_role || '');
  const canManage = isAdmin || !!me?.can_manage_agents;
  const gated = hasFeature(org, 'agents') && canManage;

  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { /* */ } }, []);
  useEffect(() => { if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs, open, busy]);
  useEffect(() => {
    const onOpen = () => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* */ } setOpen(true); };
    window.addEventListener('snr:open-chief', onOpen);
    return () => window.removeEventListener('snr:open-chief', onOpen);
  }, []);
  useEffect(() => {
    if (!open || !org?.id || agentId) return;
    listAgents(org.id).then((list) => {
      const chief = list.find((a) => a.builtin && a.name === 'Chief of Staff' && a.enabled) || list.find((a) => a.enabled);
      if (chief) setAgentId(chief.id);
    }).catch(() => {});
  }, [open, org?.id, agentId]);

  if (!gated || hidden) return null;

  const reply = (content: string, link?: MsgLink) => setMsgs((m) => [...m, { role: 'assistant', content, link }]);

  async function resolveAgent(): Promise<string> {
    if (agentId) return agentId;
    try {
      const list = await listAgents(org!.id);
      const c = list.find((a) => a.builtin && a.name === 'Chief of Staff' && a.enabled) || list.find((a) => a.enabled);
      const id = c?.id || ''; if (id) setAgentId(id); return id;
    } catch { return ''; }
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy || !org) return;
    setMsgs((m) => [...m, { role: 'user', content: msg }]);
    setQ(''); setBusy(true);
    try {
      // 1) Create an agent on request (manage-gated).
      const ca = parseCreateAgent(msg);
      if (ca) {
        if (!canManage) { reply('You need the “Manage agents” permission to create agents. Ask an admin, or I can still run workflows for you.'); return; }
        await createAgent({ org_id: org.id, name: ca.name, domain: ca.domain as any, autonomy_level: 'approve_first', created_by: me?.id || null });
        reply(`Done — I created a new agent, “${ca.name}” (${ca.domain}). It works approve-first like the rest; open Agents to grant it tools.`, { href: '/agents', label: 'Open Agents' });
        return;
      }
      // 2) Ready-made workflow (deterministic).
      const wf = detectWorkflow(msg);
      if (wf) {
        const tpl = workflowByKey(wf.key);
        const aid = await resolveAgent();
        if (tpl && wf.ready && aid) {
          const { count } = await proposeWorkflowPlan(org.id, aid, tpl.label, tpl.build(wf.vals));
          reply(`On it — I drafted a ${count}-step plan for “${tpl.label}”. Every step is preflighted and waiting for your approval.`, { href: '/agent-approvals', label: 'Review & approve' });
        } else if (tpl) {
          const ask = wf.key === 'employee_onboarding' ? 'the employee’s name' : wf.key === 'client_onboarding' ? 'the client’s name' : 'the project name';
          reply(`I can set up “${tpl.label}”. What’s ${ask}?`);
        } else {
          reply('I couldn’t map that to a workflow. Try “onboard Acme Corp” or “kick off project Apollo”.');
        }
        return;
      }
      // 3) What needs my attention (read-only, RLS-scoped).
      if (/\b(attention|pending|approv|waiting|review|what.*(next|do|need))\b/i.test(msg)) {
        const acts = await listAgentActions(org.id, 'proposed');
        if (acts.length) reply(`You have ${acts.length} action${acts.length === 1 ? '' : 's'} waiting for your approval.`, { href: '/agent-approvals', label: 'Review approvals' });
        else reply('You’re all clear — nothing is waiting for your approval right now.', { href: '/agents', label: 'Open Agents' });
        return;
      }
      // 4) Free-form → the LLM proposer via the Chief of Staff agent (degrades without a key).
      const aid = await resolveAgent();
      if (!aid) { reply('I need an active agent first. Add your built-in team on the Agents page.', { href: '/agents', label: 'Open Agents' }); return; }
      const grants = await listAgentTools(aid);
      const granted = new Set(grants.map((x) => x.tool_key));
      const tools = AGENT_TOOLS.filter((t) => granted.has(t.key)).map((t) => ({ key: t.key, label: t.label, description: t.description, risk: t.risk, reversible: t.reversible }));
      const res = await runAgentProposer({ orgId: org.id, agentId: aid, request: msg, tools, brand });
      if (res.configured === false) reply('I can run ready-made workflows (“onboard Acme Corp”) and create agents right now. For free-form requests like this, connect an AI key under Console ▸ AI assistant.', { href: '/agents', label: 'Open Agents' });
      else if (res.error) reply(res.error);
      else if ((res.proposed || 0) > 0) reply(`I drafted ${res.proposed} action${res.proposed === 1 ? '' : 's'} for that — review and approve when ready.`, { href: '/agent-approvals', label: 'Review approvals' });
      else reply('I couldn’t turn that into an action. Try “onboard Acme Corp”, “kick off project Apollo”, or “create a support agent”.');
    } catch (e: any) {
      reply(`Something went wrong: ${e?.message || 'please try again'}.`);
    } finally {
      setBusy(false);
    }
  }

  const CHIPS = ['What needs my attention?', 'Onboard a new client', 'Kick off a project', 'Create a support agent'];

  return (
    <div className="fixed left-5 bottom-5 z-40 print:hidden">
      {open && (
        <div className="absolute bottom-full left-0 mb-3 w-[23rem] max-w-[calc(100vw-2.5rem)] h-[32rem] max-h-[calc(100vh-8rem)] bg-surface border border-line rounded-2xl shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-user-shield" className="text-sm" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content leading-tight truncate">Chief of Staff</p>
              <p className="text-2xs text-muted leading-tight truncate">Approve-first · acts with your permissions</p>
            </div>
            <Link href="/agents" title="Manage agents" className="ml-auto text-muted hover:text-content"><Icon name="ti-robot" className="text-base" /></Link>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-content"><Icon name="ti-x" className="text-base" /></button>
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-content">Hi — I coordinate your agents. Tell me what you need and I’ll draft it for your approval. Nothing runs until you say so.</p>
                <div className="flex flex-col gap-1.5">
                  {CHIPS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left text-xs px-3 py-2 rounded-lg bg-surface2 hover:bg-accent/10 text-content transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-accent text-white px-3 py-2 text-sm' : 'max-w-[92%] text-sm text-content'}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && m.link && (
                    <Link href={m.link.href} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 mt-2 text-2xs px-2 py-1 rounded-full bg-surface2 text-accentstrong hover:bg-accent/10 transition-colors">
                      <Icon name="ti-arrow-right" className="text-2xs" />{m.link.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted flex items-center gap-1.5"><Icon name="ti-loader-2" className="text-sm animate-spin" />Working…</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="border-t border-line p-2.5 flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your Chief of Staff…" disabled={busy} className="input flex-1 text-sm" aria-label="Ask the Chief of Staff" />
            <button type="submit" disabled={busy || !q.trim()} aria-label="Send" className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
              <Icon name="ti-arrow-up" className="text-base" />
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-label="Chief of Staff"
        className="flex items-center gap-2 pl-3 pr-4 h-11 rounded-full bg-accent text-white shadow-lg shadow-accent/25 hover:brightness-105 transition">
        <Icon name="ti-user-shield" className="text-lg" />
        <span className="text-sm font-semibold hidden sm:inline">Chief of Staff</span>
      </button>
    </div>
  );
}
