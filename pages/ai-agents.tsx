/**
 * /ai-agents — moat-led acquisition page for SNR-PMO's approve-first AI agents
 * that work across the back office (projects, CRM, HR, accounting). Self-contained
 * SSG marketing page (react + next only), dark/emerald MarketingChrome, white-label
 * safe (reseller-host guard). Honest by design: agents PROPOSE and you approve;
 * full audit + one-click rollback + per-tenant cost ceilings; live AI proposals
 * activate when the workspace connects an AI provider key.
 */
import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MktHeader, MktFooter } from '@/components/MarketingChrome';
import { resellerPublicSite } from '@/lib/db';

const BASE = 'https://snr-pmo.vercel.app';

const STEPS: { n: string; t: string; d: string }[] = [
  { n: '1', t: 'Propose', d: 'An agent drafts the work — a project plan, a client onboarding, outreach, a reconciliation — as a concrete proposal. Nothing is applied yet.' },
  { n: '2', t: 'Approve', d: 'You review the proposed actions and approve, edit, or reject. Agents never act on their own — approval is the default, not an afterthought.' },
  { n: '3', t: 'Execute', d: 'On approval the agent performs the actions through the same permission-checked paths your team uses. No backdoors, no elevated access.' },
  { n: '4', t: 'Audit', d: 'Every proposal and action is logged with who, what and when — a complete trail across every agent and module.' },
  { n: '5', t: 'Roll back', d: 'Changed your mind? Reverse an executed action in one click. Mistakes are recoverable by design.' },
];

const DOMAINS: { t: string; d: string }[] = [
  { t: 'Work & projects', d: 'Scaffold a project from a brief, break work into tasks, flag capacity and deadline risk, draft a status brief.' },
  { t: 'CRM & sales', d: 'Onboard a new client end-to-end, draft follow-ups, keep the pipeline tidy, turn a won deal into a delivery plan.' },
  { t: 'People & HR', d: 'Prep onboarding, surface capacity and leave conflicts, draft meeting briefs — the admin around your team, handled.' },
  { t: 'Accounting & finance', d: 'Draft invoices and reconciliations, chase what is overdue, keep the ledger moving — proposed for your approval.' },
  { t: 'Across everything', d: 'A find-work agent scans your workspace and proposes the highest-value next actions across every module.' },
];

const TRUST: string[] = [
  'Approve-first — agents propose, you decide; nothing auto-applies',
  'Complete audit trail of every proposal and action',
  'One-click rollback on executed actions',
  'Per-tenant cost ceilings so spend can never run away',
  'RBAC-scoped — agents respect each role and permission',
  'Multi-tenant isolation — one workspace can never touch another',
  'Preflight — every action is dry-run against your live data before you approve',
  'Agents learn your approve/reject history and mute the noise — opt-in, reversible',
];

const FAQS: { q: string; a: string }[] = [
  { q: 'Do the agents act on their own?', a: 'No. Every agent works approve-first: it proposes a set of actions and waits for a human to approve, edit or reject them. This is the core design — governed automation, not an autonomous black box.' },
  { q: 'What can the agents actually do?', a: 'They draft and, on approval, carry out real back-office work: scaffolding projects, onboarding clients, drafting outreach and invoices, flagging risks, and proposing the best next actions across projects, CRM, HR and accounting.' },
  { q: 'Is it safe? What about my data?', a: 'Agents act through the same permission-checked paths your team uses and respect role-based access. Every workspace is isolated from every other, every action is audited, and anything executed can be rolled back in one click.' },
  { q: 'Do I need my own AI provider key?', a: 'The approve-first queue, audit trail, rollback and cost ceilings are built in. Live agent proposals turn on when your workspace connects an AI provider key, so you stay in control of the model and the spend.' },
  { q: 'Can I resell this under my own brand?', a: 'Yes. SNR-PMO is white-label: run the whole platform, agents included, under your own brand and bill your clients directly.' },
  { q: 'How is this different from GoHighLevel or other tools?', a: 'Most tools automate front-office marketing. SNR-PMO puts approve-first AI agents on the back office — projects, CRM, HR and real accounting — in one white-label workspace. That combination is the wedge no single competitor matches.' },
  { q: 'How do I know an action will actually work before I approve it?', a: 'Every create and update proposal is preflighted: the agent replays it against your live data under your own permissions inside a rolled-back transaction, then shows a clear Verified or Would-fail with the reason. Nothing is written during the check, and the queue can validate everything pending at once — so you approve with confidence, not hope.' },
];

const CONTROL_TOWER: { t: string; d: string }[] = [
  { t: 'Preflight before you approve', d: 'The agent replays the action against your live data first and tells you plainly: it will run, or it would fail and why. No more approving something that errors out a second later.' },
  { t: 'Learns your judgment', d: 'Your agents remember what you approve and reject. The queue is ranked by what you usually accept, and the kinds you keep rejecting are muted automatically \u2014 opt-in and reversible.' },
  { t: 'Just say what you want', d: 'Type \u201conboard Acme Corp\u201d or \u201ckick off project Apollo\u201d and the agent turns the sentence into a complete, reviewable plan \u2014 the contact, the project, the tasks, the deal \u2014 ready to approve.' },
  { t: 'Never fires blind', d: 'Even hands-off, low-risk automation is preflighted first. If an action would fail, it is held for a human instead of firing into an error.' },
];

const WEDGE: { t: string; d: string }[] = [
  { t: 'Back-office breadth', d: 'Not just marketing automation. Agents work across projects, CRM, HR and double-entry accounting — the operational core of the business.' },
  { t: 'Governed by design', d: 'Approve-first proposals, full audit trail, one-click rollback and per-tenant cost ceilings. Enterprise-safe AI, not an autonomous black box.' },
  { t: 'White-label', d: 'Run the whole platform, agents included, under your own brand and bill your clients directly.' },
];

