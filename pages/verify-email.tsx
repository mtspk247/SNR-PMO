import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { sb } from '@/lib/supabase';
import { Icon } from '@/components/ui';

/** Target for the account email-verification link (works signed-in or not; token is the proof). */
export default function VerifyEmail() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('Confirming your email…');
  useEffect(() => {
    if (!router.isReady) return;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    if (!token) { setState('error'); setMsg('This confirmation link is missing its token.'); return; }
    sb.rpc('confirm_email_verification', { p_token: token }).then(({ data, error }) => {
      if (error) { setState('error'); setMsg(error.message); return; }
      const r: any = data;
      if (r?.ok) { setState('ok'); setMsg('Your email is confirmed — thank you! Your account is now fully verified.'); }
      else { setState('error'); setMsg('This confirmation link is invalid or has already been used.'); }
    }, (e) => { setState('error'); setMsg(String(e?.message || e)); });
  }, [router.isReady, router.query.token]);
  const cls = state === 'ok' ? 'bg-emerald-500/10 text-emerald-600' : state === 'error' ? 'bg-rose-500/10 text-rose-600' : 'bg-accent/10 text-accentstrong';
  const icon = state === 'ok' ? 'ti-mail-check' : state === 'error' ? 'ti-mail-x' : 'ti-loader-2';
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <Head><title>Confirm your email — SNR-PMO</title></Head>
      <div className="w-full max-w-md card p-8 text-center space-y-4">
        <span className={`mx-auto w-12 h-12 rounded-xl grid place-items-center ${cls}`}><Icon name={icon} className={`text-2xl ${state === 'loading' ? 'animate-spin' : ''}`} /></span>
        <h1 className="text-lg font-semibold text-content">{state === 'ok' ? 'Email confirmed' : state === 'error' ? 'Not confirmed' : 'Confirming…'}</h1>
        <p className="text-sm text-muted">{msg}</p>
        <a href="/dashboard" className="btn btn-primary w-full"><Icon name="ti-arrow-right" />Go to your workspace</a>
      </div>
    </div>
  );
}
