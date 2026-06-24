/**
 * /savings — interactive "what is your tool stack costing you?" calculator.
 * A shareable lead magnet that quantifies the consolidation wedge: toggle the
 * tools you pay for today vs running it all on SNR-PMO. Fully client-side
 * (React state, no deps, no DB), statically generated so crawlers see the
 * default computed numbers. White-label safe (reseller-host guard).
 */
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MktHeader, MktFooter } from '@/components/MarketingChrome';
import { resellerPublicSite } from '@/lib/db';

const BASE = 'https://snr-pmo.vercel.app';
const SNR_PER_SEAT = 12; // SNR-PMO Pro, $/user/mo

type Tool = { key: string; label: string; sub: string; perSeat: number; flat: number };
const TOOLS: Tool[] = [
  { key: 'pm', label: 'Project management', sub: 'ClickUp / Asana / Monday-class', perSeat: 12, flat: 0 },
  { key: 'crm', label: 'CRM & sales pipeline', sub: 'HubSpot / Pipedrive-class', perSeat: 20, flat: 0 },
  { key: 'acct', label: 'Accounting', sub: 'QuickBooks-class', perSeat: 0, flat: 75 },
  { key: 'payroll', label: 'Payroll & HR', sub: 'Gusto-class', perSeat: 6, flat: 40 },
  { key: 'time', label: 'Time tracking', sub: 'Harvest / Toggl-class', perSeat: 8, flat: 0 },
];

const FAQS = [
  { q: 'How are these numbers calculated?', a: 'We use representative published list prices for each category (e.g. ~$12/user/mo for project management, ~$20/user/mo for CRM, ~$75/mo for accounting, ~$40/mo + $6/user for payroll, ~$8/user/mo for time tracking) and compare the total to SNR-PMO Pro at $12/user/mo, which includes all of those in one workspace. Your actual costs vary by vendor and plan — adjust the toggles to match your stack.' },
  { q: 'Does SNR-PMO really replace all of these?', a: 'SNR-PMO runs projects & PMO, a CRM pipeline, HR & payroll, real double-entry accounting and time tracking in one workspace, on one bill — plus approve-first AI agents. That is the point of the comparison: one product instead of a stack.' },
  { q: 'Is there really a free plan?', a: 'Yes — SNR-PMO is free forever for up to 5 seats (including a metered taste of AI agents). Pro is $12/user/mo. No card required to start.' },
  { q: 'What about migration?', a: 'Import projects, tasks and contacts via CSV and use the org-scoped REST API for larger datasets. Most teams move their active work over in an afternoon.' },
];

function money(n: number) { return '$' + Math.round(n).toLocaleString('en-US'); }

