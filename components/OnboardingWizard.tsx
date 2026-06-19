import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { applyBranding } from '@/lib/branding';
import { TAXONOMY } from '@/lib/taxonomy';
import { PRESET_AVATARS, presetColor } from '@/lib/avatars';
import type { OrgBranding, OrgProfile } from '@/lib/supabase';
import {
  updateOrgSettings, saveOrgProfile, getOrgProfile,
  setCustomDomain, requestDomainVerification, checkDomainVerification,
  resellerListPrices, resellerSetPrice, resellerConnectOnboard, resellerConnectStatus,
  setOnboardingState,
} from '@/lib/db';

// One guided setup flow for every onboarding tenant. Plan/role-aware (a Free tenant
// sees only Basics + Details; white-label adds Brand + Domain; resellers add Pricing,
// Storefront and Payments). Skippable + resumable — progress persists in
// organizations.onboarding via setOnboardingState. Writes to the SAME fields Settings
// edits (no duplicate data): branding, org profile, custom domain, reseller prices.

type StepKey = 'welcome' | 'basics' | 'brand' | 'details' | 'domain' | 'pricing' | 'storefront' | 'payments' | 'done';

const DEFAULT_PRIMARY = '#3ecf8e';
const SELLABLE_PLANS: { key: string; label: string }[] = [
  { key: 'pro', label: 'Pro' },
  { key: 'enterprise', label: 'Enterprise' },
];

