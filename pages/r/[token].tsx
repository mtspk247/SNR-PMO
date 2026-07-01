import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

type Shared = { title: string; url: string; duration_sec: number | null; created_at: string | null; brand: { name: string } };
const fmtDur = (s: number | null) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Public, unauthenticated player for a shared screen recording (Loom-style link).
export default function SharedRecording() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [data, setData] = useState<Shared | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    fetch(`${base}/functions/v1/recording-share?token=${encodeURIComponent(token)}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { if (d && d.url) { setData(d); setState('ok'); } else setState('error'); })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <>
      <Head><title>{data?.title || 'Shared recording'}</title><meta name="robots" content="noindex" /></Head>
      <div style={{ minHeight: '100vh', background: '#0f0f11', color: '#e8e8ea', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
        {state === 'loading' && <p style={{ color: '#8a8a90' }}>Loading recording…</p>}
        {state === 'error' && (
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>This link isn’t available</h1>
            <p style={{ color: '#8a8a90', fontSize: 14 }}>The recording may have been removed, or the share link was revoked or has expired.</p>
          </div>
        )}
        {state === 'ok' && data && (
          <div style={{ width: '100%', maxWidth: 900 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: '#1d9e75', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, color: '#fff' }}>{(data.brand?.name || 'S').slice(0, 1).toUpperCase()}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{data.title}</div>
                <div style={{ fontSize: 12, color: '#8a8a90' }}>{data.brand?.name}{data.duration_sec != null ? ` · ${fmtDur(data.duration_sec)}` : ''}</div>
              </div>
            </div>
            <video src={data.url} controls autoPlay style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: '78vh' }} />
            <p style={{ fontSize: 12, color: '#6a6a70', textAlign: 'center', marginTop: 14 }}>Shared securely · viewer link, not editable</p>
          </div>
        )}
      </div>
    </>
  );
}
