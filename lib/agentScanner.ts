// lib/agentScanner.ts — deterministic ("rules") work scanner.
// PURE: takes already-fetched records and returns concrete agent proposals on REAL data
// with REAL target ids, so the executors run WITHOUT an LLM key. db.runWorkScan fetches
// the data + writes the proposals through the existing approve-first RPCs. No DB import
// here (keeps it cycle-free and unit-testable).
import type { Task, Deal, LedgerEntry } from './supabase';

export type WorkProposal = { tool: string; summary: string; risk: 'low' | 'medium' | 'high'; reversible: boolean; payload: any };
export const SCANNABLE_DOMAINS = ['accounting', 'tasks', 'crm', 'people', 'support', 'marketing'];

const CAT_RULES: [RegExp, string][] = [
  [/aws|cloud|hosting|server|vercel|supabase|\bs3\b|ec2|digitalocean|heroku/i, 'Cloud Hosting'],
  [/figma|adobe|software|saas|license|subscription|notion|slack|github|zoom|canva|atlassian/i, 'Software'],
  [/uber|lyft|taxi|flight|airfare|hotel|travel|airbnb|mileage/i, 'Travel'],
  [/\bads?\b|marketing|facebook|linkedin|google ads|campaign|\bseo\b|mailchimp/i, 'Marketing'],
  [/salary|payroll|wage|contractor|freelanc|stipend/i, 'Payroll'],
  [/rent|lease|office|utilit|electric|internet|broadband/i, 'Office'],
  [/legal|lawyer|attorney|compliance|filing|notary/i, 'Legal'],
  [/bank|stripe|paypal|\bfee\b|interest|wire/i, 'Bank & Fees'],
];
function guessCategory(notes: string): string {
  const t = (notes || '').toLowerCase();
  for (const [re, cat] of CAT_RULES) if (re.test(t)) return cat;
  return 'General';
}
const isUncategorized = (c?: string) => { const v = (c || '').trim(); return v === '' || /^uncategori[sz]ed$/i.test(v); };
const isDoneStatus = (s?: string) => /done|complete|closed|cancel|archiv|won|lost/i.test((s || ''));

