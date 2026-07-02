import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { qrResolve } from '@/lib/db';

// Public QR redirect — resolves the slug via the capped anon RPC (which logs the
// scan with a coarse device class + referrer HOSTNAME only, never full URLs/PII)
// and forwards to the LIVE destination. No app shell, no auth, noindex.
export default function QrRedirect() {
  const router = useRouter();
  const [dead, setDead] = useState(false);
  useEffect(() => {
    const slug = typeof router.query.slug === 'string' ? router.query.slug : '';
    if (!slug) return;
    const device = /mobile|iphone|android/i.test(navigator.userAgent) ? 'mobile' : /tablet|ipad/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
    let refHost = '';
    try { refHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* ignore */ }
    qrResolve(slug, device, refHost).then((target) => {
      if (target) window.location.replace(target);
      else setDead(true);
    }).catch(() => setDead(true));
  }, [router.query.slug]);
  return (
    <>
      <Head><title>Redirecting…</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', color: '#6b7280', fontSize: 14 }}>
        {dead ? 'This link is no longer active.' : 'Redirecting…'}
      </div>
    </>
  );
}
