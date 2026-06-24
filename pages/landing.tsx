import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * SNR-PMO marketing landing page — premium dark + emerald.
 * Self-contained: only react / next/link / next/head. No external deps,
 * no images (all product visuals are HTML/CSS mockups). Fixed Tailwind
 * arbitrary-value colors so it renders identically regardless of app theme.
 */

/* ---------------------------------- data --------------------------------- */

const NAV_LINKS = [
  { href: '#agents', label: 'AI Agents' },
  { href: '#roi', label: 'ROI' },
  { href: '#features', label: 'Features' },
  { href: '#compare', label: 'Compare' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

// ROI model — mirrors the conservative per-action minutes in lib/agentRoi.ts, inlined so
// this marketing page stays dependency-free. Blended average minutes saved per action.
const ROI_MINUTES = [12, 3, 4, 15, 3, 8, 2, 20, 3, 4, 8];
const ROI_BLENDED_MIN = ROI_MINUTES.reduce((a, b) => a + b, 0) / ROI_MINUTES.length;
const ROI_DEFAULT_RATE = 45;

const REPLACES = [
  { cat: 'Project management', like: 'like ClickUp / Asana', glyph: '◧' },
  { cat: 'CRM', like: 'like HubSpot / Pipedrive', glyph: '◎' },
  { cat: 'HR & payroll', like: 'like BambooHR / Gusto', glyph: '◍' },
  { cat: 'Accounting', like: 'like QuickBooks / Xero', glyph: '▤' },
];

const MODULES = [
  { t: 'Projects & tasks', d: 'Boards, lists, timelines, portfolios — from task to org rollup.', icon: 'M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z' },
  { t: 'CRM', d: 'Leads, deals, pipeline, proposals and contracts in one flow.', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0' },
  { t: 'HR & payroll', d: 'People, attendance, leaves, payroll runs and offers.', icon: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 8h5M19.5 5.5v5' },
  { t: 'Accounting & invoicing', d: 'Real double-entry ledger, invoices, payments, P&L.', icon: 'M3 5h18v14H3zM3 10h18M8 14h3M8 17h6' },
  { t: 'Time tracking', d: 'Timers, timesheets and billable hours tied to work.', icon: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z' },
  { t: 'Drives & files', d: 'Per-tenant storage with attachments on every record.', icon: 'M3 7l2-3h6l2 3h6v12H3zM3 7h18' },
  { t: 'Support desk', d: 'Tickets, round-robin queue, canned replies and SLAs.', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
  { t: 'Dashboards', d: 'Drag-and-drop widgets across every module, live.', icon: 'M3 13h8V3H3zM13 21h8V8h-8zM13 3v3h8V3zM3 21h8v-4H3z' },
  { t: 'API & webhooks', d: 'Org-scoped REST API, keys and event webhooks.', icon: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1' },
  { t: 'Automations', d: 'Trigger actions on events — no glue code required.', icon: 'M13 2L3 14h7l-1 8 10-12h-7z' },
];

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    unit: 'forever',
    blurb: 'For small teams getting organized.',
    cta: 'Start free',
    href: '/login?mode=signup',
    highlight: false,
    feats: ['Up to 5 seats', 'AI agents — 25 actions/mo', 'Projects, tasks & CRM', 'Basic accounting & invoicing', '1 GB drive storage', 'Community support'],
  },
  {
    name: 'Pro',
    price: '$12',
    unit: '/ user / mo',
    blurb: 'For growing teams running real operations.',
    cta: 'Start free',
    href: '/login?mode=signup',
    highlight: true,
    feats: ['Everything in Free', 'HR & payroll module', 'Full double-entry accounting', 'Time tracking & dashboards', 'API, webhooks & automations', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: '$999',
    unit: '/ mo flat',
    blurb: 'For larger orgs that need control.',
    cta: 'Start free',
    href: '/login?mode=signup',
    highlight: false,
    feats: ['Up to 100 seats', 'SSO & SAML', 'Audit logs & advanced RBAC', 'Custom domains', 'Dedicated onboarding', 'SLA & priority support'],
  },
  {
    name: 'White-label',
    price: '$2,499',
    unit: '/ mo',
    blurb: 'For agencies reselling as their own.',
    cta: 'Talk to us',
    href: '/login?mode=signup',
    highlight: false,
    feats: ['Unlimited sub-accounts', 'Your brand, logo & domain', 'Reseller console & billing', 'Per-client provisioning', 'Remove SNR-PMO branding', 'Partner support channel'],
  },
];

const FAQS = [
  {
    q: 'Do the AI agents act on their own?',
    a: 'No. Agents propose actions; a person with the right permission approves them with one click. Money, payroll and any higher-risk action always require approval, every action is written to an audit trail, and executed actions can be rolled back in one click. You can optionally let only low-risk, reversible actions run automatically.',
  },
  {
    q: 'Do I need my own AI key to use the agents?',
    a: 'No. The built-in agents do real work with no AI key — create tasks, draft onboarding, categorize expenses and scan your data for actionable items. Adding your own provider key (Anthropic, OpenAI and others) unlocks free-form, natural-language requests on top.',
  },
  {
    q: 'How is SNR-PMO actually all-in-one?',
    a: 'Projects, CRM, HR & payroll, and accounting share one database, one login and one bill. A deal closing can create a project; payroll posts to the ledger; time logged shows up in invoices and the P&L — no integrations to maintain, no data silos.',
  },
  {
    q: 'Can I import from ClickUp, Asana or my CRM?',
    a: 'Yes. Import projects, tasks and contacts via CSV, and use the org-scoped REST API to migrate larger datasets. Most teams move their active work over in an afternoon.',
  },
  {
    q: 'Is the accounting real double-entry?',
    a: 'Yes — a genuine general ledger with debits and credits, a chart of accounts, trial balance and P&L. Payroll runs and invoices post real journal entries, not a faked summary. That is the core difference from bolt-on "expense tracking."',
  },
  {
    q: 'Can I white-label and resell it?',
    a: 'Yes. On the White-label plan you apply your own logo, colors and custom domain, then provision and bill unlimited sub-accounts from a reseller console. Your clients see your brand, not ours.',
  },
  {
    q: 'How does pricing work?',
    a: 'Free is free forever for up to 5 seats. Pro is billed per active user per month. Enterprise is a flat monthly fee up to 100 seats. White-label is a flat monthly partner fee with unlimited sub-accounts. No card required to start.',
  },
  {
    q: 'Is my data isolated and secure?',
    a: 'Every tenant is isolated at the database level with row-level security, so one organization can never see another tenant’s data. Roles and permissions are granular, and Enterprise adds SSO and audit logging.',
  },
];

/* -------------------------------- helpers -------------------------------- */

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 shrink-0 mt-0.5 text-[#3ECF8E]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-3 h-3 rounded-full" style={{ background: c }} aria-hidden="true" />;
}

function BrowserFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#141414]">
        <Dot c="#ff5f57" />
        <Dot c="#febc2e" />
        <Dot c="#28c840" />
        <div className="ml-3 flex-1">
          <div className="mx-auto max-w-xs rounded-md bg-white/5 border border-white/10 px-3 py-1 text-center text-[11px] text-white/40 truncate">
            {title}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/* ------------------------------ mockup pieces ----------------------------- */

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#161616] p-3">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub && <div className={'mt-0.5 text-[11px] ' + (tone || 'text-white/40')}>{sub}</div>}
    </div>
  );
}

function RoiStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#161616] p-5">
      <div className="text-2xl sm:text-3xl font-bold text-white">{value}</div>
      <div className="mt-1 text-[13px] text-white/60 leading-snug">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-white/35 leading-snug">{sub}</div>}
    </div>
  );
}

function RoiCalculator() {
  const [actions, setActions] = useState(300);
  const [rate, setRate] = useState(ROI_DEFAULT_RATE);
  const hours = (actions * ROI_BLENDED_MIN) / 60;
  const monthly = hours * rate;
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  return (
    <div className="rounded-2xl border border-[#3ECF8E]/25 bg-gradient-to-b from-[#13211b] to-[#0f0f0f] p-6 sm:p-8 shadow-2xl shadow-black/40">
      <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">ROI calculator</div>
      <div className="mt-5 space-y-5">
        <div>
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="roi-actions" className="text-white/70">Back-office actions automated / month</label>
            <span className="font-semibold text-white tabular-nums">{actions.toLocaleString('en-US')}</span>
          </div>
          <input id="roi-actions" type="range" min={50} max={2000} step={10} value={actions} onChange={(e) => setActions(Number(e.target.value))} className="mt-2 w-full accent-[#3ECF8E]" />
          <div className="flex justify-between text-[10px] text-white/30 mt-1"><span>50</span><span>2,000</span></div>
        </div>
        <div>
          <label htmlFor="roi-rate" className="text-sm text-white/70">Blended team cost ($ / hour)</label>
          <input id="roi-rate" type="number" min={10} max={250} value={rate} onChange={(e) => setRate(Math.max(1, Number(e.target.value) || 0))} className="mt-2 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#3ECF8E]/50" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-wide text-white/40">Time saved</div>
          <div className="mt-1 text-2xl font-bold text-white tabular-nums">{Math.round(hours)}<span className="text-base font-medium text-white/50"> hrs/mo</span></div>
          <div className="text-[11px] text-white/40 mt-0.5">&asymp; {(hours / 8).toFixed(1)} workdays</div>
        </div>
        <div className="rounded-xl border border-[#3ECF8E]/30 bg-[#3ECF8E]/10 p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#3ECF8E]/80">Value created</div>
          <div className="mt-1 text-2xl font-bold text-white tabular-nums">{fmt(monthly)}<span className="text-base font-medium text-white/50">/mo</span></div>
          <div className="text-[11px] text-white/40 mt-0.5">{fmt(monthly * 12)}/year</div>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-white/35 leading-relaxed">Assumes ~{Math.round(ROI_BLENDED_MIN)} min of manual work saved per automated action &mdash; the same conservative per-task model the in-product ROI dashboard uses. Approve-first, so you stay in control.</p>
      <a href="/login?mode=signup" className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#3ECF8E] px-4 py-2.5 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors">Start free &mdash; see your real numbers &rarr;</a>
    </div>
  );
}

function CompareMark({ v }: { v: string }) {
  if (v === 'y') return (
    <svg viewBox="0 0 20 20" fill="none" className="inline w-4 h-4 text-[#3ECF8E]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Yes"><path d="M4 10l4 4 8-9" /></svg>
  );
  if (v === 'p') return <span className="text-[11px] font-medium text-amber-400/90" aria-label="Partial">Partial</span>;
  return <span className="text-white/25" aria-label="No">&mdash;</span>;
}

function CompareTable() {
  const COLS = [
    { n: 'SNR-PMO', s: 'All-in-one + agents', hi: true },
    { n: 'GoHighLevel', s: 'Agency front-office', hi: false },
    { n: 'ClickUp', s: 'Project management', hi: false },
    { n: 'Odoo', s: 'ERP suite', hi: false },
    { n: 'HubSpot', s: 'Marketing CRM', hi: false },
  ];
  const ROWS: { c: string; v: string[] }[] = [
    { c: 'Projects & PMO (task to portfolio)', v: ['y', 'n', 'y', 'y', 'n'] },
    { c: 'CRM & sales pipeline', v: ['y', 'y', 'p', 'y', 'y'] },
    { c: 'HR & payroll', v: ['y', 'n', 'n', 'y', 'n'] },
    { c: 'Real double-entry accounting', v: ['y', 'n', 'n', 'y', 'n'] },
    { c: 'Approve-first AI agents (back office)', v: ['y', 'n', 'n', 'n', 'n'] },
    { c: 'White-label & resell (multi-tenant)', v: ['y', 'y', 'p', 'p', 'n'] },
    { c: 'One product, one bill', v: ['y', 'p', 'n', 'y', 'n'] },
  ];
  return (
    <div className="mt-12 overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr>
            <th className="w-[32%] p-3 align-bottom"></th>
            {COLS.map((c) => (
              <th key={c.n} className={`p-3 text-center align-bottom ${c.hi ? 'bg-[#3ECF8E]/10 rounded-t-xl' : ''}`}>
                <div className={`text-sm font-bold ${c.hi ? 'text-[#3ECF8E]' : 'text-white'}`}>{c.n}</div>
                <div className="mt-0.5 text-[10px] font-normal text-white/40">{c.s}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, ri) => (
            <tr key={r.c} className="border-t border-white/10">
              <td className="p-3 text-[13px] text-white/75">{r.c}</td>
              {r.v.map((val, i) => (
                <td key={i} className={`p-3 text-center ${COLS[i].hi ? 'bg-[#3ECF8E]/10' : ''} ${COLS[i].hi && ri === ROWS.length - 1 ? 'rounded-b-xl' : ''}`}><CompareMark v={val} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardMock() {
  const bars = [
    { m: 'Jan', inc: 70, exp: 44 },
    { m: 'Feb', inc: 58, exp: 38 },
    { m: 'Mar', inc: 82, exp: 52 },
    { m: 'Apr', inc: 64, exp: 40 },
    { m: 'May', inc: 90, exp: 60 },
    { m: 'Jun', inc: 76, exp: 47 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Open projects" value="5" />
        <KpiCard label="Open tasks" value="13" sub="2 overdue" tone="text-amber-400/80" />
        <KpiCard label="Open deals" value="4" />
        <KpiCard label="Pipeline value" value="$73,100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Income" value="$70,000" tone="text-[#3ECF8E]" />
        <KpiCard label="Expenses" value="$43,070" tone="text-red-400/80" />
        <KpiCard label="Net" value="$26,930" sub="Profitable" tone="text-[#3ECF8E]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Income vs Expenses */}
        <div className="rounded-xl border border-white/10 bg-[#161616] p-3 lg:col-span-2">
          <div className="text-xs font-medium text-white/70">Income vs Expenses</div>
          <div className="mt-3 flex items-end justify-between gap-2 h-28">
            {bars.map((b) => (
              <div key={b.m} className="flex flex-col items-center gap-1 flex-1">
                <div className="flex items-end gap-1 h-24">
                  <div className="w-2.5 rounded-t bg-[#3ECF8E]" style={{ height: b.inc + '%' }} />
                  <div className="w-2.5 rounded-t bg-red-500/70" style={{ height: b.exp + '%' }} />
                </div>
                <div className="text-[9px] text-white/40">{b.m}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Donut */}
        <div className="rounded-xl border border-white/10 bg-[#161616] p-3">
          <div className="text-xs font-medium text-white/70">Project status</div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="w-20 h-20 rounded-full"
              style={{ background: 'conic-gradient(#3ECF8E 0 50%, #6366f1 50% 83%, #6b7280 83% 100%)' }}
              aria-hidden="true"
            >
              <div className="w-full h-full grid place-items-center">
                <div className="w-12 h-12 rounded-full bg-[#161616]" />
              </div>
            </div>
            <ul className="text-[11px] space-y-1 text-white/60">
              <li className="flex items-center gap-1.5"><Dot c="#3ECF8E" /> Active 3</li>
              <li className="flex items-center gap-1.5"><Dot c="#6366f1" /> Planning 2</li>
              <li className="flex items-center gap-1.5"><Dot c="#6b7280" /> Completed 1</li>
            </ul>
          </div>
        </div>
      </div>
      {/* Pipeline by stage */}
      <div className="rounded-xl border border-white/10 bg-[#161616] p-3">
        <div className="text-xs font-medium text-white/70">Pipeline by stage</div>
        <div className="mt-3 space-y-2">
          {[
            { s: 'Lead', v: '$4,500', w: '12%' },
            { s: 'Qualified', v: '$7,000', w: '18%' },
            { s: 'Proposal', v: '$52,000', w: '100%' },
            { s: 'Negotiation', v: '$9,600', w: '24%' },
          ].map((r) => (
            <div key={r.s} className="flex items-center gap-3 text-[11px]">
              <div className="w-20 text-white/50">{r.s}</div>
              <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#3ECF8E]" style={{ width: r.w }} />
              </div>
              <div className="w-16 text-right text-white/70">{r.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardMock() {
  const cols = [
    {
      name: 'To do', count: 3,
      cards: [
        { t: 'Design system audit', p: 'High', pc: 'bg-red-500/20 text-red-300', a: ['#3ECF8E', '#6366f1'] },
        { t: 'Onboarding flow copy', p: 'Med', pc: 'bg-amber-500/20 text-amber-300', a: ['#f59e0b'] },
      ],
    },
    {
      name: 'In progress', count: 2,
      cards: [
        { t: 'Ledger reconciliation', p: 'High', pc: 'bg-red-500/20 text-red-300', a: ['#3ECF8E', '#ec4899'] },
        { t: 'Q3 payroll run', p: 'Low', pc: 'bg-white/10 text-white/60', a: ['#6366f1'] },
      ],
    },
    {
      name: 'Done', count: 1,
      cards: [{ t: 'Client kickoff deck', p: 'Med', pc: 'bg-amber-500/20 text-amber-300', a: ['#3ECF8E'] }],
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cols.map((c) => (
        <div key={c.name} className="rounded-xl bg-[#161616] border border-white/10 p-2.5">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-medium text-white/70">{c.name}</span>
            <span className="text-[10px] text-white/30 bg-white/5 rounded-full px-1.5">{c.count}</span>
          </div>
          <div className="space-y-2">
            {c.cards.map((card) => (
              <div key={card.t} className="rounded-lg bg-[#1d1d1d] border border-white/10 p-2.5">
                <div className="text-[11px] text-white/85 leading-snug">{card.t}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={'text-[9px] px-1.5 py-0.5 rounded-full ' + card.pc}>{card.p}</span>
                  <div className="flex -space-x-1.5">
                    {card.a.map((color, i) => (
                      <span key={i} className="w-4 h-4 rounded-full border border-[#1d1d1d]" style={{ background: color }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LedgerMock() {
  const rows = [
    { acct: '1000 · Cash', dr: '$26,930', cr: '' },
    { acct: '1100 · Accounts Receivable', dr: '$18,200', cr: '' },
    { acct: '2000 · Accounts Payable', dr: '', cr: '$9,400' },
    { acct: '4000 · Revenue', dr: '', cr: '$70,000' },
    { acct: '5000 · Payroll Expense', dr: '$28,500', cr: '' },
    { acct: '5100 · Operating Expense', dr: '$14,570', cr: '' },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-[#161616] overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 bg-[#1d1d1d] text-[10px] uppercase tracking-wide text-white/40 border-b border-white/10">
        <span>Account</span>
        <span className="w-16 text-right">Debit</span>
        <span className="w-16 text-right">Credit</span>
      </div>
      {rows.map((r) => (
        <div key={r.acct} className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 text-[11px] border-b border-white/5">
          <span className="text-white/75">{r.acct}</span>
          <span className="w-16 text-right text-white/80">{r.dr || '—'}</span>
          <span className="w-16 text-right text-[#3ECF8E]/90">{r.cr || '—'}</span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 text-[11px] bg-[#1d1d1d] font-semibold">
        <span className="text-white/80">Trial balance</span>
        <span className="w-16 text-right text-white">$88,200</span>
        <span className="w-16 text-right text-white">$88,200</span>
      </div>
    </div>
  );
}

function CrmMock() {
  const stages = [
    { name: 'Lead', deals: [{ t: 'Acme Corp', v: '$4,500' }] },
    { name: 'Qualified', deals: [{ t: 'Globex', v: '$7,000' }] },
    { name: 'Proposal', deals: [{ t: 'Initech', v: '$52,000' }] },
    { name: 'Negotiation', deals: [{ t: 'Umbrella', v: '$9,600' }] },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stages.map((s) => (
        <div key={s.name} className="rounded-xl bg-[#161616] border border-white/10 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-white/40 mb-2">{s.name}</div>
          {s.deals.map((d) => (
            <div key={d.t} className="rounded-lg bg-[#1d1d1d] border border-white/10 p-2.5 mb-2">
              <div className="text-[11px] text-white/85">{d.t}</div>
              <div className="mt-1 text-[12px] font-semibold text-[#3ECF8E]">{d.v}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function HrMock() {
  const rows = [
    { n: 'Sara Khan', r: 'Product Lead', s: 'Active', c: '#3ECF8E' },
    { n: 'James Lee', r: 'Engineer', s: 'Active', c: '#6366f1' },
    { n: 'Mia Torres', r: 'Designer', s: 'On leave', c: '#f59e0b' },
    { n: 'Omar Ali', r: 'Accountant', s: 'Active', c: '#ec4899' },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Headcount" value="24" />
        <KpiCard label="On leave" value="2" tone="text-amber-400/80" />
        <KpiCard label="Payroll / mo" value="$28,500" tone="text-[#3ECF8E]" />
      </div>
      <div className="rounded-xl border border-white/10 bg-[#161616] overflow-hidden">
        {rows.map((r) => (
          <div key={r.n} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 text-[11px]">
            <span className="w-6 h-6 rounded-full shrink-0" style={{ background: r.c }} />
            <span className="text-white/85 flex-1">{r.n}</span>
            <span className="text-white/40 hidden sm:block">{r.r}</span>
            <span className={'px-2 py-0.5 rounded-full text-[10px] ' + (r.s === 'Active' ? 'bg-[#10b981]/15 text-[#3ECF8E]' : 'bg-amber-500/15 text-amber-300')}>{r.s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- sections -------------------------------- */

function AgentMock() {
  const SAMPLES: Record<string, { t: string; d: string; risk: string; c: string }> = {
    task: { t: 'Create task "Send Q2 report to Acme", due Fri', d: 'Tasks', risk: 'low', c: '#10b981' },
    expense: { t: 'Draft journal entry — Figma $144.00 → Software', d: 'Accounting', risk: 'review', c: '#d97706' },
    onboard: { t: 'Draft week-1 onboarding checklist for Jordan Lee', d: 'HR', risk: 'low', c: '#10b981' },
    followup: { t: 'Draft follow-up to Globex — no reply in 7 days', d: 'CRM', risk: 'low', c: '#10b981' },
  };
  const [queue, setQueue] = useState<{ id: number; t: string; d: string; risk: string; c: string }[]>([
    { id: 1, ...SAMPLES.task }, { id: 2, ...SAMPLES.expense }, { id: 3, ...SAMPLES.onboard },
  ]);
  const [done, setDone] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [nid, setNid] = useState(10);
  const decide = (id: number, approve: boolean, t: string) => {
    setQueue((q) => q.filter((x) => x.id !== id));
    if (approve) { setDone((n) => n + 1); setLast(t); }
  };
  const send = (k: string) => { setQueue((q) => [{ id: nid, ...SAMPLES[k] }, ...q].slice(0, 6)); setNid((n) => n + 1); setLast(null); };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Actions executed" value={String(142 + done)} sub={done ? `+${done} just now` : 'this month'} tone={done ? 'text-[#3ECF8E]' : undefined} />
        <KpiCard label="Time saved" value={`${(31 + done * 0.4).toFixed(done ? 1 : 0)} h`} sub="hands-on work" tone="text-[#3ECF8E]" />
        <KpiCard label="Value created" value={`$${(1410 + done * 30).toLocaleString()}`} sub="net of agent cost" tone="text-[#3ECF8E]" />
        <KpiCard label="Reliability" value="98%" sub="approve-first" tone="text-[#3ECF8E]" />
      </div>
      <div className="rounded-xl border border-white/10 bg-[#161616] px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/40">Try a command:</span>
        {(['task', 'expense', 'onboard', 'followup'] as const).map((k) => (
          <button key={k} type="button" onClick={() => send(k)} className="text-[12px] font-mono px-2 py-1 rounded-md border border-white/10 text-[#3ECF8E] hover:bg-[#3ECF8E]/10 transition-colors">#{k}</button>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-[#161616] divide-y divide-white/5">
        <div className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-white/40 flex items-center justify-between">
          <span>Proposed by your agents</span><span className="text-white/30">awaiting your approval</span>
        </div>
        {queue.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-white/40">All clear — send a command above and an agent proposes an action for you to approve.</div>
        )}
        {queue.map((r) => (
          <div key={r.id} className="px-4 py-3 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.c }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/85 truncate">{r.t}</div>
              <div className="text-[11px] text-white/40">{r.d}</div>
            </div>
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded hidden sm:inline" style={{ backgroundColor: r.c + '22', color: r.c }}>{r.risk}</span>
            <div className="shrink-0 flex items-center gap-1.5">
              <button type="button" onClick={() => decide(r.id, true, r.t)} className="text-[11px] px-2 py-1 rounded-md bg-[#3ECF8E] text-[#0a0a0a] font-medium hover:bg-[#10b981] transition-colors">Approve</button>
              <button type="button" onClick={() => decide(r.id, false, r.t)} className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-white/60 hover:bg-white/5 transition-colors">Reject</button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-[12px] flex items-center gap-2">
        {last ? (
          <><span className="text-[#3ECF8E]">✓</span><span className="text-white/70 truncate">Done: {last}</span><span className="ml-auto text-white/30 hidden sm:inline">recorded · one-click reversible</span></>
        ) : (
          <><span className="text-[#3ECF8E] font-mono">#</span><span className="text-white/55">Click a command, then Approve — that is the whole loop. Agents never act without your click.</span></>
        )}
      </div>
    </div>
  );
}

function FeatureRow({
  flip, eyebrow, title, bullets, children,
}: { flip?: boolean; eyebrow: string; title: string; bullets: string[]; children: React.ReactNode }) {
  return (
    <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
      <div className={flip ? 'lg:order-2' : ''}>
        <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">{eyebrow}</div>
        <h3 className="mt-3 text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h3>
        <ul className="mt-5 space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3 text-white/60 text-[15px] leading-relaxed">
              <Check />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{children}</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-2xl bg-[#101010] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[15px] font-medium text-white">{q}</span>
        <span className={'shrink-0 text-[#3ECF8E] text-xl transition-transform ' + (open ? 'rotate-45' : '')} aria-hidden="true">+</span>
      </button>
      {open && <div className="px-5 pb-5 -mt-1 text-[14px] leading-relaxed text-white/55">{a}</div>}
    </div>
  );
}

/* ---------------------------------- page --------------------------------- */

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const appLd = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'SNR-PMO', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: 'All-in-one business OS - projects, CRM, HR & payroll and real double-entry accounting in one workspace, with approve-first AI agents that run the back office. White-label and resell.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };

  return (
    <>
      <Head>
        <title>SNR-PMO — The all-in-one business OS with AI agents for your back office</title>
        <meta
          name="description"
          content="SNR-PMO runs projects, CRM, HR & payroll and real accounting in one workspace — and AI agents do the back-office busywork: drafting tasks, journal entries, onboarding and follow-ups. Every action is approve-first, audited and reversible. White-label and resell it as your own."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://snr-pmo.vercel.app/" />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content="https://snr-pmo.vercel.app/" />
        <meta property="og:image" content="https://snr-pmo.vercel.app/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:title" content="SNR-PMO — the business OS with AI agents for your back office" />
        <meta property="og:description" content="Projects, CRM, HR & payroll and real accounting in one workspace — with approve-first AI agents that do the busywork. White-label and resell it as your own." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://snr-pmo.vercel.app/og.png" />
        <meta name="twitter:title" content="SNR-PMO — AI agents for your back office" />
        <meta name="twitter:description" content="The all-in-one business OS with approve-first AI agents. Projects, CRM, HR, real accounting — one workspace. White-label." />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        {/* ------------------------------- NAV ------------------------------- */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
          <nav className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#3ECF8E] text-[#0a0a0a] font-black text-lg shadow-lg shadow-[#10b981]/20">S</span>
              <span className="font-semibold tracking-tight">SNR-PMO</span>
            </Link>

            <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-white transition-colors">{l.label}</a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors">Log in</Link>
              <Link href="/login?mode=signup" className="text-sm font-medium px-4 py-2 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">
                Start free
              </Link>
            </div>

            <button
              type="button"
              className="md:hidden grid place-items-center w-9 h-9 rounded-lg border border-white/10 text-white/80"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="text-lg">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </nav>

          {menuOpen && (
            <div className="md:hidden border-t border-white/10 px-5 py-4 space-y-3 bg-[#0a0a0a]">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="block text-white/70 hover:text-white" onClick={() => setMenuOpen(false)}>{l.label}</a>
              ))}
              <div className="flex gap-3 pt-2">
                <Link href="/login" className="flex-1 text-center text-sm py-2 rounded-lg border border-white/10 text-white/80">Log in</Link>
                <Link href="/login?mode=signup" className="flex-1 text-center text-sm py-2 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] font-medium">Start free</Link>
              </div>
            </div>
          )}
        </header>

        {/* ------------------------------- HERO ------------------------------ */}
        <section className="relative overflow-hidden">
          {/* glow */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-[#10b981]/10 blur-[140px]" />
            <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-[#3ECF8E]/5 blur-[120px]" />
          </div>

          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-16 sm:pt-24 pb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/70">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3ECF8E]" />
              All-in-one business OS · with AI agents
            </span>

            <h1 className="mt-6 mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Run your back office with{' '}
              <span className="bg-gradient-to-r from-[#3ECF8E] to-[#10b981] bg-clip-text text-transparent">AI agents you approve.</span>
            </h1>

            <p className="mt-6 mx-auto max-w-2xl text-lg text-white/55 leading-relaxed">
SNR-PMO runs projects, CRM, HR &amp; payroll and real accounting in one workspace — and AI agents do the busywork: drafting tasks, journal entries, onboarding and follow-ups. Every action is approve-first, audited and one-click reversible.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/login?mode=signup" className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] font-semibold hover:bg-[#10b981] transition-colors shadow-xl shadow-[#10b981]/25">
                Start free
              </Link>
              <a href="#agents" className="w-full sm:w-auto px-6 py-3 rounded-lg border border-white/15 text-white/85 font-medium hover:bg-white/5 transition-colors">
                See the agents
              </a>
            </div>

            <div className="mt-5 text-xs text-white/40">No card required · Free up to 5 seats</div>

            {/* hero dashboard */}
            <div className="mt-14 max-w-5xl mx-auto text-left">
              <BrowserFrame title="app.snr-pmo.com/dashboard">
                <DashboardMock />
              </BrowserFrame>
            </div>
          </div>
        </section>

        {/* ------------------------------ AGENTS ----------------------------- */}
        <section id="agents" className="relative overflow-hidden border-y border-white/10 bg-[#0c0c0c]">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full bg-[#10b981]/8 blur-[130px]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">AI agents · the difference</div>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Agents that do the work — with you in control</h2>
              <p className="mt-4 text-white/55 text-[15px] leading-relaxed">
                Most &ldquo;AI&rdquo; tools just write marketing copy. SNR-PMO&rsquo;s agents do the <span className="text-white/80">operational</span> work across your back office — and never act without your say-so.
              </p>
            </div>

            <div className="mt-12 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
              <div className="order-2 lg:order-1">
                <BrowserFrame title="app.snr-pmo.com/agent-activity">
                  <AgentMock />
                </BrowserFrame>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                {[
                  { t: 'Real back-office actions', d: 'Create & assign tasks, draft journal entries from bills, build onboarding checklists, triage tickets and move deals — across Projects, CRM, HR, Accounting and Support.' },
                  { t: 'Approve-first, always', d: 'Agents propose; a person approves with one click. Money, payroll and anything risky always wait for you. Every action is audited and one-click reversible.' },
                  { t: 'Type a command in chat', d: 'Drop #task, #onboard or #expense in any channel and the right agent drafts it for approval — and you can define your own #commands.' },
                  { t: 'Measured, not hype', d: 'A live ROI dashboard shows actions executed, hours saved and dollar value created — net of agent cost. No black box.' },
                ].map((f) => (
                  <div key={f.t} className="flex gap-3.5">
                    <span className="mt-0.5"><Check /></span>
                    <div>
                      <div className="text-[15px] font-semibold text-white">{f.t}</div>
                      <div className="mt-1 text-[14px] text-white/55 leading-relaxed">{f.d}</div>
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <a href="#product" className="text-sm font-medium text-[#3ECF8E] hover:text-[#10b981]">Explore the full platform &rarr;</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------- ROI ------------------------------ */}
        <section id="roi" className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute bottom-0 right-1/4 w-[600px] h-[420px] rounded-full bg-[#3ECF8E]/8 blur-[130px]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">The payoff &middot; hours and dollars</div>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Your back office, quantified</h2>
              <p className="mt-4 text-white/55 text-[15px] leading-relaxed">Every approved action is busywork your team didn&rsquo;t have to do. Here&rsquo;s what that adds up to &mdash; on the same conservative model the in-product ROI dashboard uses, never inflated.</p>
            </div>
            <div className="mt-12 grid lg:grid-cols-2 gap-10 lg:gap-14 items-stretch">
              <div className="grid grid-cols-2 gap-4 content-center">
                <RoiStat value="~7 min" label="saved per automated action" sub="conservative, by task type" />
                <RoiStat value="5 domains" label="Projects, CRM, HR, Accounting & Support" />
                <RoiStat value="100%" label="approve-first & reversible" sub="money & payroll always wait for you" />
                <RoiStat value="$0" label="extra headcount to scale ops" />
              </div>
              <RoiCalculator />
            </div>
          </div>
        </section>

        {/* --------------------------- REPLACES STRIP ------------------------ */}
        <section className="relative mx-auto max-w-7xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Four tools collapse into one</h2>
            <p className="mt-3 text-white/50">Stop paying for — and switching between — a stack that should be a single product.</p>
          </div>

          <div className="mt-12 flex flex-col lg:flex-row items-center justify-center gap-6">
            <div className="grid grid-cols-2 gap-4">
              {REPLACES.map((r) => (
                <div key={r.cat} className="rounded-2xl border border-white/10 bg-[#101010] p-5 w-full sm:w-44 text-center">
                  <div className="text-2xl text-white/40">{r.glyph}</div>
                  <div className="mt-2 text-sm font-medium text-white">{r.cat}</div>
                  <div className="mt-1 text-[11px] text-white/35">{r.like}</div>
                </div>
              ))}
            </div>

            <div className="text-[#3ECF8E] text-3xl rotate-90 lg:rotate-0" aria-hidden="true">{'→'}</div>

            <div className="rounded-2xl border border-[#10b981]/30 bg-gradient-to-br from-[#10b981]/10 to-transparent p-8 text-center w-full sm:w-64 shadow-2xl shadow-[#10b981]/10">
              <span className="grid place-items-center mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#3ECF8E] text-[#0a0a0a] font-black text-2xl shadow-lg shadow-[#10b981]/30">S</span>
              <div className="mt-4 text-lg font-semibold">SNR-PMO</div>
              <div className="mt-1 text-xs text-white/50">One workspace · one login · one bill</div>
            </div>
          </div>
        </section>

        {/* -------------------------- FEATURE SECTIONS ----------------------- */}
        <section id="product" className="bg-[#0c0c0c] border-y border-white/10">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28 space-y-24 sm:space-y-32">
            <FeatureRow
              eyebrow="Projects & PMO"
              title="Plan and ship work, from task to portfolio"
              bullets={[
                'Boards, lists and timelines with priorities, assignees and dependencies.',
                'Roll projects up across portfolios and companies in one clean hierarchy.',
                'A closed deal can spin up a project automatically — no copy-paste.',
              ]}
            >
              <BrowserFrame title="app.snr-pmo.com/projects">
                <BoardMock />
              </BrowserFrame>
            </FeatureRow>

            <FeatureRow
              flip
              eyebrow="CRM & sales"
              title="Win deals without leaving your workspace"
              bullets={[
                'Visual pipeline with leads, deals, proposals and contracts.',
                'See pipeline value and stage-by-stage forecasts on the dashboard.',
                'Convert a client into a project and an invoice in two clicks.',
              ]}
            >
              <BrowserFrame title="app.snr-pmo.com/crm">
                <CrmMock />
              </BrowserFrame>
            </FeatureRow>

            <FeatureRow
              eyebrow="Accounting"
              title="Real double-entry accounting — not a bolt-on"
              bullets={[
                'A genuine general ledger with debits, credits and a trial balance.',
                'Invoices, payments and payroll post real journal entries automatically.',
                'See income, expenses, net and P&L update in real time.',
              ]}
            >
              <BrowserFrame title="app.snr-pmo.com/ledger">
                <LedgerMock />
              </BrowserFrame>
            </FeatureRow>

            <FeatureRow
              flip
              eyebrow="HR & payroll"
              title="Run your people and payroll in the same place"
              bullets={[
                'People records, attendance, leaves, offers and onboarding.',
                'Run payroll and have it post straight to the ledger.',
                'Headcount and payroll cost feed your dashboards and P&L.',
              ]}
            >
              <BrowserFrame title="app.snr-pmo.com/hr">
                <HrMock />
              </BrowserFrame>
            </FeatureRow>
          </div>
        </section>

        {/* --------------------------- MODULE GRID --------------------------- */}
        <section id="features" className="mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything your business runs on</h2>
            <p className="mt-3 text-white/50">Ten modules, one platform. No integrations to maintain, no data silos.</p>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {MODULES.map((m) => (
              <div key={m.t} className="rounded-2xl border border-white/10 bg-[#101010] p-5 hover:border-[#10b981]/40 hover:bg-[#121212] transition-colors">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#10b981]/10 text-[#3ECF8E] mb-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={m.icon} />
                  </svg>
                </span>
                <div className="text-sm font-semibold text-white">{m.t}</div>
                <div className="mt-1.5 text-[13px] text-white/45 leading-relaxed">{m.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------- WHITE-LABEL BAND ------------------------ */}
        <section className="relative overflow-hidden border-y border-white/10 bg-[#0c0c0c]">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#10b981]/10 blur-[130px]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">For agencies &amp; partners</div>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Make it yours. Resell it as yours.</h2>
              <p className="mt-4 text-white/55 leading-relaxed text-[15px]">
                White-label SNR-PMO with your own logo, colors and custom domain, then provision and bill unlimited client sub-accounts from a reseller console. Think GoHighLevel — but for real operations, PMO, HR and the books.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Your brand end to end — clients never see SNR-PMO.',
                  'Custom domain and fully branded login & emails.',
                  'Provision, manage and bill unlimited sub-accounts.',
                  'Sell a full business platform under your own name.',
                ].map((b) => (
                  <li key={b} className="flex gap-3 text-white/60 text-[15px]">
                    <Check />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link href="/login?mode=signup" className="mt-8 inline-flex px-6 py-3 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] font-semibold hover:bg-[#10b981] transition-colors shadow-xl shadow-[#10b981]/25">
                Become a partner
              </Link>
            </div>

            <BrowserFrame title="agency.yourbrand.com — reseller console">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white font-bold text-xs">Y</span>
                  <span className="text-sm font-medium text-white/80">YourBrand Platform</span>
                  <span className="ml-auto text-[10px] text-white/30">3 sub-accounts</span>
                </div>
                {[
                  { n: 'Northwind Co.', s: '12 seats', st: 'Active' },
                  { n: 'Riverstone LLC', s: '8 seats', st: 'Active' },
                  { n: 'Lakeside Studio', s: '4 seats', st: 'Trial' },
                ].map((c) => (
                  <div key={c.n} className="flex items-center gap-3 rounded-xl bg-[#161616] border border-white/10 px-3 py-3 text-[12px]">
                    <span className="w-7 h-7 rounded-lg bg-white/5 grid place-items-center text-white/40">{c.n[0]}</span>
                    <span className="text-white/85 flex-1">{c.n}</span>
                    <span className="text-white/40 hidden sm:block">{c.s}</span>
                    <span className={'px-2 py-0.5 rounded-full text-[10px] ' + (c.st === 'Active' ? 'bg-[#10b981]/15 text-[#3ECF8E]' : 'bg-amber-500/15 text-amber-300')}>{c.st}</span>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-[12px] text-white/40">+ Provision new client</div>
              </div>
            </BrowserFrame>
          </div>
        </section>

        {/* ------------------------------ STATS BAR -------------------------- */}
        <section className="mx-auto max-w-7xl px-5 sm:px-8 py-16">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#101010] to-[#0c0c0c] p-8 sm:p-12 grid sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold bg-gradient-to-r from-[#3ECF8E] to-[#10b981] bg-clip-text text-transparent">4 {'→'} 1</div>
              <div className="mt-2 text-sm text-white/50">Tools replaced by one platform</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white">1 login · 1 bill</div>
              <div className="mt-2 text-sm text-white/50">No tool-switching, no reconciliation across apps</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white">Projects {'→'} payroll {'→'} P&amp;L</div>
              <div className="mt-2 text-sm text-white/50">Everything your business runs on, in one workspace</div>
            </div>
          </div>
        </section>

        {/* ------------------------------ PRICING ---------------------------- */}
        {/* ------------------------------ TRUST ------------------------------ */}
        <section className="mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28 border-t border-white/10">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">Built to be trusted</div>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Real operations need real guardrails</h2>
            <p className="mt-3 text-white/50">No black boxes. Your data stays yours, every agent action is reviewable, and the books are real.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { t: 'Tenant isolation by default', d: 'Every workspace is fenced at the database level with row-level security — one organization can never see another tenant\'s data.' },
              { t: 'Approve-first, fully audited', d: 'Agents propose; a person approves. Every action is written to an append-only audit trail and is one-click reversible. Money and payroll always wait for you.' },
              { t: 'Real double-entry accounting', d: 'A genuine general ledger — debits, credits, trial balance and P&L. Invoices and payroll post real journal entries, not a faked summary.' },
              { t: 'Your data, no lock-in', d: 'Org-scoped REST API, event webhooks and CSV export. Take your data with you anytime — nothing is held hostage.' },
              { t: 'White-label & reseller-ready', d: 'Your brand, logo and custom domain, with unlimited client sub-accounts billed from a reseller console.' },
              { t: 'Granular roles & permissions', d: 'Role-based access control across every module, plus audit logs and SSO/SAML on Enterprise.' },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border border-white/10 bg-[#101010] p-6">
                <div className="text-[15px] font-semibold text-white">{f.t}</div>
                <div className="mt-2 text-[14px] text-white/55 leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------- COMPARE ----------------------------- */}
        <section id="compare" className="relative overflow-hidden border-y border-white/10 bg-[#0c0c0c]">
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">SNR-PMO vs the alternatives</div>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">One product where others cover a slice</h2>
              <p className="mt-4 text-white/55 text-[15px] leading-relaxed">Each of these is strong at one thing. SNR-PMO is the only one that runs your whole back office &mdash; projects, CRM, HR &amp; payroll and real accounting &mdash; and adds approve-first AI agents and white-label resale.</p>
            </div>
            <CompareTable />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-white/40">
              <span className="inline-flex items-center gap-1.5"><span className="text-[#3ECF8E]">&#10003;</span> included</span>
              <span className="inline-flex items-center gap-1.5"><span className="text-amber-400/90 font-medium">Partial</span> limited or add-on</span>
              <span className="inline-flex items-center gap-1.5"><span className="text-white/30">&mdash;</span> not offered</span>
            </div>
            <p className="mt-5 text-[11px] text-white/30 leading-relaxed max-w-3xl">Based on each product&rsquo;s primary positioning and publicly documented capabilities as of June 2026; capabilities and plans change. Product names are trademarks of their respective owners and imply no affiliation.</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/55">
              <span className="text-white/40">Full head-to-head:</span>
              <a href="/vs/gohighlevel" className="underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#3ECF8E] transition-colors">vs GoHighLevel</a><span className="text-white/20">&middot;</span>
              <a href="/vs/clickup" className="underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#3ECF8E] transition-colors">vs ClickUp</a><span className="text-white/20">&middot;</span>
              <a href="/vs/odoo" className="underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#3ECF8E] transition-colors">vs Odoo</a><span className="text-white/20">&middot;</span>
              <a href="/vs/hubspot" className="underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#3ECF8E] transition-colors">vs HubSpot</a>
              <a href="/alternatives" className="ml-1 text-[#3ECF8E] hover:underline">compare all 8 &rarr;</a>
            </div>
            <div className="mt-8"><a href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-[#3ECF8E] px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors">See it for yourself &mdash; start free &rarr;</a></div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple pricing for the whole stack</h2>
            <p className="mt-3 text-white/50">Start free. Upgrade when you grow. Pro is billed per active user.</p>
          </div>

          <div className="mt-12 grid md:grid-cols-2 xl:grid-cols-4 gap-5">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={
                  'relative rounded-2xl border p-6 flex flex-col ' +
                  (p.highlight
                    ? 'border-[#10b981]/50 bg-gradient-to-b from-[#10b981]/10 to-[#101010] shadow-2xl shadow-[#10b981]/10'
                    : 'border-white/10 bg-[#101010]')
                }
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#3ECF8E] text-[#0a0a0a] text-[11px] font-bold px-3 py-1">
                    Most popular
                  </span>
                )}
                <div className="text-sm font-semibold text-white">{p.name}</div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold text-white">{p.price}</span>
                  <span className="mb-1 text-xs text-white/40">{p.unit}</span>
                </div>
                <div className="mt-2 text-[13px] text-white/45 min-h-[2.5rem]">{p.blurb}</div>
                <Link
                  href={p.href}
                  className={
                    'mt-5 text-center text-sm font-semibold py-2.5 rounded-lg transition-colors ' +
                    (p.highlight
                      ? 'bg-[#3ECF8E] text-[#0a0a0a] hover:bg-[#10b981]'
                      : 'border border-white/15 text-white/85 hover:bg-white/5')
                  }
                >
                  {p.cta}
                </Link>
                <ul className="mt-6 space-y-2.5">
                  {p.feats.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-white/60">
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-white/35">Pro billed per active user. Prices in USD.</p>
        </section>

        {/* -------------------------------- FAQ ------------------------------ */}
        <section id="faq" className="mx-auto max-w-3xl px-5 sm:px-8 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </section>

        {/* ---------------------------- FINAL CTA ---------------------------- */}
        <section className="relative overflow-hidden border-t border-white/10">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#10b981]/15 blur-[130px]" />
          </div>
          <div className="relative mx-auto max-w-3xl px-5 sm:px-8 py-24 text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Put your back office on autopilot.</h2>
            <p className="mt-5 text-white/55 text-lg">Projects, CRM, HR and real accounting in one workspace — with AI agents on the busywork, approve-first. One login, one bill.</p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/login?mode=signup" className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] font-semibold hover:bg-[#10b981] transition-colors shadow-xl shadow-[#10b981]/25">
                Start free
              </Link>
              <Link href="/login" className="w-full sm:w-auto px-7 py-3.5 rounded-lg border border-white/15 text-white/85 font-medium hover:bg-white/5 transition-colors">
                Log in
              </Link>
            </div>
            <div className="mt-5 text-xs text-white/40">No card required · Free up to 5 seats</div>
          </div>
        </section>

        {/* ------------------------------ FOOTER ----------------------------- */}
        <footer className="border-t border-white/10 bg-[#0a0a0a]">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#3ECF8E] text-[#0a0a0a] font-black text-lg">S</span>
                <span className="font-semibold tracking-tight">SNR-PMO</span>
              </div>
              <p className="mt-4 text-[13px] text-white/40 leading-relaxed max-w-xs">
                The all-in-one business OS. Projects, CRM, HR &amp; payroll, and real accounting — in one workspace.
              </p>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40">Product</div>
              <ul className="mt-4 space-y-2.5 text-sm text-white/55">
                <li><a href="#agents" className="hover:text-white transition-colors">AI Agents</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
                <li><Link href="/login?mode=signup" className="hover:text-white transition-colors">Start free</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40">Company</div>
              <ul className="mt-4 space-y-2.5 text-sm text-white/55">
                <li><Link href="/login" className="hover:text-white transition-colors">Log in</Link></li>
                <li><Link href="/login?mode=signup" className="hover:text-white transition-colors">Sign up</Link></li>
                <li><a href="#product" className="hover:text-white transition-colors">Product tour</a></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40">Legal</div>
              <ul className="mt-4 space-y-2.5 text-sm text-white/55">
                <li><Link href="/legal/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/legal/terms" className="hover:text-white transition-colors">Terms</Link></li>
                <li><Link href="/legal/security" className="hover:text-white transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto max-w-7xl px-5 sm:px-8 py-6 text-xs text-white/35">{'©'} 2026 SNR-PMO. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </>
  );
}
