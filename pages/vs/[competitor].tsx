/**
 * Programmatic SEO comparison page: /vs/<competitor>.
 * Statically generated (getStaticPaths + getStaticProps) so the comparison
 * content + JSON-LD render into HTML for crawlers. Honest, balanced framing
 * (where each product wins) — consistent with the landing #compare section.
 * White-label safe: on a reseller host it redirects to "/" (their branded site).
 */
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { COMPETITORS, getCompetitor, type Competitor } from '@/lib/vsCompetitors';
import { MktHeader, MktFooter, Mark } from '@/components/MarketingChrome';
import { resellerPublicSite } from '@/lib/db';

const BASE = 'https://snr-pmo.vercel.app';

function VsFaq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl bg-[#101010] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-4 text-left px-5 py-4">
        <span className="text-[15px] font-medium text-white">{q}</span>
        <span className={`shrink-0 w-7 h-7 rounded-full border border-white/15 grid place-items-center text-white/60 transition-transform ${open ? 'rotate-45' : ''}`}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </span>
      </button>
      {open && <div className="px-5 pb-5 -mt-1 text-[14px] leading-relaxed text-white/55">{a}</div>}
    </div>
  );
}

export default function VsCompetitorPage({ competitor: c }: { competitor: Competitor }) {
  const router = useRouter();

  // White-label safety: never expose SNR-PMO comparison pages on a reseller's
  // branded host — send them to "/" which renders the reseller landing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    resellerPublicSite(window.location.hostname)
      .then((s) => { if (s?.enabled) router.replace('/'); })
      .catch(() => {});
  }, [router]);

  if (!c) return null;

  const url = `${BASE}/vs/${c.slug}`;
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Comparisons', item: `${BASE}/vs` },
      { '@type': 'ListItem', position: 3, name: `SNR-PMO vs ${c.name}`, item: url },
    ],
  };

  return (
    <>
      <Head>
        <title>{c.metaTitle}</title>
        <meta name="description" content={c.metaDescription} />
        <meta name="keywords" content={c.keywords.join(', ')} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={url} />
        <meta name="theme-color" content="#0a0a0a" />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="SNR-PMO" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={`SNR-PMO vs ${c.name}`} />
        <meta property="og:description" content={c.metaDescription} />
        <meta property="og:image" content={`${BASE}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${BASE}/og.png`} />
        <meta name="twitter:title" content={`SNR-PMO vs ${c.name}`} />
        <meta name="twitter:description" content={c.metaDescription} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-[#10b981]/30">
        <MktHeader />

        {/* HERO */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[420px] rounded-full bg-[#10b981]/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-14 sm:pt-20 pb-14">
            <nav className="text-[12px] text-white/40 flex items-center gap-2" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-white/70">Home</Link><span>/</span>
              <Link href="/vs" className="hover:text-white/70">Comparisons</Link><span>/</span>
              <span className="text-white/70">vs {c.name}</span>
            </nav>
            <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold tracking-tight">SNR-PMO <span className="text-white/40">vs</span> {c.name}</h1>
            <div className="mt-2 text-sm text-[#3ECF8E] font-medium">The {c.positioning} alternative — with your whole back office in one place</div>
            <p className="mt-5 text-[16px] sm:text-lg text-white/65 leading-relaxed max-w-3xl">{c.hero}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-[#3ECF8E] px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free &rarr;</Link>
              <a href="#table" className="inline-flex items-center justify-center rounded-lg border border-white/15 px-6 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">See the comparison</a>
            </div>
          </div>
        </section>

        {/* VERDICT */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-14">
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">The short version</div>
            <p className="mt-3 text-[15px] sm:text-base text-white/75 leading-relaxed">{c.verdict}</p>
          </div>
        </section>

        {/* TABLE */}
        <section id="table" className="mx-auto max-w-5xl px-5 sm:px-8 pb-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">SNR-PMO vs {c.name}, capability by capability</h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="w-[52%] p-3 align-bottom"></th>
                  <th className="p-3 text-center align-bottom bg-[#3ECF8E]/10 rounded-t-xl">
                    <div className="text-sm font-bold text-[#3ECF8E]">SNR-PMO</div>
                    <div className="mt-0.5 text-[10px] font-normal text-white/40">All-in-one + agents</div>
                  </th>
                  <th className="p-3 text-center align-bottom">
                    <div className="text-sm font-bold text-white">{c.name}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-white/40">{c.positioning}</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r, ri) => (
                  <tr key={r.c} className="border-t border-white/10 align-top">
                    <td className="p-3 text-[13px] text-white/75">
                      {r.c}
                      {r.note && <div className="mt-0.5 text-[11px] text-white/35 leading-snug">{r.note}</div>}
                    </td>
                    <td className={`p-3 text-center bg-[#3ECF8E]/10 ${ri === c.rows.length - 1 ? 'rounded-b-xl' : ''}`}><Mark v={r.snr} /></td>
                    <td className="p-3 text-center"><Mark v={r.them} /></td>
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

        {/* WHERE EACH WINS */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-12 grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-6">
            <h3 className="text-lg font-semibold text-white">Where {c.name} is the better choice</h3>
            <ul className="mt-4 space-y-3">
              {c.theyWin.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-white/65 leading-relaxed">
                  <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-white/30" aria-hidden="true" />{t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#3ECF8E]/30 bg-[#3ECF8E]/[0.06] p-6">
            <h3 className="text-lg font-semibold text-white">Where SNR-PMO wins</h3>
            <ul className="mt-4 space-y-3">
              {c.weWin.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-white/80 leading-relaxed">
                  <span className="mt-0.5 shrink-0"><Mark v="y" /></span>{t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* PRICING SNAPSHOT */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 pb-12">
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-white">Pricing at a glance</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-[#3ECF8E]">SNR-PMO</div>
                <p className="mt-2 text-[14px] text-white/65 leading-relaxed">Free forever for up to 5 seats (includes a metered taste of AI agents), Pro at $12/user/mo, Enterprise at $999/mo flat, and a White-label plan at $2,499/mo for unlimited resold sub-accounts. No card required to start.</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">{c.name}</div>
                <p className="mt-2 text-[14px] text-white/65 leading-relaxed">{c.pricingNote}</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">SNR-PMO vs {c.name} — FAQ</h2>
          <div className="mt-8 space-y-3">
            {c.faqs.map((f) => <VsFaq key={f.q} q={f.q} a={f.a} />)}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 pb-20">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f0f0f] to-[#0c1f17] p-10 sm:p-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Run your whole back office in one place</h2>
            <p className="mt-3 text-white/60 max-w-2xl mx-auto text-[15px] leading-relaxed">Projects, CRM, HR & payroll and real accounting — with approve-first AI agents doing the busywork. Start free, no card required.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-[#3ECF8E] px-7 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free &rarr;</Link>
              <Link href="/vs" className="inline-flex items-center justify-center rounded-lg border border-white/15 px-7 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors">Compare other tools</Link>
            </div>
          </div>
          <p className="mt-6 text-[11px] text-white/30 leading-relaxed">Comparison reflects each product&rsquo;s primary positioning and publicly documented capabilities as of June 2026; capabilities and plans change. {c.name} is a trademark of its respective owner; this page is independent and implies no affiliation or endorsement.</p>
        </section>

        <MktFooter />
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: COMPETITORS.map((c) => ({ params: { competitor: c.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = String(params?.competitor || '');
  const competitor = getCompetitor(slug);
  if (!competitor) return { notFound: true };
  return { props: { competitor } };
};
