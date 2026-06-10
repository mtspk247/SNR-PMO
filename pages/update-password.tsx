import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { Icon } from '@/components/ui';

// Landing page for the Supabase password-recovery email link. The client picks
// up the recovery token from the URL and fires PASSWORD_RECOVERY; we then let the
// user set a new password via updateUser({ password }).
export default function UpdatePassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If a recovery session is already present (or arrives), enable the form.
    sb.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.replace('/dashboard'), 1400);
    } catch (err: any) { setError(err.message || 'Could not update password.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      <div className="side hidden lg:flex flex-col justify-between p-12">
        <div className="flex items-center gap-2.5 side-fg">
          <span className="w-8 h-8 rounded-md grid place-items-center font-semibold text-accentfg" style={{ background: 'var(--brand-primary, #3ECF8E)' }}>S</span>
          <span className="font-semibold text-lg">SNR-PMO</span>
        </div>
        <div className="side-fg">
          <h1 className="text-3xl font-semibold leading-tight">Set a new<br />password.</h1>
          <p className="side-dim mt-4 max-w-sm">Choose a strong password you don't use anywhere else.</p>
        </div>
        <p className="text-2xs side-faint">© 2026 SNR-PMO</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Update password</h2>
          <p className="text-sm text-muted mt-1 mb-6">Enter a new password for your account.</p>

          {done ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
              <Icon name="ti-circle-check" /> Password updated. Redirecting…
            </div>
          ) : !ready ? (
            <div className="flex items-center gap-2 text-sm text-muted bg-surface2 border border-line rounded-md px-3 py-2">
              <Icon name="ti-loader-2" className="animate-spin" /> Waiting for a valid reset link… Open this page from your email link.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
                  <Icon name="ti-alert-circle" />{error}
                </div>
              )}
              <div>
                <label className="label">New password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus disabled={loading} />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" disabled={loading} />
              </div>
              <button className="btn btn-primary w-full" disabled={loading}>
                {loading ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
