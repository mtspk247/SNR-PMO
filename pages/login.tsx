import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { signInWithPassword, signInWithGoogle, signUpNewTenant } from '@/lib/db';
import { Icon } from '@/components/ui';

type Mode = 'signin' | 'signup' | 'reset';

export default function Login() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);

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
        const slug = slugify(orgName);
        if (!slug) throw new Error('Enter a workspace name.');
        const res = await signUpNewTenant({ email: email.trim(), password, fullName: fullName.trim(), orgName: orgName.trim(), orgSlug: slug });
        if (res.session) router.replace('/dashboard');
        else setInfo('Check your email to confirm your account, then sign in.');
      }
    } catch (err: any) { setError(err.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  };

  const google = async () => {
    setError('');
    try { await signInWithGoogle(); } catch (err: any) { setError(err.message); }
  };

  const heading = mode === 'signin' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : 'Create your workspace';
  const sub = mode === 'signin' ? 'Sign in to your workspace.'
    : mode === 'reset' ? "Enter your email and we'll send a reset link."
    : 'Start a new organization in seconds.';

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      {/* Branded showcase panel — accent gradient + glow (white-label brand mark) */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white"
        style={{ background: 'linear-gradient(160deg, #0d2018 0%, #0b2a1d 52%, #06110c 100%)' }}>
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(62,207,142,.28), transparent 62%)' }} />
        <div className="pointer-events-none absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(111,211,217,.18), transparent 62%)' }} />
        <div className="relative flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg grid place-items-center font-bold text-accentfg shadow-lg" style={{ background: 'var(--brand-primary, #3ECF8E)' }}>S</span>
          <span className="font-semibold text-lg tracking-tight">SNR-PMO</span>
        </div>
        <div className="relative">
          <h1 className="text-[2.6rem] font-semibold leading-[1.08] tracking-tight">Run your agency<br />in one clean<br />workspace.</h1>
          <p className="text-white/65 mt-5 max-w-sm text-[15px] leading-relaxed">Projects, tasks, time tracking, CRM, HR and financials — multi-tenant and white-label, scoped securely to your organization.</p>
          <ul className="mt-8 space-y-3.5 max-w-sm">
            {[['ti-layout-kanban', 'Projects, tasks, roadmaps & calendar'], ['ti-clock', 'Time tracking, payroll & accounting'], ['ti-target-arrow', 'CRM pipeline & client delivery']].map(([ic, label]) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/85">
                <span className="w-7 h-7 rounded-lg grid place-items-center bg-white/10 ring-1 ring-inset ring-white/15 shrink-0"><Icon name={ic} className="text-base text-[#3ECF8E]" /></span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-2xs text-white/40">© 2026 SNR-PMO · Secure multi-tenant SaaS</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">{heading}</h2>
          <p className="text-sm text-muted mt-1 mb-6">{sub}</p>

          {mode !== 'reset' && (
            <>
              <button onClick={google} type="button" className="btn w-full mb-4" disabled={loading}>
                <Icon name="ti-brand-google" /> Continue with Google
              </button>
              <div className="flex items-center gap-3 my-4 text-2xs text-muted2">
                <span className="flex-1 h-px bg-line" />OR<span className="flex-1 h-px bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
                <Icon name="ti-alert-circle" />{error}
              </div>
            )}
            {info && (
              <div className="flex items-center gap-2 text-sm text-sky-600 bg-sky-500/10 border border-sky-500/20 rounded-md px-3 py-2">
                <Icon name="ti-mail" />{info}
              </div>
            )}
            {mode === 'signup' && (
              <>
                <div>
                  <label className="label">Your name</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" disabled={loading} />
                </div>
                <div>
                  <label className="label">Workspace name</label>
                  <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc" disabled={loading} />
                  {orgName && <p className="text-2xs text-muted2 mt-1">URL: {slugify(orgName) || '…'}.app.com</p>}
                </div>
              </>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus disabled={loading} />
            </div>
            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}
                      className="text-2xs text-accentstrong hover:underline">Forgot password?</button>
                  )}
                </div>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} />
              </div>
            )}
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? <Icon name="ti-loader-2" className="animate-spin" />
                : mode === 'signin' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Create workspace'}
            </button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            {mode === 'reset' ? (
              <button onClick={() => { setMode('signin'); setError(''); setInfo(''); }} className="font-medium text-content hover:underline">
                <Icon name="ti-arrow-left" className="text-xs" /> Back to sign in
              </button>
            ) : (
              <>
                <span className="text-muted">Workspaces are by invitation.</span>{' '}
                <span className="text-muted2">Check your invite email for a secure signup link.</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
