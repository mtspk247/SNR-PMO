/**
 * Shared dark/emerald marketing chrome for the public /vs/* SEO pages.
 * Mirrors pages/landing.tsx styling (fixed Tailwind arbitrary-value colors,
 * no theme tokens) so the comparison pages match the landing exactly and
 * render identically regardless of app theme. Self-contained: react + next only.
 */
import { useState } from 'react';
import Link from 'next/link';

export function MktHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '/#agents', label: 'AI Agents' },
    { href: '/#compare', label: 'Compare' },
    { href: '/vs', label: 'vs Others' },
    { href: '/savings', label: 'Savings' },
    { href: '/#pricing', label: 'Pricing' },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <nav className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#3ECF8E] text-[#0a0a0a] font-black text-lg shadow-lg shadow-[#10b981]/20">S</span>
          <span className="font-semibold tracking-tight">SNR-PMO</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white transition-colors">{l.label}</Link>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors">Log in</Link>
          <Link href="/login?mode=signup" className="text-sm font-medium px-4 py-2 rounded-lg bg-[#3ECF8E] text-[#0a0a0a] hover:bg-[#10b981] transition-colors shadow-lg shadow-[#10b981]/20">Start free</Link>
        </div>
        <button type="button" className="md:hidden grid place-items-center w-9 h-9 rounded-lg border border-white/10 text-white/80" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </nav>
      {open && (
        <div className="md:hidden border-t border-white/10 bg-[#0a0a0a] px-5 py-4 flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-2 py-2.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">{l.label}</Link>
          ))}
          <Link href="/login?mode=signup" onClick={() => setOpen(false)} className="mt-2 text-center px-4 py-2.5 rounded-md text-sm font-semibold text-[#0a0a0a] bg-[#3ECF8E]">Start free</Link>
        </div>
      )}
    </header>
  );
}

export function MktFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#3ECF8E] text-[#0a0a0a] font-black text-lg">S</span>
          <span className="font-semibold tracking-tight">SNR-PMO</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/50">
          <Link href="/vs" className="hover:text-white transition-colors">Comparisons</Link>
          <Link href="/#compare" className="hover:text-white transition-colors">Compare</Link>
          <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/login?mode=signup" className="hover:text-white transition-colors">Start free</Link>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 sm:px-8 pb-10 text-[11px] text-white/30">© {new Date().getFullYear()} SNR-PMO. All rights reserved.</div>
    </footer>
  );
}

/** ✓ / Partial / — capability mark, matching the landing #compare legend. */
export function Mark({ v }: { v: 'y' | 'p' | 'n' }) {
  if (v === 'y') {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="inline-block w-[18px] h-[18px] text-[#3ECF8E]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="included">
        <path d="M4 10.5l4 4 8-9" />
      </svg>
    );
  }
  if (v === 'p') return <span className="text-[12px] font-medium text-amber-400/90" aria-label="partial">Partial</span>;
  return <span className="text-white/30" aria-label="not offered">&mdash;</span>;
}
