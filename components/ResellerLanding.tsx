import Head from 'next/head';
import type { ResellerSite } from '@/lib/db';

// Auto-generated, brand-themed marketing/pricing landing served at a reseller's
// verified custom domain root. Self-contained (inline styles) so it renders cleanly
// pre-auth without the app theme. Accent colour + logo + name come from the reseller.
export default function ResellerLanding({ site }: { site: ResellerSite }) {
  const name = site.name || 'Your workspace';
  const accent = site.branding?.primary_color && /^#/.test(site.branding.primary_color) ? site.branding.primary_color : '#10b981';
  const logo = site.branding?.logo_url || '';
  const plans = (site.plans || []).filter((p) => p.amount_cents >= 0);
  const money = (c: number, cur: string) => `${(cur || 'usd').toUpperCase() === 'USD' ? '$' : ''}${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
  const Logo = () => (
    logo.startsWith('preset:') ? <span style={{ width: 40, height: 40, borderRadius: 12, background: accent, display: 'grid', placeItems: 'center', fontSize: 20 }}>{logo.slice(7)}</span>
    : logo ? <img src={logo} alt={name} width={40} height={40} style={{ borderRadius: 12, objectFit: 'cover' }} />
    : <span style={{ width: 40, height: 40, borderRadius: 12, background: accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }}>{name.charAt(0).toUpperCase()}</span>
  );
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: accent, color: '#fff', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 600, textDecoration: 'none' };
  const feats = [
    ['Projects & tasks', 'Plan work, assign owners, track progress in one place.'],
    ['CRM & clients', 'Leads, deals and contacts alongside the work you deliver.'],
    ['HR & accounting', 'People, payroll and real double-entry books — built in.'],
  ];
  return (<>
    <Head><title>{name}</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content={accent} /><meta name="description" content={`${name} — projects, CRM, HR and accounting in one workspace.`} /></Head>
    <div style={{ fontFamily: 'ui-sans-serif,system-ui,-apple-system,Arial', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      <header style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Logo /><span style={{ fontWeight: 700, fontSize: 18 }}>{name}</span></div>
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