export default function SavingsPage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    resellerPublicSite(window.location.hostname).then((s) => { if (s?.enabled) router.replace('/'); }).catch(() => {});
  }, [router]);

  const [seats, setSeats] = useState(10);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(TOOLS.map((t) => [t.key, true])));
  const s = Math.max(1, Math.min(500, seats || 1));
  const current = TOOLS.reduce((sum, t) => sum + (on[t.key] ? t.perSeat * s + t.flat : 0), 0);
  const snr = SNR_PER_SEAT * s;
  const saveMo = Math.max(0, current - snr);
  const saveYr = saveMo * 12;
  const pct = current > 0 ? Math.round((saveMo / current) * 100) : 0;

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const appLd = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'SNR-PMO tool-stack savings calculator', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: `${BASE}/savings`, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };

  return (
    <>
      <Head>
        <title>Tool-stack cost calculator — how much could you save with SNR-PMO? (2026)</title>
        <meta name="description" content="Add up what your PM tool, CRM, accounting, payroll and time tracking cost each month, then see what running it all on SNR-PMO ($12/user/mo, all-in-one) would cost. Interactive savings calculator." />
        <meta name="keywords" content="software stack cost calculator, SaaS cost calculator, project management cost, CRM cost, all-in-one business software savings, SNR-PMO" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${BASE}/savings`} />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content={`${BASE}/savings`} />
        <meta property="og:title" content="What is your software stack costing you?" />
        <meta property="og:description" content="See how much you could save consolidating PM, CRM, accounting, payroll and time tracking onto SNR-PMO — one workspace, one bill." />
        <meta property="og:image" content={`${BASE}/og/savings.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BASE}/og/savings.png`} />
        <meta name="twitter:title" content="What is your software stack costing you?" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        <MktHeader />

        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[420px] rounded-full bg-[#10b981]/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-14 sm:pt-20 pb-10 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">Savings calculator</div>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">What is your software stack costing you?</h1>
            <p className="mt-5 text-[16px] sm:text-lg text-white/65 leading-relaxed max-w-2xl mx-auto">Most teams pay for a project tool, a CRM, accounting, payroll and time tracking — separately. SNR-PMO runs them in one workspace for $12/user/mo. Toggle what you pay for today and see the difference.</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-12 grid lg:grid-cols-2 gap-6">
          {/* INPUTS */}
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-6 sm:p-7">
            <label className="block text-sm font-medium text-white/80">Team size</label>
            <div className="mt-3 flex items-center gap-4">
              <input type="range" min={1} max={100} value={Math.min(100, s)} onChange={(e) => setSeats(parseInt(e.target.value, 10))} className="flex-1 accent-[#3ECF8E]" aria-label="Team size" />
              <input type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(parseInt(e.target.value, 10) || 0)} className="w-20 rounded-lg bg-[#0a0a0a] border border-white/15 px-3 py-2 text-center text-white" />
            </div>
            <div className="mt-7 text-sm font-medium text-white/80">Tools you pay for today</div>
            <div className="mt-3 space-y-2">
              {TOOLS.map((t) => {
                const active = on[t.key];
                const cost = t.perSeat * s + t.flat;
                return (
                  <button key={t.key} type="button" onClick={() => setOn((o) => ({ ...o, [t.key]: !o[t.key] }))} className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-[#3ECF8E]/40 bg-[#3ECF8E]/[0.06]' : 'border-white/10 bg-[#0c0c0c] hover:bg-white/5'}`}>
                    <span className={`shrink-0 w-5 h-5 rounded-md grid place-items-center border ${active ? 'bg-[#3ECF8E] border-[#3ECF8E]' : 'border-white/25'}`}>
                      {active && <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-[#0a0a0a]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[14px] font-medium text-white">{t.label}</span>
                      <span className="block text-[12px] text-white/40">{t.sub}</span>
                    </span>
                    <span className={`text-[13px] tabular-nums ${active ? 'text-white/80' : 'text-white/30'}`}>{money(cost)}/mo</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-white/30 leading-relaxed">Representative published list prices as of June 2026 (per-seat where applicable); your actual vendor pricing varies. Adjust to match your stack.</p>
          </div>

          {/* RESULTS */}
          <div className="rounded-2xl border border-[#3ECF8E]/30 bg-gradient-to-br from-[#0f0f0f] to-[#0c1f17] p-6 sm:p-7 flex flex-col">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">Your estimated savings</div>
            <div className="mt-3 text-5xl sm:text-6xl font-extrabold tracking-tight text-white tabular-nums">{money(saveYr)}<span className="text-2xl font-bold text-white/50">/yr</span></div>
            <div className="mt-1 text-[15px] text-white/60">{money(saveMo)}/mo saved · {pct}% less than your current stack</div>

            <div className="mt-7 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0c0c0c] px-4 py-3">
                <span className="text-[13px] text-white/60">Your current stack</span>
                <span className="text-[15px] font-semibold text-white tabular-nums">{money(current)}/mo</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#3ECF8E]/30 bg-[#3ECF8E]/[0.08] px-4 py-3">
                <span className="text-[13px] text-white/80">SNR-PMO Pro ({s} {s === 1 ? 'seat' : 'seats'})</span>
                <span className="text-[15px] font-semibold text-[#3ECF8E] tabular-nums">{money(snr)}/mo</span>
              </div>
            </div>

            <div className="mt-auto pt-7">
              <Link href="/login?mode=signup" className="block w-full text-center rounded-lg bg-[#3ECF8E] px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free — no card required &rarr;</Link>
              <Link href="/alternatives" className="mt-3 block w-full text-center rounded-lg border border-white/15 px-6 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">See the full comparison</Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">Savings calculator — FAQ</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <div key={f.q} className="border border-white/10 rounded-xl bg-[#101010] p-5">
                <div className="text-[15px] font-medium text-white">{f.q}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{f.a}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-white/30 leading-relaxed text-center">Estimates are for comparison only and use representative published list prices as of June 2026; they are not a quote. Product names are trademarks of their respective owners.</p>
        </section>

        <MktFooter />
      </div>
    </>
  );
}
