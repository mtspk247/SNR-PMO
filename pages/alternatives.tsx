/**
 * /alternatives — category pillar page (hub) targeting head terms like
 * "all-in-one business software" and "alternatives to <X>". Unique content:
 * a master 8-way capability matrix + per-tool "who it's for" blurbs that
 * internally link to every /vs/<slug> spoke (hub-and-spoke SEO). Statically
 * generated (no data deps). White-label safe (reseller-host guard).
 */
import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { COMPETITORS, CANONICAL_CAPS, MATRIX, SNR_MATRIX } from '@/lib/vsCompetitors';
import { MktHeader, MktFooter, Mark } from '@/components/MarketingChrome';
import { resellerPublicSite } from '@/lib/db';

const BASE = 'https://snr-pmo.vercel.app';

const FAQS = [
  { q: 'What is the best all-in-one business software in 2026?', a: 'It depends what you are consolidating. SNR-PMO is built to run an entire back office — projects, CRM, HR & payroll and real double-entry accounting — in one workspace, with approve-first AI agents and white-label resale. Odoo is a broader ERP but is typically partner-deployed; ClickUp, Monday, Asana, Jira, Wrike and Smartsheet focus on project/work management; HubSpot and Salesforce on CRM; Zoho One bundles 45+ apps; QuickBooks on accounting.' },
  { q: 'What is the best GoHighLevel alternative that also does accounting and HR?', a: 'SNR-PMO. GoHighLevel covers the marketing front office and white-label resale, but not PMO, HR & payroll or double-entry accounting. SNR-PMO adds all three with the same resell-as-your-own model.' },
  { q: 'Which of these tools include real double-entry accounting?', a: 'Odoo, QuickBooks, Zoho (via Zoho Books) and SNR-PMO have a genuine general ledger. ClickUp, Monday, Asana, Jira, Wrike, Smartsheet, GoHighLevel, HubSpot and Salesforce do not — HubSpot Commerce handles invoices and payments, not double-entry books.' },
  { q: 'Can I white-label and resell any of these as my own?', a: 'GoHighLevel and SNR-PMO are built for white-label resale; ClickUp, Odoo, Zoho and Wrike offer limited, partner or branded-workspace paths; Monday, Asana, Jira, HubSpot, QuickBooks, Smartsheet and Salesforce do not. SNR-PMO is turnkey — your brand, domain and reseller billing for unlimited sub-accounts.' },
];