export default function AiAgentsPage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    resellerPublicSite(window.location.hostname).then((s) => { if (s?.enabled) router.replace('/'); }).catch(() => {});
  }, [router]);

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const appLd = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'SNR-PMO AI back-office agents', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: `${BASE}/ai-agents`, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };

  return (
    <>
      <Head>
        <title>AI agents for your back office — approve-first &amp; governed | SNR-PMO</title>
        <meta name="description" content="SNR-PMO puts approve-first AI agents on your back office — projects, CRM, HR and real accounting. Say onboard Acme Corp in plain English and the agent builds the plan; every action is preflighted against your live data, audited, and reversible. White-label." />
        <meta name="keywords" content="AI agents back office, approve-first AI, agentic SaaS, AI for operations, AI project management, AI CRM, white-label AI agents, GoHighLevel alternative" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${BASE}/ai-agents`} />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content={`${BASE}/ai-agents`} />
        <meta property="og:title" content="AI agents for your back office — they propose, you approve" />
        <meta property="og:description" content="Approve-first AI agents across projects, CRM, HR and accounting. Full audit, one-click rollback, cost ceilings. One white-label workspace." />
        <meta property="og:image" content={`${BASE}/og/alternatives.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BASE}/og/alternatives.png`} />
        <meta name="twitter:title" content="AI agents for your back office — they propose, you approve" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        <MktHeader />

        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[820px] h-[440px] rounded-full bg-[#10b981]/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-14 sm:pt-20 pb-12 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">AI agents · approve-first</div>
            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">AI agents that run your back office &mdash; and ask before they act</h1>
            <p className="mt-5 text-[16px] sm:text-lg text-white/65 leading-relaxed max-w-2xl mx-auto">SNR-PMO puts AI agents on the work most tools ignore &mdash; projects, CRM, HR and real accounting. They propose the work; you approve. Every action is audited and reversible, with cost ceilings built in.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login?mode=signup" className="px-5 py-3 rounded-xl text-sm font-semibold text-[#0a0a0a] bg-[#3ECF8E] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free</Link>
              <Link href="/#pricing" className="px-5 py-3 rounded-xl text-sm font-medium text-white/80 border border-white/15 hover:border-white/30 hover:text-white transition-colors">See pricing</Link>
            </div>
            <p className="mt-4 text-xs text-white/40">Free for up to 5 seats · no card required</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14">
          <div className="grid sm:grid-cols-3 gap-5">
            {WEDGE.map((c) => (
              <div key={c.t} className="rounded-2xl border border-white/10 bg-[#101010] p-6">
                <div className="text-[15px] font-semibold text-white">{c.t}</div>
                <p className="mt-2 text-sm text-white/55 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#0c0c0c]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Propose. Approve. Execute. Audit. Roll back.</h2>
              <p className="mt-4 text-white/60">A human is always in the loop. Agents do the drafting and the busywork; you stay in control of what actually happens.</p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-2xl border border-white/10 bg-[#101010] p-5">
                  <div className="grid place-items-center w-9 h-9 rounded-lg bg-[#10b981]/15 text-[#3ECF8E] font-bold">{s.n}</div>
                  <div className="mt-3 text-[15px] font-semibold">{s.t}</div>
                  <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">A control tower, not a black box</h2>
            <p className="mt-4 text-white/60">The newest layer: your agents show their work, prove it before it runs, and learn what you actually want.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CONTROL_TOWER.map((c) => (
              <div key={c.t} className="rounded-2xl border border-white/10 bg-[#101010] p-6">
                <div className="text-[15px] font-semibold text-[#3ECF8E]">{c.t}</div>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">An agent for every corner of the back office</h2>
            <p className="mt-4 text-white/60">Each module has its own agent, scoped to what it should touch.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((d) => (
              <div key={d.t} className="rounded-2xl border border-white/10 bg-[#101010] p-6">
                <div className="text-[15px] font-semibold text-[#3ECF8E]">{d.t}</div>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{d.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#0c0c0c]">
          <div className="mx-auto max-w-5xl px-5 sm:px-8 py-16">
            <div className="text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">AI you can actually trust in production</h2>
              <p className="mt-4 text-white/60 max-w-2xl mx-auto">The guardrails are the product. Every agent runs inside them.</p>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {TRUST.map((t) => (
                <li key={t} className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#101010] p-4">
                  <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 w-5 h-5 shrink-0 text-[#3ECF8E]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
                  <span className="text-sm text-white/75 leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-center text-sm text-white/50">Curious what an hour of agent work is worth? <Link href="/savings" className="text-[#3ECF8E] hover:underline">Estimate your savings</Link>.</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 sm:px-8 py-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">Questions, answered</h2>
          <div className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#101010]">
            {FAQS.map((f) => (
              <details key={f.q} className="group p-5 sm:p-6">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[15px] font-medium text-white/90">
                  {f.q}
                  <span className="text-white/40 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-white/60 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto max-w-4xl px-5 sm:px-8 py-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Put an agent on your back office today</h2>
            <p className="mt-4 text-white/65 max-w-xl mx-auto">Start free for up to 5 seats. Bring your own AI provider and let the approve-first agents take the busywork &mdash; under your control, on your brand.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login?mode=signup" className="px-6 py-3.5 rounded-xl text-sm font-semibold text-[#0a0a0a] bg-[#3ECF8E] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free</Link>
              <Link href="/vs" className="px-6 py-3.5 rounded-xl text-sm font-medium text-white/80 border border-white/15 hover:border-white/30 hover:text-white transition-colors">Compare with others</Link>
            </div>
          </div>
        </section>

        <MktFooter />
      </div>
    </>
  );
}
