import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

/**
 * Invite the user to install the PWA. Uses the captured beforeinstallprompt event
 * on Android/desktop Chromium; falls back to an Add-to-Home-Screen hint on iOS
 * Safari (which has no beforeinstallprompt). Hidden if already installed or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('snr_install_dismissed') === '1') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (standalone) return; // already installed
    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBIP);
    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    if (isIOS) { setIosHint(true); setShow(true); }
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const dismiss = () => { try { window.localStorage.setItem('snr_install_dismissed', '1'); } catch (_e) { /* ignore */ } setShow(false); };
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (_e) { /* ignore */ }
    setDeferred(null); setShow(false);
  };
  if (!show) return null;

  return (
    <div className="card p-3 mb-5 flex items-center gap-3 border border-accent/30 bg-accent/5">
      <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/15 text-accentstrong shrink-0"><Icon name="ti-device-mobile" className="text-lg" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content">Install the app</p>
        <p className="text-2xs text-muted">{iosHint ? 'Tap the Share icon, then “Add to Home Screen,” to install SNR-PMO.' : 'Add SNR-PMO to your home screen for a faster, full-screen, offline-ready app.'}</p>
      </div>
      {!iosHint && <button onClick={install} className="btn btn-primary shrink-0"><Icon name="ti-download" />Install</button>}
      <button onClick={dismiss} aria-label="Dismiss" className="h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 shrink-0"><Icon name="ti-x" className="text-sm" /></button>
    </div>
  );
}