export default function AlternativesPage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    resellerPublicSite(window.location.hostname)
      .then((s) => { if (s?.enabled) router.replace('/'); })
      .catch(() => {});
  }, [router]);

  const itemLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: COMPETITORS.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: `SNR-PMO vs ${c.name}`, url: `${BASE}/vs/${c.slug}` })),
  };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };

  return (
    <>
      <Head>
        <title>Best all-in-one business software (2026): SNR-PMO vs 12 alternatives</title>
        <meta name="description" content="Compare SNR-PMO with GoHighLevel, ClickUp, Odoo, HubSpot, Monday.com, Asana, Jira, QuickBooks, Wrike, Smartsheet, Zoho and Salesforce. A master capability matrix plus honest, side-by-side breakdowns — projects, CRM, HR & payroll, real accounting, approve-first AI agents and white-label resale." />
        <meta name="keywords" content="all-in-one business software, GoHighLevel alternative, ClickUp alternative, Odoo alternative, HubSpot alternative, Monday.com alternative, Asana alternative, Jira alternative, QuickBooks alternative, Wrike alternative, Smartsheet alternative, Zoho alternative, Salesforce alternative, white-label SaaS" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${BASE}/alternatives`} />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content={`${BASE}/alternatives`} />
        <meta property="og:title" content="Best all-in-one business software (2026): SNR-PMO vs 12 alternatives" />
        <meta property="og:description" content="A master capability matrix + honest, side-by-side comparisons of SNR-PMO vs GoHighLevel, ClickUp, Odoo, HubSpot, Monday, Asana, Jira, QuickBooks, Wrike, Smartsheet, Zoho and Salesforce." />
        <meta property="og:image" content={`${BASE}/og/alternatives.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BASE}/og/alternatives.png`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        <MktHeader />

        {/* HERO */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[420px] rounded-full bg-[#10b981]/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-20 pb-12">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">All-in-one business software</div>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight max-w-3xl">The best all-in-one business software, honestly compared</h1>
            <p className="mt-5 text-[16px] sm:text-lg text-white/65 leading-relaxed max-w-3xl">Most tools own one slice — project management, CRM, marketing or accounting. SNR-PMO is the only one that runs your whole back office in a single workspace — projects, CRM, HR &amp; payroll and real double-entry accounting — with approve-first AI agents and white-label resale. Here is how it stacks up against twelve popular tools, including where each of them is the better choice.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-[#3ECF8E] px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free &rarr;</Link>
              <a href="#matrix" className="inline-flex items-center justify-center rounded-lg border border-white/15 px-6 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">Jump to the matrix</a>
            </div>
          </div>
        </section>

        {/* MASTER MATRIX */}
        <section id="matrix" className="mx-auto max-w-6xl px-5 sm:px-8 py-14">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Capability matrix — SNR-PMO vs 12 alternatives</h2>
          <p className="mt-3 text-white/55 text-[15px] max-w-3xl">Based on each product&rsquo;s primary positioning and publicly documented capabilities as of June 2026.</p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="w-[200px] p-3 align-bottom"></th>
                  <th className="p-3 text-center align-bottom bg-[#3ECF8E]/10 rounded-t-xl">
                    <div className="text-[13px] font-bold text-[#3ECF8E]">SNR-PMO</div>
                  </th>
                  {COMPETITORS.map((c) => (
                    <th key={c.slug} className="p-3 text-center align-bottom">
                      <Link href={`/vs/${c.slug}`} className="text-[12px] font-semibold text-white/80 hover:text-white">{c.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CANONICAL_CAPS.map((cap, i) => (
                  <tr key={cap} className="border-t border-white/10">
                    <td className="p-3 text-[13px] text-white/75">{cap}</td>
                    <td className={`p-3 text-center bg-[#3ECF8E]/10 ${i === CANONICAL_CAPS.length - 1 ? 'rounded-b-xl' : ''}`}><Mark v={SNR_MATRIX[i]} /></td>
                    {COMPETITORS.map((c) => (
                      <td key={c.slug} className="p-3 text-center"><Mark v={MATRIX[c.slug][i]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-white/40">
            <span className="inline-flex items-center gap-1.5"><span className="text-[#3ECF8E]">&#10003;</span> included</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-amber-400/90 font-medium">Partial</span> limited or add-on</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-white/30">&mdash;</span> not offered</span>
          </div>
        </section>

        {/* PER-TOOL CARDS */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How SNR-PMO compares to each tool</h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-5">
            {COMPETITORS.map((c) => (
              <div key={c.slug} className="rounded-2xl border border-white/10 bg-[#101010] p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">SNR-PMO <span className="text-white/40">vs</span> {c.name}</h3>
                  <Link href={`/vs/${c.slug}`} className="text-[13px] text-[#3ECF8E] hover:underline whitespace-nowrap">Full comparison &rarr;</Link>
                </div>
                <div className="mt-1 text-[12px] text-white/45">{c.name} &mdash; {c.positioning}</div>
                <p className="mt-3 text-[14px] text-white/65 leading-relaxed">{c.weWin[0]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">All-in-one software — FAQ</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <div key={f.q} className="border border-white/10 rounded-xl bg-[#101010] p-5">
                <div className="text-[15px] font-medium text-white">{f.q}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 pb-20">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f0f0f] to-[#0c1f17] p-10 sm:p-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">One workspace for the whole operation</h2>
            <p className="mt-3 text-white/60 max-w-2xl mx-auto text-[15px] leading-relaxed">Stop stitching a PM tool, a CRM, a payroll app and accounting together. Run them in one place — with approve-first AI agents doing the busywork. Start free, no card required.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-[#3ECF8E] px-7 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free &rarr;</Link>
              <Link href="/#compare" className="inline-flex items-center justify-center rounded-lg border border-white/15 px-7 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">See the landing comparison</Link>
            </div>
          </div>
          <p className="mt-6 text-[11px] text-white/30 leading-relaxed">Comparisons reflect each product&rsquo;s primary positioning and publicly documented capabilities as of June 2026; capabilities and plans change. All product names are trademarks of their respective owners; this page is independent and implies no affiliation or endorsement.</p>
        </section>

        <MktFooter />
      </div>
    </>
  );
}
