/**
 * /vs — comparisons hub. Lists every SNR-PMO vs <competitor> page so the
 * programmatic SEO set is internally linked from one crawlable index.
 * Statically generated (no data deps). White-label safe (reseller-host guard).
 */
import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { COMPETITORS } from '@/lib/vsCompetitors';
import { MktHeader, MktFooter } from '@/components/MarketingChrome';
import { resellerPublicSite } from '@/lib/db';

const BASE = 'https://snr-pmo.vercel.app';

export default function VsHub() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    resellerPublicSite(window.location.hostname)
      .then((s) => { if (s?.enabled) router.replace('/'); })
      .catch(() => {});
  }, [router]);

  const listLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: COMPETITORS.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: `SNR-PMO vs ${c.name}`, url: `${BASE}/vs/${c.slug}` })),
  };

  return (
    <>
      <Head>
        <title>SNR-PMO alternatives & comparisons — vs GoHighLevel, ClickUp, Odoo, HubSpot</title>
        <meta name="description" content="How SNR-PMO compares to GoHighLevel, ClickUp, Odoo and HubSpot. Honest, side-by-side capability comparisons — projects, CRM, HR & payroll, real accounting, approve-first AI agents and white-label resale." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${BASE}/vs`} />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content={`${BASE}/vs`} />
        <meta property="og:title" content="SNR-PMO alternatives & comparisons" />
        <meta property="og:description" content="Honest, side-by-side comparisons: SNR-PMO vs GoHighLevel, ClickUp, Odoo and HubSpot." />
        <meta property="og:image" content={`${BASE}/og/alternatives.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BASE}/og/alternatives.png`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(listLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        <MktHeader />

        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[420px] rounded-full bg-[#10b981]/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-16 sm:pt-20 pb-12 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">Comparisons</div>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">How SNR-PMO compares</h1>
            <p className="mt-5 text-[16px] sm:text-lg text-white/65 leading-relaxed max-w-2xl mx-auto">Each tool below is strong at one slice. SNR-PMO is the only one that runs your whole back office — projects, CRM, HR & payroll and real accounting — with approve-first AI agents and white-label resale. Here is an honest look at how we stack up.</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-14">
          <div className="grid sm:grid-cols-2 gap-5">
            {COMPETITORS.map((c) => (
              <Link key={c.slug} href={`/vs/${c.slug}`} className="group rounded-2xl border border-white/10 bg-[#101010] p-6 hover:border-[#3ECF8E]/40 hover:bg-[#121212] transition-colors">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-semibold text-white">SNR-PMO <span className="text-white/40">vs</span> {c.name}</div>
                  <span className="text-[#3ECF8E] text-sm opacity-0 group-hover:opacity-100 transition-opacity">Compare &rarr;</span>
                </div>
                <div className="mt-1 text-[12px] text-white/45">{c.positioning}</div>
                <p className="mt-3 text-[14px] text-white/60 leading-relaxed">{c.weWin[0]}</p>
              </Link>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/#compare" className="inline-flex items-center justify-center rounded-lg border border-white/15 px-6 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">See the full capability matrix</Link>
          </div>
        </section>

        <MktFooter />
      </div>
    </>
  );
}
