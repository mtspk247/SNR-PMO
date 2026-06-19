import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';

/**
 * Invite the user to install the PWA + offer a shareable install link.
 * Uses beforeinstallprompt on Android/desktop Chromium; iOS gets an Add-to-Home hint.
 * The shareable link (/install) works for anyone, logged in or not.
 */
export default function InstallPrompt() {
  const org = useActiveOrg();
  const brand = org?.branding?.name || org?.name || 'this app';
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('snr_install_dismissed') === '1') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (standalone) return;
    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream) { setIosHint(true); setShow(true); }
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const dismiss = () => { try { window.localStorage.setItem('snr_install_dismissed', '1'); } catch (_e) {} setShow(false); };
  const install = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (_e) {} setDeferred(null); setShow(false); };
  const copyLink = () => {
    const url = (typeof window !== 'undefined' ? window.location.origin : 'https://snr-pmo.vercel.app') + '/install';
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  if (!show) return null;

  return (
    <div className="card p-3 mb-5 flex items-center gap-3 border border-accent/30 bg-accent/5 flex-wrap">
      <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/15 text-accentstrong shrink-0"><Icon name="ti-device-mobile" className="text-lg" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content">Install the app</p>
        <p className="text-2xs text-muted">{iosHint ? 'Tap the Share icon, then “Add to Home Screen.”' : `Add ${brand} to your home screen — faster, full-screen, offline-ready.`} Share the install link with your team.</p>
      </div>
      <button onClick={copyLink} className="btn-ghost text-2xs border border-line shrink-0"><Icon name={copied ? 'ti-check' : 'ti-link'} />{copied ? 'Link copied' : 'Copy install link'}</button>
      {!iosHint && <button onClick={install} className="btn btn-primary shrink-0"><Icon name="ti-download" />Install</button>}
      <button onClick={dismiss} aria-label="Dismiss" className="h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
    </div>
  );
}
