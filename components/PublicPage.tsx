import { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * Self-contained chrome for public (pre-auth) content pages — legal, contact, etc.
 * Mirrors the landing page's Supabase-style palette via fixed Tailwind arbitrary
 * values so it renders identically regardless of the app's theme context.
 */
export default function PublicPage({
  title,
  subtitle,
  metaDescription,
  children,
}: {
  title: string;
  subtitle?: string;
  metaDescription?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Head>
        <title>{`${title} — SNR-PMO`}</title>
        <meta name="description" content={metaDescription || `${title} — SNR-PMO`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div
        style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
        className="min-h-screen bg-white text-[#0f0f0f] antialiased flex flex-col"
      >
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#0f0f0f] border-b border-white/10">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg grid place-items-center bg-[#3ECF8E] text-[#0f0f0f] font-bold text-sm">S</span>
              <span className="text-white font-semibold text-lg tracking-tight">SNR-PMO</span>
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-md text-sm font-semibold text-[#0f0f0f] bg-[#3ECF8E] hover:bg-[#34b87b] transition-colors"
            >
              Start free
            </Link>
          </div>
        </header>

        {/* Title band */}
        <section className="bg-[#0f0f0f] pb-12 pt-10 sm:pt-14">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <Link href="/" className="text-sm text-[#3ECF8E] hover:underline inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              Back to home
            </Link>
            <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-3 text-base text-white/55 max-w-2xl leading-relaxed">{subtitle}</p>}
          </div>
        </section>

        {/* Body */}
        <main className="flex-1 bg-white">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16">{children}</div>
        </main>

        {/* Footer */}
        <footer className="bg-[#0f0f0f] py-10">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/35">&copy; {new Date().getFullYear()} SNR-PMO. All rights reserved.</p>
            <nav className="flex items-center gap-5 text-xs">
              <Link href="/legal/privacy" className="text-white/55 hover:text-white transition-colors">Privacy</Link>
              <Link href="/legal/terms" className="text-white/55 hover:text-white transition-colors">Terms</Link>
              <Link href="/legal/security" className="text-white/55 hover:text-white transition-colors">Security</Link>
              <Link href="/contact" className="text-white/55 hover:text-white transition-colors">Contact</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

/** Prose helpers — keep legal/contact pages terse and consistent. */
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-bold tracking-tight text-[#0f0f0f] mt-10 first:mt-0 mb-3">{children}</h2>;
}
export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-[#3f3f46] leading-relaxed mb-4">{children}</p>;
}
export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-4 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15px] text-[#3f3f46] leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#3ECF8E] shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
