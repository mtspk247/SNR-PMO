import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { signInWithPassword, signInWithGoogle, signUpNewTenant } from '@/lib/db';
import { Icon } from '@/components/ui';
import { useHostBranding } from '@/lib/useHostBranding';

type Mode = 'signin' | 'signup' | 'reset';

export default function Login() {
  const router = useRouter();
  const { user } = useAuthStore();
  const brand = useHostBranding();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);
  useEffect(() => { const m = router.query.mode; if (m === 'signup' || m === 'reset') setMode(m as Mode); }, [router.query.mode]);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email.trim(), password);
        router.replace('/dashboard');
      } else if (mode === 'reset') {
        await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
        setInfo('If an account exists for that email, a password reset link is on its way.');
      } else {
        const { data, error: se } = await sb.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (se) throw new Error(se.message);
        if (data.session) router.replace('/dashboard');
        else setInfo(`Almost there — we sent a verification link to ${email.trim()}. Open it to activate your account, and your workspace will be ready.`);
      }
    } catch (err: any) { setError(err.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  };

  const google = async () => {
    setError('');
    try { await signInWithGoogle(); } catch (err: any) { setError(err.message); }
  };

  const heading = mode === 'signin' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : 'Create your account';
  const sub = mode === 'signin' ? 'Sign in to your workspace.'
    : mode === 'reset' ? "Enter your email and we'll send a reset link."
    : "Sign up with your email — we'll send a verification link, then set up your workspace.";

  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-2" style={{ background: '#0a0a0a' }}>
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

        {/* Hero copy — hidden on mobile (too short), visible lg+ */}
        <div className="relative z-10 hidden lg:block">
          <h1 className="text-[2.75rem] font-semibold leading-[1.07] tracking-tight">
            Run your whole<br />business in<br />one place.
          </h1>
          <p className="mt-5 text-white/60 text-[15px] leading-relaxed max-w-xs">
            Projects, CRM, HR and accounting — all in one secure, multi-tenant workspace.
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

      {/* ── RIGHT: Auth form ── */}
      <div className="flex items-center justify-center px-5 py-10 lg:py-0" style={{ background: '#0f0f0f' }}>
        <div className="w-full max-w-[360px]">

          {/* Mobile logo row (only shows on sm) */}
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

          <h2 className="text-[1.4rem] font-semibold text-white tracking-tight">{heading}</h2>
          <p className="text-sm mt-1 mb-7" style={{ color: 'rgba(255,255,255,.45)' }}>{sub}</p>

          {mode !== 'reset' && (
            <>
              <button
                onClick={google}
                type="button"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 text-sm font-medium rounded-xl px-4 py-2.5 transition-all"
                style={{
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.10)',
                  color: 'rgba(255,255,255,.85)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}
              >
                {/* Google "G" SVG */}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 my-5 text-[11px]" style={{ color: 'rgba(255,255,255,.25)' }}>
                <span className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
                OR
                <span className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.08)' }} />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171' }}>
                <Icon name="ti-alert-circle" />{error}
              </div>
            )}
            {info && (
              <div className="flex items-center gap-2 text-sm rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.2)', color: '#7dd3fc' }}>
                <Icon name="ti-mail" />{info}
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label htmlFor="login-name" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Your name</label>
                <input
                  id="login-name"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:opacity-40"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)', color: '#fff' }}
                  value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe" disabled={loading}
                  onFocus={e => (e.currentTarget.style.border = '1px solid rgba(62,207,142,.5)')}
                  onBlur={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,.10)')}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Email</label>
              <input
                id="login-email"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:opacity-40"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)', color: '#fff' }}
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" autoFocus disabled={loading}
                onFocus={e => (e.currentTarget.style.border = '1px solid rgba(62,207,142,.5)')}
                onBlur={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,.10)')}
              />
            </div>

            {mode !== 'reset' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,.55)' }}>Password</label>
                  {mode === 'signin' && (
                    <button type="button"
                      onClick={() => { setMode('reset'); setError(''); setInfo(''); }}
                      className="text-[11px] transition-colors"
                      style={{ color: '#3ECF8E' }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="login-password"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all placeholder:opacity-40"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)', color: '#fff' }}
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" disabled={loading}
                  onFocus={e => (e.currentTarget.style.border = '1px solid rgba(62,207,142,.5)')}
                  onBlur={e => (e.currentTarget.style.border = '1px solid rgba(255,255,255,.10)')}
                />
              </div>
            )}

            <button
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all mt-1"
              style={{ background: 'linear-gradient(135deg, #3ECF8E 0%, #10b981 100%)', color: '#0a0a0a', boxShadow: '0 0 20px rgba(62,207,142,.25)' }}
              disabled={loading}
              onMouseEnter={e => (e.currentTarget.style.opacity = '.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              {loading
                ? <Icon name="ti-loader-2" className="animate-spin" />
                : mode === 'signin' ? 'Sign in'
                : mode === 'reset' ? 'Send reset link'
                : 'Create account'}
            </button>
          </form>

          <p className="text-sm mt-6 text-center" style={{ color: 'rgba(255,255,255,.4)' }}>
            {mode === 'reset' ? (
              <button
                onClick={() => { setMode('signin'); setError(''); setInfo(''); }}
                className="font-medium transition-colors"
                style={{ color: 'rgba(255,255,255,.75)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.75)')}
              >
                <Icon name="ti-arrow-left" className="text-xs mr-1" />Back to sign in
              </button>
            ) : (
              <>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
                  className="font-medium transition-colors"
                  style={{ color: '#3ECF8E' }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {mode === 'signin' ? 'Create one' : 'Sign in'}
                </button>
              </>
            )}
          </p>

        </div>
      </div>
    </div>
  );
}
