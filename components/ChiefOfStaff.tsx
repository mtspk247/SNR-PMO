import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { AGENT_TOOLS, AGENT_DOMAINS } from '@/lib/agents';
import { detectWorkflow, workflowByKey } from '@/lib/agentPlans';
import { retrieveSections, sectionPlain } from '@/lib/docs';
import { listAgents, proposeWorkflowPlan, createAgent, listAgentTools, runAgentProposer, askChief, getEmployees, dashboardCounts, AssistantTurn } from '@/lib/db';

// Chief of Staff — the project's AI Personal Assistant. LLM-first + conversational: every question
// is answered by the chief-assistant edge fn, GROUNDED in the live product docs AND a live,
// RBAC/RLS-scoped snapshot of the user's own workspace data (team, metrics) — so answers are
// relevant, not canned. It acts AS the signed-in user (never a super-user). Clear actions
// (run a workflow, create an agent) are proposed approve-first through the existing queue.
// Movable launcher + persisted conversation history.
type MsgLink = { href: string; label: string };
type Msg = { role: 'user' | 'assistant'; content: string; link?: MsgLink };

const DOMAIN_KW: [string, string][] = [
  ['helpdesk', 'support'], ['support', 'support'], ['ticket', 'support'],
  ['pipeline', 'crm'], ['sales', 'crm'], ['crm', 'crm'], ['lead', 'crm'],
  ['recruit', 'hr'], ['hr', 'hr'],
  ['people', 'people'], ['capacity', 'people'], ['workload', 'people'],
  ['expense', 'accounting'], ['invoice', 'accounting'], ['finance', 'accounting'], ['account', 'accounting'], ['ledger', 'accounting'],
  ['marketing', 'marketing'], ['social', 'marketing'], ['content', 'marketing'],
  ['project', 'tasks'], ['task', 'tasks'], ['work', 'tasks'],
];

