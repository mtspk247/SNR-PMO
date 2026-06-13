import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * SNR-PMO marketing landing page.
 * Self-contained: no shared layout, no shared theme tokens, no external deps
 * besides an optional GSAP CDN script for subtle scroll/hover motion.
 * Uses fixed Supabase-style colors via Tailwind arbitrary values so it renders
 * identically regardless of the app's dark/light theme context.
 */

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const FEATURES = [
  {
    title: 'Project & Portfolio Management',
    desc: 'Plan, track, and roll up projects across portfolios and companies — with one clean view from task to org.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="4" width="7" height="7" rx="1.5" />
        <rect x="3" y="15" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    title: 'Built-in CRM pipeline',
    desc: 'Track deals from lead to close, log activity, and turn won deals straight into projects.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M3 12h12M3 18h6" />
        <circle cx="20" cy="18" r="2" />
      </svg>
    ),
  },
  {
    title: 'HR & employee onboarding',
    desc: 'Standardize new-hire checklists with reusable templates so nothing falls through the cracks.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
        <path d="M16.5 4.5l1.2 1.2 2.3-2.3" />
      </svg>
    ),
  },
  {
    title: 'Roles & granular permissions',
    desc: 'Org, company, and portfolio-scoped roles let you control exactly who sees and edits what.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
        <path d="M9.5 12l1.8 1.8L14.5 10" />
      </svg>
    ),
  },
  {
    title: 'Audit log & compliance',
    desc: 'Every key action is recorded automatically — a clear, exportable trail for reviews and audits.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    title: 'White-label / multi-tenant branding',
    desc: 'Your logo, colors, and domain — every organization gets a fully branded workspace.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18" />
        <circle cx="6.5" cy="6" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="9" cy="6" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Create your org & companies',
    desc: 'Set up your organization, add the companies you operate or work with, and apply your branding in minutes.',
  },
  {
    n: '02',
    title: 'Invite your team with roles',
    desc: 'Bring in teammates and clients with scoped roles — org admin, company manager, project lead, or read-only.',
  },
  {
    n: '03',
    title: 'Run projects, deals, and people in one place',
    desc: 'Plan portfolios, track CRM pipeline, and manage onboarding — all under a single, secure workspace.',
  },
];

