import { useEffect, useState } from 'react';
import Head from 'next/head';

// Public, shareable install landing — works without login. Share this URL with anyone:
// https://snr-pmo.vercel.app/install
export default function InstallPage() {
  const [deferred, setDeferred] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [url, setUrl] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (standalone) setInstalled(true);
    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setCanInstall(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream) setIsIOS(true);
    setUrl(window.location.origin + '/install');
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);
  const copy = () => { try { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_e) {} };
  const install = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (_e) {} setDeferred(null); setCanInstall(false); };
  const box: any = { maxWidth: 440, width: '100%', background: '#fff', borderRadius: 18, padding: 30, boxShadow: '0 4px 24px rgba(15,23,42,.08)', textAlign: 'center', border: '1px solid #eef2f7' };
  const green: any = { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#10b981', color: '#fff', border: 0, borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  const hint: any = { background: '#f1f5f9', borderRadius: 10, padding: '12px 14px', color: '#334155', fontSize: 14 };
  return (<>
    <Head><title>Install SNR-PMO</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#10b981" /></Head>
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'ui-sans-serif,system-ui,-apple-system,Arial', background: 'linear-gradient(160deg,#ecfdf5,#f8fafc 40%)' }}>
      <div style={box}>
        <div style={{ width: 76, height: 76, margin: '0 auto 16px', borderRadius: 20, background: '#10b981', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 38, fontWeight: 700 }}>S</div>
        <h1 style={{ fontSize: 23, margin: '0 0 6px', color: '#0f172a' }}>SNR-PMO</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 22px', lineHeight: 1.5 }}>Projects, CRM, HR and finance in one workspace. Install the app for a fast, full-screen, offline-ready experience on your phone or desktop.</p>
        {installed ? (
          <p style={{ color: '#047857', fontWeight: 600, fontSize: 15 }}>✓ The app is installed on this device.</p>
        ) : isIOS ? (
          <div style={hint}>On iPhone/iPad (Safari): tap the <b>Share</b> icon, then <b>Add to Home Screen</b>.</div>
        ) : canInstall ? (
          <button onClick={install} style={green}>⤓ Install app</button>
        ) : (
          <div style={hint}>Open this page in <b>Chrome</b> or <b>Edge</b>, then use the browser&rsquo;s <b>Install</b> option (an icon in the address bar, or menu → <b>Install app</b>).</div>
        )}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #eef2f7' }}>
          <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 10px' }}>Scan to open on your phone, or share this link:</p>
          {url && <img alt="QR code to install SNR-PMO" width={148} height={148} style={{ margin: '0 auto 12px', display: 'block', borderRadius: 10, border: '1px solid #eef2f7' }} src={`https://api.qrserver.com/v1/create-qr-code/?size=148x148&margin=0&data=${encodeURIComponent(url || '')}`} />}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 12, padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: 8, color: '#334155', minWidth: 0 }} />
            <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: copied ? '#047857' : '#0f172a', color: '#fff', border: 0, borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{copied ? '✓ Copied' : 'Copy link'}</button>
          </div>
        </div>
        <p style={{ marginTop: 18, fontSize: 14 }}><a href="/login" style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>Open the web app &rarr;</a></p>
      </div>
    </div>
  </>);
}
