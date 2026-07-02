import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { AGENT_TOOLS, AGENT_DOMAINS } from '@/lib/agents';
import { detectWorkflow, workflowByKey, detectInvite, parseEmail, parseInviteRole, suggestInviteRole, detectUpgrade, parseTrainingChanges, parseChiefAction, stripMd, type ChiefAction, type InviteIntent, type InviteRole, type TrainingChanges, type UpgradeIntent } from '@/lib/agentPlans';
import { retrieveSections, sectionPlain } from '@/lib/docs';
import { listAgents, proposeWorkflowPlan, createAgent, listAgentTools, runAgentProposer, askChief, getEmployees, dashboardCounts, AssistantTurn, AgentDefinition } from '@/lib/db';

// Chief of Staff — the project's AI Personal Assistant. LLM-first + conversational: every question
// is answered by the chief-assistant edge fn, GROUNDED in the live product docs AND a live,
// RBAC/RLS-scoped snapshot of the user's own workspace data (team, metrics) — so answers are
// relevant, not canned. It acts AS the signed-in user (never a super-user). Clear actions
// (run a workflow, create an agent) are proposed approve-first through the existing queue.
// Movable launcher + persisted conversation history.
type MsgLink = { href: string; label: string };
type Msg = { role: 'user' | 'assistant'; content: string; link?: MsgLink };

// Multi-turn conversational flows: the assistant collects missing details across
// turns, then proposes ONE approve-first action through the normal queue.
type Pending =
  | { kind: 'invite'; step: 'email' | 'role'; email?: string; role?: InviteRole; suggested?: InviteRole; why?: string; src: string }
  | { kind: 'upgrade'; step: 'agent' | 'tools'; changes: TrainingChanges; agentId?: string; agentName?: string; offered?: string[] };
