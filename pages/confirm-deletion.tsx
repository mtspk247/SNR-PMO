import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { confirmAccountDeletion } from '@/lib/db';
import { Icon } from '@/components/ui';

/** Public target for the workspace-deletion verification email link. */
export default function ConfirmDeletion() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('Confirming…');

  useEffect(() => {
    if (!router.isReady) return;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    if (!token) { setState('error'); setMsg('This confirmation link is missing its token.'); return; }
    confirmAccountDeletion(token)
      .then((r) => {
        if (r.ok) {
          const d = r.scheduled_for ? new Date(r.scheduled_for).toLocaleDateString() : '';
          setState('ok');
          setMsg('Deletion confirmed. Your workspace and all its data will be permanently removed on ' + (d || 'the scheduled date') + '. You can cancel anytime before then from Settings → Danger zone.');
        } else {
          setState('error');
          setMsg(r.reason === 'invalid' ? 'This confirmation link is invalid or has already been used.'
            : r.reason === 'not_owner' ? 'Please sign in as the workspace owner, then reopen this link.'
            : 'The confirmation could not be completed.');
        }
      })
      .catch((e) => { setState('error'); setMsg(e.message || 'Something went wrong.'); });
  }, [router.isReady, router.query.token]);

  const cls = state === 'loading' ? 'bg-accent/10 text-accentstrong' : 'bg-rose-500/10 text-rose-600';
  const icon = state === 'ok' ? 'ti-clock' : state === 'error' ? 'ti-alert-triangle' : 'ti-loader-2';
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <Head><title>Confirm workspace deletion — SNR-PMO</title></Head>
      <div className="w-full max-w-md card p-8 text-center space-y-4">
        <span className={`mx-auto w-12 h-12 rounded-xl grid place-items-center ${cls}`}>
          <Icon name={icon} className={`text-2xl ${state === 'loading' ? 'animate-spin' : ''}`} />
        </span>
        <h1 className="text-lg font-semibold text-content">{state === 'ok' ? 'Deletion scheduled' : state === 'error' ? 'Not confirmed' : 'Confirming…'}</h1>
        <p className="text-sm text-muted">{msg}</p>
        <a href="/settings?tab=danger" className="btn btn-primary w-full"><Icon name="ti-arrow-right" />Go to Settings</a>
      </div>
    </div>
  );
}
