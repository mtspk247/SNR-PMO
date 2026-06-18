import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { sb } from '@/lib/supabase';
import { invitePreview, acceptOrgInvite, InvitePreview } from '@/lib/db';
import { Icon } from '@/components/ui';
import { useHostBranding } from '@/lib/useHostBranding';

/**
 * Slice 3 — invite-gated self-serve onboarding.
 * /signup?token=<invite> validates the invite, lets the invitee create their
 * account (email locked to the invite), then accepts it -> provisions their org.
 */
function Shell({ brand, children }: { brand: ReturnType<typeof useHostBranding>; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-2" style={{ background: '#0a0a0a' }}>
      <Head><title>Set up your workspace — SNR-PMO</title></Head>

      {/* ── LEFT: Brand panel ── */}
      <div
        className="relative flex flex-col justify-between overflow-hidden text-white
                   px-6 py-5 lg:p-14
                   min-h-[120px] lg:min-h-screen"
        style={{ background: 'linear-gradient(150deg, #0a1a12 0%, #0d2318 55%, #061009 100%)' }}
      >
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,.22) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="pointer-events-none absolute bottom-0 right-0 w-[22rem] h-[22rem] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(62,207,142,.12) 0%, transparent 65%)', filter: 'blur(48px)' }} />
        {/* Grid texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3 z-10">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="h-9 w-auto max-w-[160px] object-contain" />
            : <>
                <span className="w-10 h-10 rounded-xl grid place-items-center font-bold text-[#0a0a0a] text-lg shadow-lg shadow-emerald-900/40 shrink-0"
                  style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)' }}>
                  {brand.name.charAt(0).toUpperCase()}
                </span>
                <span className="font-semibold text-base tracking-tight text-white/90">{brand.name}</span>
              </>}
        </div>

        {/* Hero copy — hidden on mobile, visible lg+ */}
        <div className="relative z-10 hidden lg:block">
          <h1 className="text-[2.75rem] font-semibold leading-[1.07] tracking-tight">
            Start running<br />your business<br />in one place.
          </h1>
          <p className="mt-5 text-white/60 text-[15px] leading-relaxed max-w-xs">
            Your workspace is being set up — projects, CRM, HR and accounting, all secured to your organization.
          </p>
          <ul className="mt-8 space-y-3">
            {([
              ['Projects, CRM, HR & accounting in one'],
              ['One login, one bill'],
              ['White-label & resell it as yours'],
            ] as [string][]).map(([label]) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/80">
                <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center"
                  style={{ background: 'rgba(62,207,142,.15)', border: '1px solid rgba(62,207,142,.3)' }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#3ECF8E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 hidden lg:block text-[11px] text-white/30">© 2026 {brand.name} · Secure multi-tenant SaaS</p>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="flex items-center justify-center px-5 py-10 lg:py-0" style={{ background: '#0f0f0f' }}>
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.name} className="h-7 w-auto object-contain" />
              : <>
                  <span className="w-8 h-8 rounded-lg grid place-items-center font-bold text-[#0a0a0a] text-sm"
                    style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)' }}>
                    {brand.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-sm text-white/90">{brand.name}</span>
                </>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Reusable styled input ── */
function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:opacity-40 ${props.className || ''}`}
      style={{
        background: 'rgba(255,255,255,.05)',
        border: `1px solid ${focused ? 'rgba(62,207,142,.5)' : 'rgba(255,255,255,.10)'}`,
        color: props.readOnly ? 'rgba(255,255,255,.45)' : '#fff',
        ...props.style,
      }}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const brand = useHostBranding();

  useEffect(() => {
    if (!router.isReady) return;
    const t = typeof router.query.token === 'string' ? router.query.token : '';
    setToken(t);
    if (!t) { setLoadingPreview(false); return; }
    invitePreview(t).then(setPreview).catch((e) => setError(e.message)).finally(() => setLoadingPreview(false));
    sb.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user?.email ?? null)).catch(() => {});
  }, [router.isReady, router.query.token]);

  const accept = async () => {
    setBusy(true); setError('');
    try { await acceptOrgInvite(token); window.location.href = '/dashboard'; }
    catch (e: any) { setError(e.message); setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview?.email) return;
    setBusy(true); setError(''); setInfo('');
    try {
      const { data, error: se } = await sb.auth.signUp({
        email: preview.email, password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (se) throw new Error(se.message);
      if (data.session) { await accept(); }
      else { setInfo('Account created. Check your email to confirm, then reopen this invitation link to finish setup.'); setBusy(false); }
    } catch (err: any) { setError(err.message || 'Something went wrong.'); setBusy(false); }
  };

  const signOut = async () => { await sb.auth.signOut(); setSessionEmail(null); };
  const emailMatches = !!sessionEmail && !!preview?.email && sessionEmail.toLowerCase() === preview.email.toLowerCase();

  /* ── Loading state ── */
  if (loadingPreview) return (
    <Shell brand={brand}>
      <div className="flex items-center gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>
        <Icon name="ti-loader-2" className="animate-spin" style={{ color: '#3ECF8E' } as any} />
        Checking your invitation…
      </div>
    </Shell>
  );

  /* ── Invalid / expired / missing token ── */
  if (!token || !preview || !preview.valid) {
    const reason = !token ? 'no_token' : preview?.reason || 'invalid';
    const msg = reason === 'expired' ? 'This invitation has expired. Ask your administrator to send a new one.'
      : reason === 'used' ? 'This invitation has already been used. Try signing in instead.'
      : 'This invitation link is invalid. Check the link in your email, or ask your administrator to re-send it.';
    return (
      <Shell brand={brand}>
        <div className="space-y-5">
          <span className="w-12 h-12 rounded-2xl grid place-items-center"
            style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171' }}>
            <Icon name="ti-mail-x" className="text-xl" />
          </span>
          <div>
            <h2 className="text-[1.4rem] font-semibold text-white tracking-tight">Invitation unavailable</h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.45)' }}>{msg}</p>
          </div>
          <a href="/login"
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)', color: '#0a0a0a', boxShadow: '0 0 20px rgba(62,207,142,.25)' }}
          >
            <Icon name="ti-arrow-left" />Go to sign in
          </a>
        </div>
      </Shell>
    );
  }

  /* ── Valid invite ── */
  return (
    <Shell brand={brand}>
      <div className="space-y-5">
        <div>
          <h2 className="text-[1.4rem] font-semibold text-white tracking-tight">
            {preview.kind === 'platform' ? 'Become a platform co-owner'
              : preview.new_org ? 'Set up ' + (preview.org_name || 'your workspace')
              : 'Join ' + (preview.org_name || 'your workspace')}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.45)' }}>
            Invited as{' '}
            <span className="font-medium" style={{ color: 'rgba(255,255,255,.80)' }}>{preview.email}</span>
            {preview.kind === 'platform' ? ' · platform co-owner'
              : preview.new_org ? ' · workspace owner'
              : ' · ' + preview.role}.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171' }}>
            <Icon name="ti-alert-circle" />{error}
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.2)', color: '#7dd3fc' }}>
            <Icon name="ti-mail" className="mt-0.5 shrink-0" />{info}
          </div>
        )}

        {/* Case 1: signed in + email matches → accept */}
        {sessionEmail && emailMatches ? (
          <>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>
              You're signed in as{' '}
              <span className="font-medium" style={{ color: 'rgba(255,255,255,.80)' }}>{sessionEmail}</span>.
              Accept to{' '}
              {preview.kind === 'platform' ? 'become a platform co-owner'
                : (preview.new_org ? 'create ' : 'join ') + (preview.org_name || 'the workspace')}.
            </p>
            <button
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)', color: '#0a0a0a', boxShadow: '0 0 20px rgba(62,207,142,.25)' }}
              disabled={busy} onClick={accept}
            >
              {busy ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Accept & continue'}
            </button>
          </>
        ) : sessionEmail && !emailMatches ? (
          /* Case 2: signed in + wrong email → sign out prompt */
          <>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>
              You're signed in as{' '}
              <span className="font-medium" style={{ color: 'rgba(255,255,255,.80)' }}>{sessionEmail}</span>,
              but this invitation is for{' '}
              <span className="font-medium" style={{ color: 'rgba(255,255,255,.80)' }}>{preview.email}</span>.
            </p>
            <button
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)', color: 'rgba(255,255,255,.80)' }}
              onClick={signOut}
            >
              <Icon name="ti-logout" />Sign out to continue
            </button>
          </>
        ) : (
          /* Case 3: not signed in → create account form */
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="su-email" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Email</label>
              <StyledInput id="su-email" type="email" value={preview.email} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="su-name" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Your name</label>
              <StyledInput id="su-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" disabled={busy} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="su-pw" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Create a password</label>
              <StyledInput id="su-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required disabled={busy} />
            </div>
            <button
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)', color: '#0a0a0a', boxShadow: '0 0 20px rgba(62,207,142,.25)', opacity: (busy || password.length < 8) ? '.5' : '1' }}
              disabled={busy || password.length < 8}
            >
              {busy ? <Icon name="ti-loader-2" className="animate-spin" />
                : preview.kind === 'platform' ? 'Create account & accept'
                : preview.new_org ? 'Create account & workspace'
                : 'Create account & join'}
            </button>
            <p className="text-[11px] text-center" style={{ color: 'rgba(255,255,255,.3)' }}>
              Already have an account?{' '}
              <a href="/login"
                className="transition-colors"
                style={{ color: 'rgba(255,255,255,.6)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#3ECF8E')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.6)')}
              >
                Sign in
              </a>{' '}
              with this email, then reopen this link.
            </p>
          </form>
        )}
      </div>
    </Shell>
  );
}
