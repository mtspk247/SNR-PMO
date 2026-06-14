import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { approveOwnerDeletionToken } from '@/lib/db';
import { Icon } from '@/components/ui';

/** Public one-click approval target for the owner-removal email link. */
export default function ApproveOwner() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('Confirming…');

  useEffect(() => {
    if (!router.isReady) return;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    if (!token) { setState('error'); setMsg('This approval link is missing its token.'); return; }
    approveOwnerDeletionToken(token)
      .then((r) => {
        if (r.ok) { setState('ok'); setMsg(`${r.removed || 'The owner'} has been removed as a platform owner.`); }
        else {
          setState('error');
          setMsg(r.reason === 'not_found' ? 'This approval link is invalid.'
            : (r.reason || '').startsWith('already_') ? 'This request was already handled.'
            : (r.reason || 'The removal could not be completed.'));
        }
      })
      .catch((e) => { setState('error'); setMsg(e.message || 'Something went wrong.'); });
  }, [router.isReady, router.query.token]);

  const cls = state === 'ok' ? 'bg-emerald-500/10 text-emerald-600' : state === 'error' ? 'bg-rose-500/10 text-rose-600' : 'bg-accent/10 text-accentstrong';
  const icon = state === 'ok' ? 'ti-shield-check' : state === 'error' ? 'ti-shield-x' : 'ti-loader-2';
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <Head><title>Owner removal approval — SNR-PMO</title></Head>
      <div className="w-full max-w-md card p-8 text-center space-y-4">
        <span className={`mx-auto w-12 h-12 rounded-xl grid place-items-center ${cls}`}>
          <Icon name={icon} className={`text-2xl ${state === 'loading' ? 'animate-spin' : ''}`} />
        </span>
        <h1 className="text-lg font-semibold text-content">{state === 'ok' ? 'Approved' : state === 'error' ? 'Not completed' : 'Approving…'}</h1>
        <p className="text-sm text-muted">{msg}</p>
        <a href="/platform" className="btn btn-primary w-full"><Icon name="ti-arrow-right" />Go to the platform console</a>
      </div>
    </div>
  );
}