const CANCEL_RE = /\b(cancel|never ?mind|forget it|abort)\b/i;
const AFFIRM_RE = /^\s*(y(es|ep|eah)?|ok(ay)?|sure|sounds good|go (ahead|for it)|do it|confirm|proceed|please do|that works)\b/i;
const AUTONOMY_SHORT: Record<string, string> = { draft_only: 'draft-only', approve_first: 'approve-first', auto_low_risk: 'auto low-risk' };

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
  const pend = useRef<Pending | null>(null);
  const agentsCache = useRef<AgentDefinition[] | null>(null);
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
    pend.current = null; agentsCache.current = null;
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

  const toolLabel = (k: string) => AGENT_TOOLS.find((t) => t.key === k)?.label || k;

  async function loadAgents(): Promise<AgentDefinition[]> {
    if (agentsCache.current) return agentsCache.current;
    try { const l = await listAgents(org!.id); agentsCache.current = l; return l; } catch { return []; }
  }
  const activeAgents = (l: AgentDefinition[]) => l.filter((a) => a.enabled && !a.archived_at);

  // ---- Invite a teammate (multi-turn → ONE approve-first invite_user action) ----
  async function proposeInvite(email: string, role: InviteRole) {
    pend.current = null;
    const aid = await resolveAgent();
    if (!aid) { reply('I couldn\u2019t find an enabled agent to route this through \u2014 open Agents and enable one.', { href: '/agents', label: 'Open Agents' }); return; }
    await proposeWorkflowPlan(org!.id, aid, 'Invite a teammate', [{ tool: 'invite_user', domain: 'general', summary: `Invite ${email} to the workspace as ${role}`, payload: { email, role }, risk: 'medium', reversible: true }]);
    reply(`Queued \u2014 I drafted the invitation for ${email} as ${role}. Approve it and the invite email goes out; you can revoke it any time.${isAdmin ? '' : ' Note: sending invites needs an owner/admin to approve.'}`, { href: '/agent-approvals', label: 'Review & approve' });
  }
  function askInviteRole(email: string, src: string) {
    const s = suggestInviteRole(src);
    pend.current = { kind: 'invite', step: 'role', email, suggested: s.role, why: s.why, src };
    reply(`What role should ${email} have?\n\u2022 admin \u2014 full control, including settings\n\u2022 member \u2014 full day-to-day access, no admin settings\n\u2022 viewer \u2014 read-only\nI\u2019d suggest ${s.role} (${s.why}) \u2014 say \u201cyes\u201d to go with that.`);
  }
  async function startInvite(inv: InviteIntent, src: string) {
    if (inv.email && inv.role) { await proposeInvite(inv.email, inv.role); return; }
    if (!inv.email) {
      pend.current = { kind: 'invite', step: 'email', role: inv.role, src };
      reply(inv.role ? `Happy to \u2014 what\u2019s their email address? I\u2019ll set them up as ${inv.role}.` : 'Happy to \u2014 what\u2019s their email address?');
      return;
    }
    askInviteRole(inv.email, src);
  }

  // ---- Train / upgrade an agent (multi-turn → ONE approve-first upgrade_agent action) ----
  async function proposeUpgrade(ag: AgentDefinition, ch: TrainingChanges) {
    pend.current = null;
    const parts: string[] = [];
    if (ch.tools.length) parts.push(`${ch.revoke ? 'revoke' : 'grant'} ${ch.tools.map(toolLabel).join(', ')}`);
    if (ch.autonomy) parts.push(`set autonomy to ${AUTONOMY_SHORT[ch.autonomy]}`);
    if (ch.sensing !== undefined) parts.push(`${ch.sensing ? 'enable' : 'disable'} proactive sensing`);
    if (!parts.length) { reply('Tell me what to change \u2014 a skill to grant or revoke, an autonomy level, or sensing on/off.'); return; }
    const aid = await resolveAgent();
    if (!aid) { reply('I couldn\u2019t find an enabled agent to route this through \u2014 open Agents and enable one.', { href: '/agents', label: 'Open Agents' }); return; }
    const payload: Record<string, unknown> = { agent_id: ag.id, agent_name: ag.name };
    if (ch.tools.length) payload[ch.revoke ? 'revoke_tools' : 'grant_tools'] = ch.tools;
    if (ch.autonomy) payload.autonomy_level = ch.autonomy;
    if (ch.sensing !== undefined) payload.sensing = ch.sensing;
    await proposeWorkflowPlan(org!.id, aid, `Train ${ag.name}`, [{ tool: 'upgrade_agent', domain: 'general', summary: `Train \u201c${ag.name}\u201d: ${parts.join(' \u00b7 ')}`, payload, risk: 'medium', reversible: true }]);
    reply(`Queued \u2014 approve it and I\u2019ll ${parts.join(', ')} for \u201c${ag.name}\u201d. Fully reversible if you change your mind.`, { href: '/agent-approvals', label: 'Review & approve' });
  }
  async function upgradeWithAgent(ag: AgentDefinition, ch: TrainingChanges) {
    if (ch.tools.length || ch.autonomy !== undefined || ch.sensing !== undefined) { await proposeUpgrade(ag, ch); return; }
    let have = new Set<string>();
    try { have = new Set((await listAgentTools(ag.id)).map((g) => g.tool_key)); } catch { /* offer from the full catalog */ }
    const candidates = AGENT_TOOLS.filter((t) => (t.domain === ag.domain || t.domain === 'general') && t.key !== 'upgrade_agent' && !have.has(t.key)).slice(0, 6);
    const known = AGENT_TOOLS.filter((t) => have.has(t.key)).map((t) => t.label).join(', ');
    pend.current = { kind: 'upgrade', step: 'tools', changes: { tools: [], revoke: false }, agentId: ag.id, agentName: ag.name, offered: candidates.map((t) => t.key) };
    if (!candidates.length) { reply(`\u201c${ag.name}\u201d already holds every skill for its domain${known ? ` (${known})` : ''}. I can still change its autonomy (draft-only / approve-first / auto low-risk) or toggle proactive sensing \u2014 what would you like?`); return; }
    reply(`\u201c${ag.name}\u201d currently knows: ${known || 'no tools yet'}.\nI can teach it:\n${candidates.map((t, i) => `${i + 1}. ${t.label}`).join('\n')}\nReply with numbers or names \u2014 or say \u201cmake it more autonomous\u201d / \u201cenable sensing\u201d.`);
  }
  async function startUpgrade(up: UpgradeIntent) {
    const ags = activeAgents(await loadAgents());
    if (!ags.length) { reply('You have no active agents yet \u2014 open Agents to add the built-in team first.', { href: '/agents', label: 'Open Agents' }); return; }
    const ag = up.agentName ? ags.find((a) => a.name.toLowerCase() === up.agentName!.toLowerCase()) : (ags.length === 1 ? ags[0] : undefined);
    if (!ag) { pend.current = { kind: 'upgrade', step: 'agent', changes: up.changes }; reply(`Which agent should I train? You have: ${ags.map((a) => a.name).join(' \u00b7 ')}`); return; }
    await upgradeWithAgent(ag, up.changes);
  }

  // An action line from the LLM answer routes into the SAME deterministic flows.
  async function runChiefAction(act: ChiefAction, srcMsg: string) {
    if (act.kind === 'invite') {
      const inv: InviteIntent = {};
      const e = parseEmail(act.attrs.email || ''); if (e) inv.email = e;
      const r = parseInviteRole(act.attrs.role || ''); if (r) inv.role = r;
      await startInvite(inv, srcMsg);
      return;
    }
    if (act.kind === 'train') {
      await startUpgrade({ agentName: act.attrs.agent || undefined, changes: parseTrainingChanges(srcMsg, AGENT_TOOLS) });
      return;
    }
    const tpl = workflowByKey(act.attrs.kind || '');
    if (!tpl) return;
    const nm = (act.attrs.name || '').trim();
    if (!nm) { reply(`What\u2019s ${act.attrs.kind === 'employee_onboarding' ? 'the employee\u2019s name' : act.attrs.kind === 'client_onboarding' ? 'the client\u2019s name' : 'the project name'}?`); return; }
    const vals: Record<string, string> = act.attrs.kind === 'client_onboarding' ? { client_name: nm } : act.attrs.kind === 'employee_onboarding' ? { employee_name: nm } : { project_name: nm };
    const aid = await resolveAgent();
    if (!aid) { reply('I couldn\u2019t find an enabled agent to route this through \u2014 open Agents and enable one.', { href: '/agents', label: 'Open Agents' }); return; }
    const { count } = await proposeWorkflowPlan(org!.id, aid, tpl.label, tpl.build(vals));
    reply(`On it \u2014 I drafted a ${count}-step plan for \u201c${tpl.label}\u201d. Every step is preflighted and waiting for your approval.`, { href: '/agent-approvals', label: 'Review & approve' });
  }

  // A reply while a flow is open belongs to that flow (say \u201ccancel\u201d to exit).
  async function handlePending(msg: string): Promise<boolean> {
    const p = pend.current;
    if (!p) return false;
    if (CANCEL_RE.test(msg)) { pend.current = null; reply('No problem \u2014 cancelled.'); return true; }
    if (p.kind === 'invite') {
      if (p.step === 'email') {
        const e = parseEmail(msg);
        if (!e) { reply('That doesn\u2019t look like an email address \u2014 send it like name@company.com, or say cancel.'); return true; }
        const r = p.role || parseInviteRole(msg);
        if (r) { await proposeInvite(e, r); } else { askInviteRole(e, `${p.src} ${msg}`); }
        return true;
      }
      const r = parseInviteRole(msg) || (AFFIRM_RE.test(msg) ? p.suggested : null);
      if (!r) { reply('Just reply admin, member or viewer \u2014 or \u201cyes\u201d for my suggestion.'); return true; }
      await proposeInvite(p.email!, r);
      return true;
    }
    const ags = activeAgents(await loadAgents());
    if (p.step === 'agent') {
      const low = msg.toLowerCase();
      const ag = ags.find((a) => low.includes(a.name.toLowerCase())) || ags.find((a) => a.name.toLowerCase().includes(low.trim()));
      if (!ag) { reply(`I don\u2019t recognise that one \u2014 reply with one of: ${ags.map((a) => a.name).join(' \u00b7 ')} (or say cancel).`); return true; }
      await upgradeWithAgent(ag, p.changes);
      return true;
    }
    const ag = ags.find((a) => a.id === p.agentId);
    if (!ag) { pend.current = null; reply('That agent is no longer available.'); return true; }
    const ch = parseTrainingChanges(msg, AGENT_TOOLS);
    for (const m of msg.match(/\b[1-9]\b/g) || []) { const k = (p.offered || [])[Number(m) - 1]; if (k && !ch.tools.includes(k)) ch.tools.push(k); }
    if (!ch.tools.length && ch.autonomy === undefined && ch.sensing === undefined) { reply('Tell me which skills (numbers or names), an autonomy level, or \u201cenable sensing\u201d \u2014 or say cancel.'); return true; }
    await proposeUpgrade(ag, ch);
    return true;
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
      // A flow in progress (invite / training) consumes the reply first.
      if (pend.current && (await handlePending(msg))) return;
      // Clear actions first (deterministic, approve-first). Everything else → the LLM assistant.
      const ca = parseCreateAgent(msg);
      if (ca) {
        if (!canManage) { reply('You need the “Manage agents” permission to create agents.'); return; }
        await createAgent({ org_id: org.id, name: ca.name, domain: ca.domain as any, autonomy_level: 'approve_first', created_by: me?.id || null });
        reply(`Done — I created a new agent, “${ca.name}” (${ca.domain}). It works approve-first; open Agents to grant it tools.`, { href: '/agents', label: 'Open Agents' });
        return;
      }
      const inv = detectInvite(msg);
      if (inv) { await startInvite(inv, msg); return; }
      if (/\b(train|upskill|upgrade|teach|coach|grant|give|revoke|remove|autonom|independent|sensing|proactive)\w*/i.test(msg)) {
        const names = activeAgents(await loadAgents()).map((a) => a.name);
        const up = detectUpgrade(msg, names, AGENT_TOOLS);
        if (up) { await startUpgrade(up); return; }
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
        const { shown, action } = parseChiefAction(res.answer);
        if (shown) reply(stripMd(shown));
        if (action) { await runChiefAction(action, msg); return; }
        if (!shown) reply('I couldn\u2019t work that out just now \u2014 try rephrasing, or ask me to run a workflow or create an agent.');
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

  const CHIPS = ['How many staff do we have and what do they do?', 'What needs my attention today?', 'Onboard a new client', 'Invite a teammate', 'Train one of my agents'];

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
