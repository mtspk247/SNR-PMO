import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { sb } from '@/lib/supabase';
import { invitePreview, acceptOrgInvite, InvitePreview } from '@/lib/db';
import { Icon } from '@/components/ui';

/**
 * Slice 3 — invite-gated self-serve onboarding.
 * /signup?token=<invite> validates the invite, lets the invitee create their
 * account (email locked to the invite), then accepts it -> provisions their org.
 */
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

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      <Head><title>Set up your workspace — SNR-PMO</title></Head>
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white"
        style={{ background: 'linear-gradient(160deg, #0d2018 0%, #0b2a1d 52%, #06110c 100%)' }}>
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(62,207,142,.28), transparent 62%)' }} />
        <div className="relative flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg grid place-items-center font-bold text-accentfg shadow-lg" style={{ background: 'var(--brand-primary, #3ECF8E)' }}>S</span>
          <span className="font-semibold text-lg tracking-tight">SNR-PMO</span>
        </div>
        <div className="relative">
          <h1 className="text-[2.6rem] font-semibold leading-[1.08] tracking-tight">You're invited.<br />Let's set up<br />your workspace.</h1>
          <p className="text-white/65 mt-5 max-w-sm text-[15px] leading-relaxed">Create your account to access your organization — projects, tasks, CRM, HR and financials, scoped securely to your tenant.</p>
        </div>
        <p className="relative text-2xs text-white/40">© 2026 SNR-PMO · Secure multi-tenant SaaS</p>
      </div>
      <div className="flex items-center justify-center p-6"><div className="w-full max-w-sm">{children}</div></div>
    </div>
  );

  if (loadingPreview) return <Shell><div className="flex items-center gap-2 text-sm text-muted"><Icon name="ti-loader-2" className="animate-spin" />Checking your invitation…</div></Shell>;

  if (!token || !preview || !preview.valid) {
    const reason = !token ? 'no_token' : preview?.reason || 'invalid';
    const msg = reason === 'expired' ? 'This invitation has expired. Ask your administrator to send a new one.'
      : reason === 'used' ? 'This invitation has already been used. Try signing in instead.'
      : 'This invitation link is invalid. Check the link in your email, or ask your administrator to re-send it.';
    return (
      <Shell>
        <div className="space-y-4">
          <span className="w-11 h-11 rounded-xl grid place-items-center bg-rose-500/10 text-rose-500"><Icon name="ti-mail-x" className="text-xl" /></span>
          <h2 className="text-xl font-semibold">Invitation unavailable</h2>
          <p className="text-sm text-muted">{msg}</p>
          <a href="/login" className="btn btn-primary w-full"><Icon name="ti-arrow-left" />Go to sign in</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">{preview.new_org ? 'Set up ' + (preview.org_name || 'your workspace') : 'Join ' + (preview.org_name || 'your workspace')}</h2>
          <p className="text-sm text-muted mt-1">Invited as <span className="font-medium text-content">{preview.email}</span>{preview.new_org ? ' · workspace owner' : ' · ' + preview.role}.</p>
        </div>

        {error && <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2"><Icon name="ti-alert-circle" />{error}</div>}
        {info && <div className="flex items-start gap-2 text-sm text-sky-600 bg-sky-500/10 border border-sky-500/20 rounded-md px-3 py-2"><Icon name="ti-mail" />{info}</div>}

        {sessionEmail && emailMatches ? (
          <>
            <p className="text-sm text-muted">You're signed in as <span className="font-medium text-content">{sessionEmail}</span>. Accept to {preview.new_org ? 'create' : 'join'} {preview.org_name || 'the workspace'}.</p>
            <button className="btn btn-primary w-full" disabled={busy} onClick={accept}>{busy ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Accept & continue'}</button>
          </>
        ) : sessionEmail && !emailMatches ? (
          <>
            <p className="text-sm text-muted">You're signed in as <span className="font-medium text-content">{sessionEmail}</span>, but this invitation is for <span className="font-medium text-content">{preview.email}</span>.</p>
            <button className="btn w-full" onClick={signOut}><Icon name="ti-logout" />Sign out to continue</button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input opacity-70" type="email" value={preview.email} readOnly disabled />
            </div>
            <div>
              <label className="label">Your name</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" disabled={busy} autoFocus />
            </div>
            <div>
              <label className="label">Create a password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required disabled={busy} />
            </div>
            <button className="btn btn-primary w-full" disabled={busy || password.length < 8}>{busy ? <Icon name="ti-loader-2" className="animate-spin" /> : (preview.new_org ? 'Create account & workspace' : 'Create account & join')}</button>
            <p className="text-2xs text-muted2 text-center">Already have an account? <a href="/login" className="text-content hover:underline">Sign in</a> with this email, then reopen this link.</p>
          </form>
        )}
      </div>
    </Shell>
  );
}