export default function OnboardingWizard() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const hydrated = useAuthStore((s) => s.hasHydrated);

  const isAdmin = org?.member_role === 'owner' || org?.member_role === 'admin';
  const isReseller = !!org?.is_reseller;
  const canBrand = isReseller || (org?.features || []).includes('white_label');
  const isPlatformHome = !!(org as { is_platform_home?: boolean } | null)?.is_platform_home;

  const eligible = !!org && hydrated && isAdmin && !isPlatformHome
    && !org.onboarding?.completed_at && !org.onboarding?.skipped;

  // Build the step list for this tenant's plan/role.
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ['welcome', 'basics'];
    if (canBrand) s.push('brand');
    s.push('details');
    if (canBrand) s.push('domain');
    if (isReseller) s.push('pricing', 'storefront', 'payments');
    s.push('done');
    return s;
  }, [canBrand, isReseller]);

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const loadedFor = useRef<string | null>(null);

  // Form state (initialised from the org + its profile once eligible).
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [logoPick, setLogoPick] = useState(false);
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [accent, setAccent] = useState('#6366f1');
  const [website, setWebsite] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [domain, setDomain] = useState('');
  const [domainToken, setDomainToken] = useState('');
  const [domainVerified, setDomainVerified] = useState(false);
  const [domainState, setDomainState] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [interval, setInterval] = useState('month');
  const [template, setTemplate] = useState('classic');
  const [connectOk, setConnectOk] = useState(false);

  useEffect(() => {
    if (!eligible || !org) return;
    if (loadedFor.current === org.id) return;
    loadedFor.current = org.id;
    const b = (org.branding || {}) as OrgBranding;
    setName(org.name || '');
    setLogo(b.logo_url || '');
    setBrandName(b.name || '');
    setPrimary(b.primary_color || DEFAULT_PRIMARY);
    setAccent(b.accent_color || '#6366f1');
    setTemplate(b.site_template || 'classic');
    setIdx(Math.min(Math.max(org.onboarding?.step ?? 0, 0), steps.length - 1));
    setOpen(true);
    // Pull profile + reseller context in the background.
    getOrgProfile(org.id).then((p: OrgProfile) => {
      setIndustry(p.industry || ''); setCategory(p.category || '');
      setWebsite(p.website || ''); setCEmail(p.contact_email || '');
      setCPhone(p.contact_phone || ''); setCity(p.city || '');
      setCountry(p.country || ''); setLinkedin(p.social_linkedin || '');
    }).catch(() => {});
    getTenantDomainSafe(org.id).then((d) => { if (d) { setDomain(d.custom_domain || ''); setDomainToken(d.token || ''); setDomainVerified(d.verified); } });
    if (isReseller) {
      resellerListPrices(org.id).then((rows) => {
        const m: Record<string, string> = {};
        for (const r of rows) m[r.plan_key] = (r.amount_cents / 100).toString();
        setPrices(m); if (rows[0]) setInterval(rows[0].interval || 'month');
      }).catch(() => {});
      resellerConnectStatus(org.id).then((s) => setConnectOk(!!s.charges_enabled)).catch(() => {});
    }
  }, [eligible, org, steps.length, isReseller]);

  if (!eligible || !open || !org) return null;

  const step = steps[idx];
  const pct = Math.round((idx / (steps.length - 1)) * 100);
  const brandingMerge = (extra: Partial<OrgBranding>): Record<string, any> => ({ ...(org.branding || {}), ...extra });

  async function persistStep(): Promise<boolean> {
    if (!org) return false;
    setErr('');
    try {
      if (step === 'basics') {
        const branding = brandingMerge({ logo_url: logo.trim() || undefined });
        const updated = await updateOrgSettings(org.id, { name: name.trim() || org.name, branding });
        patchOrg({ id: org.id, name: updated.name, branding: updated.branding });
        applyBranding(updated as any);
        await saveOrgProfile(org.id, { industry: industry || null, category: category || null } as Partial<OrgProfile>);
      } else if (step === 'brand') {
        const branding = brandingMerge({
          name: brandName.trim() || undefined,
          primary_color: primary && primary.toLowerCase() !== DEFAULT_PRIMARY.toLowerCase() ? primary : undefined,
          accent_color: accent || undefined,
        });
        const updated = await updateOrgSettings(org.id, { branding });
        patchOrg({ id: org.id, branding: updated.branding });
        applyBranding(updated as any);
      } else if (step === 'details') {
        await saveOrgProfile(org.id, {
          website: website || null, contact_email: cEmail || null, contact_phone: cPhone || null,
          city: city || null, country: country || null, social_linkedin: linkedin || null,
        } as Partial<OrgProfile>);
      } else if (step === 'storefront') {
        const updated = await updateOrgSettings(org.id, { branding: brandingMerge({ site_template: template }) });
        patchOrg({ id: org.id, branding: updated.branding });
      } else if (step === 'pricing') {
        for (const p of SELLABLE_PLANS) {
          const v = parseFloat(prices[p.key] || '');
          if (!isNaN(v) && v > 0) await resellerSetPrice(org.id, p.key, Math.round(v * 100), interval);
        }
      }
      return true;
    } catch (e) {
      setErr((e as Error).message || 'Could not save');
      return false;
    }
  }

  async function advance(save: boolean) {
    if (busy) return;
    setBusy(true);
    let ok = true;
    if (save) ok = await persistStep();
    if (ok) {
      const next = Math.min(idx + 1, steps.length - 1);
      setIdx(next);
      try { await setOnboardingState(org!.id, { step: next }); } catch { /* non-fatal */ }
    }
    setBusy(false);
  }

  async function finish() {
    setBusy(true);
    try {
      await setOnboardingState(org!.id, { step: steps.length - 1, industry, use_case: isReseller ? 'reseller' : 'tenant' }, true);
      patchOrg({ id: org!.id, onboarding: { ...(org!.onboarding || {}), completed_at: new Date().toISOString() } });
    } catch { /* non-fatal */ }
    setBusy(false);
    setOpen(false);
  }

  async function skipAll() {
    setBusy(true);
    try {
      await setOnboardingState(org!.id, { skipped: true }, true);
      patchOrg({ id: org!.id, onboarding: { ...(org!.onboarding || {}), skipped: true, completed_at: new Date().toISOString() } });
    } catch { /* non-fatal */ }
    setBusy(false);
    setOpen(false);
  }

  async function verifyDomain() {
    if (!org || !domain.trim()) return;
    setBusy(true); setErr(''); setDomainState('saving');
    try {
      const d = await setCustomDomain(org.id, domain.trim());
      setDomainToken(d.token || ''); setDomainVerified(d.verified);
      if (d.verified) { setDomainState('verified'); setBusy(false); return; }
      await requestDomainVerification(org.id);
      setDomainState('pending');
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const res = await checkDomainVerification(org.id);
        setDomainState(res.state);
        if (res.state === 'verified') { setDomainVerified(true); break; }
      }
    } catch (e) {
      setErr((e as Error).message || 'Verification failed'); setDomainState('error');
    }
    setBusy(false);
  }

  async function connectStripe() {
    if (!org) return;
    setBusy(true); setErr('');
    try { const { url } = await resellerConnectOnboard(org.id); window.location.href = url; }
    catch (e) { setErr((e as Error).message || 'Could not start Stripe onboarding'); setBusy(false); }
  }

  const cats = TAXONOMY.find((t) => t.name === industry)?.categories || [];

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header + progress */}
        <div className="px-6 pt-5 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg grid place-items-center text-accentfg shrink-0" style={{ background: primary }}>
              <Icon name="ti-rocket" className="text-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Set up {isReseller ? 'your agency' : 'your workspace'}</p>
              <p className="text-2xs text-muted">Step {idx + 1} of {steps.length} · takes a few minutes · you can finish later</p>
            </div>
            <button onClick={skipAll} disabled={busy} className="btn btn-ghost text-xs ml-auto">I'll do this later</button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(pct, 4)}%`, background: primary }} />
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 overflow-y-auto flex-1 space-y-5">
          {step === 'welcome' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto text-accentfg" style={{ background: primary }}><Icon name="ti-confetti" className="text-3xl" /></div>
              <h2 className="text-xl font-semibold">Welcome aboard{name ? `, ${name}` : ''} 👋</h2>
              <p className="text-sm text-muted max-w-md mx-auto">A quick guided setup to make this workspace yours{isReseller ? ' — brand it, set your client pricing and turn on payments' : canBrand ? ' — brand it and add your details' : ' — add your logo and details'}. Everything here can be changed later in Settings.</p>
            </div>
          )}

          {step === 'basics' && (
            <>
              <Field label="Workspace name" hint="Shown across the app and to your team.">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." maxLength={60} />
              </Field>
              <Field label="Logo" hint="Used in the sidebar, login screen and emails.">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-line bg-surface2 grid place-items-center overflow-hidden shrink-0">
                    {logo && logo.startsWith('preset:') ? <span className="w-full h-full grid place-items-center text-2xl" style={{ background: presetColor(logo.slice(7)) }}>{logo.slice(7)}</span>
                      : logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Icon name="ti-photo" className="text-muted2 text-xl" />}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="btn btn-ghost text-xs cursor-pointer border border-line"><Icon name="ti-upload" className="text-sm" /> Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onLogoFile(setLogo)} /></label>
                    <button type="button" onClick={() => setLogoPick((v) => !v)} className="btn btn-ghost text-xs border border-line"><Icon name="ti-mood-smile" className="text-sm" /> Use an icon</button>
                    {logo && <button type="button" onClick={() => { setLogo(''); setLogoPick(false); }} className="btn btn-ghost text-xs text-rose-600">Remove</button>}
                  </div>
                </div>
                {logoPick && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {PRESET_AVATARS.map((e) => (
                      <button key={e} type="button" onClick={() => { setLogo('preset:' + e); setLogoPick(false); }} style={{ background: presetColor(e) }} className={`w-9 h-9 rounded-lg grid place-items-center text-lg transition hover:scale-110 ${logo === 'preset:' + e ? 'ring-2 ring-offset-2 ring-accent' : ''}`}>{e}</button>
                    ))}
                  </div>
                )}
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Industry">
                  <select className="input" value={industry} onChange={(e) => { setIndustry(e.target.value); setCategory(''); }}>
                    <option value="">Select…</option>
                    {TAXONOMY.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Category">
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={!cats.length}>
                    <option value="">{cats.length ? 'Select…' : 'Pick an industry first'}</option>
                    {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 'brand' && (
            <>
              <Field label="Brand name" hint="Your product name — shows in the browser tab and cascades to your clients. Leave blank to use the workspace name.">
                <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={name || org.name} maxLength={40} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Primary colour" hint="Buttons, links, active nav."><ColorRow value={primary} onChange={setPrimary} /></Field>
                <Field label="Accent colour" hint="Secondary highlights."><ColorRow value={accent} onChange={setAccent} /></Field>
              </div>
              <div className="rounded-lg border border-line p-4 flex items-center gap-3">
                <span className="h-8 px-3 grid place-items-center rounded-md text-2xs font-medium text-accentfg" style={{ background: primary }}>Primary button</span>
                <span className="h-5 px-2 grid place-items-center rounded-full text-2xs" style={{ background: accent, color: '#fff' }}>Accent</span>
                <span className="text-2xs text-muted ml-auto">Live preview</span>
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <p className="text-2xs text-muted -mt-1">All optional — fill what you have. Used on invoices, your public page and emails.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Website"><input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" /></Field>
                <Field label="Contact email"><input className="input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="hello@acme.com" /></Field>
                <Field label="Contact phone"><input className="input" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+1 555 000 0000" /></Field>
                <Field label="LinkedIn"><input className="input" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/company/acme" /></Field>
                <Field label="City"><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
                <Field label="Country"><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
              </div>
            </>
          )}

          {step === 'domain' && (
            <>
              <Field label="Custom domain" hint="Run the app on your own domain (e.g. app.youragency.com). Optional — skip to use the default.">
                <input className="input" value={domain} onChange={(e) => { setDomain(e.target.value); setDomainVerified(false); setDomainState(''); }} placeholder="app.youragency.com" />
              </Field>
              {domainVerified ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5"><Icon name="ti-circle-check" /> Verified — your domain is live.</p>
              ) : (
                <>
                  {domainToken && (
                    <div className="rounded-lg border border-line bg-surface2 p-3 text-2xs space-y-1">
                      <p className="font-medium text-content">Add this DNS TXT record at your registrar, then verify:</p>
                      <p className="font-mono">Host: <span className="text-accentstrong">_snr-verify.{domain}</span></p>
                      <p className="font-mono">Value: <span className="text-accentstrong break-all">{domainToken}</span></p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={verifyDomain} disabled={busy || !domain.trim()} className="btn btn-primary text-sm">{busy && domainState === 'pending' ? 'Checking DNS…' : domainToken ? 'Verify domain' : 'Save & verify'}</button>
                    {domainState === 'not_found' && <span className="text-2xs text-amber-600">TXT record not found yet — DNS can take a few minutes.</span>}
                    {domainState === 'error' && <span className="text-2xs text-rose-600">Couldn't verify. Check the record and retry.</span>}
                  </div>
                  <p className="text-2xs text-muted">You can also attach the domain later from Settings. Vercel domain attachment is handled by the platform team.</p>
                </>
              )}
            </>
          )}

          {step === 'pricing' && (
            <>
              <p className="text-2xs text-muted -mt-1">Set the monthly or yearly price your clients pay you for each plan. You can change these any time.</p>
              <Field label="Billing interval">
                <select className="input max-w-[200px]" value={interval} onChange={(e) => setInterval(e.target.value)}>
                  <option value="month">Per month</option>
                  <option value="year">Per year</option>
                </select>
              </Field>
              <div className="space-y-3">
                {SELLABLE_PLANS.map((p) => (
                  <div key={p.key} className="flex items-center gap-3">
                    <span className="w-28 text-sm font-medium">{p.label}</span>
                    <div className="relative flex-1 max-w-[220px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <input className="input pl-6" inputMode="decimal" value={prices[p.key] || ''} onChange={(e) => setPrices((m) => ({ ...m, [p.key]: e.target.value }))} placeholder="0.00" />
                    </div>
                    <span className="text-2xs text-muted">/ {interval === 'year' ? 'year' : 'month'} per client</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'storefront' && (
            <>
              <p className="text-2xs text-muted -mt-1">Pick the look of your public sign-up page. Clients see this on your domain.</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[{ k: 'classic', t: 'Classic', d: 'Balanced hero + features' }, { k: 'minimal', t: 'Minimal', d: 'Clean, lots of whitespace' }, { k: 'bold', t: 'Bold', d: 'Big type, strong colour' }].map((o) => (
                  <button key={o.k} type="button" onClick={() => setTemplate(o.k)} className={`text-left rounded-lg border p-3 transition ${template === o.k ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-borderstrong'}`}>
                    <div className="h-16 rounded-md mb-2 grid place-items-center text-2xs text-accentfg" style={{ background: o.k === 'minimal' ? '#64748b' : o.k === 'bold' ? primary : `linear-gradient(120deg, ${primary}, ${accent})` }}>{o.t}</div>
                    <p className="text-sm font-medium">{o.t}</p>
                    <p className="text-2xs text-muted">{o.d}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'payments' && (
            <div className="space-y-3">
              <p className="text-2xs text-muted -mt-1">Connect Stripe to charge your clients. You're the merchant of record; the platform takes a small fee.</p>
              {connectOk ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5"><Icon name="ti-circle-check" /> Stripe connected — you can accept payments.</p>
              ) : (
                <div className="rounded-lg border border-line p-4 flex items-center gap-3">
                  <Icon name="ti-brand-stripe" className="text-2xl text-[#635bff]" />
                  <div className="min-w-0"><p className="text-sm font-medium">Connect your Stripe account</p><p className="text-2xs text-muted">Opens Stripe to finish onboarding. Optional — you can do this later.</p></div>
                  <button onClick={connectStripe} disabled={busy} className="btn btn-primary text-sm ml-auto">Connect Stripe</button>
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto text-accentfg" style={{ background: primary }}><Icon name="ti-circle-check" className="text-3xl" /></div>
              <h2 className="text-xl font-semibold">You're all set 🎉</h2>
              <p className="text-sm text-muted max-w-md mx-auto">{isReseller ? 'Invite your first client from the Clients page, or tweak anything in Console.' : 'Jump into your dashboard. You can refine any of this in Settings whenever you like.'}</p>
            </div>
          )}

          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center gap-3">
          {idx > 0 && step !== 'done' && <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} disabled={busy} className="btn btn-ghost text-sm"><Icon name="ti-arrow-left" className="text-sm" /> Back</button>}
          <div className="ml-auto flex items-center gap-2">
            {step !== 'welcome' && step !== 'done' && <button onClick={() => advance(false)} disabled={busy} className="btn btn-ghost text-sm">Skip</button>}
            {step === 'done'
              ? <button onClick={finish} disabled={busy} className="btn btn-primary text-sm">{busy ? 'Finishing…' : 'Go to dashboard'}</button>
              : <button onClick={() => advance(step !== 'welcome')} disabled={busy} className="btn btn-primary text-sm">{busy ? 'Saving…' : step === 'welcome' ? "Let's go" : 'Continue'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- small helpers ----
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-2xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-md border border-line bg-surface cursor-pointer p-0.5" />
      <input className="input font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function onLogoFile(setLogo: (v: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return;
    if (f.size > 1.5 * 1024 * 1024) return;
    const r = new FileReader();
    r.onload = () => setLogo(typeof r.result === 'string' ? r.result : '');
    r.readAsDataURL(f);
  };
}

// getTenantDomain may reject for orgs with no domain yet; swallow into null.
async function getTenantDomainSafe(orgId: string): Promise<{ custom_domain: string | null; verified: boolean; token: string | null } | null> {
  try { const { getTenantDomain } = await import('@/lib/db'); return await getTenantDomain(orgId); }
  catch { return null; }
}