const PRICING = [
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    note: 'Up to 5 users',
    desc: 'Core PPM essentials for small teams getting organized.',
    features: [
      'Projects & portfolios',
      'Tasks, milestones & boards',
      'Basic dashboards',
      'Up to 5 team members',
      'Community support',
    ],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$15',
    period: '/user / month',
    note: 'Billed monthly, per active user',
    desc: 'Everything growing teams need to run projects, people, and pipeline.',
    features: [
      'Everything in Starter',
      'Built-in CRM pipeline',
      'HR & employee onboarding',
      'Audit log & compliance',
      'Advanced roles & permissions',
      'Priority email support',
    ],
    cta: 'Start free',
    highlight: true,
  },
  {
    name: 'White-label',
    price: 'Custom',
    period: 'pricing',
    note: 'For agencies & platforms',
    desc: 'Full white-label deployment with your brand, domain, and dedicated support.',
    features: [
      'Everything in Pro',
      'Per-tenant branding & themes',
      'Custom subdomain',
      'Multi-org management console',
      'Priority onboarding & support',
      'Custom contract & SLA',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
];

const FAQS = [
  {
    q: 'What is SNR-PMO?',
    a: 'SNR-PMO is an all-in-one project & portfolio management platform that also includes a lightweight CRM, HR onboarding, attendance & leave, roles, and an audit log — built for agencies, SMBs, and internal PMOs that want one brandable hub instead of five disconnected tools.',
  },
  {
    q: 'Is my data isolated per tenant?',
    a: 'Yes. Every organization is a fully isolated tenant. Data is scoped at the database level by organization, company, portfolio, and project, so one workspace can never see another’s data.',
  },
  {
    q: 'Can I white-label it?',
    a: 'Absolutely. On the White-label plan you can apply your own logo, color palette, and a custom subdomain, so your clients or internal teams experience your brand, not ours.',
  },
  {
    q: 'How does pricing work?',
    a: 'Starter is a flat monthly price for small teams (up to 5 users). Pro is billed per active user per month and unlocks CRM, HR/onboarding, audit log, and advanced permissions. White-label is custom-priced based on tenants and support needs. Prices shown are illustrative.',
  },
  {
    q: 'Can I import existing projects?',
    a: 'Yes. You can bring in existing projects, tasks, and contacts during setup, or start clean and build out your portfolios as you go.',
  },
];

const LOGOS = ['NORTHPEAK', 'VERIDIAN', 'CASCADE&CO', 'ATLAS WORKS', 'BRIGHTFIELD'];

function GsapReveal() {
  // Loads GSAP from CDN and applies subtle scroll-reveal + hover lift.
  // Degrades gracefully (everything is visible by default via CSS) if it fails.
  useEffect(() => {
    let cancelled = false;
    const existing = document.getElementById('gsap-cdn-script') as HTMLScriptElement | null;

    const init = () => {
      if (cancelled) return;
      const w = window as any;
      const gsap = w.gsap;
      if (!gsap) return;
      try {
        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el, i) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: 0.7,
              delay: Math.min(i * 0.04, 0.2),
              ease: 'power2.out',
              scrollTrigger: w.ScrollTrigger
                ? { trigger: el, start: 'top 88%', once: true }
                : undefined,
            }
          );
          if (!w.ScrollTrigger) {
            // Fallback without ScrollTrigger: just animate in immediately.
            gsap.set(el, { opacity: 1, y: 0 });
          }
        });
      } catch {
        // Swallow errors — page already looks correct without animation.
      }
    };

    if (existing) {
      if ((window as any).gsap) init();
      else existing.addEventListener('load', init);
      return () => existing.removeEventListener('load', init);
    }

    const script = document.createElement('script');
    script.id = 'gsap-cdn-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      const stScript = document.createElement('script');
      stScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
      stScript.async = true;
      stScript.onload = init;
      stScript.onerror = init;
      document.body.appendChild(stScript);
    };
    script.onerror = () => {
      // No GSAP — make sure reveal elements are visible.
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute top-0 right-0 w-72 max-w-[85%] h-full bg-[#0f0f0f] border-l border-white/10 px-6 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-lg tracking-tight">SNR-PMO</span>
          <button
            aria-label="Close menu"
            onClick={onClose}
            className="w-9 h-9 grid place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={onClose}
              className="px-2 py-3 rounded-md text-base text-white/80 hover:text-white hover:bg-white/5 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full text-center px-4 py-2.5 rounded-md text-sm font-medium text-white/90 border border-white/15 hover:bg-white/5 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="w-full text-center px-4 py-2.5 rounded-md text-sm font-semibold text-[#0f0f0f] bg-[#3ECF8E] hover:bg-[#34b87b] transition-colors"
          >
            Start free
          </Link>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-black/10 py-5" data-reveal>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 text-left group"
      >
        <span className="text-base sm:text-lg font-medium text-[#0f0f0f]">{q}</span>
        <span
          className={`shrink-0 w-8 h-8 rounded-full border border-black/10 grid place-items-center text-[#0f0f0f]/70 group-hover:border-[#3ECF8E] group-hover:text-[#3ECF8E] transition-all duration-200 ${open ? 'rotate-45' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="text-sm sm:text-base text-[#52525b] mt-3 leading-relaxed max-w-2xl">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Head>
        <title>SNR-PMO — The all-in-one, white-label PMO platform</title>
        <meta
          name="description"
          content="SNR-PMO is the all-in-one, white-label PMO for teams that run projects, people, and pipeline — project & portfolio management, CRM, HR onboarding, roles, and audit log in one workspace."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <GsapReveal />

      <div style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }} className="bg-white text-[#0f0f0f] antialiased">
        {/* ============ NAV ============ */}
        <header
          className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
            scrolled ? 'bg-[#0f0f0f]/90 backdrop-blur-md border-b border-white/10' : 'bg-[#0f0f0f]/40 backdrop-blur-sm border-b border-transparent'
          }`}
        >
          <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <a href="#top" className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg grid place-items-center bg-[#3ECF8E] text-[#0f0f0f] font-bold text-sm">S</span>
              <span className="text-white font-semibold text-lg tracking-tight">SNR-PMO</span>
            </a>

            <nav className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="text-sm text-white/70 hover:text-white transition-colors">
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <Link href="/login" className="px-4 py-2 rounded-md text-sm font-medium text-white/85 hover:text-white hover:bg-white/5 transition-colors">
                Log in
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 rounded-md text-sm font-semibold text-[#0f0f0f] bg-[#3ECF8E] hover:bg-[#34b87b] transition-colors shadow-[0_0_0_1px_rgba(62,207,142,0.3)]"
              >
                Start free
              </Link>
            </div>

            <button
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="md:hidden w-10 h-10 grid place-items-center rounded-md text-white/85 hover:bg-white/5 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </header>

        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* ============ HERO ============ */}
        <section id="top" className="relative bg-[#0f0f0f] pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden">
          {/* Ambient gradient glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[60rem] h-[40rem] rounded-full bg-[#3ECF8E]/10 blur-[120px]" />
            <div className="absolute top-1/3 right-0 w-[28rem] h-[28rem] rounded-full bg-[#3ECF8E]/[0.06] blur-[100px]" />
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
                backgroundSize: '64px 64px',
              }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-16 items-center">
            <div data-reveal>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-[#3ECF8E] bg-[#3ECF8E]/10 border border-[#3ECF8E]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3ECF8E]" />
                Now with white-label tenants
              </span>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight text-white leading-[1.08]">
                The all-in-one, white-label PMO for teams that run{' '}
                <span className="text-[#3ECF8E]">projects, people, and pipeline.</span>
              </h1>

              <p className="mt-6 text-base sm:text-lg text-white/60 max-w-xl leading-relaxed">
                SNR-PMO brings project &amp; portfolio management, a built-in CRM, HR onboarding, roles, and a full
                audit log into one secure, brandable workspace — for organizations, companies, portfolios, and
                projects, all in a single hub.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-sm font-semibold text-[#0f0f0f] bg-[#3ECF8E] hover:bg-[#34b87b] transition-all hover:shadow-[0_0_24px_rgba(62,207,142,0.35)]"
                >
                  Start free
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-sm font-semibold text-white border border-white/15 hover:bg-white/5 transition-colors"
                >
                  See features
                </a>
              </div>

              <p className="mt-6 text-xs text-white/40">No credit card required &middot; Free forever for small teams</p>
            </div>

            {/* Abstract product dashboard mockup */}
            <div data-reveal className="relative">
              <div className="absolute -inset-6 rounded-[28px] bg-gradient-to-br from-[#3ECF8E]/15 via-transparent to-transparent blur-2xl" />
              <div className="relative rounded-2xl border border-white/10 bg-[#161616] shadow-2xl shadow-black/50 overflow-hidden">
                {/* Title bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#1c1c1c]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-[11px] text-white/35 font-mono">app.snr-pmo.com/dashboard</span>
                </div>

                <div className="flex">
                  {/* Sidebar */}
                  <div className="hidden sm:flex w-40 shrink-0 flex-col gap-1 p-3 border-r border-white/10 bg-[#141414]">
                    <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-[#3ECF8E]/10 text-[#3ECF8E] text-xs font-medium">
                      <span className="w-2 h-2 rounded-sm bg-[#3ECF8E]" />
                      Overview
                    </div>
                    {['Projects', 'Portfolios', 'CRM', 'People', 'Audit log'].map((item) => (
                      <div key={item} className="flex items-center gap-2 px-2 py-2 rounded-md text-white/45 text-xs">
                        <span className="w-2 h-2 rounded-sm bg-white/15" />
                        {item}
                      </div>
                    ))}
                    <div className="mt-auto flex items-center gap-2 px-2 py-2 rounded-md text-white/35 text-[11px]">
                      <span className="w-5 h-5 rounded-full bg-white/10 grid place-items-center text-[10px]">A</span>
                      Acme Co.
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 p-4 sm:p-5 space-y-4">
                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Active projects', value: '24', delta: '+3' },
                        { label: 'Open deals', value: '$182k', delta: '+12%' },
                        { label: 'Team members', value: '37', delta: '+2' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg border border-white/10 bg-[#1a1a1a] p-3">
                          <p className="text-[10px] text-white/40">{s.label}</p>
                          <p className="text-lg font-semibold text-white mt-1">{s.value}</p>
                          <p className="text-[10px] text-[#3ECF8E] mt-0.5">{s.delta}</p>
                        </div>
                      ))}
                    </div>

                    {/* Chart card */}
                    <div className="rounded-lg border border-white/10 bg-[#1a1a1a] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-white/70">Portfolio progress</p>
                        <span className="text-[10px] text-white/35">This quarter</span>
                      </div>
                      <div className="flex items-end gap-2 h-20">
                        {[40, 65, 50, 80, 60, 95, 70, 55, 88, 64, 92, 76].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm bg-gradient-to-t from-[#3ECF8E]/30 to-[#3ECF8E]"
                            style={{ height: `${h}%`, opacity: 0.4 + (h / 100) * 0.6 }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* List card */}
                    <div className="rounded-lg border border-white/10 bg-[#1a1a1a] p-4 space-y-2.5">
                      <p className="text-xs font-medium text-white/70 mb-1">Recent activity</p>
                      {[
                        ['Website Revamp', 'Task completed', '#3ECF8E'],
                        ['Acme onboarding', 'New hire added', '#60a5fa'],
                        ['Northpeak deal', 'Moved to Proposal', '#fbbf24'],
                      ].map(([title, sub, color]) => (
                        <div key={title as string} className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color as string }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white/80 truncate">{title}</p>
                          </div>
                          <span className="text-[10px] text-white/35">{sub}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ TRUST STRIP ============ */}
        <section className="bg-white border-b border-black/5 py-12">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <p className="text-center text-xs font-medium tracking-widest text-[#a1a1aa] uppercase mb-8" data-reveal>
              Trusted by teams at
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {LOGOS.map((logo) => (
                <span
                  key={logo}
                  data-reveal
                  className="text-lg sm:text-xl font-bold tracking-tight text-[#0f0f0f]/25 hover:text-[#0f0f0f]/45 transition-colors select-none"
                >
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="bg-white py-24 sm:py-28">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mx-auto text-center" data-reveal>
              <span className="text-xs font-semibold tracking-widest text-[#3ECF8E] uppercase">Features</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0f0f0f]">
                Everything your PMO needs, in one place
              </h2>
              <p className="mt-4 text-base sm:text-lg text-[#52525b] leading-relaxed">
                Stop stitching together separate tools for delivery, sales, and people. SNR-PMO unifies the workflows
                your teams already run.
              </p>
            </div>

            <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  data-reveal
                  className="group relative rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.18)] hover:border-[#3ECF8E]/30"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#3ECF8E]/10 text-[#1f9d6c] grid place-items-center group-hover:bg-[#3ECF8E] group-hover:text-[#0f0f0f] transition-colors duration-300">
                    {f.icon}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#0f0f0f]">{f.title}</h3>
                  <p className="mt-2 text-sm text-[#52525b] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="bg-[#fafafa] py-24 sm:py-28 border-y border-black/5">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mx-auto text-center" data-reveal>
              <span className="text-xs font-semibold tracking-widest text-[#3ECF8E] uppercase">How it works</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0f0f0f]">
                Up and running in minutes
              </h2>
            </div>

            <div className="mt-16 grid md:grid-cols-3 gap-8 md:gap-6">
              {STEPS.map((s, i) => (
                <div key={s.n} data-reveal className="relative">
                  <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
                    <span className="text-5xl font-extrabold text-[#3ECF8E]/25 leading-none md:mb-4">{s.n}</span>
                    <div className="md:mt-0">
                      <h3 className="text-lg font-semibold text-[#0f0f0f]">{s.title}</h3>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[#52525b] leading-relaxed">{s.desc}</p>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-6 -right-3 w-6 h-px bg-[#0f0f0f]/10" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ PRICING ============ */}
        <section id="pricing" className="bg-white py-24 sm:py-28">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="max-w-2xl mx-auto text-center" data-reveal>
              <span className="text-xs font-semibold tracking-widest text-[#3ECF8E] uppercase">Pricing</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0f0f0f]">
                Simple plans that grow with you
              </h2>
              <p className="mt-4 text-base sm:text-lg text-[#52525b] leading-relaxed">
                Start free, upgrade when you need CRM, HR, and compliance — or go fully white-label.
              </p>
            </div>

            <div className="mt-16 grid lg:grid-cols-3 gap-6 items-stretch">
              {PRICING.map((p) => (
                <div
                  key={p.name}
                  data-reveal
                  className={`relative rounded-2xl p-7 sm:p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                    p.highlight
                      ? 'bg-[#0f0f0f] text-white border border-[#3ECF8E]/40 shadow-[0_24px_60px_-20px_rgba(62,207,142,0.35)] lg:scale-[1.04]'
                      : 'bg-white border border-black/[0.07] hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,0.18)]'
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide text-[#0f0f0f] bg-[#3ECF8E]">
                      MOST POPULAR
                    </span>
                  )}

                  <h3 className={`text-lg font-semibold ${p.highlight ? 'text-white' : 'text-[#0f0f0f]'}`}>{p.name}</h3>
                  <p className={`mt-2 text-sm leading-relaxed ${p.highlight ? 'text-white/55' : 'text-[#52525b]'}`}>{p.desc}</p>

                  <div className="mt-6 flex items-end gap-1.5">
                    <span className={`text-4xl font-extrabold tracking-tight ${p.highlight ? 'text-white' : 'text-[#0f0f0f]'}`}>{p.price}</span>
                    <span className={`text-sm pb-1 ${p.highlight ? 'text-white/45' : 'text-[#a1a1aa]'}`}>{p.period}</span>
                  </div>
                  <p className={`mt-1 text-xs ${p.highlight ? 'text-[#3ECF8E]' : 'text-[#1f9d6c]'}`}>{p.note}</p>

                  <ul className="mt-7 space-y-3 flex-1">
                    {p.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-sm">
                        <svg
                          viewBox="0 0 24 24"
                          className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-[#3ECF8E]' : 'text-[#1f9d6c]'}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <span className={p.highlight ? 'text-white/80' : 'text-[#3f3f46]'}>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/login"
                    className={`mt-8 inline-flex items-center justify-center w-full px-5 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      p.highlight
                        ? 'bg-[#3ECF8E] text-[#0f0f0f] hover:bg-[#34b87b]'
                        : 'bg-[#0f0f0f] text-white hover:bg-[#262626]'
                    }`}
                  >
                    {p.cta}
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-[#a1a1aa]" data-reveal>
              Prices shown are illustrative placeholders for preview purposes and may change at launch.
            </p>
          </div>
        </section>

        {/* ============ TESTIMONIAL ============ */}
        <section className="bg-[#0f0f0f] py-20 sm:py-24 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-[24rem] rounded-full bg-[#3ECF8E]/[0.08] blur-[100px]" />
          </div>
          <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center" data-reveal>
            <svg viewBox="0 0 24 24" className="w-9 h-9 mx-auto text-[#3ECF8E]/40" fill="currentColor">
              <path d="M9.5 7C6.5 8 4.5 10.6 4.5 14c0 2.5 1.7 4.5 4 4.5 1.9 0 3.4-1.4 3.4-3.3 0-1.8-1.3-3.1-3-3.1-.2 0-.5 0-.7.1.3-1.7 1.7-3.2 3.5-3.8L9.5 7zm9 0c-3 1-5 3.6-5 7 0 2.5 1.7 4.5 4 4.5 1.9 0 3.4-1.4 3.4-3.3 0-1.8-1.3-3.1-3-3.1-.2 0-.5 0-.7.1.3-1.7 1.7-3.2 3.5-3.8L18.5 7z" />
            </svg>
            <p className="mt-6 text-xl sm:text-2xl font-medium text-white leading-relaxed">
              &ldquo;We replaced four tools with SNR-PMO in a single afternoon. Our project leads, sales pipeline, and
              new-hire onboarding finally live in the same place &mdash; and clients love that it&rsquo;s branded as
              ours.&rdquo;
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#3ECF8E]/15 border border-[#3ECF8E]/30 grid place-items-center text-sm font-semibold text-[#3ECF8E]">
                JM
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Jordan M.</p>
                <p className="text-xs text-white/45">Operations Director, illustrative customer</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="bg-white py-24 sm:py-28">
          <div className="max-w-3xl mx-auto px-5 sm:px-8">
            <div className="text-center" data-reveal>
              <span className="text-xs font-semibold tracking-widest text-[#3ECF8E] uppercase">FAQ</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0f0f0f]">
                Frequently asked questions
              </h2>
            </div>

            <div className="mt-12 border-t border-black/10">
              {FAQS.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="bg-[#3ECF8E] py-20 sm:py-24">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center" data-reveal>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0f0f0f]">
              Run your projects, people, and pipeline &mdash; under your own brand.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-[#0f0f0f]/70 max-w-xl mx-auto">
              Spin up your organization in minutes. No credit card required to get started.
            </p>
            <div className="mt-9">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg text-sm font-semibold text-[#3ECF8E] bg-[#0f0f0f] hover:bg-[#1c1c1c] transition-all hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)]"
              >
                Start free
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        {/* ============ FOOTER ============ */}
        <footer className="bg-[#0f0f0f] pt-16 pb-10">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg grid place-items-center bg-[#3ECF8E] text-[#0f0f0f] font-bold text-sm">S</span>
                  <span className="text-white font-semibold text-lg tracking-tight">SNR-PMO</span>
                </div>
                <p className="mt-4 text-sm text-white/45 max-w-xs leading-relaxed">
                  The all-in-one, white-label PMO for teams that run projects, people, and pipeline.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold tracking-widest text-white/40 uppercase">Product</h4>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><a href="#features" className="text-white/60 hover:text-white transition-colors">Features</a></li>
                  <li><a href="#pricing" className="text-white/60 hover:text-white transition-colors">Pricing</a></li>
                  <li><a href="#faq" className="text-white/60 hover:text-white transition-colors">FAQ</a></li>
                  <li><Link href="/login" className="text-white/60 hover:text-white transition-colors">Log in</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold tracking-widest text-white/40 uppercase">Company</h4>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><a href="#features" className="text-white/60 hover:text-white transition-colors">About</a></li>
                  <li><Link href="/contact" className="text-white/60 hover:text-white transition-colors">Careers</Link></li>
                  <li><Link href="/contact" className="text-white/60 hover:text-white transition-colors">Contact</Link></li>
                  <li><Link href="/docs" className="text-white/60 hover:text-white transition-colors">Docs</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold tracking-widest text-white/40 uppercase">Legal</h4>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><Link href="/legal/privacy" className="text-white/60 hover:text-white transition-colors">Privacy policy</Link></li>
                  <li><Link href="/legal/terms" className="text-white/60 hover:text-white transition-colors">Terms of service</Link></li>
                  <li><Link href="/legal/security" className="text-white/60 hover:text-white transition-colors">Security</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-14 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-white/35">&copy; {new Date().getFullYear()} SNR-PMO. All rights reserved.</p>
              <p className="text-xs text-white/35">Built for agencies, SMBs, and internal PMO teams.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