export function scanForWork(
  domain: string,
  ctx: { tasks?: Task[]; deals?: Deal[]; ledger?: LedgerEntry[]; users?: { id: string; name: string }[]; tickets?: { id: string; subject: string; status: string; assignee_id: string | null }[]; agents?: { id: string; name: string }[]; analytics?: { overview?: { posts?: number; impressions?: number; engagement?: number; engagement_rate?: number }; channels?: { platform?: string; handle?: string | null; engagement?: number; followers?: number }[]; top?: { body?: string; engagement?: number; platform?: string | null }[] }; sourceItems?: { id: string; title: string; url: string; summary: string }[]; today: string },
  cap = 8,
): WorkProposal[] {
  const out: WorkProposal[] = [];
  const { today } = ctx;
  if (domain === 'accounting') {
    for (const e of ctx.ledger || []) {
      if (e.type !== 'expense' || !isUncategorized(e.category)) continue;
      const cat = guessCategory(e.notes || '');
      const label = e.notes ? '"' + e.notes.slice(0, 40) + '" ' : '';
      out.push({ tool: 'categorize_expense', summary: 'Categorize ' + label + '($' + Number(e.amount || 0).toFixed(2) + ') as ' + cat, risk: 'low', reversible: true, payload: { entry_id: e.id, category: cat, from_category: e.category || null } });
      if (out.length >= cap) break;
    }
  } else if (domain === 'tasks') {
    for (const t of ctx.tasks || []) {
      if (!t.due_date || t.due_date >= today || isDoneStatus(t.status)) continue;
      const pr = t.priority || '';
      if (pr === 'Urgent' || pr === 'High') continue;
      out.push({ tool: 'triage_task', summary: 'Overdue: bump "' + (t.name || '').slice(0, 40) + '" to High (was due ' + t.due_date + ')', risk: 'low', reversible: true, payload: { task_id: t.id, to_priority: 'High', from_priority: pr || null } });
      if (out.length >= cap) break;
    }
  } else if (domain === 'crm') {
    for (const d of ctx.deals || []) {
      if (isDoneStatus(d.stage) || !d.expected_close || d.expected_close >= today) continue;
      out.push({ tool: 'draft_followup', summary: 'Stale deal "' + (d.title || '').slice(0, 40) + '" (close date ' + d.expected_close + ' passed) — draft a follow-up', risk: 'low', reversible: true, payload: { deal_id: d.id, deal: d.title } });
      if (out.length >= cap) break;
    }
  } else if (domain === 'people') {
    // Group open (non-done) tasks by assignee; flag anyone carrying a heavy load.
    const nameOf = new Map((ctx.users || []).map((u) => [u.id, u.name] as [string, string]));
    const load = new Map<string, { open: number; overdue: number }>();
    for (const t of ctx.tasks || []) {
      if (isDoneStatus(t.status)) continue;
      const ids = (t.assignee_ids && t.assignee_ids.length) ? t.assignee_ids : (t.assignee_id ? [t.assignee_id] : []);
      for (const id of ids) {
        const cur = load.get(id) || { open: 0, overdue: 0 };
        cur.open++;
        if (t.due_date && t.due_date < today) cur.overdue++;
        load.set(id, cur);
      }
    }
    const ranked = Array.from(load.entries()).filter((e) => e[1].open >= 8 || e[1].overdue >= 3).sort((a, b) => b[1].open - a[1].open);
    for (const e of ranked) {
      const id = e[0], v = e[1];
      const who = nameOf.get(id) || 'A team member';
      out.push({ tool: 'flag_capacity_risk', summary: 'Capacity risk: ' + who + ' has ' + v.open + ' open' + (v.overdue ? (', ' + v.overdue + ' overdue') : '') + ' - review workload', risk: 'low', reversible: true, payload: { person: who, person_id: id, open: v.open, overdue: v.overdue } });
      if (out.length >= cap) break;
    }
  } else if (domain === 'support') {
    // Round-robin assign unassigned, non-terminal tickets to active support staff.
    // Maps to the existing triage_ticket executor (assignTicket; RPC enforces support-staff);
    // reversible by unassigning (from_assignee_id=null). No-op when there is no active agent.
    const staff = ctx.agents || [];
    const isClosed = (st?: string) => /closed|resolved|done|cancel|archiv/i.test(st || '');
    let i = 0;
    for (const t of ctx.tickets || []) {
      if (staff.length === 0) break;
      if (t.assignee_id || isClosed(t.status)) continue;
      const a = staff[i % staff.length]; i++;
      out.push({ tool: 'triage_ticket', summary: 'Unassigned ticket "' + (t.subject || '').slice(0, 40) + '" \u2192 assign to ' + a.name, risk: 'low', reversible: true, payload: { ticket_id: t.id, assignee_id: a.id, from_assignee_id: null } });
      if (out.length >= cap) break;
    }
  } else if (domain === 'marketing') {
    const a = ctx.analytics || {};
    const ov = a.overview || {};
    const chans = (a.channels || []).filter((c) => (c.engagement || 0) > 0).slice().sort((x, y) => (y.engagement || 0) - (x.engagement || 0));
    if (chans.length) {
      const b = chans[0];
      out.push({ tool: 'analyze_social_performance', summary: 'Best channel: ' + (b.handle || b.platform) + ' drives the most engagement — lean into it', risk: 'low', reversible: true, payload: { insight_key: 'best_channel', kind: 'opportunity', summary: (b.handle || b.platform) + ' is your highest-engagement channel (' + (b.engagement || 0) + ' engagement). Publish more there and repurpose winners.', recommendation: 'Shift more posts to ' + (b.platform || 'it') + ' and test one extra post per week.' } });
    }
    if ((ov.impressions || 0) > 0 && (ov.engagement_rate || 0) < 2) {
      out.push({ tool: 'analyze_social_performance', summary: 'Engagement rate is ' + ov.engagement_rate + '% — below 2%; tighten hooks & CTAs', risk: 'low', reversible: true, payload: { insight_key: 'low_eng_rate', kind: 'gap', summary: 'Engagement rate is ' + ov.engagement_rate + '% across ' + ov.impressions + ' impressions — below the ~2% healthy mark.', recommendation: 'Open with a hook, ask one clear question, and add a single CTA per post.' } });
    }
    const top = (a.top || []).filter((t) => (t.engagement || 0) > 0);
    if (top.length) {
      const t = top[0];
      out.push({ tool: 'analyze_social_performance', summary: 'Your top post earned ' + (t.engagement || 0) + ' engagement — make more like it', risk: 'low', reversible: true, payload: { insight_key: 'top_post', kind: 'opportunity', summary: 'Top post (\u201c' + String(t.body || '').slice(0, 60) + '\u201d) earned ' + (t.engagement || 0) + ' engagement on ' + (t.platform || 'social') + '. That theme resonates.', recommendation: 'Draft two or three variations on this theme this week.' } });
    }
    if ((ov.posts || 0) > 0 && (ov.posts || 0) < 8) {
      out.push({ tool: 'analyze_social_performance', summary: 'Only ' + ov.posts + ' posts in range — increase cadence to stay top-of-feed', risk: 'low', reversible: true, payload: { insight_key: 'cadence', kind: 'gap', summary: 'You published ' + ov.posts + ' posts in the period. Consistent cadence compounds reach.', recommendation: 'Aim for 3+ posts/week; use the content calendar to batch-schedule.' } });
    }
    // Draft posts from fresh content-source (RSS) items — approve-first, reversible, linked on approval.
    for (const it of (ctx.sourceItems || []).slice(0, 5)) {
      const title = (it.title || '').trim(); if (!title) continue;
      const body = (it.url ? title + '\n\n' + it.url : title).slice(0, 5000);
      out.push({ tool: 'draft_social_post', summary: 'Draft a post from “' + title.slice(0, 60) + (title.length > 60 ? '…' : '') + '”', risk: 'low', reversible: true, payload: { source_item_id: it.id, body, item_title: title } });
    }
  }
  return out;
}
