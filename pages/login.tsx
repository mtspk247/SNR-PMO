import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import { signInWithPassword, signInWithGoogle, signUpNewTenant } from '@/lib/db';
import { Icon } from '@/components/ui';

type Mode = 'signin' | 'signup';

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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper">
      {/* Cosmetic, branding-aware panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 text-white" style={{ background: 'var(--brand-ink, #0E2233)' }}>
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-md bg-white grid place-items-center font-semibold" style={{ color: 'var(--brand-ink, #0E2233)' }}>S</span>
          <span className="font-semibold text-lg">SNR-PMO</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Project management<br />&amp; operations,<br />in one clean workspace.</h1>
          <p className="text-white/60 mt-4 max-w-sm">Multi-tenant, white-label PMO — projects, tasks, risk, and financials, scoped securely to your organization.</p>
        </div>
        <p className="text-2xs text-white/40">© 2026 SNR-PMO</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h2>
          <p className="text-sm text-neutral-500 mt-1 mb-6">
            {mode === 'signin' ? 'Sign in to your workspace.' : 'Start a new organization in seconds.'}
          </p>

          <button onClick={google} type="button" className="btn w-full mb-4" disabled={loading}>
            <Icon name="ti-brand-google" /> Continue with Google
          </button>
          <div className="flex items-center gap-3 my-4 