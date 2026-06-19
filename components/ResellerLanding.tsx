import Head from 'next/head';
import type { ResellerSite } from '@/lib/db';

// Auto-generated, brand-themed marketing/pricing landing served at a reseller's
// verified custom domain root. Self-contained (inline styles) so it renders cleanly
// pre-auth without the app theme. Accent colour + logo + name come from the reseller.
// Supports site_template: 'classic' (default) | 'minimal' | 'bold'

export default function ResellerLanding({ site }: { site: ResellerSite }) {
  const template = site.branding?.site_template || 'classic';
  const name = site.name || 'Your workspace';
  const accent = site.branding?.primary_color && /^#/.test(site.branding.primary_color) ? site.branding.primary_color : '#10b981';
  const logo = site.branding?.logo_url || '';
  const plans = (site.plans || []).filter((p) => p.amount_cents >= 0);
  const money = (c: number, cur: string) => `${(cur || 'usd').toUpperCase() === 'USD' ? '$' : ''}${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

  const feats = [
    ['Projects & tasks', 'Plan work, assign owners, track progress in one place.'],
    ['CRM & clients', 'Leads, deals and contacts alongside the work you deliver.'],
    ['HR & accounting', 'People, payroll and real double-entry books — built in.'],
  ];

  const headEl = (
    <Head>
      <title>{name}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content={accent} />
      <meta name="description" content={`${name} — projects, CRM, HR and accounting in one workspace.`} />
    </Head>
  );

  // ── Shared Logo component (used across all templates) ──────────────────────
  const LogoMark = ({ size = 40, radius = 12 }: { size?: number; radius?: number }) => (
    logo.startsWith('preset:')
      ? <span style={{ width: size, height: size, borderRadius: radius, background: accent, display: 'grid', placeItems: 'center', fontSize: size * 0.5, flexShrink: 0 }}>{logo.slice(7)}</span>
      : logo
        ? <img src={logo} alt={name} width={size} height={size} style={{ borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
        : <span style={{ width: size, height: size, borderRadius: radius, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.45, flexShrink: 0 }}>{name.charAt(0).toUpperCase()}</span>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // CLASSIC template — original design, kept pixel-exact
  // ══════════════════════════════════════════════════════════════════════════
  if (template !== 'minimal' && template !== 'bold') {
    const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: accent, color: '#fff', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 600, textDecoration: 'none' };
    return (<>
      {headEl}
      <div style={{ fontFamily: 'ui-sans-serif,system-ui,-apple-system,Arial', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
        <header style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><LogoMark /><span style={{ fontWeight: 700, fontSize: 18 }}>{name}</span></div>
          <a href="/login" style={{ color: '#334155', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Sign in</a>
        </header>
        <section style={{ maxWidth: 820, margin: '0 auto', padding: '64px 24px 40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '0 0 16px', letterSpacing: '-.02em' }}>Run your business with {name}</h1>
          <p style={{ fontSize: 18, color: '#475569', maxWidth: 600, margin: '0 auto 28px', lineHeight: 1.5 }}>Projects, CRM, HR and accounting in one workspace — one login, one bill. Get started in minutes.</p>
          <a href="/signup" style={btn}>Start free &rarr;</a>
        </section>
        <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
          {feats.map(([t, d]) => (
            <div key={t} style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}1a`, marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{t}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{d}</p>
            </div>
          ))}
        </section>
        {plans.length > 0 && (
          <section style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
            <h2 style={{ textAlign: 'center', fontSize: 28, margin: '0 0 28px' }}>Simple pricing</h2>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(220px,1fr))`, gap: 20, maxWidth: plans.length === 1 ? 320 : undefined, margin: '0 auto' }}>
              {plans.map((p) => (
                <div key={p.plan_key} style={{ border: `1px solid #eef2f7`, borderRadius: 16, padding: 24, textAlign: 'center' }}>
                  <div style={{ textTransform: 'capitalize', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{p.plan_key}</div>
                  <div style={{ fontSize: 34, fontWeight: 800 }}>{money(p.amount_cents, p.currency)}<span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>/{p.interval === 'year' ? 'yr' : 'mo'}</span></div>
                  <a href="/signup" style={{ ...btn, marginTop: 18, justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>Get started</a>
                </div>
              ))}
            </div>
          </section>
        )}
        <footer style={{ borderTop: '1px solid #eef2f7', marginTop: 40 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px', color: '#94a3b8', fontSize: 13 }}>© {new Date().getFullYear()} {name}. All rights reserved.</div>
        </footer>
      </div>
    </>);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAL template — lots of whitespace, type-forward, understated
  // ══════════════════════════════════════════════════════════════════════════
  if (template === 'minimal') {
    const btnMin: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${accent}`, color: accent, borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none', letterSpacing: '.01em', background: 'transparent' };
    const btnMinFill: React.CSSProperties = { ...btnMin, background: accent, color: '#fff', border: 'none' };
    return (<>
      {headEl}
      <div style={{ fontFamily: "'Inter',ui-sans-serif,system-ui,-apple-system,Arial", color: '#1a1a2e', background: '#fafafa', minHeight: '100vh' }}>
        {/* Nav */}
        <header style={{ maxWidth: 900, margin: '0 auto', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={32} radius={8} />
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-.01em' }}>{name}</span>
          </div>
          <a href="/login" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
        </header>

        {/* Hero */}
        <section style={{ maxWidth: 640, margin: '0 auto', padding: '72px 32px 56px', textAlign: 'left' }}>
          <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.12em', color: accent, fontWeight: 600, marginBottom: 20 }}>All-in-one workspace</p>
          <h1 style={{ fontSize: 48, lineHeight: 1.08, margin: '0 0 20px', fontWeight: 700, letterSpacing: '-.03em', color: '#111' }}>
            Everything your<br />business needs.
          </h1>
          <p style={{ fontSize: 17, color: '#6b7280', lineHeight: 1.65, margin: '0 0 36px', maxWidth: 480 }}>
            {name} brings projects, CRM, HR and accounting into one calm workspace. No more tool-switching.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/signup" style={btnMinFill}>Get started free</a>
            <a href="/login" style={btnMin}>Sign in</a>
          </div>
        </section>

        {/* Divider */}
        <div style={{ maxWidth: 640, margin: '0 auto 0', padding: '0 32px' }}>
          <div style={{ height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Features — text list */}
        <section style={{ maxWidth: 640, margin: '0 auto', padding: '48px 32px' }}>
          {feats.map(([t, d], i) => (
            <div key={t} style={{ display: 'flex', gap: 20, paddingBottom: i < feats.length - 1 ? 28 : 0, marginBottom: i < feats.length - 1 ? 28 : 0, borderBottom: i < feats.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ width: 6, flexShrink: 0, borderRadius: 3, background: accent, marginTop: 3 }} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#111' }}>{t}</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>{d}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Pricing */}
        {plans.length > 0 && (
          <section style={{ maxWidth: 640, margin: '0 auto', padding: '0 32px 72px' }}>
            <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.12em', color: '#9ca3af', fontWeight: 600, marginBottom: 20 }}>Pricing</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {plans.map((p) => (
                <div key={p.plan_key} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', minWidth: 180, flex: '1 1 180px' }}>
                  <div style={{ textTransform: 'capitalize', fontSize: 12, letterSpacing: '.08em', color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>{p.plan_key}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#111', marginBottom: 16 }}>
                    {money(p.amount_cents, p.currency)}<span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>/{p.interval === 'year' ? 'yr' : 'mo'}</span>
                  </div>
                  <a href="/signup" style={{ ...btnMinFill, fontSize: 13, padding: '8px 14px', display: 'inline-flex' }}>Start free</a>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ borderTop: '1px solid #f0f0f0' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#d1d5db' }}>© {new Date().getFullYear()} {name}</span>
            <a href="/signup" style={{ fontSize: 12, color: accent, textDecoration: 'none', fontWeight: 500 }}>Get started →</a>
          </div>
        </footer>
      </div>
    </>);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BOLD template — high-contrast, large display type, strong accent blocks
  // ══════════════════════════════════════════════════════════════════════════
  // template === 'bold'
  const btnBold: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: accent, borderRadius: 8, padding: '14px 28px', fontSize: 15, fontWeight: 800, textDecoration: 'none', letterSpacing: '.01em' };
  const btnBoldOutline: React.CSSProperties = { ...btnBold, background: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.5)' };

  // Derive a darker shade for the hero gradient bottom
  const darkenHex = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
  };
  const accentDark = accent.length === 7 ? darkenHex(accent) : accent;

  return (<>
    {headEl}
    <div style={{ fontFamily: "'Inter',ui-sans-serif,system-ui,-apple-system,Arial", color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      {/* Hero — full-bleed accent block */}
      <div style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`, color: '#fff', paddingBottom: 0 }}>
        <header style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogoMark size={44} radius={10} />
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.02em' }}>{name}</span>
          </div>
          <a href="/login" style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Sign in</a>
        </header>

        <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 28px 96px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 62, lineHeight: 1.0, margin: '0 0 20px', fontWeight: 900, letterSpacing: '-.04em' }}>
            Work at full<br />throttle.
          </h1>
          <p style={{ fontSize: 20, opacity: 0.85, maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.5 }}>
            {name} — projects, CRM, HR and accounting. One login. Zero excuses.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={btnBold}>Start free</a>
            <a href="/login" style={btnBoldOutline}>Sign in</a>
          </div>
        </section>

        {/* Jagged bottom edge */}
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 60, marginTop: -1 }}>
          <path d="M0,60 L0,0 L480,50 L960,0 L1440,50 L1440,60 Z" fill="#fff" />
        </svg>
      </div>

      {/* Feature cards */}
      <section style={{ maxWidth: 1060, margin: '0 auto', padding: '48px 28px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {feats.map(([t, d]) => (
            <div key={t} style={{ borderRadius: 16, padding: '28px 24px', background: '#f8fafc', borderLeft: `4px solid ${accent}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: accent, marginBottom: 16 }} />
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, letterSpacing: '-.01em' }}>{t}</h3>
              <p style={{ margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.6 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      {plans.length > 0 && (
        <section style={{ background: '#0f172a', margin: '48px 0 0', padding: '64px 28px 72px' }}>
          <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 8px', letterSpacing: '-.03em' }}>Straightforward pricing.</h2>
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 15, margin: '0 0 36px' }}>No hidden fees. Cancel any time.</p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(220px,1fr))`, gap: 16, maxWidth: plans.length === 1 ? 320 : undefined, margin: '0 auto' }}>
              {plans.map((p, i) => (
                <div key={p.plan_key} style={{ borderRadius: 14, padding: '28px 24px', background: i === 0 ? accent : 'rgba(255,255,255,0.06)', border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                  <div style={{ textTransform: 'capitalize', fontWeight: 700, fontSize: 13, marginBottom: 10, color: i === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)', letterSpacing: '.08em' }}>{p.plan_key}</div>
                  <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                    {money(p.amount_cents, p.currency)}
                  </div>
                  <div style={{ fontSize: 13, color: i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)', marginBottom: 20 }}>per {p.interval === 'year' ? 'year' : 'month'}</div>
                  <a href="/signup" style={{ display: 'block', background: '#fff', color: accent, borderRadius: 8, padding: '11px 0', fontWeight: 800, fontSize: 14, textDecoration: 'none', letterSpacing: '.01em' }}>Get started</a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA strip */}
      <section style={{ background: accent, padding: '48px 28px', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-.02em' }}>Ready to move faster?</h2>
        <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: accent, borderRadius: 8, padding: '13px 28px', fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>Start free today</a>
      </section>

      <footer style={{ background: '#0f172a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 28px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>© {new Date().getFullYear()} {name}. All rights reserved.</div>
      </footer>
    </div>
  </>);
}
