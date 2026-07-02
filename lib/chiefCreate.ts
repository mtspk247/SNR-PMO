// Chief of Staff "creatable entity" registry — ONE place that defines everything the
// assistant can create on request. Adding a module here (one entry) makes it Chief-creatable:
// the capabilities context, the deterministic detector, the [[create]] action route and the
// permission gates all derive from this registry. House rule: never hand-roll a bespoke
// create-flow in ChiefOfStaff.tsx again.
//
// Safety model: records are created directly AS the signed-in user — RLS is the wall and
// every kind is additionally gated by (a) the org's plan feature and (b) the user's per-page
// CREATE permission (effectivePagePerm). Everything created here is inert org data (drafts,
// records) — actions with external side effects (sending, publishing, money) stay in the
// approve-first flows and are NOT in this registry.
import {
  createTask, createProject, createLead, createDeal, createClient as createClientRow,
  createProposal, createContract, createQrCode, createSignRequest, createForm,
} from '@/lib/db';
import type { FeatureKey } from '@/lib/supabase';

export interface ChiefCreateResult { ok: boolean; note: string; link?: string; linkLabel?: string }
type Ctx = { orgId: string; userId: string };

export interface CreatableSpec {
  kind: string;
  aliases: string[];        // nouns that map to this kind (word-boundary matched)
  label: string;
  feature?: FeatureKey;     // plan gate (hasFeature)
  href: string;             // page — used for the CREATE page-perm check + default deep link
  hint: string;             // one-liner for the LLM action protocol
  create: (ctx: Ctx, attrs: Record<string, string>) => Promise<ChiefCreateResult>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
const rand = () => Math.random().toString(36).slice(2, 8);
const num = (v?: string): number | null => {
  if (!v) return null;
  const m = String(v).replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)(k)?$/i);
  return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : null;
};
const isoDue = (v?: string): string | null => {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  const d = new Date();
  if (t === 'today') return d.toISOString().slice(0, 10);
  if (t === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (t === 'next week') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

export const CREATABLES: CreatableSpec[] = [
  {
    kind: 'task', aliases: ['task', 'todo', 'to-do'], label: 'a task', feature: 'projects', href: '/tasks',
    hint: 'name=..., due=today|tomorrow|YYYY-MM-DD, priority=High|Medium|Low',
    create: async (ctx, a) => {
      const t = await createTask({ org_id: ctx.orgId, name: (a.name || 'New task').slice(0, 200), due_date: isoDue(a.due), priority: a.priority && /^(high|medium|low)$/i.test(a.priority) ? a.priority[0].toUpperCase() + a.priority.slice(1).toLowerCase() : undefined });
      return { ok: true, note: `Done — I created the task “${t.name}”${t.due_date ? ` due ${t.due_date}` : ''}. It’s unassigned — open it to assign someone or add it to a project.`, link: `/tasks?task=${t.id}`, linkLabel: 'Open the task' };
    },
  },
  {
    kind: 'project', aliases: ['project'], label: 'a project', feature: 'projects', href: '/projects',
    hint: 'name=...',
    create: async (ctx, a) => {
      if (!a.name) return { ok: false, note: 'What should the project be called?' };
      await createProject({ name: a.name.slice(0, 200), org_id: ctx.orgId, created_by: ctx.userId });
      return { ok: true, note: `Done — project “${a.name}” is created in Planning. Open it to set dates, a manager and the team.`, link: '/projects', linkLabel: 'Open Projects' };
    },
  },
  {
    kind: 'lead', aliases: ['lead', 'prospect'], label: 'a lead', feature: 'crm', href: '/leads',
    hint: 'name=..., email=..., phone=..., value=12000',
    create: async (ctx, a) => {
      if (!a.name && !a.email) return { ok: false, note: 'Who is the lead? Give me a name or an email.' };
      const v = num(a.value);
      await createLead({ org_id: ctx.orgId, name: (a.name || a.email || 'New lead').slice(0, 160), email: a.email || null, phone: a.phone || null, value: v ?? undefined, source: 'chief-of-staff', created_by: ctx.userId });
      return { ok: true, note: `Done — lead “${a.name || a.email}” is in your pipeline${v ? ` at $${v.toLocaleString()}` : ''}.`, link: '/leads', linkLabel: 'Open Leads' };
    },
  },
  {
    kind: 'deal', aliases: ['deal', 'opportunity'], label: 'a deal', feature: 'crm', href: '/crm',
    hint: 'name=..., value=12000',
    create: async (ctx, a) => {
      if (!a.name) return { ok: false, note: 'What’s the deal called — e.g. “Acme renewal”?' };
      await createDeal({ title: a.name.slice(0, 200), org_id: ctx.orgId, value: num(a.value) });
      return { ok: true, note: `Done — deal “${a.name}” added to the pipeline${num(a.value) ? ` at $${num(a.value)!.toLocaleString()}` : ''}.`, link: '/crm', linkLabel: 'Open the pipeline' };
    },
  },
  {
    kind: 'client', aliases: ['client', 'customer', 'account'], label: 'a client', feature: 'crm', href: '/clients',
    hint: 'name=..., email=...',
    create: async (ctx, a) => {
      if (!a.name) return { ok: false, note: 'What’s the client’s name?' };
      await createClientRow({ org_id: ctx.orgId, name: a.name.slice(0, 160), email: a.email || null, status: 'active', created_by: ctx.userId });
      return { ok: true, note: `Done — client “${a.name}” is on the books.`, link: '/clients', linkLabel: 'Open Clients' };
    },
  },
  {
    kind: 'proposal', aliases: ['proposal', 'quote'], label: 'a proposal', feature: 'crm', href: '/proposals',
    hint: 'name=..., value=12000',
    create: async (ctx, a) => {
      if (!a.name) return { ok: false, note: 'What’s the proposal for — give me a title?' };
      await createProposal({ org_id: ctx.orgId, title: a.name.slice(0, 200), amount: num(a.value) ?? 0, created_by: ctx.userId });
      return { ok: true, note: `Done — draft proposal “${a.name}” created.`, link: '/proposals', linkLabel: 'Open Proposals' };
    },
  },
  {
    kind: 'contract', aliases: ['contract', 'agreement'], label: 'a contract', feature: 'crm', href: '/contracts',
    hint: 'name=..., value=12000',
    create: async (ctx, a) => {
      if (!a.name) return { ok: false, note: 'What’s the contract called?' };
      await createContract({ org_id: ctx.orgId, title: a.name.slice(0, 200), value: num(a.value) ?? 0, created_by: ctx.userId });
      return { ok: true, note: `Done — contract “${a.name}” recorded. Want it sent for signature? Say “send it for signing” and I’ll draft the request.`, link: '/contracts', linkLabel: 'Open Contracts' };
    },
  },
  {
    kind: 'qr', aliases: ['qr', 'qr code', 'qrcode'], label: 'a QR code', feature: 'qr', href: '/qr',
    hint: 'name=..., url=https://...',
    create: async (ctx, a) => {
      const url = (a.url || '').trim();
      if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, note: 'What link should the QR code point to? Give me the full URL (it stays editable after printing).' };
      const name = (a.name || 'QR code').slice(0, 120);
      await createQrCode({ org_id: ctx.orgId, slug: `${slug(name)}-${rand()}`, name, target_url: url.slice(0, 1000), created_by: ctx.userId });
      return { ok: true, note: `Done — dynamic QR “${name}” created pointing at ${url}. You can retarget it any time, even after it’s printed.`, link: '/qr', linkLabel: 'Open QR Codes' };
    },
  },
  {
    kind: 'sign_request', aliases: ['signature request', 'signing request', 'sign request', 'esignature', 'e-signature'], label: 'a signature request', feature: 'signing', href: '/signing',
    hint: 'name=... (creates a draft; recipients + send happen on the Signatures page)',
    create: async (ctx, a) => {
      const title = (a.name || 'Signature request').slice(0, 200);
      const r = await createSignRequest({ org_id: ctx.orgId, title, created_by: ctx.userId });
      return { ok: true, note: `Done — draft signature request “${title}” created. Open it to attach the document, add signers and send — sending stays in your hands.`, link: '/signing', linkLabel: 'Open Signatures' };
    },
  },
  {
    kind: 'survey', aliases: ['survey', 'nps', 'csat', 'questionnaire', 'poll', 'feedback form'], label: 'a survey', feature: 'surveys', href: '/surveys',
    hint: 'topic=...',
    create: async (ctx, a) => {
      const t = (a.topic || a.name || '').trim();
      const title = t ? `Feedback — ${t.slice(0, 60)}` : 'Customer feedback';
      const row = await createForm({
        org_id: ctx.orgId, created_by: ctx.userId, name: title, slug: `${slug(title)}-${rand()}`, status: 'draft', kind: 'survey',
        fields: [
          { key: 'q_nps', label: t ? `How likely are you to recommend ${t.slice(0, 80)}?` : 'How likely are you to recommend us?', type: 'nps', required: true, jumps: [{ op: 'gte', value: '9', to: 'q_praise' }] },
          { key: 'q_improve', label: 'What could we do better?', type: 'textarea', next: '_end' },
          { key: 'q_praise', label: 'What did you love most?', type: 'textarea' },
        ],
        settings: { submit_label: 'Finish', success_message: 'Thanks for your feedback!' },
      });
      return { ok: true, note: `Done — I created a draft survey “${title}” with an NPS flow: the score question routes happy and unhappy respondents to different follow-ups. Open it to tweak, publish, and share the public link.`, link: `/surveys?open=${row.id}`, linkLabel: 'Open the draft survey' };
    },
  },
];

export const creatableByKind = (kind: string): CreatableSpec | undefined =>
  CREATABLES.find((c) => c.kind === (kind || '').toLowerCase().trim());

// noun → kind (longest alias first so "qr code" beats "qr", "signature request" beats none)
const ALIAS_INDEX: { alias: string; kind: string }[] = CREATABLES
  .flatMap((c) => c.aliases.map((a) => ({ alias: a, kind: c.kind })))
  .sort((a, b) => b.alias.length - a.alias.length);

export interface CreateIntent { kind: string; attrs: Record<string, string> }
const CREATE_VERB = /\b(create|add|make|build|set ?up|start|open|new|log|draft|prepare|record|launch|run|send|conduct)\b/i;

// Deterministic "create <thing> ..." detector. Runs BEFORE workflow templates.
// Excluded on purpose: agents (parseCreateAgent), people/invites (detectInvite).
export function detectCreate(raw: string): CreateIntent | null {
  const text = (raw || '').trim();
  if (!text || !CREATE_VERB.test(text)) return null;
  if (/\b(agent|user|teammate|team member|workspace|report)\b/i.test(text)) return null;
  const low = text.toLowerCase();
  // The EARLIEST noun in the sentence wins (so "create a survey ... about our project"
  // is a survey, not a project); ties (e.g. "qr" vs "qr code") go to the longer alias.
  let hit: { alias: string; kind: string } | null = null; let hitAt = Infinity;
  for (const x of ALIAS_INDEX) {
    const m = new RegExp(`\\b${x.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').exec(low);
    if (m && (m.index < hitAt || (m.index === hitAt && x.alias.length > (hit?.alias.length || 0)))) { hit = x; hitAt = m.index; }
  }
  if (!hit) return null;
  const attrs: Record<string, string> = {};
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) attrs.email = email[0].toLowerCase();
  const value = text.match(/(?:worth|valued? at|for)\s*\$?\s*([\d,]+(?:\.\d+)?\s*k?)\b/i) || text.match(/\$\s*([\d,]+(?:\.\d+)?\s*k?)\b/);
  if (value) attrs.value = value[1].replace(/\s+/g, '');
  const due = text.match(/\b(?:due|by)\s+(today|tomorrow|next week|\d{4}-\d{2}-\d{2})\b/i);
  if (due) attrs.due = due[1].toLowerCase();
  const url = text.match(/https?:\/\/\S+/i);
  if (url) attrs.url = url[0].replace(/[).,;]+$/, '');
  if (hit.kind === 'survey') {
    const m = text.match(/\b(?:about|regarding|on|for)\s+(.{3,140}?)(?:\s+and\s+what\b|[.?!]|$)/i);
    if (m) attrs.topic = m[1].replace(/\s+/g, ' ').replace(/["'.!?\s]+$/g, '').trim();
    return { kind: 'survey', attrs };
  }
  // name: quoted > called/named/titled > text after the noun
  let name = '';
  const qm = text.match(/["“]([^"”]{2,120})["”]/);
  if (qm) name = qm[1].trim();
  if (!name) { const cm = text.match(/\b(?:called|named|titled|title[d]?:?)\s+(.{2,120}?)(?:\s+(?:due|by|worth|valued?|for \$|with|at)\b.*)?$/i); if (cm) name = cm[1].trim(); }
  if (!name) {
    const nm = low.indexOf(hit.alias);
    let rest = text.slice(nm + hit.alias.length).replace(/^s\b/, '').trim();
    rest = rest.replace(/^(?:to|for|about|regarding|:|-|—)\s+/i, '');
    rest = rest.replace(/\s+(?:due|by)\s+(?:today|tomorrow|next week|\d{4}-\d{2}-\d{2})\b.*$/i, '');
    rest = rest.replace(/\s+(?:worth|valued? at)\s.*$/i, '').replace(/\s*https?:\/\/\S+.*$/i, '');
    rest = rest.replace(/\s+(?:with\s+)?(?:email\s+)?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}.*$/i, '');
    name = rest.replace(/["'.!?\s]+$/g, '').trim();
  }
  if (name) attrs.name = name.slice(0, 160).replace(/^(a|an|the|our|my|new)\s+/i, '');
  return { kind: hit.kind, attrs };
}
