import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import { signIn } from '@/lib/db';
import { Icon } from '@/components/ui';

export default function Login() {
  const router = useRouter();
  const { user, hasHydrated, setUser } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (hasHydrated && user) router.replace('/dashboard'); }, [hasHydrated, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const u = await signIn(username.trim(), password);
      if (u) { setUser(u); router.replace('/dashboard'); }
      else setError('Invalid username or password.');
    } catch (err: any) { setError(err.message || 'Login failed.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-ink text-white">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-md bg-white text-ink grid place-items-center font-semibold">S</span>
          <span className="font-semibold text-lg">SNR-PMO</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Project management<br />&amp; operations,<br />in one clean workspace.</h1>
          <p className="text-neutral-400 mt-4 max-w-sm">Projects, tasks, and your sales pipeline — unified, fast, and built for the team at Shahzad &amp; Rainer.</p>
        </div>
        <p className="text-2xs text-neutral-500">© 2026 Shahzad &amp; Rainer</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="w-8 h-8 rounded-md bg-ink text-white grid place-items-center font-semibold">S</span>
            <span className="font-semibold text-lg">SNR-PMO</span>
          </div>
          <h2 className="text-xl font-semibold">Welcome back</h2>
          <p className="text-sm text-neutral-500 mt-1 mb-6">Sign in to your workspace.</p>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
                <Icon name="ti-alert-circle" />{error}
              </div>
            )}
            <div>
              <label className="label">Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus disabled={loading} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} />
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