export function parseCreateAgent(text: string): { name: string; domain: string } | null {
  // Only treat as create-AGENT (not create user/report/etc). Requires the word "agent".
  if (!/\b(create|add|make|set\s?up|spin\s?up|new|build)\b/i.test(text) || !/\bagent\b/i.test(text)) return null;
  if (/\b(user|report|task|project|client|contact|deal|invoice|expense)\b/i.test(text)) return null;
  const low = text.toLowerCase();
  let domain = 'general';
  for (const [kw, dom] of DOMAIN_KW) { if (low.includes(kw)) { domain = dom; break; } }
  let name = '';
  const nm = text.match(/\b(?:called|named|call it|name it)\s+(.+?)$/i);
  if (nm) name = nm[1].replace(/["'`.!?]+$/g, '').trim();
  if (!name) { const label = AGENT_DOMAINS.find((d) => d.key === domain)?.label || 'General'; name = `${label} Assistant`; }
  return { name: name.slice(0, 80), domain };
}

const HIDE_KEY = 'chief_of_staff_hidden';
const POS_KEY = 'chief_fab_pos';
const PW = 384, PH = 544; // panel px

export default function ChiefOfStaff() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const brand = (org as any)?.branding?.name || (org as any)?.name || 'your workspace';
  const isAdmin = ['owner', 'admin'].includes((org as any)?.member_role || '');
  const canManage = isAdmin || !!me?.can_manage_agents;
  const gated = hasFeature(org, 'agents') && canManage;

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 20, y: 400 });
  const scroller = useRef<HTMLDivElement>(null);
  const ctxCache = useRef<{ id: string; title: string; text: string }[] | null>(null);
  const drag = useRef<{ on: boolean; moved: boolean; dx: number; dy: number }>({ on: false, moved: false, dx: 0, dy: 0 });
  const histKey = org ? `chief_hist_${org.id}` : '';

  useEffect(() => {
    setMounted(true);
    try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { /* */ }
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw));
      else setPos({ x: 20, y: Math.max(80, window.innerHeight - 72) });
    } catch { setPos({ x: 20, y: 400 }); }
  }, []);
  useEffect(() => { // restore history per org
    if (!histKey) return;
    try { const raw = localStorage.getItem(histKey); setMsgs(raw ? JSON.parse(raw) : []); } catch { setMsgs([]); }
    ctxCache.current = null;
  }, [histKey]);
  useEffect(() => { if (histKey) { try { localStorage.setItem(histKey, JSON.stringify(msgs.slice(-50))); } catch { /* */ } } }, [msgs, histKey]);
  useEffect(() => { if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs, open, busy]);
  useEffect(() => {
    const onOpen = () => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* */ } setOpen(true); };
    window.addEventListener('snr:open-chief', onOpen);
    return () => window.removeEventListener('snr:open-chief', onOpen);
  }, []);

  if (!mounted || !gated || hidden) return null;

  const reply = (content: string, link?: MsgLink) => setMsgs((m) => [...m, { role: 'assistant', content, link }]);

  async function resolveAgent(): Promise<string> {
    if (agentId) return agentId;
    try {
      const list = await listAgents(org!.id);
      const c = list.find((a) => a.builtin && a.name === 'Chief of Staff' && a.enabled) || list.find((a) => a.enabled);
      const id = c?.id || ''; if (id) setAgentId(id); return id;
    } catch { return ''; }
  }

  // Live, RBAC/RLS-scoped snapshot the assistant can reason over. Cached per open session.
  async function gatherContext(question: string): Promise<{ id: string; title: string; text: string }[]> {
    const ctx: { id: string; title: string; text: string }[] = [];
    try { for (const h of retrieveSections(question, 4)) ctx.push({ id: h.section.id, title: h.section.title, text: sectionPlain(h.section) }); } catch { /* */ }
    if (ctxCache.current) return [...ctx, ...ctxCache.current];
    const live: { id: string; title: string; text: string }[] = [];
    try {
      const [emps, counts] = await Promise.all([getEmployees(org!.id).catch(() => [] as any[]), dashboardCounts(org!.id).catch(() => ({} as any))]);
      const team = (emps || []).slice(0, 60).map((e: any) => `- ${e.full_name}${e.job_title ? ` — ${e.job_title}` : ''}${e.department ? ` (${e.department})` : ''} · role: ${e.role}${e.status && e.status !== 'active' ? ` [${e.status}]` : ''}`).join('\n');
      live.push({ id: 'live-team', title: `Team — ${(emps || []).length} people`, text: team || 'No team members are visible to you.' });
      const m: any = counts || {};
      live.push({ id: 'live-metrics', title: 'Live workspace metrics', text: [
        `Pending agent approvals: ${m.agent_pending ?? 0}`, `Overdue tasks: ${m.tasks_overdue ?? 0}`,
        `Overdue invoices: ${m.invoices_overdue ?? 0}`, `Expenses pending: ${m.expenses_pending ?? 0}`,
        `Leave requests pending: ${m.leave_pending ?? 0}`, `New leads (7d): ${m.leads_new_7d ?? 0}`,
        `Open inbox items: ${m.inbox_open ?? 0}`, `Drive files: ${m.drive_files ?? 0}`,
      ].join('\n') });
    } catch { /* */ }
    ctxCache.current = live;
    return [...ctx, ...live];
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy || !org) return;
    setMsgs((m) => [...m, { role: 'user', content: msg }]);
    setQ(''); setBusy(true);
    try {
      // Clear actions first (deterministic, approve-first). Everything else → the LLM assistant.
      const ca = parseCreateAgent(msg);
      if (ca) {
        if (!canManage) { reply('You need the “Manage agents” permission to create agents.'); return; }
        await createAgent({ org_id: org.id, name: ca.name, domain: ca.domain as any, autonomy_level: 'approve_first', created_by: me?.id || null });
        reply(`Done — I created a new agent, “${ca.name}” (${ca.domain}). It works approve-first; open Agents to grant it tools.`, { href: '/agents', label: 'Open Agents' });
        return;
      }
      const wf = detectWorkflow(msg);
      if (wf) {
        const tpl = workflowByKey(wf.key);
        if (tpl && wf.ready) {
          const aid = await resolveAgent();
          if (aid) { const { count } = await proposeWorkflowPlan(org.id, aid, tpl.label, tpl.build(wf.vals)); reply(`On it — I drafted a ${count}-step plan for “${tpl.label}”. Every step is preflighted and waiting for your approval.`, { href: '/agent-approvals', label: 'Review & approve' }); return; }
        } else if (tpl) {
          reply(`I can set up “${tpl.label}”. What’s ${wf.key === 'employee_onboarding' ? 'the employee’s name' : wf.key === 'client_onboarding' ? 'the client’s name' : 'the project name'}?`);
          return;
        }
      }
      // Conversational: grounded LLM answer over docs + live data.
      const context = await gatherContext(msg);
      const history: AssistantTurn[] = msgs.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const res = await askChief({ question: msg, brand, history, context });
      if (res.configured === false) {
        reply('I can run ready-made workflows (“onboard Acme Corp”) and create agents right now. To answer free-form questions and requests, connect an AI key under Console ▸ AI assistant.', { href: '/keys', label: 'Connect an AI key' });
      } else if (res.answer) {
        reply(res.answer);
      } else {
        reply('I couldn’t work that out just now — try rephrasing, or ask me to run a workflow or create an agent.');
      }
    } catch (e: any) {
      reply(`Something went wrong: ${e?.message || 'please try again'}.`);
    } finally {
      setBusy(false);
    }
  }

  // Draggable launcher (persisted). A small move-threshold distinguishes drag from click.
  const onPointerDown = (e: RPE) => {
    drag.current = { on: true, moved: false, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPE) => {
    if (!drag.current.on) return;
    const nx = e.clientX - drag.current.dx, ny = e.clientY - drag.current.dy;
    if (Math.abs(e.clientX - (drag.current.dx + pos.x)) > 4 || Math.abs(e.clientY - (drag.current.dy + pos.y)) > 4) drag.current.moved = true;
    const cx = Math.min(Math.max(8, nx), window.innerWidth - 60);
    const cy = Math.min(Math.max(60, ny), window.innerHeight - 20);
    setPos({ x: cx, y: cy });
  };
  const onPointerUp = () => {
    if (drag.current.on) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* */ } }
    const wasDrag = drag.current.moved; drag.current.on = false;
    if (!wasDrag) setOpen((v) => !v);
  };

  // Panel placed near the FAB, clamped on-screen.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const panelLeft = Math.min(Math.max(8, pos.x), Math.max(8, vw - PW - 8));
  const panelTop = pos.y > vh / 2 ? Math.max(8, pos.y - PH - 12) : Math.min(pos.y + 56, vh - PH - 8);

  const CHIPS = ['How many staff do we have and what do they do?', 'What needs my attention today?', 'Onboard a new client', 'Create a support agent'];

  return (
    <div className="print:hidden">
      {open && (
        <div className="fixed z-50 bg-surface border border-line rounded-2xl shadow-xl flex flex-col overflow-hidden"
          style={{ left: panelLeft, top: Math.max(8, panelTop), width: PW, height: Math.min(PH, vh - 16) }}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-user-shield" className="text-sm" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content leading-tight truncate">Chief of Staff</p>
              <p className="text-2xs text-muted leading-tight truncate">Knows your workspace · acts with your permissions</p>
            </div>
            {msgs.length > 0 && <button onClick={() => { setMsgs([]); ctxCache.current = null; }} title="Clear conversation" className="ml-auto text-muted hover:text-content"><Icon name="ti-eraser" className="text-base" /></button>}
            <Link href="/agents" title="Manage agents" className={msgs.length > 0 ? 'text-muted hover:text-content' : 'ml-auto text-muted hover:text-content'}><Icon name="ti-robot" className="text-base" /></Link>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-content"><Icon name="ti-x" className="text-base" /></button>
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-content">Hi — I’m your Chief of Staff. Ask me anything about {brand}, or tell me what you need done. I know your team, your numbers and the whole platform, and I only act with your permissions — nothing changes without your approval.</p>
                <div className="flex flex-col gap-1.5">
                  {CHIPS.map((s) => (<button key={s} onClick={() => send(s)} className="text-left text-xs px-3 py-2 rounded-lg bg-surface2 hover:bg-accent/10 text-content transition-colors">{s}</button>))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-accent text-white px-3 py-2 text-sm' : 'max-w-[92%] text-sm text-content'}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && m.link && (
                    <Link href={m.link.href} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 mt-2 text-2xs px-2 py-1 rounded-full bg-surface2 text-accentstrong hover:bg-accent/10 transition-colors"><Icon name="ti-arrow-right" className="text-2xs" />{m.link.label}</Link>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted flex items-center gap-1.5"><Icon name="ti-loader-2" className="text-sm animate-spin" />Thinking…</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="border-t border-line p-2.5 flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your Chief of Staff…" disabled={busy} className="input flex-1 text-sm" aria-label="Ask the Chief of Staff" />
            <button type="submit" disabled={busy || !q.trim()} aria-label="Send" className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"><Icon name="ti-arrow-up" className="text-base" /></button>
          </form>
        </div>
      )}

      <button
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        aria-label="Chief of Staff — drag to move"
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
        className="fixed z-50 flex items-center gap-2 pl-3 pr-4 h-11 rounded-full bg-accent text-white shadow-lg shadow-accent/25 hover:brightness-105 transition cursor-grab active:cursor-grabbing select-none">
        <Icon name="ti-user-shield" className="text-lg" />
        <span className="text-sm font-semibold hidden sm:inline">Chief of Staff</span>
      </button>
    </div>
  );
}
